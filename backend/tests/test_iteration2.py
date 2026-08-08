"""Iteration 2 backend tests for new features:
- Categories CRUD + default seed
- Investment withdraw with/without add_to_income
- Expected return type round-trip
- Loan compute (forward + inverse)
- Loan enrich for backdated (months_elapsed, expected_paid_to_date, expected_remaining)
- Reminders list + pay for SIP and EMI
"""
from datetime import datetime, timezone

import pytest


# ---------- Categories ----------
class TestCategories:
    def test_defaults_seeded_on_get(self, base_url, auth_session):
        r = auth_session.get(f"{base_url}/api/categories")
        assert r.status_code == 200, r.text
        items = r.json()
        names = {c["name"] for c in items}
        # Must include known defaults
        for must in ["Salary", "Investment Withdrawal", "EMI", "SIP", "Groceries"]:
            assert must in names, f"Missing default category: {must}"
        types = {c["type"] for c in items}
        assert types == {"income", "expense"}

    def test_category_crud(self, base_url, auth_session):
        # create
        cr = auth_session.post(
            f"{base_url}/api/categories",
            json={"name": "TEST_Cat", "type": "expense"},
        )
        assert cr.status_code == 200, cr.text
        c = cr.json()
        assert "_id" not in c
        cid = c["id"]
        # rename
        up = auth_session.put(
            f"{base_url}/api/categories/{cid}",
            json={"name": "TEST_Cat2", "type": "expense"},
        )
        assert up.status_code == 200
        # verify rename
        lst = auth_session.get(f"{base_url}/api/categories").json()
        match = next((x for x in lst if x["id"] == cid), None)
        assert match and match["name"] == "TEST_Cat2"
        # delete
        d = auth_session.delete(f"{base_url}/api/categories/{cid}")
        assert d.status_code == 200
        lst2 = auth_session.get(f"{base_url}/api/categories").json()
        assert cid not in [x["id"] for x in lst2]


@pytest.fixture(scope="session")
def self_member_id(base_url, auth_session):
    members = auth_session.get(f"{base_url}/api/members").json()
    for m in members:
        if m.get("relation") == "Self":
            return m["id"]
    return members[0]["id"]


# ---------- Investment withdrawal income flow ----------
class TestWithdrawIncome:
    def test_withdraw_creates_income_tx(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_FD_WD",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 50000,
                "start_date": "2024-01-01",
                "current_value": 55000,
            },
        ).json()
        inv_id = cr["id"]
        # before count
        before = auth_session.get(f"{base_url}/api/transactions", params={"type": "income"}).json()
        before_ids = {t["id"] for t in before}
        w = auth_session.post(
            f"{base_url}/api/investments/{inv_id}/withdraw",
            json={"amount": 10000, "date": "2025-01-10", "add_to_income": True},
        )
        assert w.status_code == 200, w.text
        body = w.json()
        wd = body["withdrawal"]
        assert wd.get("income_tx_id"), "income_tx_id missing"
        assert wd.get("date") == "2025-01-10"
        # tx fetchable via GET /transactions
        txs = auth_session.get(f"{base_url}/api/transactions", params={"type": "income"}).json()
        new = [t for t in txs if t["id"] not in before_ids]
        assert any(t["id"] == wd["income_tx_id"] for t in new)
        the_tx = next(t for t in new if t["id"] == wd["income_tx_id"])
        assert the_tx["category"] == "Investment Withdrawal"
        assert the_tx["amount"] == 10000
        assert the_tx["type"] == "income"

    def test_withdraw_without_income(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_FD_WD2",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 20000,
                "start_date": "2024-02-01",
            },
        ).json()
        inv_id = cr["id"]
        before = auth_session.get(f"{base_url}/api/transactions").json()
        w = auth_session.post(
            f"{base_url}/api/investments/{inv_id}/withdraw",
            json={"amount": 3000, "date": "2025-02-15", "add_to_income": False},
        )
        assert w.status_code == 200
        wd = w.json()["withdrawal"]
        assert wd.get("income_tx_id") is None
        # No new transactions
        after = auth_session.get(f"{base_url}/api/transactions").json()
        assert len(after) == len(before)
        # but withdrawal recorded
        g = auth_session.get(f"{base_url}/api/investments/{inv_id}").json()
        assert any(x.get("amount") == 3000 for x in g.get("withdrawals", []))


# ---------- Expected return type round-trip ----------
class TestExpectedReturnType:
    def test_round_trip_percent_to_amount(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_ER",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 100000,
                "start_date": "2024-01-01",
                "expected_return": 12,
                "expected_return_type": "percent",
            },
        )
        assert cr.status_code == 200, cr.text
        inv = cr.json()
        inv_id = inv["id"]
        g = auth_session.get(f"{base_url}/api/investments/{inv_id}").json()
        assert g["expected_return"] == 12
        assert g["expected_return_type"] == "percent"
        # update to amount
        up = auth_session.put(
            f"{base_url}/api/investments/{inv_id}",
            json={
                "name": "TEST_ER",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 100000,
                "start_date": "2024-01-01",
                "expected_return": 15000,
                "expected_return_type": "amount",
            },
        )
        assert up.status_code == 200
        g2 = auth_session.get(f"{base_url}/api/investments/{inv_id}").json()
        assert g2["expected_return"] == 15000
        assert g2["expected_return_type"] == "amount"


# ---------- Loan compute ----------
class TestLoanCompute:
    def test_compute_forward_emi(self, base_url, auth_session):
        r = auth_session.post(
            f"{base_url}/api/loans/compute",
            json={
                "total_amount": 1000000,
                "interest_rate": 9.5,
                "tenure_months": 240,
                "start_date": "2022-01-15",
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["emi"] == pytest.approx(9321.31, abs=1.0)
        assert d["total_payable"] == pytest.approx(2237114, rel=0.001)
        assert d["end_date"] == "2042-01-15"

    def test_compute_inverse_rate(self, base_url, auth_session):
        r = auth_session.post(
            f"{base_url}/api/loans/compute",
            json={"emi": 9321.31, "tenure_months": 240, "total_amount": 1000000},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["interest_rate"] == pytest.approx(9.5, abs=0.05)


# ---------- Loan enrich (backdated) ----------
class TestLoanEnrichBackdated:
    def test_backdated_loan_enrich(self, base_url, auth_session, self_member_id):
        # start 24 months ago
        now = datetime.now(timezone.utc)
        month = now.month - 24
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        start_date = f"{year:04d}-{month:02d}-15"
        cr = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_Backdated",
                "member_id": self_member_id,
                "total_amount": 1000000,
                "interest_rate": 9.5,
                "emi": 9321,
                "tenure_months": 240,
                "start_date": start_date,
            },
        )
        assert cr.status_code == 200, cr.text
        loan = cr.json()
        # months_elapsed ~24 (allow 22-25 for date boundary nuances)
        assert 22 <= loan["months_elapsed"] <= 26, loan["months_elapsed"]
        assert "expected_paid_to_date" in loan
        assert "expected_remaining" in loan
        # ~223,704 paid expected
        assert loan["expected_paid_to_date"] == pytest.approx(9321 * loan["months_elapsed"], rel=0.01)
        assert loan["expected_remaining"] == pytest.approx(
            1000000 - loan["expected_paid_to_date"], rel=0.01
        )


# ---------- Reminders ----------
class TestReminders:
    def test_sip_reminder_and_pay(self, base_url, auth_session, self_member_id):
        # Create a recurring SIP that started 2 months ago
        now = datetime.now(timezone.utc)
        month = now.month - 2
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        start_date = f"{year:04d}-{month:02d}-01"
        cr = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST_SIP_REM",
                "type": "recurring",
                "member_id": self_member_id,
                "amount": 2500,
                "start_date": start_date,
            },
        ).json()
        inv_id = cr["id"]
        r = auth_session.get(f"{base_url}/api/reminders")
        assert r.status_code == 200, r.text
        items = r.json()
        matched = [x for x in items if x["kind"] == "investment" and x["id"] == inv_id]
        assert len(matched) == 1, items
        # Pay
        pr = auth_session.post(
            f"{base_url}/api/reminders/pay",
            json={"kind": "investment", "id": inv_id},
        )
        assert pr.status_code == 200, pr.text
        body = pr.json()
        assert body["amount"] == 2500
        # Verify expense tx with category SIP
        txs = auth_session.get(f"{base_url}/api/transactions").json()
        sip_tx = next((t for t in txs if t["id"] == body["transaction_id"]), None)
        assert sip_tx is not None
        assert sip_tx["category"] == "SIP"
        assert sip_tx["type"] == "expense"
        # Should not appear in reminders anymore for current month
        items2 = auth_session.get(f"{base_url}/api/reminders").json()
        matched2 = [x for x in items2 if x["kind"] == "investment" and x["id"] == inv_id]
        assert matched2 == [], "SIP still appears in reminders after pay"

    def test_loan_reminder_and_pay(self, base_url, auth_session, self_member_id):
        # Backdated loan
        now = datetime.now(timezone.utc)
        month = now.month - 1
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        start_date = f"{year:04d}-{month:02d}-01"
        cr = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST_LOAN_REM",
                "member_id": self_member_id,
                "total_amount": 100000,
                "interest_rate": 8,
                "emi": 5000,
                "tenure_months": 24,
                "start_date": start_date,
            },
        ).json()
        lid = cr["id"]
        rems = auth_session.get(f"{base_url}/api/reminders").json()
        matched = [x for x in rems if x["kind"] == "loan" and x["id"] == lid]
        assert len(matched) == 1
        # Pay
        before = auth_session.get(f"{base_url}/api/loans/{lid}").json()
        before_remaining = before["remaining_balance"]
        pr = auth_session.post(
            f"{base_url}/api/reminders/pay",
            json={"kind": "loan", "id": lid},
        )
        assert pr.status_code == 200, pr.text
        body = pr.json()
        assert body["amount"] == 5000
        # Verify EMI expense tx
        txs = auth_session.get(f"{base_url}/api/transactions").json()
        emi_tx = next((t for t in txs if t["id"] == body["transaction_id"]), None)
        assert emi_tx is not None
        assert emi_tx["category"] == "EMI"
        # Loan remaining reduced
        after = auth_session.get(f"{base_url}/api/loans/{lid}").json()
        assert after["remaining_balance"] == before_remaining - 5000
        # Not in reminders anymore
        rems2 = auth_session.get(f"{base_url}/api/reminders").json()
        assert not any(x["kind"] == "loan" and x["id"] == lid for x in rems2)


# ---------- Dashboard date-range filter ----------
class TestDashboardRange:
    def test_date_range_filter(self, base_url, auth_session, self_member_id):
        # Create two txs: one in range, one out of range
        in_date = "2024-06-15"
        out_date = "2023-01-10"
        auth_session.post(
            f"{base_url}/api/transactions",
            json={"type": "income", "amount": 1234, "category": "Salary",
                  "date": in_date, "member_id": self_member_id},
        )
        auth_session.post(
            f"{base_url}/api/transactions",
            json={"type": "expense", "amount": 999, "category": "Food",
                  "date": out_date, "member_id": self_member_id},
        )
        # query range that includes only in_date
        d = auth_session.get(
            f"{base_url}/api/dashboard",
            params={"start_date": "2024-01-01", "end_date": "2024-12-31"},
        ).json()
        # The 999 out-of-range expense from 2023 must NOT be counted
        # We can't assert exact values (other tests add txs) but ensure
        # ranged income includes the 1234, while a tighter pre-2024 range excludes it.
        d_excl = auth_session.get(
            f"{base_url}/api/dashboard",
            params={"start_date": "2023-01-01", "end_date": "2023-12-31"},
        ).json()
        assert d["income"] >= 1234
        assert d_excl["income"] < d["income"]
