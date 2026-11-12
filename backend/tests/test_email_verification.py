"""Regression tests for the sign-up / sign-in / password-reset flow (see server.py's
/auth/signup, /auth/login, /auth/verify-email, /auth/resend-verification,
/auth/forgot-password, /auth/reset-password).

Email verification is no longer required (commit b7ff2c3): signing up signs the new
account straight in, and login does not check it. These tests used to assert the opposite
(no token from signup, 403 on login until verified) and have failed on every push since --
they now pin the current rules. /auth/verify-email and /auth/resend-verification still
exist for links already sent.

Ordering note: this file must run BEFORE tests/test_auth_hardening.py in the same CI job
(see .github/workflows/backend-tenant-isolation.yml) -- that file deliberately exhausts
the /auth/login and /auth/signup rate limits (5/min, 3/hour) against the same live
server process, and slowapi's limiter state persists for the process's lifetime. This
file sends exactly three signups (the /auth/signup limit) and one login, so it must not
grow another signup, and only stays under the limits if it gets there first.

Can't exercise the full happy path of a reset link without either a live email provider or
direct DB access to the token, since only its SHA-256 hash is ever stored server-side by
design (see _consume_auth_token in server.py) -- so for reset this covers the observable
contract: both token-consuming endpoints reject garbage input, and forgot-password does
not leak whether an email is registered.
"""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def test_signup_signs_the_new_account_straight_in():
    email = f"verify-probe-{uuid.uuid4()}@example.com"
    resp = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"name": "Verify Probe", "company_name": "Verify Probe Co", "email": email, "password": "probe-password-123"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("token"), "signup must hand back a session: email verification is no longer required"
    assert body.get("email") == email
    assert body.get("role") == "admin"

    # The session works, and a brand-new company starts with nothing in it (no other company's data).
    vehicles = requests.get(f"{BASE_URL}/api/vehicles", headers={"Authorization": f"Bearer {body['token']}"})
    assert vehicles.status_code == 200, vehicles.text
    assert vehicles.json() == []


def test_login_works_straight_after_signup():
    email = f"verify-probe-{uuid.uuid4()}@example.com"
    signup = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"name": "Verify Probe", "company_name": "Verify Probe Co", "email": email, "password": "probe-password-123"},
    )
    assert signup.status_code == 200, signup.text

    login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": email, "password": "probe-password-123"})
    assert login.status_code == 200, (
        f"Expected 200 for a just-signed-up account (no email verification), got {login.status_code}: {login.text}"
    )
    assert login.json().get("token")


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
