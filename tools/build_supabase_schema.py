"""Builds backend/supabase/schema.sql (the Postgres tables for Supabase) from the app's own MariaDB definitions:
backend/schema.sql, the Finance books migrations, and the CREATE TABLE / ADD COLUMN statements that server.py and
finance_books.py run at start-up. It then checks the result against sqldb.TABLES (every column the app reads must exist).

    python tools/build_supabase_schema.py            # rewrite backend/supabase/schema.sql
    python tools/build_supabase_schema.py --check    # change nothing; exit 1 if schema.sql is out of date

Run it whenever a table or column is added to the app (backend/tests/test_supabase_schema.py fails until you do).
Optional arguments: <backend dir> <postgres schema name> <output file>
"""
import ast, re, sys
from pathlib import Path

_args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
backend = Path(_args[0]) if len(_args) > 0 else Path(__file__).resolve().parent.parent / "backend"
SCHEMA = _args[1] if len(_args) > 1 else "public"
out_path = Path(_args[2]) if len(_args) > 2 else backend / "supabase" / "schema.sql"
schema_sql = (backend / "schema.sql").read_text(encoding="utf-8")
server_py = (backend / "server.py").read_text(encoding="utf-8")
sqldb_py = (backend / "sqldb.py").read_text(encoding="utf-8")


def strip_comments(s):
    return "\n".join(re.sub(r"--.*$", "", l) for l in s.splitlines())


def split_top(body):
    parts, depth, cur = [], 0, ""
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip()); cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


# ---- collect CREATE TABLE statements (schema.sql first; server.py adds the later ones)
stmts = [s for s in strip_comments(schema_sql).split(";") if re.match(r"\s*CREATE TABLE", s, re.I)]
stmts += re.findall(r'"""(CREATE TABLE IF NOT EXISTS .*?)"""', server_py, re.S)
for mig in ("migration_add_finance_books.sql", "migration_add_finance_rent.sql"):
    f = backend / mig
    if f.exists():
        stmts += [x for x in strip_comments(f.read_text(encoding="utf-8")).split(";") if re.match(r"\s*CREATE TABLE", x, re.I)]
fin_alters = []   # (table, column, type) from finance_books.py's ALTER ... ADD COLUMN strings
fb = backend / "finance_books.py"
if fb.exists():
    import ast as _ast
    wanted = {}
    for node in _ast.parse(fb.read_text(encoding="utf-8")).body:
        if isinstance(node, _ast.Assign) and getattr(node.targets[0], "id", "") in ("RENT_DDL", "PARTY_TYPE_DDL", "QUOTATION_DDL", "GROUP_DDL", "SERVICE_COLUMNS"):
            wanted[node.targets[0].id] = _ast.literal_eval(node.value)
    texts = [wanted.get("QUOTATION_DDL", ""), wanted.get("GROUP_DDL", ""), *wanted.get("RENT_DDL", []), *wanted.get("PARTY_TYPE_DDL", [])]
    for t in texts:
        if t.upper().startswith("CREATE TABLE"):
            stmts.append(t)
        else:
            m = re.match(r"ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+) (.+)$", t, re.I)
            if m: fin_alters.append(m.groups())
    for col, kind in wanted.get("SERVICE_COLUMNS", ()):
        fin_alters.append(("fin_transactions", col, kind))
stmts.append("CREATE TABLE IF NOT EXISTS facebook_pages (id VARCHAR(36) NOT NULL PRIMARY KEY, company_id VARCHAR(36) NOT NULL, "
             "INDEX idx_facebook_pages_company_id (company_id), page_id VARCHAR(64), page_name VARCHAR(255), access_token TEXT, "
             "connected_by VARCHAR(100), connected_at VARCHAR(40), CONSTRAINT fk_facebook_pages_company FOREIGN KEY (company_id) "
             "REFERENCES companies(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")

TYPES = [(r"VARCHAR\((\d+)\)", lambda m: f"varchar({m.group(1)})"), (r"LONGTEXT|MEDIUMTEXT|TEXT", lambda m: "text"),
         (r"TINYINT\(1\)", lambda m: "boolean"), (r"BIGINT", lambda m: "bigint"), (r"INT", lambda m: "integer"),
         (r"DOUBLE", lambda m: "double precision"), (r"JSON", lambda m: "jsonb")]


def parse_column(name, rest):
    col = {"name": name, "notnull": False, "default": None, "unique": False, "pk": False, "identity": False}
    for pat, fn in TYPES:
        m = re.match(pat, rest, re.I)
        if m:
            col["type"], rest = fn(m), rest[m.end():]
            break
    else:
        raise ValueError(f"unknown type in column {name}: {rest}")
    if re.search(r"NOT NULL", rest, re.I): col["notnull"] = True
    if re.search(r"\bUNIQUE\b", rest, re.I): col["unique"] = True
    if re.search(r"PRIMARY KEY", rest, re.I): col["pk"] = True
    if re.search(r"AUTO_INCREMENT", rest, re.I): col["identity"] = True
    m = re.search(r"DEFAULT\s+('(?:[^']|'')*'|[-\w.]+)", rest, re.I)
    if m:
        d = m.group(1)
        if d.upper() == "NULL":
            d = None
        elif col["type"] == "boolean":
            d = "true" if d in ("1", "true", "TRUE") else "false"
        col["default"] = d
    return col


tables = {}  # name -> dict
for stmt in stmts:
    m = re.match(r"\s*CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\((.*)\)\s*ENGINE=.*$", stmt, re.S | re.I)
    name, body = m.group(1), strip_comments(m.group(2)).replace("`", "")
    if name in tables:
        continue
    t = {"cols": [], "indexes": [], "uniques": [], "fks": [], "checks": [], "pk": None}
    for item in split_top(body):
        u = item.upper()
        if u.startswith("UNIQUE KEY"):
            mm = re.match(r"UNIQUE\s+KEY\s+(\w+)\s*\(([^)]*)\)", item, re.I)
            t["uniques"].append((mm.group(1), [c.strip() for c in mm.group(2).split(",")]))
        elif u.startswith("INDEX") or u.startswith("KEY"):
            mm = re.match(r"(?:INDEX|KEY)\s+(\w+)\s*\(([^)]*)\)", item, re.I)
            t["indexes"].append((mm.group(1), [c.strip() for c in mm.group(2).split(",")]))
        elif u.startswith("CONSTRAINT") and "FOREIGN KEY" in u:
            mm = re.match(r"CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)\s*(.*)$", item, re.I | re.S)
            t["fks"].append((mm.group(1), mm.group(2), mm.group(3), mm.group(4), mm.group(5).strip()))
        elif u.startswith("CONSTRAINT") and "CHECK" in u:
            mm = re.match(r"CONSTRAINT\s+(\w+)\s+CHECK\s*(\(.*\))$", item, re.I | re.S)
            t["checks"].append((mm.group(1), mm.group(2)))
        elif u.startswith("PRIMARY KEY"):
            t["pk"] = [c.strip() for c in re.search(r"\(([^)]*)\)", item).group(1).split(",")]
        else:
            cm = re.match(r"(\w+)\s+(.*)$", item, re.S)
            if not cm:
                raise SystemExit(f"cannot parse in table {name}: {item!r}")
            t["cols"].append(parse_column(cm.group(1), cm.group(2).strip()))
    tables[name] = t

# ---- columns the app adds at startup (server.py's _post_schema_cols + the two vehicles columns)
block = re.search(r"_post_schema_cols = \[(.*?)\n        \]", server_py, re.S).group(1)
patches = re.findall(r'\("(\w+)", "(\w+)", "([^"]+)"\)', block)
patches += [("vehicles", "ownership_termination_status", "VARCHAR(20) DEFAULT 'pending'"),
            ("vehicles", "ownership_transfer_status", "VARCHAR(20) DEFAULT 'pending'")]
patches += fin_alters
added = []
for tbl, col, typ in patches:
    t = tables[tbl]
    if col not in {c["name"] for c in t["cols"]}:
        t["cols"].append(parse_column(col, typ)); added.append(f"{tbl}.{col}")

# ---- users.username: MariaDB compared text case-insensitively, so "Admin" found "admin" at login. Keep that.
for c in tables["users"]["cols"]:
    if c["name"] == "username":
        c["type"] = "citext"

# ---- cross-check against the app's own table list
tree = ast.parse(sqldb_py)
app_tables = next(ast.literal_eval(n.value) for n in tree.body
                  if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "TABLES")
problems = []
for tname, meta in app_tables.items():
    if tname not in tables:
        problems.append(f"TABLE MISSING: {tname}"); continue
    have = {c["name"] for c in tables[tname]["cols"]}
    miss = meta["columns"] - have
    if miss: problems.append(f"{tname}: app expects columns not in schema: {sorted(miss)}")
    extra = have - meta["columns"]
    if extra: print(f"note: {tname} has columns the app never reads: {sorted(extra)}", file=sys.stderr)
    for b in meta.get("bool_cols", set()):
        ty = next((c["type"] for c in tables[tname]["cols"] if c["name"] == b), None)
        if ty != "boolean": problems.append(f"{tname}.{b} should be boolean, is {ty}")
    for j in meta.get("json_cols", set()):
        ty = next((c["type"] for c in tables[tname]["cols"] if c["name"] == j), None)
        if ty not in ("jsonb", "text"): problems.append(f"{tname}.{j} should be jsonb or text, is {ty}")
print(f"tables built: {len(tables)}; startup columns added: {len(added)}", file=sys.stderr)
for p in problems: print("PROBLEM:", p, file=sys.stderr)

# ---- write postgres SQL
Q = lambda s: '"' + s + '"'
S = Q(SCHEMA)
o = ["-- Auto Stock Manager's tables on Supabase (Postgres). Generated from backend/schema.sql plus the columns/tables",
     "-- server.py adds at startup, then checked against sqldb.TABLES. Safe to run more than once.",
     "-- Text dates stay text (ISO strings) and money stays double precision, exactly as in MariaDB.",
     "-- users.username is citext (case-insensitive), because MariaDB matched usernames case-insensitively.",
     "begin;", "create extension if not exists citext;", ""]
used_idx = set()
for name, t in tables.items():
    lines = []
    for c in t["cols"]:
        s = f"  {Q(c['name'])} {c['type']}"
        if c["identity"]: s += " generated by default as identity"
        if c["notnull"] or c["pk"]: s += " not null"
        if c["default"] is not None: s += f" default {c['default']}"
        if c["unique"]: s += " unique"
        if c["pk"]: s += " primary key"
        lines.append(s)
    if t["pk"]: lines.append(f"  primary key ({', '.join(Q(x) for x in t['pk'])})")
    for n, cols in t["uniques"]: lines.append(f"  constraint {Q(n)} unique ({', '.join(Q(x) for x in cols)})")
    for n, expr in t["checks"]: lines.append(f"  constraint {Q(n)} check {expr}")
    o.append(f"create table if not exists {S}.{Q(name)} (\n" + ",\n".join(lines) + "\n);")
    o.append(f"alter table {S}.{Q(name)} enable row level security;  -- the public API key can read nothing; the backend connects directly")
    for c in t["cols"]:  # a table that already exists (older schema) gets any column it is missing
        if c["identity"]: continue
        d = f" default {c['default']}" if c["default"] is not None else ""
        o.append(f"alter table {S}.{Q(name)} add column if not exists {Q(c['name'])} {c['type']}{d};")
    for n, cols in t["indexes"]:
        iname = n if n not in used_idx else f"{name}_{n}"
        used_idx.add(iname)
        o.append(f"create index if not exists {Q(iname)} on {S}.{Q(name)} ({', '.join(Q(x) for x in cols)});")
    o.append("")
o.append("-- Foreign keys (added once every table exists).")
for name, t in tables.items():
    for n, col, rt, rc, tail in t["fks"]:
        on = f" {tail}" if tail else ""
        o.append(f"do $$ begin alter table {S}.{Q(name)} add constraint {Q(n)} foreign key ({Q(col)}) "
                 f"references {S}.{Q(rt)} ({Q(rc)}){on}; exception when duplicate_object then null; end $$;")
o += ["", "commit;", "", "notify pgrst, 'reload schema';", ""]
text = "\n".join(o)
if CHECK:
    current = out_path.read_text(encoding="utf-8").replace("\r\n", "\n") if out_path.exists() else ""
    if current != text:
        print(f"{out_path} is out of date: run  python tools/build_supabase_schema.py  and commit the result.", file=sys.stderr)
        sys.exit(1)
    print(f"{out_path} is up to date ({len(tables)} tables).", file=sys.stderr)
else:
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {out_path} ({len(tables)} tables)", file=sys.stderr)
sys.exit(1 if problems else 0)
