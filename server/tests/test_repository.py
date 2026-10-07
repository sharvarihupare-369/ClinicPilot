"""Focused unit tests for SQLAlchemy 2.0 Repository & SQLite transactional integrity."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.repositories import ClinicRepository


@pytest.fixture
def in_memory_db():
    """Provides an isolated SQLite in-memory database with clean schema for every test."""
    test_engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(test_engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSessionLocal()
    repo = ClinicRepository(session)
    repo.seed_default_clinic_data()

    yield repo, session

    session.close()
    Base.metadata.drop_all(test_engine)


def test_search_doctors_by_specialty(in_memory_db):
    repo, _ = in_memory_db
    dermatologists = repo.search_doctors(specialty="Dermatology")
    assert len(dermatologists) == 2
    names = {d.name for d in dermatologists}
    assert "Dr. Sharma" in names
    assert "Dr. Mehta" in names


def test_search_doctors_by_specialty_and_location(in_memory_db):
    repo, _ = in_memory_db
    results = repo.search_doctors(specialty="Dermatology", location="Pune")
    assert len(results) == 1
    assert results[0].name == "Dr. Sharma"
    assert results[0].id == 1


def test_get_available_slots(in_memory_db):
    repo, _ = in_memory_db
    slots = repo.get_available_slots(doctor_id=1, date="2026-10-10")
    assert len(slots) == 14
    assert slots[0].time == "09:00"
    assert all(s.status == "AVAILABLE" for s in slots)


def test_successful_booking(in_memory_db):
    repo, session = in_memory_db
    result = repo.book_appointment(
        patient_id="patient_123",
        doctor_id=1,
        date="2026-10-10",
        time="10:00",
    )
    assert result.success is True
    assert result.appointment_id is not None
    assert isinstance(result.appointment_id, int)
    assert result.appointment.status == "CONFIRMED"

    # Verify slot is marked BOOKED
    slot = repo.get_slot(1, "2026-10-10", "10:00")
    assert slot.status == "BOOKED"

    # Verify appointment exists in patient history
    patient_apts = repo.get_patient_appointments("patient_123")
    assert len(patient_apts) == 1
    assert patient_apts[0].id == result.appointment_id


def test_prevent_booking_already_booked_slot(in_memory_db):
    repo, _ = in_memory_db
    # First booking succeeds
    res1 = repo.book_appointment("patient_A", 1, "2026-10-10", "11:00")
    assert res1.success is True

    # Second booking of the exact same slot must fail
    res2 = repo.book_appointment("patient_B", 1, "2026-10-10", "11:00")
    assert res2.success is False
    assert res2.error_code == "SLOT_ALREADY_BOOKED"


def test_cancel_appointment_releases_slot(in_memory_db):
    repo, _ = in_memory_db
    book_res = repo.book_appointment("patient_1", 2, "2026-10-10", "14:00")
    apt_id = book_res.appointment_id

    # Verify slot is BOOKED
    slot_before = repo.get_slot(2, "2026-10-10", "14:00")
    assert slot_before.status == "BOOKED"

    # Cancel appointment
    cancel_res = repo.cancel_appointment("patient_1", apt_id)
    assert cancel_res.success is True

    # Verify appointment is CANCELLED
    apt = repo.get_appointment_by_id(apt_id)
    assert apt.status == "CANCELLED"

    # Verify slot is released back to AVAILABLE
    slot_after = repo.get_slot(2, "2026-10-10", "14:00")
    assert slot_after.status == "AVAILABLE"


def test_reschedule_appointment(in_memory_db):
    repo, _ = in_memory_db
    book_res = repo.book_appointment("patient_1", 1, "2026-10-10", "09:00")
    apt_id = book_res.appointment_id

    # Reschedule to 15:00
    reschedule_res = repo.reschedule_appointment(
        patient_id="patient_1",
        appointment_id=apt_id,
        new_date="2026-10-10",
        new_time="15:00",
    )
    assert reschedule_res.success is True
    assert reschedule_res.new_time == "15:00"

    # Old slot should be AVAILABLE again
    old_slot = repo.get_slot(1, "2026-10-10", "09:00")
    assert old_slot.status == "AVAILABLE"

    # New slot should now be BOOKED
    new_slot = repo.get_slot(1, "2026-10-10", "15:00")
    assert new_slot.status == "BOOKED"
