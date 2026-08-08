"""End-to-end backend test suite for Family Finance Tracker.

Covers: auth, members, transactions, investments (all 3 types), loans,
dashboard, CSV export. Uses public EXPO_PUBLIC_BACKEND_URL with /api prefix.
"""
import uuid
from datetime import datetime, timezone

import pytest
import requests


# ---------- Auth ----------
class TestAuth:
    def test_register_and_me(self, api_client, base_url):
        email = f"test_{uuid.uuid4().hex[:10]}@family.app"
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": email, "password": "Pass1234", "full_name": "TEST X"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == email
        # /me
        me = requests.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_register_duplicate(self, api_client, base_url, auth_session):
        r = api_client.post(
            f"{base_url}/api/auth/register",
            json={"email": auth_session.email, "password": "whatever"},
        )
        assert r.status_code == 400

    def test_login_valid_and_invalid(self, api_client, base_url, auth_session):
        ok = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": auth_session.email, "password": auth_session.password},
        )
        assert ok.status_code == 200
        assert "access_token" in ok.json()
        bad = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": auth_session.email, "password": "wrong"},
        )
        assert bad.status_code == 400

    def test_me_unauthenticated(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401


# ---------- Members ----------
class TestMembers:
    def test_auto_self_member_created(self, base_url, auth_session):
        r = auth_session.get(f"{base_url}/api/members")
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list)
        assert any(m.get("relation") == "Self" for m in members), members

    def test_member_crud(self, base_url, auth_session):
        # create
        cr = auth_session.post(
            f"{base_url}/api/members",
            json={"name": "TEST Spouse", "relation": "Spouse", "color": "#FF00AA"},
        )
        assert cr.status_code == 200
        m = cr.json()
        assert "_id" not in m
        assert m["name"] == "TEST Spouse"
        mid = m["id"]
        # update
        up = auth_session.put(
            f"{base_url}/api/members/{mid}",
            json={"name": "TEST Spouse2", "relation": "Spouse", "color": "#00FF00"},
        )
        assert up.status_code == 200
        # verify persisted
        lst = auth_session.get(f"{base_url}/api/members").json()
        names = [x["name"] for x in lst]
        assert "TEST Spouse2" in names
        # delete
        d = auth_session.delete(f"{base_url}/api/members/{mid}")
        assert d.status_code == 200
        lst2 = auth_session.get(f"{base_url}/api/members").json()
        assert mid not in [x["id"] for x in lst2]


@pytest.fixture(scope="session")
def self_member_id(base_url, auth_session):
    r = auth_session.get(f"{base_url}/api/members")
    members = r.json()
    for m in members:
        if m.get("relation") == "Self":
            return m["id"]
    return members[0]["id"]


# ---------- Transactions ----------
class TestTransactions:
    def test_create_list_filter(self, base_url, auth_session, self_member_id):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # income
        r1 = auth_session.post(
            f"{base_url}/api/transactions",
            json={
                "type": "income",
                "amount": 5000.0,
                "category": "Salary",
                "date": today,
                "notes": "TEST income",
                "member_id": self_member_id,
            },
        )
        assert r1.status_code == 200, r1.text
        tx1 = r1.json()
        assert "_id" not in tx1
        assert tx1["amount"] == 5000.0
        # expense
        r2 = auth_session.post(
            f"{base_url}/api/transactions",
            json={
                "type": "expense",
                "amount": 1200.0,
                "category": "Food",
                "date": today,
                "notes": "TEST expense",
                "member_id": self_member_id,
            },
        )
        assert r2.status_code == 200
        # list and verify both present (Create -> GET)
        lst = auth_session.get(f"{base_url}/api/transactions").json()
        ids = [t["id"] for t in lst]
        assert tx1["id"] in ids and r2.json()["id"] in ids
        # filter by type
        only_income = auth_session.get(
            f"{base_url}/api/transactions", params={"type": "income"}
        ).json()
        assert all(t["type"] == "income" for t in only_income)
        # filter by member_ids
        by_member = auth_session.get(
            f"{base_url}/api/transactions",
            params={"member_ids": self_member_id},
        ).json()
        assert all(t["member_id"] == self_member_id for t in by_member)

    def test_update_and_delete(self, base_url, auth_session, self_member_id):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cr = auth_session.post(
            f"{base_url}/api/transactions",
            json={
                "type": "expense",
                "amount": 100,
                "category": "Misc",
                "date": today,
                "member_id": self_member_id,
            },
        ).json()
        tx_id = cr["id"]
        up = auth_session.put(
            f"{base_url}/api/transactions/{tx_id}",
            json={
                "type": "expense",
                "amount": 250,
                "category": "Misc",
                "date": today,
                "member_id": self_member_id,
            },
        )
        assert up.status_code == 200
        lst = auth_session.get(f"{base_url}/api/transactions").json()
        updated = next(t for t in lst if t["id"] == tx_id)
        assert updated["amount"] == 250
        d = auth_session.delete(f"{base_url}/api/transactions/{tx_id}")
        assert d.status_code == 200
        lst2 = auth_session.get(f"{base_url}/api/transactions").json()
        assert tx_id not in [t["id"] for t in lst2]


# ---------- Investments ----------
class TestInvestments:
    def test_onetime_investment_pl(self, base_url, auth_session, self_member_id):
        r = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST FD",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 100000,
                "start_date": "2024-01-01",
                "current_value": 110000,
            },
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        assert "_id" not in inv
        assert inv["total_invested"] == 100000
        assert inv["current_value"] == 110000
        assert inv["profit_loss"] == 10000
        # GET round trip
        g = auth_session.get(f"{base_url}/api/investments/{inv['id']}").json()
        assert g["profit_loss"] == 10000

    def test_recurring_investment_month_multiplier(
        self, base_url, auth_session, self_member_id
    ):
        # Start 5 months ago -> expect ~6 contributions (inclusive)
        today = datetime.now(timezone.utc)
        start_year = today.year if today.month > 5 else today.year - 1
        start_month = today.month - 5 if today.month > 5 else today.month + 7
        start_date = f"{start_year:04d}-{start_month:02d}-01"
        r = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST SIP",
                "type": "recurring",
                "member_id": self_member_id,
                "amount": 1000,
                "start_date": start_date,
            },
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        # months between start and now inclusive = 6
        expected_months = (today.year - start_year) * 12 + (today.month - start_month) + 1
        assert inv["total_invested"] == pytest.approx(1000 * expected_months)
        assert inv["profit_loss"] == 0  # current_value defaults to total_invested

    def test_dynamic_with_value_history(self, base_url, auth_session, self_member_id):
        r = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST Stocks",
                "type": "dynamic",
                "member_id": self_member_id,
                "amount": 50000,
                "start_date": "2024-06-01",
                "current_value": 50000,
            },
        )
        assert r.status_code == 200
        inv = r.json()
        inv_id = inv["id"]
        # add value entry
        v = auth_session.post(
            f"{base_url}/api/investments/{inv_id}/value",
            json={"date": "2025-01-01", "current_value": 65000},
        )
        assert v.status_code == 200
        # refresh and verify P/L
        g = auth_session.get(f"{base_url}/api/investments/{inv_id}").json()
        assert g["current_value"] == 65000
        assert g["total_invested"] == 50000
        assert g["profit_loss"] == 15000

    def test_withdraw_and_close(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST MF",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 20000,
                "start_date": "2024-03-01",
                "current_value": 22000,
            },
        ).json()
        inv_id = cr["id"]
        w = auth_session.post(
            f"{base_url}/api/investments/{inv_id}/withdraw",
            json={"amount": 5000, "date": "2024-12-01", "notes": "TEST partial"},
        )
        assert w.status_code == 200
        g = auth_session.get(f"{base_url}/api/investments/{inv_id}").json()
        assert g["total_invested"] == 15000  # 20000 - 5000
        # close
        c = auth_session.post(f"{base_url}/api/investments/{inv_id}/close")
        assert c.status_code == 200
        g2 = auth_session.get(f"{base_url}/api/investments/{inv_id}").json()
        assert g2["status"] == "closed"

    def test_investment_update_and_delete(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/investments",
            json={
                "name": "TEST Bond",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 10000,
                "start_date": "2024-01-01",
            },
        ).json()
        inv_id = cr["id"]
        up = auth_session.put(
            f"{base_url}/api/investments/{inv_id}",
            json={
                "name": "TEST Bond Renamed",
                "type": "onetime",
                "member_id": self_member_id,
                "amount": 10000,
                "start_date": "2024-01-01",
            },
        )
        assert up.status_code == 200
        assert up.json()["name"] == "TEST Bond Renamed"
        d = auth_session.delete(f"{base_url}/api/investments/{inv_id}")
        assert d.status_code == 200


# ---------- Loans ----------
class TestLoans:
    def test_loan_lifecycle(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST Home Loan",
                "member_id": self_member_id,
                "total_amount": 500000,
                "interest_rate": 8.5,
                "emi": 10000,
                "tenure_months": 60,
                "start_date": "2024-01-01",
            },
        )
        assert cr.status_code == 200, cr.text
        loan = cr.json()
        assert "_id" not in loan
        assert loan["remaining_balance"] == 500000
        lid = loan["id"]
        # EMI payment
        p1 = auth_session.post(
            f"{base_url}/api/loans/{lid}/payment",
            json={"amount": 10000, "date": "2024-02-01", "type": "emi"},
        )
        assert p1.status_code == 200
        # prepayment
        p2 = auth_session.post(
            f"{base_url}/api/loans/{lid}/payment",
            json={"amount": 40000, "date": "2024-03-15", "type": "prepayment"},
        )
        assert p2.status_code == 200
        g = auth_session.get(f"{base_url}/api/loans/{lid}").json()
        assert g["total_paid"] == 50000
        assert g["remaining_balance"] == 450000
        # close
        c = auth_session.post(f"{base_url}/api/loans/{lid}/close")
        assert c.status_code == 200
        g2 = auth_session.get(f"{base_url}/api/loans/{lid}").json()
        assert g2["status"] == "closed"

    def test_loan_update_and_delete(self, base_url, auth_session, self_member_id):
        cr = auth_session.post(
            f"{base_url}/api/loans",
            json={
                "name": "TEST Car",
                "member_id": self_member_id,
                "total_amount": 200000,
                "interest_rate": 9,
                "emi": 5000,
                "tenure_months": 48,
                "start_date": "2024-05-01",
            },
        ).json()
        lid = cr["id"]
        up = auth_session.put(
            f"{base_url}/api/loans/{lid}",
            json={
                "name": "TEST Car v2",
                "member_id": self_member_id,
                "total_amount": 200000,
                "interest_rate": 9,
                "emi": 6000,
                "tenure_months": 48,
                "start_date": "2024-05-01",
            },
        )
        assert up.status_code == 200
        assert up.json()["emi"] == 6000
        d = auth_session.delete(f"{base_url}/api/loans/{lid}")
        assert d.status_code == 200


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_aggregates(self, base_url, auth_session):
        r = auth_session.get(f"{base_url}/api/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        for key in [
            "income",
            "expense",
            "net_cash",
            "current_balance",
            "saved",
            "total_invested",
            "portfolio_value",
            "investment_pl",
            "loan_outstanding",
            "net_worth",
            "breakdown",
        ]:
            assert key in d, f"Missing dashboard key {key}"
        # Iteration-3: monthly_cash_flow removed; new breakdown structure
        assert "monthly_cash_flow" not in d
        assert isinstance(d["breakdown"], dict)
        for bk in ["income", "expense", "emi_by_loan", "sip_by_investment"]:
            assert bk in d["breakdown"]
            assert isinstance(d["breakdown"][bk], list)
        # net_worth = portfolio_value - loan_outstanding
        assert d["net_worth"] == pytest.approx(
            d["portfolio_value"] - d["loan_outstanding"]
        )
        # investment_pl matches
        assert d["investment_pl"] == pytest.approx(
            d["portfolio_value"] - d["total_invested"]
        )


# ---------- CSV Export ----------
class TestExport:
    @pytest.mark.parametrize("kind", ["transactions", "investments", "loans"])
    def test_csv_export(self, base_url, auth_session, kind):
        r = auth_session.get(f"{base_url}/api/export/csv", params={"kind": kind})
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        body = r.text
        # Must contain header row
        assert "\n" in body or "," in body

    def test_csv_invalid_kind(self, base_url, auth_session):
        r = auth_session.get(f"{base_url}/api/export/csv", params={"kind": "nope"})
        assert r.status_code == 400
