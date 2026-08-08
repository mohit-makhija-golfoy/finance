# Family Finance Tracker - PRD

## Overview
A premium dark-fintech mobile app (Expo + FastAPI + MongoDB) for personal finance management with **multi-member support** (self, spouse, parents, etc).

## Stack
- Frontend: Expo Router (React Native), react-native-svg charts, dark+light themes
- Backend: FastAPI + Motor (MongoDB), JWT auth (PyJWT + bcrypt)
- Currency: INR (₹) throughout

## Modules
1. **Auth** — JWT register/login/me, secure token storage
2. **Members** — CRUD; auto-create "Self" on signup
3. **Transactions** — Income/Expense CRUD with category, date, notes; filter by member/type/date
4. **Investments** — three types:
   - `onetime` (FD/stocks/gold) — partial withdrawal + close
   - `recurring` (SIP/RD) — auto-calc invested across months
   - `dynamic` — value history timeline + line chart, profit/loss
5. **Loans** — CRUD, EMI / prepayment tracking, auto-remaining balance, close
6. **Dashboard** — Net worth (assets − liabilities), portfolio value, total invested, P/L, loan outstanding, monthly net cash flow chart
7. **Reports & Filters** — member multi-select chips, date range, type filters
8. **CSV Export** — transactions/investments/loans
9. **Dark mode** toggle (persisted)

## Key API Endpoints
`/api/auth/*`, `/api/members`, `/api/transactions`, `/api/investments` (+ `/value`, `/withdraw`, `/close`), `/api/loans` (+ `/payment`, `/close`), `/api/dashboard`, `/api/export/csv?kind=...`

## Auth
JWT (HS256) email+password, bcrypt hash. Token in `Authorization: Bearer`.
Test creds: `demo@family.app` / `demo1234`
