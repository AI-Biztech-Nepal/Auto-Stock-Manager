import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from portal_cutover_report import people_report, propose_map  # noqa: E402

COS = [{"id": "c-deeva", "name": "Deeva"}, {"id": "c-hamro", "name": "Hamro G&G Auto"}, {"id": "c-x", "name": "Dup"}]
ORGS = [{"id": "o-hamro", "name": "hamro g&g  auto"}, {"id": "o1", "name": "Dup"}, {"id": "o2", "name": "Dup"}]


def test_map_lists_hamro_first_and_does_not_guess():
    out = propose_map(COS, ORGS)
    lines = [l for l in out.splitlines() if l.startswith("insert")]
    assert len(lines) == 1 and "'c-hamro', 'o-hamro'" in lines[0]
    assert "c-deeva" in out.split("NEEDS A DECISION")[1] and "2 orgs with this name" in out


def test_people_flags_sanakhat_shared_email_and_plain_username():
    users = [
        {"company_id": "c-hamro", "username": "a@x.com", "role": "admin"},
        {"company_id": "c-x", "username": "a@x.com", "role": "stock_supervisor"},
        {"company_id": "c-hamro", "username": "desk", "role": "sanakhat_officer"},
        {"company_id": None, "username": "owner@x.com", "role": "platform_owner"},
        {"company_id": "c-hamro", "username": "w@x.com", "role": "mystery"},
    ]
    out = people_report(users, COS)
    assert "sanakhat_officer users: 1" in out and "must add it" in out
    assert "several companies" in out and "a@x.com" in out
    assert "Non-email usernames" in out and "desk" in out
    assert "['mystery']" in out
