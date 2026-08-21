"""Regression tests for the 2026-08-20 email-verification / password-reset pass (see
server.py's /auth/signup, /auth/login, /auth/verify-email, /auth/resend-verification,
/auth/forgot-password, /auth/reset-password).

Ordering note: this file must run BEFORE tests/test_auth_hardening.py in the same CI job
(see .github/workflows/backend-tenant-isolation.yml) -- that file deliberately exhausts
the /auth/login and /auth/signup rate limits (5/min, 3/hour) against the same live
server process, and slowapi's limiter state persists for the process's lifetime. This
file only sends one signup and one login, comfortably under either limit, but only if it
gets there first.

Can't exercise the full happy path (actually clicking a verification/reset link) without
either a live email provider or direct DB access to the token, since only its SHA-256
hash is ever stored server-side by design (see _consume_auth_token in server.py) -- so
this covers the observable contract: signup no longer hands back a usable session,
login is blocked pre-verification, and both token-consuming endpoints reject garbage
input without leaking whether an email is registered.
"""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def test_signup_returns_pending_message_not_a_token():
    email = f"verify-probe-{uuid.uuid4()}@example.com"
    resp = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"name": "Verify Probe", "company_name": "Verify Probe Co", "email": email, "password": "probe-password-123"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "token" not in body, "signup must not hand back a usable session before the email is verified"
    assert body.get("email") == email


def test_login_blocked_until_verified():
    email = f"verify-probe-{uuid.uuid4()}@example.com"
    signup = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"name": "Verify Probe", "company_name": "Verify Probe Co", "email": email, "password": "probe-password-123"},
    )
    assert signup.status_code == 200, signup.text

    login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": email, "password": "probe-password-123"})
    assert login.status_code == 403, (
        f"Expected 403 (unverified email) for a just-signed-up account, got {login.status_code}: {login.text}"
    )


def test_forgot_password_does_not_leak_whether_email_exists():
    real_email = f"verify-probe-{uuid.uuid4()}@example.com"
    signup = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"name": "Verify Probe", "company_name": "Verify Probe Co", "email": real_email, "password": "probe-password-123"},
    )
    assert signup.status_code == 200, signup.text

    real_email_resp = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": real_email})
    fake_email_resp = requests.post(
        f"{BASE_URL}/api/auth/forgot-password", json={"email": f"definitely-not-registered-{uuid.uuid4()}@example.com"}
    )
    assert real_email_resp.status_code == fake_email_resp.status_code == 200
    assert real_email_resp.json() == fake_email_resp.json(), (
        "forgot-password's response must be identical whether or not the email is registered, "
        "otherwise it can be used to enumerate accounts"
    )


def test_verify_email_rejects_garbage_token():
    resp = requests.get(f"{BASE_URL}/api/auth/verify-email", params={"token": "not-a-real-token"})
    assert resp.status_code == 400


def test_reset_password_rejects_garbage_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/reset-password", json={"token": "not-a-real-token", "new_password": "irrelevant123"}
    )
    assert resp.status_code == 400
