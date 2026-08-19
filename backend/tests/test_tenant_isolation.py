"""Regression tests for the 2026-08-18/19 tenant-isolation incident: a session whose JWT
had no company_id caused _ScopedCollection (server.py) to silently write/read completely
unscoped, invisible to every other company-scoped query with no error anywhere. Two guards
now exist: an app-level 401 at auth time (get_current_user), and a database-level NOT NULL
+ FOREIGN KEY on every tenant table's company_id (migration_harden_company_id.sql). These
tests must keep passing for both layers, independently -- either one regressing should fail
CI before it ever reaches production again.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
JWT_SECRET = os.environ.get("JWT_SECRET", "hamro-gng-2024")


def _craft_token(role: str, company_id=None) -> str:
    """Bypasses normal login to simulate exactly the broken state that caused the incident:
    a valid, correctly-signed token whose company_id is missing -- e.g. a token minted
    before the account had one assigned. Login itself can no longer produce this token, so
    the only way to test the guard is to build one directly, the same way create_token()
    in server.py does."""
    return jwt.encode(
        {"user_id": str(uuid.uuid4()), "username": "test-isolation-probe", "role": role,
         "company_id": company_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        JWT_SECRET, algorithm="HS256",
    )


# ── App-level guard: get_current_user rejects non-platform_owner with no company_id ──────
class TestAuthTimeGuard:
    def test_missing_company_id_rejected_for_normal_role(self):
        token = _craft_token(role="admin", company_id=None)
        resp = requests.get(f"{BASE_URL}/api/vehicles", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401, (
            f"Expected 401 for a token with no company_id, got {resp.status_code}: {resp.text}. "
            "This is the exact hole that let sales/vehicles/customers go missing on 2026-08-18/19 -- "
            "a stale or bugged session must be rejected before it can touch any data, not silently "
            "unscoped."
        )

    def test_platform_owner_without_company_id_still_allowed(self):
        """platform_owner is the one legitimate exception -- this guards against a fix here
        being overcorrected into blocking the one role that's supposed to have no company_id."""
        token = _craft_token(role="platform_owner", company_id=None)
        resp = requests.get(f"{BASE_URL}/api/super-admin/companies", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code != 401, (
            f"platform_owner with no company_id should not be rejected at auth time, got {resp.status_code}"
        )

    def test_valid_company_id_still_allowed(self):
        token = _craft_token(role="admin", company_id=str(uuid.uuid4()))
        resp = requests.get(f"{BASE_URL}/api/vehicles", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code != 401, (
            f"A token with a real company_id should never be rejected by this guard, got {resp.status_code}"
        )


# ── Database-level guard: NOT NULL + FK on company_id (migration_harden_company_id.sql) ──
# Only runs where the test process has direct DB access (same MYSQL_* env vars server.py
# reads) -- skipped otherwise rather than failing, same as any other environment-gated test.
def _get_sqldb():
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import sqldb
    return sqldb


def test_db_rejects_missing_company_id_even_if_app_code_forgets_to_check():
    """Proves the safety net holds independently of server.py: even a hand-built insert
    that skips get_current_user/_ScopedCollection entirely cannot write a tenant row with no
    company_id, because the column itself is NOT NULL with a FOREIGN KEY to companies(id)."""
    if not os.environ.get("MYSQL_USER"):
        pytest.skip("no direct DB access configured for this test run (MYSQL_USER unset)")

    async def _attempt():
        sqldb = _get_sqldb()
        db = sqldb.MySQLDatabase()
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO customers (id, company_id, name, created_at) VALUES (%s, NULL, %s, %s)",
                    (str(uuid.uuid4()), "test-isolation-probe", datetime.now(timezone.utc).isoformat()),
                )
        db.close()

    with pytest.raises(Exception):
        asyncio.run(_attempt())


def test_db_rejects_company_id_not_referencing_a_real_company():
    """Same guard, other half: a company_id that doesn't match any row in `companies` must
    also be rejected (the FK, not just the NOT NULL) -- otherwise a typo'd or forged
    company_id could still write data that resolves to nothing."""
    if not os.environ.get("MYSQL_USER"):
        pytest.skip("no direct DB access configured for this test run (MYSQL_USER unset)")

    async def _attempt():
        sqldb = _get_sqldb()
        db = sqldb.MySQLDatabase()
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO customers (id, company_id, name, created_at) VALUES (%s, %s, %s, %s)",
                    (str(uuid.uuid4()), str(uuid.uuid4()), "test-isolation-probe", datetime.now(timezone.utc).isoformat()),
                )
        db.close()

    with pytest.raises(Exception):
        asyncio.run(_attempt())
