"""Unit tests for the Agent Tools layer."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.repositories import ClinicRepository
from app.services import ClinicService
from app.tools import (
    search_doctors,
    get_available_slots,
    get_patient_appointments,
    book_appointment,
    cancel_appointment,
    reschedule_appointment,
    execute_tool,
    ALL_TOOL_DEFINITIONS,
)


@pytest.fixture
def tools_fixture():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    repo = ClinicRepository(session)
    repo.seed_default_clinic_data()
    service = ClinicService(repo)

    yield service, repo

    session.close()
    Base.metadata.drop_all(engine)


def test_search_doctors_tool(tools_fixture):
    service, _ = tools_fixture
    res = search_doctors(service, specialty="Dermatology", location="Pune")
    assert res["success"] is True
    assert res["count"] == 1
    assert res["doctors"][0]["name"] == "Dr. Sharma"
    assert res["doctors"][0]["id"] == 1

    # Verify synonym normalization: "Skin" -> "Dermatology"
    skin_res = search_doctors(service, specialty="Skin", location="Pune")
    assert skin_res["success"] is True
    assert skin_res["count"] == 1
    assert skin_res["doctors"][0]["name"] == "Dr. Sharma"

    # Verify synonym normalization: "dermats" -> "Dermatology"
    dermat_res = search_doctors(service, specialty="dermats")
    assert dermat_res["success"] is True
    assert dermat_res["count"] == 2  # Dr. Sharma (Pune) and Dr. Mehta (Mumbai)



def test_get_available_slots_tool_validation(tools_fixture):
    service, _ = tools_fixture

    # Missing doctor ID
    res1 = get_available_slots(service, doctor_id="", date="2026-10-10")
    assert res1["success"] is False
    assert res1["error_code"] == "INVALID_DOCTOR_ID"

    # Invalid date format
    res2 = get_available_slots(service, doctor_id=1, date="tomorrow")
    assert res2["success"] is False
    assert res2["error_code"] == "INVALID_DATE_FORMAT"

    # Valid query
    res3 = get_available_slots(service, doctor_id=1, date="2026-10-10")
    assert res3["success"] is True
    assert res3["count"] > 0


def test_get_available_slots_tool_service_outage(tools_fixture):
    _, repo = tools_fixture
    service_failing = ClinicService(repo, simulate_availability_failure=True)
    res = get_available_slots(service_failing, doctor_id=1, date="2026-10-10")
    assert res["success"] is False
    assert res["error_code"] == "AVAILABILITY_SERVICE_OUTAGE"


def test_book_appointment_tool(tools_fixture):
    service, _ = tools_fixture

    # Missing fields
    bad_res = book_appointment(service, patient_id="", doctor_id=1, date="2026-10-10", time="10:00")
    assert bad_res["success"] is False
    assert bad_res["error_code"] == "INVALID_PATIENT_ID"

    # Successful booking
    res = book_appointment(service, patient_id="p1", doctor_id=1, date="2026-10-10", time="10:00")
    assert res["success"] is True
    assert res["appointment_id"] is not None
    assert isinstance(res["appointment_id"], int)

    # Stale/double booking attempt
    res_duplicate = book_appointment(service, patient_id="p2", doctor_id=1, date="2026-10-10", time="10:00")
    assert res_duplicate["success"] is False
    assert res_duplicate["error_code"] == "SLOT_ALREADY_BOOKED"


def test_cancel_appointment_tool(tools_fixture):
    service, _ = tools_fixture
    book_res = book_appointment(service, patient_id="p1", doctor_id=1, date="2026-10-10", time="11:00")
    apt_id = book_res["appointment_id"]

    cancel_res = cancel_appointment(service, patient_id="p1", appointment_id=apt_id)
    assert cancel_res["success"] is True

    # Try cancelling again
    cancel_res2 = cancel_appointment(service, patient_id="p1", appointment_id=apt_id)
    assert cancel_res2["success"] is False
    assert cancel_res2["error_code"] == "APPOINTMENT_ALREADY_CANCELLED"


def test_reschedule_appointment_tool(tools_fixture):
    service, _ = tools_fixture
    book_res = book_appointment(service, patient_id="p1", doctor_id=1, date="2026-10-10", time="14:00")
    apt_id = book_res["appointment_id"]

    resched_res = reschedule_appointment(
        service, patient_id="p1", appointment_id=apt_id, new_date="2026-10-10", new_time="15:00"
    )
    assert resched_res["success"] is True
    assert resched_res["new_time"] == "15:00"


def test_execute_tool_dispatcher(tools_fixture):
    service, _ = tools_fixture

    # Test valid dispatch
    res = execute_tool(
        tool_name="search_doctors",
        arguments={"specialty": "Cardiology"},
        service=service,
    )
    assert res["success"] is True
    assert res["count"] == 1
    assert res["doctors"][0]["name"] == "Dr. Patel"

    # Test unknown tool dispatch
    res_unknown = execute_tool(
        tool_name="delete_database_hack",
        arguments={},
        service=service,
    )
    assert res_unknown["success"] is False
    assert res_unknown["error_code"] == "UNKNOWN_TOOL"


def test_tool_definitions_validity():
    assert len(ALL_TOOL_DEFINITIONS) == 6
    names = {t["name"] for t in ALL_TOOL_DEFINITIONS}
    assert names == {
        "search_doctors",
        "get_available_slots",
        "get_patient_appointments",
        "book_appointment",
        "cancel_appointment",
        "reschedule_appointment",
    }
    for t in ALL_TOOL_DEFINITIONS:
        assert "description" in t
        assert "parameters" in t
        assert t["parameters"]["type"] == "object"
