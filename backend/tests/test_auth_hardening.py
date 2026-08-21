"""Regression tests for the auth-hardening pass (rate limiting on /auth/login and
/auth/signup — see the `limiter`/`_client_ip` setup and the `@limiter.limit(...)`
decorators in server.py). Mirrors test_tenant_isolation.py's pattern: hits a real,
already-running backend over HTTP rather than importing server.py directly, since the
limiter is in-memory and keyed by request IP — exercising it end to end is the only way
to prove both the decorator and the exception handler are wired up correctly together.
"""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def test_login_is_rate_limited_per_ip():
    """5/minute on /auth/login (see server.py). All requests here share one IP (the CI
    runner / localhost), so the 6th attempt within the same minute must be rejected before
    it ever reaches the password check — otherwise a brute-force script can retry as fast
    as the network allows."""
    last = None
    for _ in range(6):
        last = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "does-not-exist@example.com", "password": "wrong-password"},
        )
    assert last.status_code == 429, (
        f"Expected the 6th rapid login attempt from one IP to be rate-limited (429), "
        f"got {last.status_code}: {last.text}"
    )


def test_signup_is_rate_limited_per_ip():
    """3/hour on /auth/signup (see server.py) — guards against scripted mass company
    signups from one source. Each attempt uses a unique email so the 429 on the 4th call
    can't be confused with the unrelated "email already exists" 400."""
    last = None
    for _ in range(4):
        last = requests.post(
            f"{BASE_URL}/api/auth/signup",
            json={
                "name": "Test User",
                "company_name": "Rate Limit Probe Co",
                "email": f"rate-limit-probe-{uuid.uuid4()}@example.com",
                "password": "probe-password-123",
            },
        )
    assert last.status_code == 429, (
        f"Expected the 4th rapid signup attempt from one IP to be rate-limited (429), "
        f"got {last.status_code}: {last.text}"
    )
