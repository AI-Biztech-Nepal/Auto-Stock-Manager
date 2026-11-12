"""backend/supabase/schema.sql (the Postgres tables for Supabase) is generated from the app's own definitions:
schema.sql, the Finance migrations, and the CREATE TABLE / ADD COLUMN statements run at start-up in server.py and
finance_books.py. A table or column added in any of those but not in schema.sql would be silently missing on Supabase
(its data never saved, or left behind by the copy). This fails when the two drift apart.

Fix: python tools/build_supabase_schema.py   (then commit backend/supabase/schema.sql).
Reads files only: no database, no server.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_supabase_schema_is_up_to_date():
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "build_supabase_schema.py"), "--check"],
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, (
        "backend/supabase/schema.sql is out of date (or does not cover a column the app reads).\n"
        "Run  python tools/build_supabase_schema.py  and commit the result.\n\n" + r.stderr[-1500:])
