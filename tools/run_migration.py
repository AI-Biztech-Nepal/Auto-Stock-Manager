"""TEMPORARY - runs the move from MariaDB to Supabase from THIS PC, with no login on the server.

It signs in to the app with your normal admin login (the owner, or an admin of the original business), reads the
Supabase settings from backend/.env on this PC, and asks the app's migration tool (backend/migration_tool.py) to do the
work on the server. Passwords are typed hidden and are never printed. Nothing is deleted anywhere.

    python tools/run_migration.py test        # checks the connections only; copies nothing
    python tools/run_migration.py copy        # moves photos + data and compares them; the app keeps using MariaDB
    python tools/run_migration.py switch      # the same, then (only if everything matches) makes the app use Supabase
    python tools/run_migration.py rollback    # makes the app use MariaDB again

Optional:  --api https://api.hamroauto.com.np   --env path/to/.env
"""
import getpass
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API = "https://api.hamroauto.com.np"
DEFAULT_ENV = Path(__file__).resolve().parent.parent / "backend" / ".env"
MODES = ("test", "copy", "switch", "rollback")


def die(msg, code=1):
    print("\n" + msg)
    sys.exit(code)


def read_env(path):
    try:
        raw = Path(path).read_bytes()
    except OSError:
        die(f"Cannot read {path}. Run this from the project folder, or pass --env.")
    env = {}
    for line in raw.replace(b"\x00", b"").decode("utf-8", "replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip("\"'")
    return env


def call(method, url, token=None, body=None, timeout=60):
    """(HTTP status, parsed JSON or {}) - never raises on an HTTP error status."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def detail(data):
    d = data.get("detail") if isinstance(data, dict) else None
    return d if isinstance(d, str) else json.dumps(d) if d else ""


def main():
    args = sys.argv[1:]
    mode = args[0] if args and args[0] in MODES else ""
    if not mode:
        die(__doc__)
    api = (args[args.index("--api") + 1] if "--api" in args else DEFAULT_API).rstrip("/")
    env_path = args[args.index("--env") + 1] if "--env" in args else DEFAULT_ENV
    if not api.startswith("https://") and not api.startswith("http://127.0.0.1") and not api.startswith("http://localhost"):
        die("The address must start with https:// so your login and settings travel encrypted.")

    body = {"mode": mode}
    if mode != "rollback":
        env = read_env(env_path)
        body.update(supabase_url=env.get("SUPABASE_URL", ""), service_role_key=env.get("SUPABASE_SERVICE_ROLE_KEY", ""),
                    db_url=env.get("SUPABASE_DB_URL", ""))
        missing = [k for k, v in (("SUPABASE_URL", body["supabase_url"]), ("SUPABASE_SERVICE_ROLE_KEY", body["service_role_key"]),
                                  ("SUPABASE_DB_URL", body["db_url"])) if not v]
        if missing:
            die("These are empty in " + str(env_path) + ": " + ", ".join(missing))

    print(f"Mode: {mode}    App: {api}")
    print({"test": "Only checks the connections. Nothing is copied or changed.",
           "copy": "Copies photos and data to Supabase and compares them. The app keeps using MariaDB.",
           "switch": "Copies, compares, and ONLY IF everything matches makes the app use Supabase (it restarts briefly).",
           "rollback": "Makes the app use MariaDB again (it restarts briefly)."}[mode])
    print("Nothing is deleted from MariaDB in any mode.\n")

    print("Sign in with your normal login for the app (the owner, or an admin of the original business).")
    user = input("Username: ").strip()
    password = getpass.getpass("Password (hidden): ")
    status, data = call("POST", api + "/api/auth/login", body={"username": user, "password": password})
    if status == 429:
        die("Too many login tries. Wait a minute and run it again.")
    if status != 200 or "token" not in data:
        die("Login failed: " + (detail(data) or f"HTTP {status}") + "\nCheck the username and password you use for the admin site.")
    token = data["token"]

    status, data = call("GET", api + "/api/admin/migration/status", token)
    if status == 404:
        die("The migration tool is not on the server yet. Commit and push the project to GitHub (the server updates itself, "
            "give it a minute or two), then run this again.")
    if status == 403:
        die("This login is not allowed to use the tool: " + detail(data))
    if status != 200:
        die(f"Unexpected answer from the server (HTTP {status}): {detail(data)}")
    print(f"Signed in as {data.get('user')}. The app is currently using: {data.get('db_backend')}.\n")

    if mode == "switch":
        print("This will make your live app use Supabase when the comparison passes.")
        if input("Type SWITCH to continue: ").strip() != "SWITCH":
            die("Cancelled. Nothing was changed.", 0)

    status, data = call("POST", api + "/api/admin/migration/run", token, body)
    if status != 200:
        die(f"The server said no (HTTP {status}): {detail(data) or 'unknown reason'}")

    since, final, errors = 0, None, 0
    while True:
        time.sleep(3)
        try:
            status, data = call("GET", f"{api}/api/admin/migration/status?since={since}", token, timeout=30)
            errors = 0
        except (urllib.error.URLError, OSError, ValueError):
            errors += 1  # the app restarting at the end of "switch" or "rollback" looks like this for a few seconds
            if errors > 40:
                die("Lost contact with the server. Run 'python tools/run_migration.py test' in a minute to see where it stands.")
            continue
        if status != 200:
            errors += 1
            if errors > 40:
                die(f"Server answered HTTP {status}: {detail(data)}")
            continue
        for line in data.get("lines", []):
            print(line)
        since = data.get("next", since)
        if data.get("state") in ("done", "failed"):
            final = data
            break

    ok = final["state"] == "done"
    if ok and final.get("flipped"):
        want = "postgres" if final["flipped"] == "postgres" else "mysql"
        print(f"\nWaiting for the app to restart on {'Supabase' if want == 'postgres' else 'MariaDB'} (up to 4 minutes)...")
        seen = None
        for _ in range(48):
            time.sleep(5)
            try:
                _, h = call("GET", api + "/api/health", timeout=10)
            except (urllib.error.URLError, OSError, ValueError):
                continue
            seen = h
            if h.get("db_backend") == want and h.get("database") == "ok":
                print(f"\nDONE. The app is now using {'Supabase' if want == 'postgres' else 'MariaDB'} and its database check says ok.")
                print("Open the admin site and look around: inventory, a customer, a sale, a photo.")
                return
        if seen and seen.get("db_backend") == "mysql" and want == "postgres":
            die("The app restarted but is using MariaDB: it could not reach Supabase at startup, so it fell back to MariaDB "
                "automatically. Your data is safe. Run 'test' to see why, fix it, then run 'switch' again.")
        die("The app has not come back on the new database yet. Wait a minute and open the admin site; if it is down or "
            "still on the old database, tell me exactly what you see.")
    print("\n" + ("Finished - see the lines above." if ok else "It stopped. Nothing was deleted and the app was not switched. "
                                                           "Send me the lines above (they contain no passwords)."))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        die("Stopped. (If a copy was running on the server, it carries on there; nothing is deleted.)", 130)
