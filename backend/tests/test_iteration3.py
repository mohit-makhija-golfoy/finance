"""Iteration-3 backend tests:
- Dashboard new fields (current_balance, saved, breakdown w/ income, expense, emi_by_loan, sip_by_investment) and removal of monthly_cash_flow
- Active-only totals (closed investments/loans excluded from total_invested/portfolio_value/loan_outstanding)
- Range scoping by start_date overlap (out-of-range active investments/loans excluded from total_invested/loan_outstanding/active_* counts)
- POST /api/loans/{id}/mark_paid_till_now creates N backdated EMI payments and is idempotent
- Breakdown emi_by_loan / sip_by_investment populated when /api/reminders/pay creates EMI/SIP txs
"""
from datetime import datetime, timezone
import pytest


@pytest.fixture(scope="session")
def self_member_id(base_url, auth_session):
    members = auth_session.get(f"{base_url}/api/members").json()
    for m in members:
        if m.get("relation") == "Self":
            return m["id"]
    return members[0]["id"]


def _months_ago(n: int) -> str:
    now = datetime.now(timezone.utc)
    month = now.month - n
    year = now.year
    while month <= 0:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}-15"


# ---------- Dashboard new shape ----------
class TestDashboardNewShape:
    def test_new_fields_present_and_old_removed(self, base_url, auth_session):
        r = auth_session.get(f"{base_url}/api/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "monthly_cash_flow" not in d, "monthly_cash_flow must be removed in iteration-3"
        for k in ["current_balance", "saved", "breakdown"]:
            assert k in d, f"Missing dashboard key {k}"
        bd = d["breakdown"]
        for bk in ["income", "expense", "emi_by_loan", "sip_by_investment"]:
            assert bk in bd
            assert isinstance(bd[bk], list)
        # saved = max(0, income - expense)
        assert d["saved"] == max(0, d["income"] - d["expense"])
        # current_balance equals net_cash for now
        assert d["current_balance"] == d["income"] - d["expense"]


# ---------- Active-only / closed exclusion ----------
class TestActiveOnlyTotals:
    def test_closed_investment_excluded(self, base_url, auth_session, self_member_id):
        # Create two investments (active + closed), neither has source-coupling to other tests
        active = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_I3_ACTIVE",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 77777,
                "start_date": _months_ago(2),
                "current_value": 80000,
            },
        ).json()
        closed = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_I3_CLOSED",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 55555,
                "start_date": _months_ago(2),
                "current_value": 60000,
            },
        ).json()
        # Close one
        cr = auth_session.post(f"{base_url}/api/investments/{closed['id']}/close")
        assert cr.status_code == 200

        d = auth_session.get(f"{base_url}/api/dashboard").json()
        # Closed inv's amount (55555) should NOT be part of total_invested
        # We can only assert: an "all-time" dashboard call (no range) → total_invested includes 77777 but not 55555.
        # Strict assertion: deltas relative to before/after the close — but easier: check that closed inv name is not in any tile.
        # Functional check: portfolio_value should not include 60000 from closed.
        # We do a strong check via per-investment list and filter status:
        invs = auth_session.get(f"{base_url}/api/investments").json()
        active_sum = sum(i.get("total_invested", 0) for i in invs if i.get("status") != "closed")
        port_sum = sum(i.get("current_value", 0) for i in invs if i.get("status") != "closed")
        assert d["total_invested"] == pytest.approx(active_sum, abs=1.0)
        assert d["portfolio_value"] == pytest.approx(port_sum, abs=1.0)

    def test_closed_loan_excluded(self, base_url, auth_session, self_member_id):
        active = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_LOAN_ACTIVE",
                "member_id": self_member_id,
                "total_amount": 300000,
                "interest_rate": 9.0,
                "emi": 5000,
                "tenure_months": 60,
                "start_date": _months_ago(3),
            },
        ).json()
        closed = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_LOAN_CLOSED",
                "member_id": self_member_id,
                "total_amount": 200000,
                "interest_rate": 9.0,
                "emi": 5000,
                "tenure_months": 60,
                "start_date": _months_ago(3),
            },
        ).json()
        auth_session.post(f"{base_url}/api/loans/{closed['id']}/close")

        d = auth_session.get(f"{base_url}/api/dashboard").json()
        loans = auth_session.get(f"{base_url}/api/loans").json()
        active_outstanding = sum(l.get("remaining_balance", 0) for l in loans if l.get("status") != "closed")
        assert d["loan_outstanding"] == pytest.approx(active_outstanding, abs=1.0)


# ---------- Range scoping ----------
class TestRangeScoping:
    def test_investments_out_of_range_excluded(self, base_url, auth_session, self_member_id):
        # Old inv 24 months ago, new inv this month
        inv_old = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_I3_OLDINV",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 11111,
                "start_date": _months_ago(24),
                "current_value": 12000,
            },
        ).json()
        inv_new = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_I3_NEWINV",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 22222,
                "start_date": _months_ago(0),
                "current_value": 23000,
            },
        ).json()
        # Range covering last 3 months only → old inv excluded
        end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        start = _months_ago(3)
        d = auth_session.get(
            f"{base_url}/api/dashboard",
            params={"start_date": start, "end_date": end},
        ).json()
        # The 11111 from old inv must NOT contribute to range total_invested,
        # while 22222 from new inv MUST contribute.
        # Net Worth must remain all-time → portfolio_value should include old (active) inv's current_value
        # but total_invested (range-scoped) shouldn't include 11111.
        # We confirm with a no-range call.
        d_all = auth_session.get(f"{base_url}/api/dashboard").json()
        assert d_all["total_invested"] >= d["total_invested"], (
            f"All-time total_invested ({d_all['total_invested']}) should be >= ranged ({d['total_invested']})"
        )
        # The delta should be at least 11111 (the old inv's principal) — approx, since others may exist
        assert (d_all["total_invested"] - d["total_invested"]) >= 11000, (
            "Old inv outside range should be excluded from ranged total_invested"
        )
        # portfolio_value (all-time, active) should NOT be range-filtered
        assert d["portfolio_value"] == d_all["portfolio_value"]
        assert d["net_worth"] == d_all["net_worth"]

    def test_loans_out_of_range_excluded(self, base_url, auth_session, self_member_id):
        old_loan = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_OLDLOAN",
                "member_id": self_member_id,
                "total_amount": 500000,
                "interest_rate": 8,
                "emi": 6000,
                "tenure_months": 120,
                "start_date": _months_ago(24),
            },
        ).json()
        new_loan = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_NEWLOAN",
                "member_id": self_member_id,
                "total_amount": 100000,
                "interest_rate": 8,
                "emi": 3000,
                "tenure_months": 36,
                "start_date": _months_ago(0),
            },
        ).json()
        end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        start = _months_ago(3)
        d_range = auth_session.get(
            f"{base_url}/api/dashboard",
            params={"start_date": start, "end_date": end},
        ).json()
        d_all = auth_session.get(f"{base_url}/api/dashboard").json()
        # All-time active loan_outstanding includes old loan's remaining → ranged excludes it
        assert d_all["loan_outstanding"] >= d_range["loan_outstanding"]
        assert (d_all["loan_outstanding"] - d_range["loan_outstanding"]) >= 400000, (
            "Old loan outside range should be excluded from ranged loan_outstanding"
        )


# ---------- mark_paid_till_now ----------
class TestMarkPaidTillNow:
    def test_backdated_marks_n_months_and_idempotent(self, base_url, auth_session, self_member_id):
        # Start 12 months ago, tenure 240 (so months_elapsed clamp won't truncate at 12)
        loan = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_MPTN",
                "member_id": self_member_id,
                "total_amount": 2400000,
                "interest_rate": 9,
                "emi": 10000,
                "tenure_months": 240,
                "start_date": _months_ago(12),
            },
        ).json()
        lid = loan["id"]
        r1 = auth_session.post(f"{base_url}/api/loans/{lid}/mark_paid_till_now")
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        # Allow 11..13 months for boundary nuance
        assert 11 <= body1["added_months"] <= 13, body1
        assert body1["amount"] == body1["added_months"] * 10000
        # Verify paid_months populated and payments inserted
        got = auth_session.get(f"{base_url}/api/loans/{lid}").json()
        assert len(got.get("payments", [])) == body1["added_months"]
        assert len(set(got.get("paid_months", []))) == body1["added_months"]
        # Idempotent: second call → 0 added
        r2 = auth_session.post(f"{base_url}/api/loans/{lid}/mark_paid_till_now")
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["added_months"] == 0
        assert body2["amount"] == 0
        got2 = auth_session.get(f"{base_url}/api/loans/{lid}").json()
        assert len(got2.get("payments", [])) == body1["added_months"], "No duplicate payments on idempotent call"

    def test_mptn_no_op_for_future_start(self, base_url, auth_session, self_member_id):
        # Loan starting next month → 0
        now = datetime.now(timezone.utc)
        mo = now.month + 1
        yr = now.year
        if mo > 12:
            mo = 1
            yr += 1
        loan = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_FUTURE",
                "member_id": self_member_id,
                "total_amount": 100000,
                "interest_rate": 8,
                "emi": 5000,
                "tenure_months": 24,
                "start_date": f"{yr:04d}-{mo:02d}-15",
            },
        ).json()
        r = auth_session.post(f"{base_url}/api/loans/{loan['id']}/mark_paid_till_now")
        assert r.status_code == 200
        assert r.json()["added_months"] == 0


# ---------- Breakdown emi_by_loan / sip_by_investment via reminders/pay ----------
class TestBreakdownEmiSip:
    def test_emi_sip_breakdown_populates(self, base_url, auth_session, self_member_id):
        # SIP recurring, started 2 months ago
        inv = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_I3_SIP_BD",
                "type": "recurring",
                "member_id": self_member_id,
                "amount": 1500,
                "start_date": _months_ago(2),
            },
        ).json()
        loan = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_I3_LOAN_BD",
                "member_id": self_member_id,
                "total_amount": 240000,
                "interest_rate": 9,
                "emi": 2500,
                "tenure_months": 96,
                "start_date": _months_ago(1),
            },
        ).json()
        # Pay both
        pa = auth_session.post(
            f"{base_url}/api/reminders/pay",
            json={"kind": "investment", "id": inv["id"]},
        )
        assert pa.status_code == 200, pa.text
        pb = auth_session.post(
            f"{base_url}/api/reminders/pay",
            json={"kind": "loan", "id": loan["id"]},
        )
        assert pb.status_code == 200, pb.text

        d = auth_session.get(f"{base_url}/api/dashboard").json()
        bd = d["breakdown"]
        # emi_by_loan should include our loan
        emi_entry = next((e for e in bd["emi_by_loan"] if e["id"] == loan["id"]), None)
        assert emi_entry is not None, bd["emi_by_loan"]
        assert emi_entry["amount"] >= 2500
        assert emi_entry["name"] == "TEST_I3_LOAN_BD"
        sip_entry = next((e for e in bd["sip_by_investment"] if e["id"] == inv["id"]), None)
        assert sip_entry is not None, bd["sip_by_investment"]
        assert sip_entry["amount"] >= 1500
        assert sip_entry["name"] == "TEST_I3_SIP_BD"
        # Also EMI/SIP must show up in expense breakdown
        expense_cats = {x["category"] for x in bd["expense"]}
        assert "EMI" in expense_cats
        assert "SIP" in expense_cats
