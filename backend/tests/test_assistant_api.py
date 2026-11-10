"""Unit tests for the read-only assistant briefing (no server or database needed)."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import assistant_api as a  # noqa: E402


def _revenue(s):
    return s.get("retained_amount", 0) if s.get("returned") else s.get("sale_price", 0)


def test_key_maps_to_its_company_and_only_its_company():
    keys = json.dumps({"co-1": a.hash_key("secret-one"), "co-2": a.hash_key("secret-two")})
    assert a.company_for_key("secret-one", keys) == "co-1"
    assert a.company_for_key("secret-two", keys) == "co-2"
    assert a.company_for_key("secret-three", keys) is None
    assert a.company_for_key("", keys) is None


def test_bad_or_missing_configuration_lets_nobody_in():
    assert a.company_for_key("x", "") is None
    assert a.company_for_key("x", "not json") is None
    assert a.company_for_key("x", "[]") is None
    assert a.company_for_key("x", json.dumps({"co": 5})) is None


def test_the_stored_value_is_a_hash_never_the_key():
    assert a.company_for_key("secret", json.dumps({"co": "secret"})) is None     # plain key stored: rejected


def test_nepal_today_uses_nepal_time_not_utc():
    # 20:30 UTC on 10 Nov is already 02:15 on 11 Nov in Nepal (UTC+5:45).
    late = datetime(2026, 11, 10, 20, 30, tzinfo=timezone.utc)
    assert a.nepal_today(late) == ("2026-11-11", "2026-11")


def test_briefing_counts_today_month_and_dues():
    sales = [
        {"sale_date": "2026-11-10", "sale_price": 100000, "due_amount": 0},
        {"sale_date": "2026-11-10T09:00:00", "sale_price": 50000, "due_amount": 20000, "due_date": "2026-11-20"},
        {"sale_date": "2026-11-03", "sale_price": 80000, "due_amount": 30000, "due_date": "2026-11-05"},
        {"sale_date": "2026-10-28", "sale_price": 70000, "due_amount": 0},
        {"sale_date": "2026-11-09", "returned": True, "retained_amount": 5000, "sale_price": 90000},
    ]
    finance = {"gross_profit": 12345, "inventory_value": 999, "vehicles_in_stock": 81, "vehicles_sold": 5}
    out = a.build_briefing(sales, finance, "2026-11-10", "2026-11", _revenue)
    assert out["today"] == {"sales": 2, "revenue": 150000}
    assert out["this_month"] == {"sales": 4, "revenue": 235000}          # the return counts at what was kept
    assert out["dues"] == {"total": 50000, "customers_owing": 2, "overdue": 1}
    assert out["finance"]["gross_profit"] == 12345
    assert out["stock"] == {"vehicles_in_stock": 81, "vehicles_sold": 5}


def test_briefing_with_no_sales_is_all_zeros_not_an_error():
    out = a.build_briefing([], {}, "2026-11-10", "2026-11", _revenue)
    assert out["today"] == {"sales": 0, "revenue": 0}
    assert out["dues"] == {"total": 0, "customers_owing": 0, "overdue": 0}


def test_derived_key_verifies_for_its_company_and_nobody_else():
    key = a.derive_key("server-secret", "co-1")
    assert a.company_for_derived_key(key, "server-secret") == "co-1"
    assert a.company_for_derived_key(key, "another-secret") is None            # not this server's key
    other = a.derive_key("server-secret", "co-2")
    assert other != key and a.company_for_derived_key(other, "server-secret") == "co-2"


def test_a_tampered_or_malformed_derived_key_is_refused():
    key = a.derive_key("server-secret", "co-1")
    swapped = "co-2." + key.split(".", 1)[1]                                   # another company, first company's proof
    assert a.company_for_derived_key(swapped, "server-secret") is None
    assert a.company_for_derived_key(key[:-1] + ("0" if key[-1] != "0" else "1"), "server-secret") is None
    for bad in ("", "nodot", ".", "co-1.", ".abc"):
        assert a.company_for_derived_key(bad, "server-secret") is None
    assert a.company_for_derived_key(key, "") is None


def _status(stored, purchases):
    if purchases > 0:
        return "converted"
    return stored if stored in ("new", "contacted", "interested", "lost") else "new"


def _day(value):
    from datetime import date
    return date.fromisoformat(str(value)[:10]) if value else None


def test_people_briefing_counts_customers_stages_followups_and_team():
    from datetime import date
    customers = [
        {"id": "a", "created_at": "2026-11-02", "lead_status": "interested"},
        {"id": "b", "created_at": "2026-11-09", "lead_status": "contacted"},
        {"id": "c", "created_at": "2026-10-20", "lead_status": "lost"},
        {"id": "d", "created_at": "2026-08-01", "lead_status": None},
        {"id": "e", "created_at": "2026-07-01", "lead_status": "interested"},
    ]
    sales = [{"customer_id": "a"}, {"customer_id": "e", "returned": True}, {"customer_id": None}]   # a bought; e's sale came back
    followups = [{"due_at": "2026-11-08"}, {"due_at": "2026-11-10"}, {"due_at": "2026-11-12"}, {"due_at": None}]
    team = [{"role": "sales", "is_active": 1}, {"role": "sales", "is_active": 0}, {"role": "mechanic"}]
    out = a.people_briefing(customers, sales, followups, team, date(2026, 11, 10), _status, _day)
    assert out["customers"]["total"] == 5 and out["customers"]["new_this_month"] == 2
    assert out["customers"]["by_stage"] == {"new": 1, "contacted": 1, "interested": 1, "converted": 1, "lost": 1}
    assert out["customers"]["followups_overdue"] == 1 and out["customers"]["followups_today"] == 1
    assert out["team"] == {"active": 2, "by_role": {"mechanic": 1, "sales": 1}}          # inactive staff are left out


def test_people_numbers_are_added_to_the_briefing_without_breaking_it():
    out = a.build_briefing([], {}, "2026-11-10", "2026-11", _revenue, people={"customers": {"total": 3}})
    assert out["customers"] == {"total": 3} and out["today"]["sales"] == 0
    assert "customers" not in a.build_briefing([], {}, "2026-11-10", "2026-11", _revenue)
