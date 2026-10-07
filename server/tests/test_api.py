"""Tests for FastAPI thin routing layer (POST /chat)."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_chat_endpoint_thin_routing(client):
    # Test POST /chat
    payload = {
        "patient_id": "test_patient_api",
        "message": "I need a dermatologist in Pune",
    }
    res = client.post("/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "test_patient_api"
    assert "Dr. Sharma" in data["response"]
    assert "session_id" in data
