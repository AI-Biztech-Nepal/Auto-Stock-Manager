"""TEMPORARY - moves the data from MariaDB to Supabase (and back) without anyone logging in to the server.

Used from a PC with tools/run_migration.py, signed in with the app's own login. It only runs the scripts that are
already in this folder (migrate_media_to_supabase.py, copy_mysql_to_supabase.py) as separate processes, so the live
app keeps serving while they work. Remove it when the move is finished: delete this file, tools/run_migration.py and
the migration_tool lines at the bottom of server.py.

Who may use it: the platform owner, or an admin of the ORIGINAL (oldest) business. A company created by a later
signup can never qualify.

Nothing is deleted anywhere. MariaDB is only read (the photo step adds a pointer to each photo row). The Supabase
settings are passed to the copy processes through their environment and are never logged or returned; they are written
to .env only by "switch", after a copy that checked out clean.

Modes:  test      - checks the Supabase and MariaDB connections, copies nothing
        copy      - moves the photos, copies the data, compares the two (the app keeps using MariaDB)
        switch    - the same, then - only if the comparison passed - makes the app use Supabase and restarts it
        rollback  - makes the app use MariaDB again and restarts it
"""
import asyncio
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import unquote, urlsplit

from fastapi import Depends, HTTPException
from pydantic import BaseModel

BACKEND = Path(__file__).parent
ENV_FILE = BACKEND / ".env"
PM2_APP = "auto-stock-backend"
MAX_LINES = 4000
STALE_AFTER = 3 * 3600  # a job that has "run" this long is treated as dead, so the tool can never get stuck

PREFLIGHT = r'''
import asyncio, json, os, sys, urllib.request
ok = True
def say(s): print(s, flush=True)
try:
    import psycopg
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], connect_timeout=20, prepare_threshold=None) as c:
        has = c.execute("select to_regclass('public.users') is not null").fetchone()[0]
        n = c.execute("select count(*) from information_schema.tables where table_schema='public'").fetchone()[0]
    if has:
        say(f"ok    Supabase database: connected, {n} tables are ready")
    else:
        say("ok    Supabase database: connected; the tables are not there yet - the copy step creates them")
except Exception as e:
    say(f"FAIL  Supabase database: cannot connect ({type(e).__name__}) - check the connection string and password"); ok = False
try:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(os.environ["SUPABASE_URL"].rstrip("/") + "/storage/v1/bucket",
                                 headers={"apikey": key, "Authorization": "Bearer " + key})
    names = [b["name"] for b in json.loads(urllib.request.urlopen(req, timeout=20).read())]
    missing = [b for b in ("asm-photos", "asm-documents") if b not in names]
    if missing:
        say("FAIL  Supabase Storage: reachable, but these buckets are missing: " + ", ".join(missing) + " (run backend/supabase/0001_media_buckets.sql)"); ok = False
    else:
        say("ok    Supabase Storage: reachable, both buckets exist")
except Exception as e:
    say(f"FAIL  Supabase Storage: {type(e).__name__} - check SUPABASE_URL and the service key"); ok = False
try:
    import aiomysql
    async def mysql():
        conn = await aiomysql.connect(host=os.environ.get("MYSQL_HOST", "localhost"), port=int(os.environ.get("MYSQL_PORT", "3306")),
                                      user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
                                      db=os.environ.get("MYSQL_DB") or os.environ["DB_NAME"], charset="utf8mb4")
        try:
            out = {}
            async with conn.cursor() as cur:
                for t in ("users", "vehicles", "customers", "sales", "vehicle_photos"):
                    await cur.execute(f"SELECT COUNT(*) FROM `{t}`")
                    out[t] = (await cur.fetchone())[0]
            return out
        finally:
            conn.close()
    counts = asyncio.run(mysql())
    say("ok    MariaDB (this server): readable - " + ", ".join(f"{k} {v}" for k, v in counts.items()))
except Exception as e:
    say(f"FAIL  MariaDB (this server): {type(e).__name__}"); ok = False
say("")
say("Everything is ready." if ok else "Something above needs fixing first.")
sys.exit(0 if ok else 1)
'''

# One entry per step the tool may run. Fixed commands: nothing from a request is ever put into them.
STEP_COMMANDS = {
    "preflight": [sys.executable, "-u", "-c", PREFLIGHT],
    "prepare": [sys.executable, "-u", "copy_mysql_to_supabase.py", "prepare"],
    "media_copy": [sys.executable, "-u", "migrate_media_to_supabase.py", "copy"],
    "media_verify": [sys.executable, "-u", "migrate_media_to_supabase.py", "verify"],
    "data_copy": [sys.executable, "-u", "copy_mysql_to_supabase.py", "copy"],
    "data_check": [sys.executable, "-u", "copy_mysql_to_supabase.py", "check"],
}
PLANS = {
    "test": [("Checking the connections", "preflight")],
    "copy": [("1/5  Preparing Supabase (tables and photo buckets)", "prepare"),
             ("2/5  Moving photos and documents into Supabase Storage", "media_copy"),
             ("3/5  Checking every file arrived", "media_verify"),
             ("4/5  Copying the data", "data_copy"),
             ("5/5  Comparing MariaDB and Supabase", "data_check")],
}
PLANS["switch"] = PLANS["copy"]


def step_problem(key: str, lines: list) -> Optional[str]:
    """What is wrong with a step that exited cleanly, or None."""
    text = "\n".join(lines)
    if key == "media_copy":
        failed = sum(int(n) for n in re.findall(r"(\d+) failed", text))
        return f"{failed} photos/documents could not be moved" if failed else None
    if key == "media_verify":
        return None if "All good." in text else "some files are not right in Storage"
    if key == "data_check":
        return None if "Everything matches" in text else "MariaDB and Supabase do not match yet"
    return None


class RunBody(BaseModel):
    mode: Literal["test", "copy", "switch", "rollback"]
    supabase_url: Optional[str] = None
    service_role_key: Optional[str] = None
    db_url: Optional[str] = None


def clean_settings(body: RunBody) -> dict:
    """Validated Supabase settings, or HTTP 400 saying which one is wrong."""
    url = (body.supabase_url or "").strip().strip("\"'").rstrip("/")
    url = re.sub(r"/rest/v1$", "", url).rstrip("/")
    key = (body.service_role_key or "").strip().strip("\"'")
    dsn = (body.db_url or "").strip().strip("\"'")
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", url):
        raise HTTPException(400, "supabase_url should look like https://abcdefgh.supabase.co")
    if len(key) < 40 or " " in key:
        raise HTTPException(400, "service_role_key looks too short")
    if not re.fullmatch(r"postgres(ql)?://\S+@\S+", dsn) or "[" in dsn or "]" in dsn:
        raise HTTPException(400, "db_url should start with postgresql:// and have the real password in it (no [ ] brackets)")
    return {"SUPABASE_URL": url, "SUPABASE_SERVICE_ROLE_KEY": key, "SUPABASE_DB_URL": dsn}


def secrets_to_hide(settings: dict) -> list:
    hide = [settings["SUPABASE_SERVICE_ROLE_KEY"], settings["SUPABASE_DB_URL"]]
    try:
        pw = urlsplit(settings["SUPABASE_DB_URL"]).password
        if pw:
            hide += [pw, unquote(pw)]
    except ValueError:
        pass
    return sorted({h for h in hide if h}, key=len, reverse=True)


def redact(line: str, hide: list) -> str:
    for h in hide:
        line = line.replace(h, "***")
    return line


def apply_env(path: Path, updates: dict) -> Path:
    """Sets/replaces the given lines in a .env file, keeping everything else. Writes a backup first. Returns the backup."""
    text = ""
    if path.exists():
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
    eol = "\r\n" if "\r\n" in text else "\n"
    backup = path.with_name(f"{path.name}.before-migration-{int(time.time())}")
    with open(backup, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    keep = [l for l in text.splitlines() if not any(l.startswith(k + "=") for k in updates)]
    while keep and not keep[-1].strip():
        keep.pop()
    keep += [f"{k}={v}" for k, v in updates.items()]
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(eol.join(keep) + eol)
    os.chmod(tmp, mode)
    os.replace(tmp, path)
    try:
        os.chmod(backup, mode)
    except OSError:
        pass
    return backup


def restart_app():
    """Ask PM2 to restart the backend (the same command the auto-deploy uses); if PM2 is not available, exit and let
    whatever supervises the process start it again."""
    try:
        subprocess.Popen(["pm2", "restart", PM2_APP], start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    except OSError:
        os.kill(os.getpid(), signal.SIGTERM)


def register(api_router, db, get_current_user, logger, get_backend):
    job = {"id": None, "mode": None, "state": "idle", "lines": [], "started": 0.0, "note": "", "flipped": None}

    async def owner_only(cu: dict = Depends(get_current_user)):
        if cu.get("role") == "platform_owner":
            return cu
        if cu.get("role") == "admin":
            oldest = await db.companies.find({}, {"_id": 0}).sort("created_at", 1).to_list(1)
            if oldest and oldest[0].get("id") == cu.get("company_id"):
                return cu
        raise HTTPException(403, "Only the owner (or an admin of the original business) may use this.")

    def say(text: str, hide=()):
        if len(job["lines"]) < MAX_LINES:
            job["lines"].append(redact(text, list(hide)))

    async def run_step(label: str, key: str, env: dict, hide: list) -> tuple:
        say(""); say(f"== {label}")
        lines = []

        def work():  # in a worker thread, so the live app keeps serving and this works on any event loop / OS
            proc = subprocess.Popen(STEP_COMMANDS[key], cwd=str(BACKEND), env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
            for raw in proc.stdout:
                line = raw.decode("utf-8", "replace").rstrip()
                lines.append(redact(line, hide))
                say(line, hide)
            return proc.wait()

        return await asyncio.get_running_loop().run_in_executor(None, work), lines

    async def flip(to: str, settings: Optional[dict]):
        updates = {"DB_BACKEND": to}
        if settings:
            updates.update(settings)
        backup = apply_env(ENV_FILE, updates)
        say(f"Saved DB_BACKEND={to} in .env (previous file kept as {backup.name}).")
        job["flipped"] = to
        say("Restarting the app in a few seconds so it uses it...")
        asyncio.get_running_loop().call_later(4, restart_app)

    async def run_job(mode: str, settings: Optional[dict]):
        hide = secrets_to_hide(settings) if settings else []
        try:
            if mode == "rollback":
                if not os.environ.get("MYSQL_USER"):
                    raise RuntimeError("The MariaDB settings (MYSQL_USER...) are not in this server's .env, so there is nothing to go back to.")
                await flip("mysql", None)
            else:
                env = {**os.environ, **settings, "PYTHONUNBUFFERED": "1"}
                for label, key in PLANS[mode]:
                    rc, lines = await run_step(label, key, env, hide)
                    problem = f"this step stopped with an error (code {rc})" if rc else step_problem(key, lines)
                    if problem:
                        raise RuntimeError(f"Stopped: {problem}. Nothing was deleted and the app was not switched.")
                if mode == "switch":
                    say(""); say("== Everything matches - switching the app to Supabase")
                    await flip("postgres", settings)
                else:
                    say(""); say("== DONE. The app is still using MariaDB; nothing was switched.")
            job["state"] = "done"
        except Exception as e:  # report it; never let a failed job take the app down
            if isinstance(e, RuntimeError):
                logger.warning("migration tool: %s", e)
            else:
                logger.exception("migration tool job failed")
            say(""); say(str(e) if isinstance(e, RuntimeError) else f"Stopped: unexpected error ({type(e).__name__}). Nothing was deleted and the app was not switched.", hide)
            job["state"] = "failed"

    @api_router.post("/admin/migration/run")
    async def migration_run(body: RunBody, cu: dict = Depends(owner_only)):
        if job["state"] == "running" and time.time() - job["started"] < STALE_AFTER:
            raise HTTPException(409, "A run is already in progress - wait for it to finish.")
        settings = None if body.mode == "rollback" else clean_settings(body)
        if body.mode == "rollback" and get_backend() != "postgres":
            raise HTTPException(400, "The app is not using Supabase, so there is nothing to roll back.")
        if body.mode == "switch" and get_backend() == "postgres":
            raise HTTPException(400, "The app is already using Supabase.")
        if body.mode == "switch" and not os.environ.get("MYSQL_USER"):
            raise HTTPException(400, "The MariaDB settings are not in this server's .env.")
        job.update(id=uuid.uuid4().hex[:8], mode=body.mode, state="running", lines=[], started=time.time(), flipped=None)
        logger.warning("migration tool: %s started by %s", body.mode, cu.get("username"))
        job["task"] = asyncio.create_task(run_job(body.mode, settings))  # kept, so it cannot be cleaned up mid-run
        return {"job": job["id"]}

    @api_router.get("/admin/migration/status")
    async def migration_status(since: int = 0, cu: dict = Depends(owner_only)):
        return {"job": job["id"], "mode": job["mode"], "state": job["state"], "db_backend": get_backend(),
                "flipped": job["flipped"], "lines": job["lines"][max(0, since):], "next": len(job["lines"]),
                "user": cu.get("username"),
                # server.py serves a photo/document from the database whenever Storage is not switched on here, so moving
                # files to Storage cannot break the live site. An older server does not say so, and copy/switch refuse to run.
                "photo_fallback": True,
                # copy re-uploads files that the database calls "moved" but that are not in the Storage project being used
                # (needed when the project changes, e.g. to a nearer region); an older server does not say so.
                "media_reupload": True}
