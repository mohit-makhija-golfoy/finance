from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import csv
import uuid
import bcrypt
import jwt
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr
from fastapi.security import OAuth2PasswordBearer

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "family-finance-secret-change-me-please-1234567890")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Family Finance Tracker API")
api = APIRouter(prefix="/api")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat() if dt.tzinfo is None else dt.isoformat()


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now_utc() + timedelta(days=JWT_EXP_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------- Schemas ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None


class AuthOut(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"


class MemberIn(BaseModel):
    name: str
    relation: Optional[str] = None
    color: Optional[str] = None


class TransactionIn(BaseModel):
    type: Literal["income", "expense"]
    amount: float
    category: str
    date: str  # ISO date
    notes: Optional[str] = None
    member_id: str


class InvestmentIn(BaseModel):
    name: str
    type: Literal["onetime", "recurring", "dynamic"]
    member_id: str
    amount: float = 0  # principal (onetime) or monthly (recurring) or initial (dynamic)
    start_date: str
    maturity_date: Optional[str] = None
    end_date: Optional[str] = None
    expected_return: Optional[float] = None  # value (percent or absolute)
    expected_return_type: Optional[Literal["percent", "amount"]] = "percent"
    current_value: Optional[float] = None  # for dynamic init
    notes: Optional[str] = None


class ValueHistoryIn(BaseModel):
    date: str
    current_value: float


class WithdrawIn(BaseModel):
    amount: float
    date: Optional[str] = None
    notes: Optional[str] = None
    add_to_income: bool = True
    category: Optional[str] = "Investment Withdrawal"


class CategoryIn(BaseModel):
    name: str
    type: Literal["income", "expense"]


class LoanIn(BaseModel):
    name: str
    member_id: str
    total_amount: float
    interest_rate: float
    emi: float
    tenure_months: int
    start_date: str
    notes: Optional[str] = None


class LoanPaymentIn(BaseModel):
    amount: float
    date: str
    type: Literal["emi", "prepayment"] = "emi"
    notes: Optional[str] = None


# ---------- Auth ----------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "full_name": body.full_name,
        "hashed_password": hash_password(body.password),
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    # Auto-create a "Self" member
    await db.members.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "name": body.full_name or "Self",
        "relation": "Self",
        "color": "#10B981",
        "created_at": iso(now_utc()),
    })
    await ensure_default_categories(uid)
    return AuthOut(
        user=UserOut(id=uid, email=body.email.lower(), full_name=body.full_name),
        access_token=create_token(uid),
    )


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")
    return AuthOut(
        user=UserOut(id=user["id"], email=user["email"], full_name=user.get("full_name")),
        access_token=create_token(user["id"]),
    )


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return UserOut(id=user["id"], email=user["email"], full_name=user.get("full_name"))


# ---------- Members ----------
@api.get("/members")
async def list_members(user=Depends(get_current_user)):
    items = await db.members.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    return items


@api.post("/members")
async def create_member(body: MemberIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name,
        "relation": body.relation,
        "color": body.color or "#FAFAFA",
        "created_at": iso(now_utc()),
    }
    await db.members.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/members/{member_id}")
async def update_member(member_id: str, body: MemberIn, user=Depends(get_current_user)):
    res = await db.members.update_one(
        {"id": member_id, "user_id": user["id"]},
        {"$set": {"name": body.name, "relation": body.relation, "color": body.color}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Member not found")
    return {"ok": True}


@api.delete("/members/{member_id}")
async def delete_member(member_id: str, user=Depends(get_current_user)):
    await db.members.delete_one({"id": member_id, "user_id": user["id"]})
    return {"ok": True}


# ---------- Transactions ----------
@api.get("/transactions")
async def list_tx(
    member_ids: Optional[str] = None,
    type: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["id"]}
    if member_ids:
        q["member_id"] = {"$in": member_ids.split(",")}
    if type:
        q["type"] = type
    if category:
        q["category"] = category
    if start_date or end_date:
        q["date"] = {}
        if start_date:
            q["date"]["$gte"] = start_date
        if end_date:
            q["date"]["$lte"] = end_date
    items = await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return items


@api.post("/transactions")
async def create_tx(body: TransactionIn, user=Depends(get_current_user)):
    doc = body.dict()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = iso(now_utc())
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/transactions/{tx_id}")
async def update_tx(tx_id: str, body: TransactionIn, user=Depends(get_current_user)):
    res = await db.transactions.update_one(
        {"id": tx_id, "user_id": user["id"]}, {"$set": body.dict()}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@api.delete("/transactions/{tx_id}")
async def delete_tx(tx_id: str, user=Depends(get_current_user)):
    await db.transactions.delete_one({"id": tx_id, "user_id": user["id"]})
    return {"ok": True}


# ---------- Investments ----------
def calc_recurring_invested(monthly: float, start_date: str, end_date: Optional[str]) -> float:
    try:
        sd = datetime.fromisoformat(start_date[:10])
    except Exception:
        return 0
    ed_dt = datetime.fromisoformat(end_date[:10]) if end_date else datetime.now()
    if ed_dt < sd:
        return 0
    months = (ed_dt.year - sd.year) * 12 + (ed_dt.month - sd.month) + 1
    return max(0, monthly * months)


async def enrich_investment(inv: dict) -> dict:
    inv.pop("_id", None)
    inv_type = inv.get("type")
    if inv_type == "onetime":
        withdrawals = inv.get("withdrawals", [])
        total_withdrawn = sum(w.get("amount", 0) for w in withdrawals)
        inv["total_invested"] = max(0, inv.get("amount", 0) - total_withdrawn)
        history = inv.get("value_history", [])
        if history:
            history_sorted = sorted(history, key=lambda x: x["date"])
            inv["current_value"] = history_sorted[-1]["current_value"]
        else:
            # current_value intentionally stays at principal (not the projected
            # maturity amount) until a real value update is recorded — net worth
            # must reflect money actually held today, not unrealized future interest.
            inv["current_value"] = inv.get("current_value") or inv["total_invested"]
    elif inv_type == "recurring":
        end = inv.get("end_date") if inv.get("status") == "closed" else None
        invested = calc_recurring_invested(inv.get("amount", 0), inv.get("start_date"), end)
        inv["total_invested"] = invested
        monthly = inv.get("amount", 0) or 0
        history = inv.get("value_history", [])
        if history:
            history_sorted = sorted(history, key=lambda x: x["date"])
            last = history_sorted[-1]
            try:
                base_date = datetime.fromisoformat(last["date"][:10])
                now = datetime.now()
                months_after = (now.year - base_date.year) * 12 + (now.month - base_date.month)
                inv["current_value"] = last["current_value"] + max(0, months_after) * monthly
            except Exception:
                inv["current_value"] = last["current_value"]
        else:
            inv["current_value"] = inv.get("current_value") or invested
    elif inv_type == "dynamic":
        history = inv.get("value_history", [])
        inv["total_invested"] = inv.get("amount", 0)
        if history:
            history_sorted = sorted(history, key=lambda x: x["date"])
            inv["current_value"] = history_sorted[-1]["current_value"]
        else:
            inv["current_value"] = inv.get("current_value") or inv.get("amount", 0)
    inv["profit_loss"] = (inv.get("current_value") or 0) - (inv.get("total_invested") or 0)
    return inv


@api.get("/investments")
async def list_inv(member_ids: Optional[str] = None, user=Depends(get_current_user)):
    q: dict = {"user_id": user["id"]}
    if member_ids:
        q["member_id"] = {"$in": member_ids.split(",")}
    items = await db.investments.find(q, {"_id": 0}).sort("start_date", -1).to_list(1000)
    return [await enrich_investment(i) for i in items]


@api.post("/investments")
async def create_inv(body: InvestmentIn, user=Depends(get_current_user)):
    doc = body.dict()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["status"] = "active"
    doc["withdrawals"] = []
    doc["value_history"] = []
    if body.type == "dynamic" and body.current_value is not None:
        doc["value_history"].append({"date": body.start_date, "current_value": body.current_value})
    doc["created_at"] = iso(now_utc())
    await db.investments.insert_one(doc)
    inv = await db.investments.find_one({"id": doc["id"]}, {"_id": 0})
    return await enrich_investment(inv)


@api.get("/investments/{inv_id}")
async def get_inv(inv_id: str, user=Depends(get_current_user)):
    inv = await db.investments.find_one({"id": inv_id, "user_id": user["id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Investment not found")
    return await enrich_investment(inv)


@api.put("/investments/{inv_id}")
async def update_inv(inv_id: str, body: InvestmentIn, user=Depends(get_current_user)):
    res = await db.investments.update_one(
        {"id": inv_id, "user_id": user["id"]},
        {"$set": body.dict(exclude_none=True)},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Investment not found")
    inv = await db.investments.find_one({"id": inv_id}, {"_id": 0})
    return await enrich_investment(inv)


@api.delete("/investments/{inv_id}")
async def delete_inv(inv_id: str, user=Depends(get_current_user)):
    await db.investments.delete_one({"id": inv_id, "user_id": user["id"]})
    return {"ok": True}


@api.post("/investments/{inv_id}/value")
async def add_value(inv_id: str, body: ValueHistoryIn, user=Depends(get_current_user)):
    inv = await db.investments.find_one({"id": inv_id, "user_id": user["id"]})
    if not inv:
        raise HTTPException(404, "Investment not found")
    entry = {"date": body.date, "current_value": body.current_value, "id": str(uuid.uuid4())}
    await db.investments.update_one(
        {"id": inv_id}, {"$push": {"value_history": entry}, "$set": {"current_value": body.current_value}}
    )
    return {"ok": True, "entry": entry}


@api.post("/investments/{inv_id}/withdraw")
async def withdraw_inv(inv_id: str, body: WithdrawIn, user=Depends(get_current_user)):
    inv = await db.investments.find_one({"id": inv_id, "user_id": user["id"]})
    if not inv:
        raise HTTPException(404, "Investment not found")
    wdate = body.date or iso(now_utc())[:10]
    entry = {"amount": body.amount, "date": wdate, "notes": body.notes, "id": str(uuid.uuid4()), "income_tx_id": None}
    if body.add_to_income:
        tx = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "income",
            "amount": body.amount,
            "category": body.category or "Investment Withdrawal",
            "date": wdate,
            "notes": f"Withdrawal from {inv.get('name')}",
            "member_id": inv.get("member_id"),
            "source": "withdrawal",
            "source_id": inv_id,
            "created_at": iso(now_utc()),
        }
        await db.transactions.insert_one(tx)
        entry["income_tx_id"] = tx["id"]
    await db.investments.update_one({"id": inv_id}, {"$push": {"withdrawals": entry}})
    return {"ok": True, "withdrawal": entry}


@api.post("/investments/{inv_id}/close")
async def close_inv(inv_id: str, user=Depends(get_current_user)):
    res = await db.investments.update_one(
        {"id": inv_id, "user_id": user["id"]},
        {"$set": {"status": "closed", "end_date": iso(now_utc())[:10]}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Investment not found")
    return {"ok": True}


# ---------- Loans ----------
async def enrich_loan(loan: dict) -> dict:
    loan.pop("_id", None)
    payments = loan.get("payments", [])
    paid = sum(p.get("amount", 0) for p in payments)
    loan["total_paid"] = paid
    # Total payable = EMI × tenure (fallback to principal)
    emi_v = loan.get("emi", 0) or 0
    tenure_v = loan.get("tenure_months", 0) or 0
    total_payable = emi_v * tenure_v if (emi_v and tenure_v) else loan.get("total_amount", 0)
    loan["total_payable"] = total_payable
    # Keep principal-based remaining for back-compat
    loan["remaining_balance"] = max(0, loan.get("total_amount", 0) - paid)
    # New: payable-based remaining (what the user actually owes including interest)
    loan["remaining_payable"] = max(0, total_payable - paid)
    # Expected paid based on months elapsed since start (helps for backdated loans)
    try:
        sd = datetime.fromisoformat(loan.get("start_date", "")[:10])
        months_elapsed = (datetime.now().year - sd.year) * 12 + (datetime.now().month - sd.month)
        months_elapsed = max(0, min(months_elapsed, int(loan.get("tenure_months", 0) or 0)))
    except Exception:
        months_elapsed = 0
    loan["months_elapsed"] = months_elapsed
    expected_paid = min(total_payable, emi_v * months_elapsed)
    loan["expected_paid_to_date"] = expected_paid
    loan["expected_remaining"] = max(0, total_payable - expected_paid)
    # End date
    try:
        if loan.get("start_date") and loan.get("tenure_months"):
            sd2 = datetime.fromisoformat(loan["start_date"][:10])
            month = sd2.month + int(loan["tenure_months"]) - 1
            year = sd2.year + month // 12
            month = month % 12 + 1
            loan["end_date"] = f"{year:04d}-{month:02d}-{min(sd2.day, 28):02d}"
    except Exception:
        pass
    if loan["remaining_payable"] == 0 and loan.get("status") != "closed":
        loan["status"] = "closed"
    return loan


@api.get("/loans")
async def list_loans(member_ids: Optional[str] = None, user=Depends(get_current_user)):
    q: dict = {"user_id": user["id"]}
    if member_ids:
        q["member_id"] = {"$in": member_ids.split(",")}
    items = await db.loans.find(q, {"_id": 0}).sort("start_date", -1).to_list(1000)
    return [await enrich_loan(i) for i in items]


@api.post("/loans")
async def create_loan(body: LoanIn, user=Depends(get_current_user)):
    doc = body.dict()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["status"] = "active"
    doc["payments"] = []
    doc["created_at"] = iso(now_utc())
    await db.loans.insert_one(doc)
    loan = await db.loans.find_one({"id": doc["id"]}, {"_id": 0})
    return await enrich_loan(loan)


@api.get("/loans/{loan_id}")
async def get_loan(loan_id: str, user=Depends(get_current_user)):
    loan = await db.loans.find_one({"id": loan_id, "user_id": user["id"]}, {"_id": 0})
    if not loan:
        raise HTTPException(404, "Loan not found")
    return await enrich_loan(loan)


@api.put("/loans/{loan_id}")
async def update_loan(loan_id: str, body: LoanIn, user=Depends(get_current_user)):
    res = await db.loans.update_one(
        {"id": loan_id, "user_id": user["id"]}, {"$set": body.dict(exclude_none=True)}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Loan not found")
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    return await enrich_loan(loan)


@api.delete("/loans/{loan_id}")
async def delete_loan(loan_id: str, user=Depends(get_current_user)):
    await db.loans.delete_one({"id": loan_id, "user_id": user["id"]})
    return {"ok": True}


@api.post("/loans/{loan_id}/payment")
async def add_payment(loan_id: str, body: LoanPaymentIn, user=Depends(get_current_user)):
    loan = await db.loans.find_one({"id": loan_id, "user_id": user["id"]})
    if not loan:
        raise HTTPException(404, "Loan not found")
    entry = {
        "id": str(uuid.uuid4()),
        "amount": body.amount,
        "date": body.date,
        "type": body.type,
        "notes": body.notes,
    }
    await db.loans.update_one({"id": loan_id}, {"$push": {"payments": entry}})
    return {"ok": True, "payment": entry}


@api.post("/loans/{loan_id}/close")
async def close_loan(loan_id: str, user=Depends(get_current_user)):
    res = await db.loans.update_one(
        {"id": loan_id, "user_id": user["id"]}, {"$set": {"status": "closed"}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Loan not found")
    return {"ok": True}


@api.post("/loans/{loan_id}/mark_paid_till_now")
async def mark_paid_till_now(loan_id: str, user=Depends(get_current_user)):
    loan = await db.loans.find_one({"id": loan_id, "user_id": user["id"]})
    if not loan:
        raise HTTPException(404, "Loan not found")
    try:
        sd = datetime.fromisoformat(loan.get("start_date", "")[:10])
    except Exception:
        raise HTTPException(400, "Loan start_date invalid")
    now = now_utc().replace(tzinfo=None)
    months_elapsed = (now.year - sd.year) * 12 + (now.month - sd.month)
    months_elapsed = max(0, min(months_elapsed, int(loan.get("tenure_months", 0) or 0)))
    if months_elapsed == 0:
        return {"ok": True, "added_months": 0, "amount": 0}
    emi = loan.get("emi", 0) or 0
    already = set(loan.get("paid_months", []))
    payments = []
    new_paid = []
    for k in range(months_elapsed):
        mo = sd.month + k - 1
        yr = sd.year + mo // 12
        mo = mo % 12 + 1
        month_key = f"{yr:04d}-{mo:02d}"
        if month_key in already:
            continue
        payments.append({
            "id": str(uuid.uuid4()),
            "amount": emi,
            "date": f"{month_key}-{min(sd.day, 28):02d}",
            "type": "emi",
            "notes": f"Auto catch-up {month_key}",
        })
        new_paid.append(month_key)
    if payments:
        await db.loans.update_one(
            {"id": loan_id},
            {"$push": {"payments": {"$each": payments}}, "$addToSet": {"paid_months": {"$each": new_paid}}},
        )
    return {"ok": True, "added_months": len(payments), "amount": len(payments) * emi}


# ---------- Categories ----------
DEFAULT_CATEGORIES = {
    "income": ["Salary", "Bonus", "Interest", "Dividend", "Rental", "Investment Withdrawal", "Other"],
    "expense": ["Groceries", "Rent", "Utilities", "Food", "Transport", "Shopping", "Health", "Education", "EMI", "SIP", "Other"],
}


async def ensure_default_categories(user_id: str):
    existing = await db.categories.find_one({"user_id": user_id})
    if existing:
        return
    docs = []
    for kind, names in DEFAULT_CATEGORIES.items():
        for n in names:
            docs.append({"id": str(uuid.uuid4()), "user_id": user_id, "name": n, "type": kind})
    if docs:
        await db.categories.insert_many(docs)


@api.get("/categories")
async def list_categories(user=Depends(get_current_user)):
    await ensure_default_categories(user["id"])
    items = await db.categories.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    return items


@api.post("/categories")
async def create_category(body: CategoryIn, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "name": body.name, "type": body.type}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryIn, user=Depends(get_current_user)):
    res = await db.categories.update_one(
        {"id": cat_id, "user_id": user["id"]}, {"$set": {"name": body.name, "type": body.type}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Category not found")
    return {"ok": True}


@api.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user=Depends(get_current_user)):
    await db.categories.delete_one({"id": cat_id, "user_id": user["id"]})
    return {"ok": True}


# ---------- Loan compute helper ----------
class LoanComputeIn(BaseModel):
    total_amount: Optional[float] = None
    interest_rate: Optional[float] = None  # annual %
    emi: Optional[float] = None
    tenure_months: Optional[int] = None
    total_payable: Optional[float] = None
    start_date: Optional[str] = None


@api.post("/loans/compute")
async def loan_compute(body: LoanComputeIn, user=Depends(get_current_user)):
    P = body.total_amount
    R = body.interest_rate
    E = body.emi
    N = body.tenure_months
    T = body.total_payable

    def emi_formula(p: float, r_annual: float, n: int) -> float:
        if not p or not n or n <= 0:
            return 0
        r = (r_annual / 12.0) / 100.0
        if r == 0:
            return p / n
        denom = ((1 + r) ** n) - 1
        if denom == 0:
            return 0
        return p * r * ((1 + r) ** n) / denom

    # Total payable derivable
    if T is None and E and N:
        T = E * N
    # If P + T + N → derive rate iteratively (bisection)
    if (R is None or R == 0) and P and T and N:
        lo, hi = 0.0, 100.0
        target = T
        for _ in range(60):
            mid = (lo + hi) / 2
            est = emi_formula(P, mid, N) * N
            if est < target:
                lo = mid
            else:
                hi = mid
        R = round((lo + hi) / 2, 4)
    # If P + R + N → derive EMI
    if E is None and P and R is not None and N:
        E = round(emi_formula(P, R, N), 2)
        if T is None:
            T = round(E * N, 2)
    # If P + R + E → derive N (loop)
    if N is None and P and R is not None and E:
        for n in range(1, 600):
            if emi_formula(P, R, n) <= E:
                N = n
                break
    # If E + N + R → derive P (reverse)
    if P is None and E and R is not None and N:
        r = (R / 12.0) / 100.0
        if r == 0:
            P = round(E * N, 2)
        else:
            P = round(E * (((1 + r) ** N) - 1) / (r * ((1 + r) ** N)), 2)
        if T is None:
            T = round(E * N, 2)
    end_date = None
    if body.start_date and N:
        try:
            sd = datetime.fromisoformat(body.start_date[:10])
            mo = sd.month + N - 1
            yr = sd.year + mo // 12
            mo = mo % 12 + 1
            end_date = f"{yr:04d}-{mo:02d}-{min(sd.day, 28):02d}"
        except Exception:
            pass
    extra_interest = (T - P) if (T and P) else None
    return {
        "total_amount": P,
        "interest_rate": R,
        "emi": E,
        "tenure_months": N,
        "total_payable": T,
        "extra_interest": extra_interest,
        "end_date": end_date,
    }


# ---------- Reminders (Day-1 monthly auto-due) ----------
@api.get("/reminders")
async def list_reminders(user=Depends(get_current_user)):
    month_key = datetime.now().strftime("%Y-%m")
    members = {m["id"]: m for m in await db.members.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)}
    out = []
    # Recurring active SIPs
    invs = await db.investments.find({"user_id": user["id"], "type": "recurring", "status": "active"}, {"_id": 0}).to_list(500)
    for i in invs:
        paid_months = i.get("paid_months", [])
        if month_key in paid_months:
            continue
        try:
            sd = datetime.fromisoformat(i.get("start_date", "")[:10])
            now = datetime.now()
            if datetime(sd.year, sd.month, 1) > datetime(now.year, now.month, 1):
                continue
        except Exception:
            pass
        out.append({
            "kind": "investment",
            "id": i["id"],
            "name": i.get("name"),
            "amount": i.get("amount", 0),
            "member_name": members.get(i.get("member_id"), {}).get("name", ""),
            "month": month_key,
        })
    # Loan EMIs active
    loans = await db.loans.find({"user_id": user["id"], "status": "active"}, {"_id": 0}).to_list(500)
    for l in loans:
        paid_months = l.get("paid_months", [])
        if month_key in paid_months:
            continue
        try:
            sd = datetime.fromisoformat(l.get("start_date", "")[:10])
            now = datetime.now()
            if datetime(sd.year, sd.month, 1) > datetime(now.year, now.month, 1):
                continue
        except Exception:
            pass
        out.append({
            "kind": "loan",
            "id": l["id"],
            "name": l.get("name"),
            "amount": l.get("emi", 0),
            "member_name": members.get(l.get("member_id"), {}).get("name", ""),
            "month": month_key,
        })
    return out


class ReminderPayIn(BaseModel):
    kind: Literal["investment", "loan"]
    id: str
    month: Optional[str] = None


@api.post("/reminders/pay")
async def pay_reminder(body: ReminderPayIn, user=Depends(get_current_user)):
    month = body.month or datetime.now().strftime("%Y-%m")
    today_iso = iso(now_utc())[:10]
    if body.kind == "investment":
        inv = await db.investments.find_one({"id": body.id, "user_id": user["id"]})
        if not inv:
            raise HTTPException(404, "Investment not found")
        amount = inv.get("amount", 0)
        tx = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "expense",
            "amount": amount,
            "category": "SIP",
            "date": today_iso,
            "notes": f"SIP payment for {inv.get('name')} ({month})",
            "member_id": inv.get("member_id"),
            "source": "sip",
            "source_id": body.id,
            "created_at": iso(now_utc()),
        }
        await db.transactions.insert_one(tx)
        await db.investments.update_one({"id": body.id}, {"$addToSet": {"paid_months": month}})
        return {"ok": True, "transaction_id": tx["id"], "amount": amount}
    else:
        loan = await db.loans.find_one({"id": body.id, "user_id": user["id"]})
        if not loan:
            raise HTTPException(404, "Loan not found")
        amount = loan.get("emi", 0)
        # Record loan payment
        entry = {"id": str(uuid.uuid4()), "amount": amount, "date": today_iso, "type": "emi", "notes": f"Auto-pay {month}"}
        await db.loans.update_one({"id": body.id}, {"$push": {"payments": entry}, "$addToSet": {"paid_months": month}})
        # Also record as expense transaction
        tx = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "expense",
            "amount": amount,
            "category": "EMI",
            "date": today_iso,
            "notes": f"EMI for {loan.get('name')} ({month})",
            "member_id": loan.get("member_id"),
            "source": "emi",
            "source_id": body.id,
            "created_at": iso(now_utc()),
        }
        await db.transactions.insert_one(tx)
        return {"ok": True, "transaction_id": tx["id"], "payment_id": entry["id"], "amount": amount}


# ---------- Dashboard / Reports ----------
def _in_range(date_str: str, start: Optional[str], end: Optional[str]) -> bool:
    if not date_str:
        return False
    if start and date_str < start:
        return False
    if end and date_str > end:
        return False
    return True


@api.get("/dashboard")
async def dashboard(
    member_ids: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user=Depends(get_current_user),
):
    member_filter: dict = {"user_id": user["id"]}
    if member_ids:
        ids = member_ids.split(",")
        member_filter["member_id"] = {"$in": ids}

    # Transactions in date range
    tx_q = dict(member_filter)
    if start_date or end_date:
        tx_q["date"] = {}
        if start_date:
            tx_q["date"]["$gte"] = start_date
        if end_date:
            tx_q["date"]["$lte"] = end_date
    txs = await db.transactions.find(tx_q, {"_id": 0}).to_list(5000)
    income = sum(t["amount"] for t in txs if t["type"] == "income")
    expense = sum(t["amount"] for t in txs if t["type"] == "expense")

    # Category breakdown
    income_by_cat: dict = {}
    expense_by_cat: dict = {}
    emi_by_loan: dict = {}
    sip_by_inv: dict = {}
    for t in txs:
        bucket = income_by_cat if t["type"] == "income" else expense_by_cat
        cat = t.get("category") or "Other"
        bucket[cat] = bucket.get(cat, 0) + t["amount"]
        if t.get("source") == "emi" and t.get("source_id"):
            emi_by_loan[t["source_id"]] = emi_by_loan.get(t["source_id"], 0) + t["amount"]
        if t.get("source") == "sip" and t.get("source_id"):
            sip_by_inv[t["source_id"]] = sip_by_inv.get(t["source_id"], 0) + t["amount"]

    # Resolve names for EMI/SIP sub-breakdowns
    if emi_by_loan:
        loan_docs = await db.loans.find({"id": {"$in": list(emi_by_loan.keys())}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
        emi_sub = [{"id": l["id"], "name": l["name"], "amount": emi_by_loan[l["id"]]} for l in loan_docs]
    else:
        emi_sub = []
    if sip_by_inv:
        inv_docs = await db.investments.find({"id": {"$in": list(sip_by_inv.keys())}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
        sip_sub = [{"id": i["id"], "name": i["name"], "amount": sip_by_inv[i["id"]]} for i in inv_docs]
    else:
        sip_sub = []

    # Investments — active-only; for tiles within date-range we count contributions in range
    inv_q_all = dict(member_filter)
    invs_all = await db.investments.find(inv_q_all, {"_id": 0}).to_list(2000)
    invs_all = [await enrich_investment(i) for i in invs_all]
    active_invs = [i for i in invs_all if i.get("status") != "closed"]
    total_invested_all = sum(i.get("total_invested", 0) for i in active_invs)
    portfolio_value_all = sum(i.get("current_value", 0) for i in active_invs)

    # Loans — active-only; liabilities use remaining_payable
    loan_q_all = dict(member_filter)
    loans_all = await db.loans.find(loan_q_all, {"_id": 0}).to_list(2000)
    loans_all = [await enrich_loan(l) for l in loans_all]
    active_loans = [l for l in loans_all if l.get("status") != "closed"]
    loan_outstanding_all = sum(l.get("remaining_payable", l.get("remaining_balance", 0)) for l in active_loans)

    # Build the list of months within the selected range (capped at current month)
    today_key = datetime.now().strftime("%Y-%m")
    def months_iter(s_iso: str, e_iso: str):
        try:
            sd = datetime.fromisoformat(s_iso[:10])
            ed = datetime.fromisoformat(e_iso[:10])
        except Exception:
            return []
        out = []
        y, mm = sd.year, sd.month
        while (y, mm) <= (ed.year, ed.month):
            out.append(f"{y:04d}-{mm:02d}")
            mm += 1
            if mm > 12:
                mm = 1
                y += 1
        return out

    if start_date and end_date:
        range_months = [m for m in months_iter(start_date, end_date) if m <= today_key]
    elif start_date or end_date:
        sd_use = start_date or today_key + "-01"
        ed_use = end_date or today_key + "-28"
        range_months = [m for m in months_iter(sd_use, ed_use) if m <= today_key]
    else:
        range_months = [today_key]

    # Range-scoped invested = onetime/dynamic that started in range + recurring contributions during range
    range_invested = 0
    range_inv_ids = set()
    for inv in active_invs:
        if inv.get("type") == "recurring":
            inv_start_m = (inv.get("start_date") or "")[:7]
            inv_end_m = (inv.get("end_date") or "9999-12")[:7] if inv.get("status") == "closed" else "9999-12"
            count = sum(1 for m in range_months if m >= inv_start_m and m <= inv_end_m)
            if count > 0:
                monthly = inv.get("amount", 0) or 0
                range_invested += count * monthly
                range_inv_ids.add(inv["id"])
        else:
            if _in_range(inv.get("start_date", ""), start_date, end_date) or (not start_date and not end_date):
                range_invested += inv.get("total_invested", 0)
                range_inv_ids.add(inv["id"])

    # Pending SIP outflow for the range (unpaid recurring months)
    pending_sip = 0
    for inv in active_invs:
        if inv.get("type") != "recurring":
            continue
        paid_set = set(inv.get("paid_months", []))
        inv_start_m = (inv.get("start_date") or "")[:7]
        monthly = inv.get("amount", 0) or 0
        for mk in range_months:
            if mk < inv_start_m:
                continue
            if mk in paid_set:
                continue
            pending_sip += monthly

    # Pending loan EMI outflow for the range
    pending_emi = 0
    range_loan_ids = set()
    for loan in active_loans:
        try:
            sd = datetime.fromisoformat(loan.get("start_date", "")[:10])
            last_idx = sd.month + (loan.get("tenure_months", 0) or 0) - 1
            last_y = sd.year + last_idx // 12
            last_m = last_idx % 12 + 1
            last_key = f"{last_y:04d}-{last_m:02d}"
        except Exception:
            last_key = "9999-12"
        loan_start_m = (loan.get("start_date") or "")[:7]
        paid_set = set(loan.get("paid_months", []))
        emi = loan.get("emi", 0) or 0
        for mk in range_months:
            if mk < loan_start_m or mk > last_key:
                continue
            if mk in paid_set:
                continue
            pending_emi += emi
            range_loan_ids.add(loan["id"])

    pending_outflow = pending_sip + pending_emi
    current_balance = income - expense - pending_outflow
    net_worth = portfolio_value_all - loan_outstanding_all

    return {
        "income": income,
        "expense": expense,
        "net_cash": income - expense,
        "current_balance": current_balance,
        "saved": max(0, current_balance),
        "pending_outflow": pending_outflow,
        "pending_sip": pending_sip,
        "pending_emi": pending_emi,
        # Range-scoped tiles
        "total_invested": range_invested,
        "loan_outstanding_range": pending_emi,
        "active_investments": len(range_inv_ids),
        "active_loans": len(range_loan_ids),
        # All-time active for net worth / liabilities
        "portfolio_value": portfolio_value_all,
        "total_invested_all": total_invested_all,
        "investment_pl": portfolio_value_all - total_invested_all,
        "loan_outstanding": loan_outstanding_all,
        "net_worth": net_worth,
        # Breakdown
        "breakdown": {
            "income": [{"category": k, "amount": v} for k, v in sorted(income_by_cat.items(), key=lambda x: -x[1])],
            "expense": [{"category": k, "amount": v} for k, v in sorted(expense_by_cat.items(), key=lambda x: -x[1])],
            "emi_by_loan": emi_sub,
            "sip_by_investment": sip_sub,
        },
    }


@api.get("/export/csv")
async def export_csv(
    kind: str = "transactions",
    member_ids: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["id"]}
    if member_ids:
        q["member_id"] = {"$in": member_ids.split(",")}
    output = io.StringIO()
    writer = csv.writer(output)
    if kind == "transactions":
        items = await db.transactions.find(q, {"_id": 0}).to_list(5000)
        writer.writerow(["date", "type", "category", "amount", "member_id", "notes"])
        for t in items:
            writer.writerow([t.get("date"), t.get("type"), t.get("category"), t.get("amount"), t.get("member_id"), t.get("notes", "")])
    elif kind == "investments":
        items = await db.investments.find(q, {"_id": 0}).to_list(2000)
        items = [await enrich_investment(i) for i in items]
        writer.writerow(["name", "type", "start_date", "amount", "total_invested", "current_value", "profit_loss", "status"])
        for i in items:
            writer.writerow([i.get("name"), i.get("type"), i.get("start_date"), i.get("amount"), i.get("total_invested"), i.get("current_value"), i.get("profit_loss"), i.get("status")])
    elif kind == "loans":
        items = await db.loans.find(q, {"_id": 0}).to_list(2000)
        items = [await enrich_loan(i) for i in items]
        writer.writerow(["name", "total_amount", "emi", "interest_rate", "tenure_months", "total_paid", "remaining_balance", "status"])
        for l in items:
            writer.writerow([l.get("name"), l.get("total_amount"), l.get("emi"), l.get("interest_rate"), l.get("tenure_months"), l.get("total_paid"), l.get("remaining_balance"), l.get("status")])
    else:
        raise HTTPException(400, "kind must be transactions|investments|loans")
    return PlainTextResponse(output.getvalue(), media_type="text/csv")


@api.get("/")
async def root():
    return {"app": "Family Finance Tracker", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    # Seed demo user (idempotent) so test creds in /app/memory/test_credentials.md work out of the box.
    try:
        existing = await db.users.find_one({"email": "demo@family.app"})
        if not existing:
            uid = str(uuid.uuid4())
            await db.users.insert_one({
                "id": uid,
                "email": "demo@family.app",
                "full_name": "Demo User",
                "hashed_password": hash_password("demo1234"),
                "created_at": iso(now_utc()),
            })
            await db.members.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "name": "Demo User",
                "relation": "Self",
                "color": "#10B981",
                "created_at": iso(now_utc()),
            })
            logger.info("Seeded demo user demo@family.app")
    except Exception as e:
        logger.warning(f"seed failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
