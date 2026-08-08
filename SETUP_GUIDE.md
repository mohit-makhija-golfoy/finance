# Setup Guide - Money Management App

## Problem Fixed
✅ **Login error resolved**: "Unexpected token '<', "<!DOCTYPE "..." is not valid JSON

The issue was that `EXPO_PUBLIC_BACKEND_URL` was not configured, causing the frontend API client to send requests to an undefined URL, which returned HTML error pages instead of JSON responses.

## Configuration Files Created

### 1. Frontend `.env` (frontend/.env)
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```
This tells the frontend where to find the backend API.

### 2. Backend `.env` (backend/.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=family_finance
JWT_SECRET=family-finance-secret-change-me-please-1234567890
```

## Setup Instructions

### Prerequisites
- Node.js & npm
- Python 3.8+
- MongoDB running locally (or update MONGO_URL in backend/.env)

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python server.py
# Or with uvicorn: uvicorn server:app --reload --port 8000
```
The backend will start on `http://localhost:8000`

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## For Production
Update `frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://your-production-api-url.com
```

And update `backend/.env`:
```
MONGO_URL=mongodb+srv://user:password@your-cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=family_finance
JWT_SECRET=your-secure-random-secret-key
```

## Testing the Fix
1. Start the backend server
2. Start the frontend
3. Try logging in - the JSON error should be resolved
4. If still getting errors, check:
   - Backend is running on port 8000
   - MongoDB is accessible at the MONGO_URL
   - Frontend `.env` file is properly set
