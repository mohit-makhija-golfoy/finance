import os
import pytest
import requests
import uuid

# Load EXPO_PUBLIC_BACKEND_URL from frontend .env (single source of truth for public URL)
def _load_base_url() -> str:
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val.rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not configured")


BASE_URL = _load_base_url()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_session(api_client):
    """Register a fresh user (avoids password collision with the demo account) and return authenticated session."""
    email = f"test_{uuid.uuid4().hex[:10]}@family.app"
    password = "TestPass1234"
    full_name = "TEST User"
    r = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
        timeout=30,
    )
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    sess = requests.Session()
    sess.headers.update(
        {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    )
    sess.email = email  # type: ignore[attr-defined]
    sess.password = password  # type: ignore[attr-defined]
    sess.user_id = data["user"]["id"]  # type: ignore[attr-defined]
    sess.token = token  # type: ignore[attr-defined]
    return sess
