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


# ---- lookups -------------------------------------------------------------
from datetime import date as _date  # noqa: E402

TODAY = _date(2026, 11, 10)
CUSTOMERS = [
    {"id": "c1", "name": "Ram Thapa", "contact_number": "9841000001"},
    {"id": "c2", "name": "Sita Rai", "contact_number": "+977 9841000002"},
    {"id": "c3", "name": "Ramesh Karki", "contact_number": "9841000003"},
]
VEHICLES = [
    {"id": "v1", "brand": "Honda", "model": "Dio", "year": 2018, "color": "Grey", "registration_number": "046/5845",
     "status": "available", "selling_price": 145000, "purchase_price": 110000, "kilometer_run": 21000},
    {"id": "v2", "brand": "Honda", "model": "Aviator", "year": 2019, "color": "Black", "registration_number": "52/4129",
     "status": "sold", "selling_price": 175000, "purchase_price": 140000},
    {"id": "v3", "brand": "Yamaha", "model": "Fascino", "year": 2017, "color": "Blue", "registration_number": None, "status": "available"},
]
SALES = [
    {"customer_id": "c1", "vehicle_id": "v2", "sale_price": 175000, "due_amount": 25000, "due_date": "2026-11-01",
     "sale_date": "2026-11-03", "sold_by_name": "Hari"},
    {"customer_id": "c1", "vehicle_id": "v1", "sale_price": 140000, "due_amount": 0, "sale_date": "2026-09-15", "sold_by_name": "Hari"},
    {"customer_id": "c2", "vehicle_id": "v3", "sale_price": 90000, "due_amount": 40000, "due_date": "2026-12-01",
     "sale_date": "2026-11-10", "sold_by_name": "Gita"},
    {"customer_id": "c2", "vehicle_id": "v1", "sale_price": 99999, "due_amount": 99999, "sale_date": "2026-11-09", "returned": True,
     "retained_amount": 5000},
]


def test_period_names_become_date_ranges():
    assert a.period_range("today", TODAY) == (TODAY, TODAY)
    assert a.period_range("this_month", TODAY) == (_date(2026, 11, 1), TODAY)
    assert a.period_range("last_month", TODAY) == (_date(2026, 10, 1), _date(2026, 10, 31))
    assert a.period_range("2026-12", TODAY) == (_date(2026, 12, 1), _date(2026, 12, 31))
    assert a.period_range("2026-11-03", TODAY) == (_date(2026, 11, 3), _date(2026, 11, 3))
    assert a.period_range("someday", TODAY) is None


def test_customer_found_by_name_or_phone_with_dues_and_days_since():
    r = a.lookup_customer("ram", CUSTOMERS, SALES, TODAY)
    assert r["matches"] == 2                                         # Ram Thapa and Ramesh Karki
    ram = r["customers"][0]
    assert ram["name"] == "Ram Thapa" and ram["bought"] == 2 and ram["owes_rs"] == 25000
    assert ram["bought_total_rs"] == 315000 and ram["last_purchase_days_ago"] == 7
    by_phone = a.lookup_customer("+977 98410-00002", CUSTOMERS, SALES, TODAY)
    assert by_phone["customers"][0]["name"] == "Sita Rai"
    assert by_phone["customers"][0]["owes_rs"] == 40000              # the returned sale's due is not counted
    assert a.lookup_customer("", CUSTOMERS, SALES, TODAY)["error"]


def test_dues_rank_by_amount_and_split_out_what_is_overdue():
    r = a.lookup_dues(5, CUSTOMERS, SALES, TODAY)
    assert r["customers_owing"] == 2 and r["total_owed_rs"] == 65000 and r["total_overdue_rs"] == 25000
    assert [row["name"] for row in r["top"]] == ["Sita Rai", "Ram Thapa"]
    assert r["top"][1]["overdue_rs"] == 25000 and r["top"][1]["oldest_due_days_ago"] == 9


def test_sales_in_a_period_with_the_best_groups():
    r = a.lookup_sales("this_month", "seller", SALES, VEHICLES, TODAY, _revenue)
    assert r["sales"] == 3 and r["revenue_rs"] == 175000 + 90000 + 5000      # the return counts at what was kept
    assert [g["name"] for g in r["groups"]] == ["Hari", "Gita", "(not recorded)"]    # equal sales: biggest revenue first
    assert r["groups"][0] == {"name": "Hari", "sales": 1, "revenue_rs": 175000}
    assert r["groups"][2] == {"name": "(not recorded)", "sales": 1, "revenue_rs": 5000}     # the return, at what was kept
    by_model = a.lookup_sales("2026-11-03", "model", SALES, VEHICLES, TODAY, _revenue)
    assert by_model["groups"] == [{"name": "Honda Aviator", "sales": 1, "revenue_rs": 175000}]
    assert "error" in a.lookup_sales("someday", "", SALES, VEHICLES, TODAY, _revenue)


def test_vehicle_found_by_plate_in_any_spelling_or_by_words():
    by_plate = a.lookup_vehicle("046 5845", "", VEHICLES)
    assert by_plate["matches"] == 1 and by_plate["vehicles"][0]["selling_price_rs"] == 145000
    assert by_plate["vehicles"][0]["year"] == 2018 and by_plate["vehicles"][0]["kilometers"] == 21000
    assert a.lookup_vehicle("honda", "", VEHICLES)["matches"] == 2
    assert a.lookup_vehicle("honda", "available", VEHICLES)["matches"] == 1
    assert a.lookup_vehicle("grey dio", "", VEHICLES)["vehicles"][0]["name"] == "Honda Dio"
    assert a.lookup_vehicle("", "", VEHICLES)["error"]


def test_run_lookup_only_runs_the_named_read_only_lookups():
    data = {"customers": CUSTOMERS, "sales": SALES, "vehicles": VEHICLES}
    assert a.run_lookup("dues", {"top": 1}, data, TODAY, _revenue)["top"][0]["name"] == "Sita Rai"
    assert "error" in a.run_lookup("drop_table", {}, data, TODAY, _revenue)
    assert "error" in a.run_lookup("customer", "not a dict", data, TODAY, _revenue)
    assert len(a.lookup_dues(99, CUSTOMERS, SALES, TODAY)["top"]) <= a.MAX_ROWS          # results stay small
