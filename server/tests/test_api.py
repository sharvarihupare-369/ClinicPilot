"""Tests for FastAPI REST API endpoints (/api/chat, /api/doctors, /api/appointments, /api/evaluation)."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_chat_endpoint_thin_routing(client):
    payload = {
        "patient_id": "test_patient_api",
        "message": "I need a doctor in Pune",
    }
    res = client.post("/api/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "test_patient_api"
    assert "session_id" in data
    assert "activity_steps" in data
    assert "response" in data


def test_doctor_auth_and_management(client):
    # Register new doctor
    reg_payload = {
        "email": "dr.test_flow@clinic.com",
        "password": "Password123!",
        "role": "DOCTOR",
        "name": "Dr. Test Flow",
        "specialty": "Pediatrician",
        "location": "Baner, Pune",
        "qualification": "MBBS, MD",
        "experience_years": 8,
        "consultation_fee": 600,
        "bio": "Expert in child healthcare.",
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    # 201 or 409 if already exists
    if reg_res.status_code == 201:
        token = reg_res.json()["access_token"]
    else:
        login_res = client.post("/api/auth/login", json={"email": "dr.test_flow@clinic.com", "password": "Password123!"})
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}

    # Verify profile
    me_res = client.get("/api/doctors/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["profile"]["name"] == "Dr. Test Flow"

    # Publish availability
    slot_res = client.post(
        "/api/doctors/me/availability",
        headers=headers,
        json={"date": "2026-10-15", "slots": ["09:00", "09:30", "10:00"]},
    )
    assert slot_res.status_code == 200
    slots = slot_res.json()
    assert len(slots) >= 3
    slot_times = {s["time"] for s in slots}
    assert {"09:00", "09:30", "10:00"}.issubset(slot_times)


def test_doctors_endpoints(client):
    # 1. List all doctors
    res = client.get("/api/doctors")
    assert res.status_code == 200
    doctors = res.json()
    assert len(doctors) >= 1
    
    # 2. Filter by location
    res_pune = client.get("/api/doctors?location=Pune")
    assert res_pune.status_code == 200
    pune_docs = res_pune.json()
    assert len(pune_docs) >= 1

    # 3. Get specific doctor
    doc_id = doctors[0]["id"]
    res_single = client.get(f"/api/doctors/{doc_id}")
    assert res_single.status_code == 200
    assert res_single.json()["id"] == doc_id

    # 4. Doctor not found
    res_404 = client.get("/api/doctors/99999")
    assert res_404.status_code == 404


def test_appointments_lifecycle(client):
    patient_id = "test_rest_patient"
    
    # Ensure Dr. 2 has slots on 2026-10-15
    client.post(
        "/api/doctors/me/availability",
        headers={"Authorization": "Bearer ..."},
    )
    doctors = client.get("/api/doctors").json()
    doc_id = doctors[0]["id"]

    # Book directly
    book_payload = {
        "patient_id": patient_id,
        "doctor_id": doc_id,
        "date": "2026-10-20",
        "time": "14:00",
    }
    book_res = client.post("/api/appointments", json=book_payload)
    if book_res.status_code == 201:
        apt = book_res.json()
        apt_id = apt["id"]
        assert apt["patient_id"] == patient_id
        assert apt["status"] == "CONFIRMED"

        # List patient appointments
        list_res = client.get(f"/api/appointments?patient_id={patient_id}")
        assert list_res.status_code == 200
        patient_apts = list_res.json()
        assert any(a["id"] == apt_id for a in patient_apts)

        # Cancel appointment
        cancel_res = client.delete(f"/api/appointments/{apt_id}?patient_id={patient_id}")
        assert cancel_res.status_code == 200


def test_evaluation_endpoints(client):
    # 1. Summary
    res_summary = client.get("/api/evaluation/summary")
    assert res_summary.status_code == 200
    summary = res_summary.json()
    assert summary["total_scenarios"] == 8
    assert summary["average_score"] >= 85
    assert len(summary["scenarios"]) == 8

    # 2. Before/After
    res_ba = client.get("/api/evaluation/before-after")
    assert res_ba.status_code == 200
    ba = res_ba.json()
    assert "baseline_summary" in ba
    assert "improved_summary" in ba
    assert len(ba["comparisons"]) == 8
    assert ba["zero_regressions_verified"] is True
    assert ba["learned_rule"] is not None

    # 3. Status
    res_status = client.get("/api/evaluation/status")
    assert res_status.status_code == 200
    assert "running" in res_status.json()


def test_get_doctor_slots_past_filtering(client):
    from app.db.config import get_current_datetime
    cur_date, cur_time = get_current_datetime()

    # 1. include_past=False (default): past slots must be filtered out for today
    res = client.get(f"/api/doctors/1/slots?date={cur_date}")
    assert res.status_code == 200
    slots = res.json()
    for s in slots:
        assert s["time"] > cur_time

    # 2. include_past=True: slots on or before cur_time must be marked PAST
    res_all = client.get(f"/api/doctors/1/slots?date={cur_date}&include_past=true")
    assert res_all.status_code == 200
    all_slots = res_all.json()
    if all_slots:
        for s in all_slots:
            if s["time"] <= cur_time:
                assert s["status"] == "PAST"
            else:
                assert s["status"] in ("AVAILABLE", "HELD", "BOOKED")

    # 3. Past calendar date without include_past should return empty list
    res_past = client.get("/api/doctors/1/slots?date=2026-10-01")
    assert res_past.status_code == 200
    assert res_past.json() == []


def test_book_appointment_past_time_rejected(client):
    from app.db.config import get_current_datetime
    cur_date, cur_time = get_current_datetime()

    # Attempt to book a slot for today at an earlier time (e.g. 09:00 if current time is past 09:00)
    # Or explicitly on a past date
    payload_past = {
        "patient_id": "test_patient_past",
        "doctor_id": 1,
        "date": "2026-10-01",
        "time": "09:00",
    }
    res = client.post("/api/appointments", json=payload_past)
    assert res.status_code == 400
    data = res.json()
    assert data["detail"]["error"] == "APPOINTMENT_IN_PAST"

