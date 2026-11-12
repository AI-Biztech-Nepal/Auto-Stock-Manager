"""Backs up Auto Stock Manager's Supabase project to a folder on this PC: all the data, and the photos and documents.

It only READS from Supabase. It never changes or deletes anything there, and it never deletes anything in the backup folder
(every backup is a new dated folder; the photo folder only ever gains files).

    python tools/backup_supabase.py                  # data (one dated folder) + any photos/documents not yet saved
    python tools/backup_supabase.py --no-files       # data only (fast)
    python tools/backup_supabase.py verify           # check the newest backup is complete and not damaged
    python tools/backup_supabase.py restore <backup folder>        # put a backup back into an EMPTY Supabase project
    python tools/backup_supabase.py restore-files    # upload the saved photos/documents back to Storage

Where: %USERPROFILE%\\AutoStockBackups (change with --to). The data folder holds customers' details and password hashes: keep it
private (not in a shared or synced folder). Needs: pip install "psycopg[binary]" (the launcher does this for you).
Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL from backend/.env (nothing is printed).
"""
import argparse
import concurrent.futures as cf
import csv
import gzip
import hashlib
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV = ROOT / "backend" / ".env"
DEFAULT_DEST = Path.home() / "AutoStockBackups"
BUCKETS = ("asm-photos", "asm-documents")
csv.field_size_limit(sys.maxsize)


def die(msg, code=1):
    print("\n" + msg)
    sys.exit(code)


def q(name):
    return '"' + name.replace('"', '""') + '"'


def read_env(path):
    try:
        raw = Path(path).read_bytes()
    except OSError:
        die(f"Cannot read {path}.")
    env = {}
    for line in raw.replace(b"\x00", b"").decode("utf-8", "replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip("\"'")
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"):
        if not env.get(k):
            die(f"{k} is empty in {path}.")
    env["SUPABASE_URL"] = env["SUPABASE_URL"].rstrip("/")
    return env


def connect(env, schema=None):
    try:
        import psycopg
    except ImportError:
        die('The database add-on is missing. Run:  python -m pip install --user "psycopg[binary]"')
    opts = f"-c search_path={schema},public" if schema else None
    return psycopg.connect(env["SUPABASE_DB_URL"], prepare_threshold=None, connect_timeout=30, **({"options": opts} if opts else {}))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ── backup: data ────────────────────────────────────────────────────────────
def backup_data(env, dest, schema=None):
    """One dated folder with every table as a compressed CSV and a manifest. All tables come from ONE consistent snapshot of the
    database, even while the live app is writing."""
    import psycopg
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    snap = Path(dest) / "data" / stamp
    snap.mkdir(parents=True, exist_ok=False)
    conn = connect(env, schema)
    conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
    conn.read_only = True
    manifest = {"made_at": datetime.now().isoformat(timespec="seconds"), "project": urllib.parse.urlsplit(env["SUPABASE_URL"]).hostname.split(".")[0],
                "tables": {}}
    with conn:
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute(
            "select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE' order by 1").fetchall()]
        for t in tables:
            cols = cur.execute(
                "select a.attname, format_type(a.atttypid, a.atttypmod), not a.attnotnull from pg_attribute a "
                "where a.attrelid = %s::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum", (q(t),)).fetchall()
            path = snap / f"{t}.csv.gz"
            with gzip.open(path, "wb", compresslevel=6) as gz:
                with cur.copy(f"copy {q(t)} to stdout with (format csv, header true)") as cp:
                    for chunk in cp:
                        gz.write(bytes(chunk))
            n = cur.execute(f"select count(*) from {q(t)}").fetchone()[0]
            manifest["tables"][t] = {"rows": n, "file": path.name, "bytes": path.stat().st_size, "sha256": sha256(path),
                                     "columns": [{"name": c, "type": ty, "nullable": nl} for c, ty, nl in cols]}
            print(f"  {t:30s} {n:>8} rows")
    (snap / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    total = sum(v["rows"] for v in manifest["tables"].values())
    size = sum(v["bytes"] for v in manifest["tables"].values())
    print(f"Data saved: {len(tables)} tables, {total} rows, {size / 1e6:.1f} MB in {snap}")
    return snap


# ── backup: photos and documents ────────────────────────────────────────────
def object_url(env, bucket, name):
    return f"{env['SUPABASE_URL']}/storage/v1/object/{bucket}/{urllib.parse.quote(name)}"


def backup_files(env, dest, schema=None, max_files=None, workers=8):
    """Saves every file that is in Storage and not yet in <dest>/files (same name and size). Never deletes anything."""
    conn = connect(env, schema)
    with conn:
        objs = conn.execute("select bucket_id, name, (metadata->>'size')::bigint from storage.objects where bucket_id = any(%s) order by 1, 2",
                            (list(BUCKETS),)).fetchall()
    base = Path(dest) / "files"
    todo, have = [], 0
    for bucket, name, size in objs:
        local = base / bucket / name
        if local.exists() and (size is None or local.stat().st_size == size):
            have += 1
        else:
            todo.append((bucket, name, size))
    print(f"Storage holds {len(objs)} files; {have} are already saved on this PC; {len(todo)} to save now.")
    if max_files is not None:
        todo = todo[:max_files]
    headers = {"apikey": env["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"]}

    def fetch(item):
        bucket, name, size = item
        local = base / bucket / name
        local.parent.mkdir(parents=True, exist_ok=True)
        part = local.with_name(local.name + ".part")
        last = ""
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(object_url(env, bucket, name), headers=headers), timeout=120) as r, open(part, "wb") as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
                if size is not None and part.stat().st_size != size:
                    raise OSError(f"size {part.stat().st_size}, expected {size}")
                part.replace(local)
                return None
            except Exception as e:  # noqa: BLE001 - retried, then reported
                last = f"{type(e).__name__}: {str(e)[:80]}"
                time.sleep(1 + attempt * 2)
        if part.exists():
            part.unlink()
        return f"{bucket}/{name}: {last}"

    done = failed = 0
    errors = []
    with cf.ThreadPoolExecutor(workers) as ex:
        for res in ex.map(fetch, todo):
            if res:
                failed += 1
                errors.append(res)
            else:
                done += 1
            if (done + failed) % 100 == 0:
                print(f"  {done + failed}/{len(todo)}")
    print(f"Files: {done} saved, {failed} failed.")
    for e in errors[:10]:
        print("  " + e)
    return failed == 0


# ── verify ──────────────────────────────────────────────────────────────────
def newest_snapshot(dest):
    snaps = sorted(p for p in (Path(dest) / "data").glob("*") if (p / "manifest.json").exists())
    return snaps[-1] if snaps else None


def verify(snap):
    manifest = json.loads((Path(snap) / "manifest.json").read_text(encoding="utf-8"))
    bad = 0
    for t, info in manifest["tables"].items():
        path = Path(snap) / info["file"]
        if not path.exists():
            print(f"MISSING  {t}"); bad += 1; continue
        if sha256(path) != info["sha256"]:
            print(f"DAMAGED  {t}  (the file changed since it was saved)"); bad += 1; continue
        with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
            rows = sum(1 for _ in csv.reader(f)) - 1
        if rows != info["rows"]:
            print(f"WRONG COUNT  {t}: file has {rows} rows, the backup recorded {info['rows']}"); bad += 1
    total = sum(v["rows"] for v in manifest["tables"].values())
    print(f"Backup {Path(snap).name}: {len(manifest['tables'])} tables, {total} rows - " + ("complete and not damaged." if not bad else f"{bad} PROBLEM(S) above."))
    return bad == 0


# ── restore ─────────────────────────────────────────────────────────────────
def restore(env, snap, allow_nonempty=False, schema=None, schema_sql=None):
    """Puts a backup back into an EMPTY project: creates the tables, loads the data (links between tables are not checked while it
    loads, because the live data can hold old leftover ones), and makes the auto-numbers carry on."""
    manifest = json.loads((Path(snap) / "manifest.json").read_text(encoding="utf-8"))
    if not verify(snap):
        die("The backup is not intact, so nothing was restored.")
    conn = connect(env, schema)
    conn.autocommit = True
    conn.execute(Path(schema_sql or ROOT / "backend" / "supabase" / "schema.sql").read_text(encoding="utf-8"))
    conn.autocommit = False
    have = {r[0] for r in conn.execute("select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'")}
    if not allow_nonempty:
        full = [t for t in manifest["tables"] if t in have and conn.execute(f"select exists (select 1 from {q(t)})").fetchone()[0]]
        if full:
            conn.rollback()
            die("Stopped: these tables already hold data, and a restore would mix it with the backup's: " + ", ".join(full)
                + "\nRestore into a new, empty project (or add --allow-nonempty if you are sure).")
    with conn:
        conn.execute("set local session_replication_role = replica")
        for t, info in manifest["tables"].items():
            existing = {r[0]: r[1] for r in conn.execute(
                "select column_name, is_nullable from information_schema.columns where table_schema = current_schema() and table_name = %s", (t,))}
            for c in info["columns"]:
                if c["name"] not in existing:  # a column only the live database had
                    conn.execute(f"alter table {q(t)} add column {q(c['name'])} {c['type']}")
                elif c["nullable"] and existing[c["name"]] == "NO":
                    conn.execute(f"alter table {q(t)} alter column {q(c['name'])} drop not null")
            cols = ", ".join(q(c["name"]) for c in info["columns"])
            with gzip.open(Path(snap) / info["file"], "rb") as gz, conn.cursor() as cur:
                with cur.copy(f"copy {q(t)} ({cols}) from stdin with (format csv, header true)") as cp:
                    while True:
                        chunk = gz.read(1 << 16)
                        if not chunk:
                            break
                        cp.write(chunk)
            for (col,) in conn.execute("select column_name from information_schema.columns where table_schema = current_schema() and table_name = %s "
                                       "and is_identity = 'YES'", (t,)).fetchall():
                conn.execute("select setval(pg_get_serial_sequence(%s, %s), coalesce((select max(" + q(col) + ") from " + q(t) + "), 0) + 1, false)",
                             (q(t), col))
        wrong = [t for t, info in manifest["tables"].items() if conn.execute(f"select count(*) from {q(t)}").fetchone()[0] != info["rows"]]
        if wrong:
            raise RuntimeError("row counts differ after loading: " + ", ".join(wrong))
    print(f"Restored {len(manifest['tables'])} tables, {sum(v['rows'] for v in manifest['tables'].values())} rows. Now run:  restore-files")


def restore_files(env, dest, schema=None, workers=8):
    base = Path(dest) / "files"
    conn = connect(env, schema)
    with conn:
        there = {(b, n) for b, n in conn.execute("select bucket_id, name from storage.objects where bucket_id = any(%s)", (list(BUCKETS),))}
    todo = [(bucket.name, str(p.relative_to(bucket)).replace(chr(92), "/"), p)
            for bucket in sorted(base.glob("*")) if bucket.is_dir() for p in bucket.rglob("*") if p.is_file() and not p.name.endswith(".part")]
    todo = [t for t in todo if (t[0], t[1]) not in there]
    print(f"{len(todo)} saved files are not in Storage yet.")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]

    def put(item):
        bucket, name, path = item
        ctype = "application/pdf" if name.lower().endswith(".pdf") else "image/" + (name.rsplit(".", 1)[-1].lower().replace("jpg", "jpeg") if "." in name else "jpeg")
        req = urllib.request.Request(object_url(env, bucket, name), data=path.read_bytes(), method="POST",
                                     headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": ctype, "x-upsert": "true"})
        try:
            urllib.request.urlopen(req, timeout=120).read()
            return None
        except Exception as e:  # noqa: BLE001
            return f"{bucket}/{name}: {type(e).__name__} {str(e)[:60]}"

    failed = []
    with cf.ThreadPoolExecutor(workers) as ex:
        for i, res in enumerate(ex.map(put, todo), 1):
            if res:
                failed.append(res)
            if i % 100 == 0:
                print(f"  {i}/{len(todo)}")
    print(f"Files: {len(todo) - len(failed)} uploaded, {len(failed)} failed.")
    for f in failed[:10]:
        print("  " + f)
    return not failed


def main(argv=None):
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("command", nargs="?", default="backup", choices=["backup", "verify", "restore", "restore-files"])
    ap.add_argument("folder", nargs="?", help="restore: the dated backup folder")
    ap.add_argument("--to", default=str(DEFAULT_DEST), help="backup folder (default: %(default)s)")
    ap.add_argument("--env", default=str(DEFAULT_ENV))
    ap.add_argument("--no-files", action="store_true")
    ap.add_argument("--allow-nonempty", action="store_true")
    ap.add_argument("--schema", help=argparse.SUPPRESS)
    ap.add_argument("--schema-sql", help=argparse.SUPPRESS)
    ap.add_argument("--max-files", type=int, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    dest = Path(a.to)
    if a.command == "verify":
        snap = Path(a.folder) if a.folder else newest_snapshot(dest)
        if not snap:
            die(f"No backup found in {dest}.")
        sys.exit(0 if verify(snap) else 1)
    env = read_env(a.env)
    if a.command == "backup":
        dest.mkdir(parents=True, exist_ok=True)
        print(f"Backing up project {urllib.parse.urlsplit(env['SUPABASE_URL']).hostname.split('.')[0]} to {dest}")
        snap = backup_data(env, dest, a.schema)
        ok = verify(snap)
        if not a.no_files:
            ok = backup_files(env, dest, a.schema, a.max_files) and ok
        print("\nDONE." if ok else "\nFinished WITH PROBLEMS - see above.")
        sys.exit(0 if ok else 1)
    if a.command == "restore":
        if not a.folder:
            die("Say which backup: restore <the dated folder inside " + str(dest / "data") + ">")
        restore(env, Path(a.folder), a.allow_nonempty, a.schema, a.schema_sql)
    if a.command == "restore-files":
        sys.exit(0 if restore_files(env, dest, a.schema) else 1)


if __name__ == "__main__":
    main()
