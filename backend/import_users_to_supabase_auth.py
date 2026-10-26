"""Gives every Auto Stock Manager login a Supabase Auth login with the same password, and records its company and
role in asm_members (FINANCE/supabase/migrations/0014_asm_security.sql). Step 1 of moving the app to Supabase.

Read-only on MySQL; the app keeps logging people in exactly as before until its screens are switched over.

    venv/bin/python import_users_to_supabase_auth.py           # dry run: who would be created or linked
    venv/bin/python import_users_to_supabase_auth.py --apply   # do it

Passwords: each account's existing bcrypt hash is handed to Supabase as it is (Supabase Auth accepts bcrypt), so
nobody's password changes and nobody's password is ever seen.
Usernames: Supabase logs people in by email. An account whose username is an email keeps it; any other
username (e.g. "admin") becomes <username>@<ASM_STAFF_EMAIL_DOMAIN> (default staff.hamroauto.local), and the
login screen will turn a plain username into that address.
An email that already has a Supabase login (an owner who also uses Finance) is linked, not created: that login
and its password stay as they are.
"""
import asyncio
import os
import re
import sys
from pathlib import Path

import aiomysql
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

STAFF_DOMAIN = os.environ.get("ASM_STAFF_EMAIL_DOMAIN", "staff.hamroauto.local")


def email_for(username: str) -> str:
    u = (username or "").strip().lower()
    if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", u):
        return u
    return f"{re.sub(r'[^a-z0-9._-]+', '.', u).strip('.') or 'user'}@{STAFF_DOMAIN}"


async def main():
    apply = "--apply" in sys.argv
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (url and key):
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.")
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    conn = await aiomysql.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"), port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
        db=os.environ.get("MYSQL_DB") or os.environ["DB_NAME"], charset="utf8mb4")
    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute("SELECT id, company_id, username, password_hash, name, role FROM users")
        users = await cur.fetchall()
    conn.close()

    async with httpx.AsyncClient(timeout=60) as client:
        existing, page = {}, 1
        while True:
            r = await client.get(f"{url}/auth/v1/admin/users?page={page}&per_page=200", headers=h)
            r.raise_for_status()
            batch = r.json().get("users") or []
            existing.update({(u.get("email") or "").lower(): u["id"] for u in batch})
            if len(batch) < 200:
                break
            page += 1

        created = linked = failed = 0
        for u in users:
            email = email_for(u["username"])
            role = u.get("role") or "admin"
            if role not in ("admin", "stock_supervisor", "parts_supervisor", "social_media", "platform_owner"):
                print(f"  skip {u['username']}: unknown role {role}")
                continue
            user_id = existing.get(email)
            action = "link" if user_id else "create"
            print(f"  {action:6s} {u['username']:32s} -> {email:40s} {role}")
            if not apply:
                continue
            if not user_id:
                r = await client.post(f"{url}/auth/v1/admin/users", headers=h, json={
                    "email": email, "password_hash": u["password_hash"], "email_confirm": True,
                    "user_metadata": {"app": "asm", "asm_user_id": u["id"], "username": u["username"], "full_name": u.get("name")},
                })
                if r.status_code >= 300:
                    failed += 1
                    print(f"    failed: {r.status_code} {r.text[:200]}")
                    continue
                user_id = r.json()["id"]
                created += 1
            else:
                linked += 1
            r = await client.post(f"{url}/rest/v1/asm_members?on_conflict=user_id",
                                  headers={**h, "Prefer": "resolution=merge-duplicates,return=minimal"},
                                  json={"user_id": user_id, "asm_user_id": u["id"], "company_id": u.get("company_id"),
                                        "username": u["username"], "name": u.get("name"), "role": role})
            if r.status_code >= 300:
                failed += 1
                print(f"    member row failed: {r.status_code} {r.text[:200]}")

    if apply:
        print(f"Done: {created} created, {linked} linked to an existing login, {failed} failed.")
    else:
        print(f"{len(users)} accounts. Dry run - nothing written. Run with --apply to do it.")


if __name__ == "__main__":
    asyncio.run(main())
