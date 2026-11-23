"""DRY RUN helpers for moving Stock onto the portal. Reads JSON files you export yourself; connects to nothing,
writes nothing, prints SQL/report text only. You review the output and apply it to the portal yourself.

  python scripts/portal_cutover_report.py map     stock_companies.json portal_orgs.json
  python scripts/portal_cutover_report.py people  stock_users.json     [stock_companies.json]

Exports (read-only queries, run by you):
  stock_companies.json  select id, name from companies;                          -> [{"id":..,"name":..}]
  portal_orgs.json      select id, name from core.organizations;                 -> [{"id":..,"name":..}]
  stock_users.json      select id, company_id, username, name, role from users; -> [{...}]
"""
import json
import re
import sys
from collections import Counter, defaultdict

STOCK_ROLES = {"admin", "stock_supervisor", "parts_supervisor", "social_media", "sanakhat_officer"}
FIRST = "hamro"  # Hamro G&G Auto is listed first


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def propose_map(companies, orgs):
    by_name = defaultdict(list)
    for o in orgs:
        by_name[norm(o["name"])].append(o)
    rows, undecided = [], []
    for c in sorted(companies, key=lambda c: (FIRST not in norm(c["name"]), norm(c["name"]))):
        hits = by_name.get(norm(c["name"]), [])
        (rows if len(hits) == 1 else undecided).append((c, hits))
    out = ["-- PROPOSED core.legacy_tenant_map rows (review, then apply yourself; nothing was written)"]
    for c, hits in rows:
        out.append(f"insert into core.legacy_tenant_map (service_key, legacy_id, org_id) values "
                   f"('stock', '{c['id']}', '{hits[0]['id']}');  -- {c['name']}")
    if undecided:
        out.append("\n-- NEEDS A DECISION (no single exact name match; not guessed)")
        for c, hits in undecided:
            why = "no org with this name" if not hits else f"{len(hits)} orgs with this name"
            out.append(f"--   company {c['id']} '{c['name']}': {why}")
    return "\n".join(out)


def people_report(users, companies=()):
    names = {c["id"]: c["name"] for c in companies}
    out = ["-- PEOPLE DRY RUN (nobody is migrated)"]
    by_co = defaultdict(Counter)
    for u in users:
        by_co[u.get("company_id")][u.get("role") or "(none)"] += 1
    for co, roles in sorted(by_co.items(), key=lambda kv: (FIRST not in norm(names.get(kv[0], "")), str(kv[0]))):
        out.append(f"{names.get(co, co)}: " + ", ".join(f"{r} {n}" for r, n in sorted(roles.items())))
    unknown = sorted({u.get("role") for u in users if u.get("role") not in STOCK_ROLES | {"platform_owner"}} - {None})
    if unknown:
        out.append(f"ROLES THE PORTAL HAS NO NAME FOR: {unknown}")
    n_sk = sum(1 for u in users if u.get("role") == "sanakhat_officer")
    out.append(f"sanakhat_officer users: {n_sk}" + ("  -> portal role list must add it before these can be moved" if n_sk else ""))
    out.append("platform_owner users (stay on the old token, no portal role): "
               f"{sum(1 for u in users if u.get('role') == 'platform_owner')}")
    emails = defaultdict(list)
    plain = []
    for u in users:
        name = (u.get("username") or "").strip().lower()
        if "@" in name:
            emails[name].append(u)
        else:
            plain.append(u)
    multi = {e: us for e, us in emails.items() if len({x.get("company_id") for x in us}) > 1}
    out.append(f"\nSame email in several companies (one portal login, one membership per org; you pick the UUID): {len(multi)}")
    for e, us in multi.items():
        out.append(f"  {e}: " + ", ".join(f"{names.get(x['company_id'], x['company_id'])}={x.get('role')}" for x in us))
    out.append(f"Non-email usernames (need an email before they can log in on the portal): {len(plain)}")
    for u in plain:
        out.append(f"  {u.get('username')} ({names.get(u.get('company_id'), u.get('company_id'))}, {u.get('role')})")
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "map":
        print(propose_map(load(sys.argv[2]), load(sys.argv[3])))
    elif len(sys.argv) >= 3 and sys.argv[1] == "people":
        print(people_report(load(sys.argv[2]), load(sys.argv[3]) if len(sys.argv) > 3 else ()))
    else:
        sys.exit(__doc__)
