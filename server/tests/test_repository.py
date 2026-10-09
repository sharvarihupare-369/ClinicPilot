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


def test_slot_reflection_and_concurrent_race_condition(in_memory_db):
    """Test:
    1. Patient books a slot -> reflects in patient appointments & doctor dashboard appointments.
    2. That slot is no longer visible in get_available_slots to other patients.
    3. Race condition: concurrent booking attempt by patient 2 returns SLOT_ALREADY_BOOKED with error message.
    """
    repo, session = in_memory_db
    doc_id = 1
    date = "2026-10-10"
    time = "10:30"

    # Step 1: Initial available slots include 10:30
    slots_before = repo.get_available_slots(doc_id, date)
    assert any(s.time == time for s in slots_before)

    # Step 2: Patient 1 books the slot
    res1 = repo.book_appointment("pat_alice", doc_id, date, time)
    assert res1.success is True
    assert res1.appointment_id is not None

    # Step 3: Slot must NO LONGER be visible in get_available_slots to any patient
    slots_after = repo.get_available_slots(doc_id, date)
    assert not any(s.time == time for s in slots_after)

    # Step 4: Reflects in patient's appointments
    patient_apts = repo.get_patient_appointments("pat_alice")
    assert len(patient_apts) == 1
    assert patient_apts[0].date == date
    assert patient_apts[0].time == time

    # Step 5: Reflects in doctor's appointments panel
    doc_apts = repo.get_doctor_appointments(doc_id)
    matched_doc_appt = [a for a in doc_apts if a.date == date and a.time == time]
    assert len(matched_doc_appt) == 1
    assert matched_doc_appt[0].patient_id == "pat_alice"

    # Step 6: Patient 2 attempts to book the same slot (race condition / subsequent attempt)
    res2 = repo.book_appointment("pat_bob", doc_id, date, time)
    assert res2.success is False
    assert res2.error_code == "SLOT_ALREADY_BOOKED"
    assert "already booked" in res2.message.lower() or "just booked" in res2.message.lower()
    assert "other available slots" in res2.message.lower()

    # Step 7: Patient 2 has 0 appointments booked
    bob_apts = repo.get_patient_appointments("pat_bob")
    assert len(bob_apts) == 0

