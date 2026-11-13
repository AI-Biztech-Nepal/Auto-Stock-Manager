"""Automatic backups of the Supabase project, so nobody has to remember to run them.

Every night at 02:30 Nepal time (BACKUP_AT) this runs tools/backup_supabase.py in its own process: all the data as one dated folder
of compressed files, checked afterwards, plus any photos and documents not saved yet. Old backups are tidied (the newest 14, and one
per week for 8 weeks). It only READS from Supabase. Nothing is ever deleted there.

  * Where: BACKUP_DIR (default ~/AutoStockBackups for the user the app runs as). The data holds customers' details and password
    hashes: keep that folder private.
  * If the app was off at 02:30 (or the last try failed), it catches up: a backup older than 26 hours is made soon after the app
    starts, and a failed try is repeated every 30 minutes, up to 4 times.
  * Photos and documents are only copied while the disk has at least 3 GB free; otherwise just the data is saved and the report says so.
  * Settings > Automatic backups shows the state, has a "Back up now" button, and the sidebar bell warns when no backup has worked
    for 36 hours.
  * AUTO_BACKUP=off turns the schedule off. It also stays off when the app runs against a test schema (PG_SCHEMA) and with the old
    MariaDB database.
"""
import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger("auto_backup")

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "backup_supabase.py"
NEPAL = timezone(timedelta(hours=5, minutes=45))
STARTUP_DELAY = 600            # seconds after the app starts before it looks at whether a backup is due
CATCH_UP_HOURS = 26            # a backup older than this is made right away
PROBLEM_HOURS = 36             # no good backup for this long: warn
RETRY_AFTER = 30 * 60
MAX_TRIES = 4
MIN_FREE_GB_FOR_FILES = 3.0
RUN_TIMEOUT = 4 * 3600

_running = {"since": None, "manual": False}
_tasks: set = set()
_started_at = time.time()


def schedule_enabled() -> bool:
    return (os.environ.get("AUTO_BACKUP", "on").strip().lower() not in ("off", "0", "false", "no")
            and not os.environ.get("PG_SCHEMA"))  # a test schema: never schedule


def backup_dir() -> Path:
    return Path(os.environ.get("BACKUP_DIR") or (Path.home() / "AutoStockBackups"))


def _status_file() -> Path:
    return backup_dir() / "auto-backup-status.json"


def read_status() -> dict:
    try:
        return json.loads(_status_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write_status(st: dict) -> None:
    try:
        backup_dir().mkdir(parents=True, exist_ok=True)
        tmp = _status_file().with_suffix(".tmp")
        tmp.write_text(json.dumps(st, indent=1), encoding="utf-8")
        os.replace(tmp, _status_file())
    except OSError:
        logger.warning("Could not write the backup status file", exc_info=True)


def _parse(iso: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(iso) if iso else None
    except ValueError:
        return None


def _hours_since(iso: Optional[str], now: Optional[datetime] = None) -> Optional[float]:
    t = _parse(iso)
    return None if t is None else ((now or datetime.now(timezone.utc)) - t).total_seconds() / 3600


def next_scheduled(now: Optional[datetime] = None) -> datetime:
    """The next BACKUP_AT (HH:MM, Nepal time) after `now`."""
    now = now or datetime.now(timezone.utc)
    try:
        hh, mm = (int(x) for x in os.environ.get("BACKUP_AT", "02:30").split(":"))
        if not (0 <= hh < 24 and 0 <= mm < 60):
            raise ValueError
    except ValueError:
        hh, mm = 2, 30
    local = now.astimezone(NEPAL)
    due = local.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if due <= local:
        due += timedelta(days=1)
    return due.astimezone(timezone.utc)


def when_due(st: dict, now: Optional[datetime] = None) -> datetime:
    """When the next run should start, given what the status file says."""
    now = now or datetime.now(timezone.utc)
    age = _hours_since(st.get("last_ok"), now)
    failures = int(st.get("failures") or 0)
    if age is None or age > CATCH_UP_HOURS:
        last_try = _parse(st.get("last_try"))
        if failures and failures < MAX_TRIES and last_try:
            return max(now, last_try + timedelta(seconds=RETRY_AFTER))
        if failures >= MAX_TRIES:
            return next_scheduled(now)
        return now
    return next_scheduled(now)


# ── the run ───────────────────────────────────────────────────────────────────────────────────
def _free_gb(path: Path) -> float:
    probe = path
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return shutil.disk_usage(probe).free / 1e9


def _run_tool(manual: bool) -> dict:
    """Runs the backup tool and returns the new status. Blocking: called in a worker thread."""
    started = time.time()
    dest = backup_dir()
    st = read_status()
    st.update(last_try=datetime.now(timezone.utc).isoformat(timespec="seconds"), manual=manual)
    schema = os.environ.get("PG_SCHEMA")
    notes = []
    try:
        dest.mkdir(parents=True, exist_ok=True)
        free = _free_gb(dest)
        with_files = free >= MIN_FREE_GB_FOR_FILES and not schema
        if not with_files and not schema:
            notes.append(f"Photos and documents were not copied: only {free:.1f} GB of disk is free (needs {MIN_FREE_GB_FOR_FILES:.0f} GB).")
        cmd = [sys.executable, str(TOOL), "--to", str(dest), "--prune"] + ([] if with_files else ["--no-files"]) + (["--schema", schema] if schema else [])
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=RUN_TIMEOUT, cwd=str(ROOT))
        out = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
        lines = [l.rstrip() for l in out.splitlines() if l.strip()]
        ok = proc.returncode == 0
        summary = [l for l in lines if re.match(r"(Data saved|Storage holds|Files:|Old backups removed|Backup \S+: )", l)]
        st.update(ok=ok, with_files=with_files, summary=summary[-6:], notes=notes, error=None if ok else " | ".join(lines[-4:])[:600])
        m = re.search(r"Storage holds (\d+) files", out)
        if m:
            st["storage_files"] = int(m.group(1))
    except subprocess.TimeoutExpired:
        st.update(ok=False, with_files=False, summary=[], notes=notes, error=f"Took longer than {RUN_TIMEOUT // 3600} hours and was stopped.")
    except Exception as e:  # noqa: BLE001 - never let a backup problem reach the app
        st.update(ok=False, with_files=False, summary=[], notes=notes, error=f"{type(e).__name__}: {str(e)[:300]}")
    st["seconds"] = round(time.time() - started)
    if st.get("ok"):
        st["last_ok"] = st["last_try"]
        st["failures"] = 0
    else:
        st["failures"] = int(st.get("failures") or 0) + 1
    _write_status(st)
    (logger.info if st.get("ok") else logger.error)("Backup %s in %ss: %s", "finished" if st.get("ok") else "FAILED", st["seconds"], st.get("error") or "; ".join(st.get("summary") or []))
    return st


async def run_once(manual: bool = False) -> bool:
    """Starts a backup unless one is already running. True if it ran (successfully or not), False if one was already going."""
    if _running["since"]:
        return False
    _running.update(since=time.time(), manual=manual)   # set before the first await, so two callers cannot both start
    try:
        await asyncio.to_thread(_run_tool, manual)
    finally:
        _running.update(since=None, manual=False)
    return True


def start_manual() -> bool:
    """For the "Back up now" button: starts a run in the background. False if one is already going."""
    if _running["since"]:
        return False
    task = asyncio.get_running_loop().create_task(run_once(manual=True))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return True


async def scheduler() -> None:
    await asyncio.sleep(STARTUP_DELAY)
    while True:
        try:
            due = when_due(read_status())
            wait = (due - datetime.now(timezone.utc)).total_seconds()
            if wait > 1:
                await asyncio.sleep(min(wait, 3600))   # looked at again at least hourly, so a manual run or a clock change is noticed
                continue
            await run_once()
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.warning("Backup scheduler hiccup", exc_info=True)
            await asyncio.sleep(300)


def start_scheduler() -> None:
    if not schedule_enabled():
        logger.info("Automatic backups are off (AUTO_BACKUP, or a test schema).")
        return
    task = asyncio.get_running_loop().create_task(scheduler())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    logger.info("Automatic backups on: every night at %s Nepal time into %s", os.environ.get("BACKUP_AT", "02:30"), backup_dir())


# ── for the screen ────────────────────────────────────────────────────────────────────────────
def snapshot() -> dict:
    st = read_status()
    now = datetime.now(timezone.utc)
    age = _hours_since(st.get("last_ok"), now)
    data = backup_dir() / "data"
    copies, latest = 0, None
    try:
        good = sorted(p for p in data.iterdir() if p.is_dir() and (p / "manifest.json").exists())
        copies = len(good)
        if good:
            manifest = json.loads((good[-1] / "manifest.json").read_text(encoding="utf-8"))
            latest = {"folder": good[-1].name, "made_at": manifest.get("made_at"), "tables": len(manifest.get("tables", {})),
                      "rows": sum(t.get("rows", 0) for t in manifest.get("tables", {}).values()),
                      "mb": round(sum(t.get("bytes", 0) for t in manifest.get("tables", {}).values()) / 1e6, 1)}
    except (OSError, ValueError):
        pass
    enabled = schedule_enabled()
    never = age is None
    uptime_h = (time.time() - _started_at) / 3600
    problem = enabled and ((never and uptime_h > 2) or (not never and age > PROBLEM_HOURS) or int(st.get("failures") or 0) >= 2)
    try:
        free = round(_free_gb(backup_dir()), 1)
    except OSError:
        free = None
    return {"enabled": enabled, "schedule": f"every night at {os.environ.get('BACKUP_AT', '02:30')} Nepal time", "dir": str(backup_dir()),
            "running": bool(_running["since"]), "running_manual": bool(_running["since"] and _running["manual"]),
            "next_run": next_scheduled(now).isoformat(timespec="seconds") if enabled else None,
            "last_try": st.get("last_try"), "last_ok": st.get("last_ok"), "last_ok_hours_ago": None if never else round(age, 1),
            "ok": st.get("ok"), "failures": int(st.get("failures") or 0), "error": st.get("error"), "summary": st.get("summary") or [],
            "notes": st.get("notes") or [], "seconds": st.get("seconds"), "with_files": st.get("with_files"), "storage_files": st.get("storage_files"),
            "copies": copies, "latest": latest, "disk_free_gb": free, "problem": bool(problem)}
