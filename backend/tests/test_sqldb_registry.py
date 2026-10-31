"""sqldb.py only knows the tables and columns listed in its TABLES registry: a table that is missing raises
"No such collection/table", and a column that is missing is dropped from every INSERT, UPDATE *and* SELECT without
any error. So a column added to the database (in schema.sql, or by the ALTER / CREATE TABLE statements in server.py's
start-up) but not to TABLES silently never saves and never reads back.

This reads the files as text (no database, no server import) and fails when the two drift apart.
Anything in KNOWN_MISSING is an older gap that still needs a decision; the list may only shrink.
"""
import ast
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

# Older gaps (not yet fixed): see the note in each line. Remove an entry when the column is added to TABLES.
KNOWN_MISSING = {
    ("bookings", "receipt_no"),            # booking receipt numbers are generated but never stored
    ("sales", "cost_at_return"),           # the "fresh cost cycle on return" snapshot is never stored
    ("sales", "prev_purchase_price"),
    ("sales", "prev_purchase_date"),
    ("sales", "prev_accessories_cost"),
    ("sales", "prev_sanakhat_cost"),
}
# Tables sqldb.py handles itself rather than through TABLES.
SPECIAL_TABLES = {"spare_parts_set_components"}

_COLUMN_LINE = re.compile(r"^(\w+)\s+(VARCHAR|INT|DOUBLE|TEXT|JSON|TINYINT|LONGTEXT|MEDIUMTEXT|DECIMAL|BIGINT|DATE)\b", re.IGNORECASE)
_NOT_COLUMNS = ("INDEX", "CONSTRAINT", "UNIQUE", "PRIMARY", "KEY", "CHECK")


def _registry():
    tree = ast.parse((BACKEND / "sqldb.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "TABLES":
            reg = {}
            for key, meta in zip(node.value.keys, node.value.values):
                cols = set()
                for k, v in zip(meta.keys, meta.values):
                    if k.value == "columns":
                        cols = {e.value for e in v.elts}
                reg[key.value] = cols
            return reg
    raise AssertionError("TABLES not found in sqldb.py")


def _created_tables(sql_text):
    for name, body in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\) ENGINE", sql_text, re.S):
        cols = set()
        for line in body.splitlines():
            line = line.strip()
            m = _COLUMN_LINE.match(line)
            if m and not line.upper().startswith(_NOT_COLUMNS):
                cols.add(m.group(1))
        yield name, cols


def _missing():
    reg = _registry()
    found = []
    sources = [(BACKEND / "schema.sql").read_text(encoding="utf-8"), (BACKEND / "server.py").read_text(encoding="utf-8")]
    for text in sources:
        for table, cols in _created_tables(text):
            if table in SPECIAL_TABLES: continue
            if table not in reg: found.append((table, "(the whole table)")); continue
            found += [(table, c) for c in sorted(cols - reg[table])]
    # columns the server adds to existing tables at start-up
    srv = sources[1]
    block = re.search(r"_post_schema_cols = \[(.*?)\n        \]", srv, re.S)
    for table, col, _type in re.findall(r'\("(\w+)", "(\w+)", "([^"]+)"\)', block.group(1)):
        if table not in reg: found.append((table, "(the whole table)"))
        elif col not in reg[table]: found.append((table, col))
    return sorted(set(found))


def test_every_column_the_app_creates_is_known_to_the_sql_layer():
    new = [m for m in _missing() if m not in KNOWN_MISSING]
    assert not new, (
        "These tables/columns exist in the database (schema.sql or server.py's start-up) but not in sqldb.TABLES, so the "
        f"app would silently never save or read them: {new}. Add them to TABLES in backend/sqldb.py."
    )


def test_known_gaps_list_only_shrinks():
    still = set(_missing())
    fixed = sorted(KNOWN_MISSING - still)
    assert not fixed, f"These are fixed now, remove them from KNOWN_MISSING: {fixed}"
