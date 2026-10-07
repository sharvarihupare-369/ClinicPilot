"""Unit tests for ClinicService business logic and simulation hooks."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.repositories import ClinicRepository
from app.services.clinic_service import ClinicService


@pytest.fixture
def service_fixture():
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


def test_service_search_and_availability(service_fixture):
    service, _ = service_fixture
    docs = service.search_doctors(specialty="Cardiology")
    assert len(docs) == 1
    assert docs[0].name == "Dr. Patel"

    slots = service.get_available_slots(doctor_id=docs[0].id, date="2026-10-10")
    assert len(slots) > 0


def test_service_simulated_availability_outage(service_fixture):
    service, repo = service_fixture
    service_failing = ClinicService(repo, simulate_availability_failure=True)

    with pytest.raises(RuntimeError) as exc_info:
        service_failing.get_available_slots(1, "2026-10-10")
    assert "SERVICE_UNAVAILABLE" in str(exc_info.value)


def test_service_simulated_booking_conflict(service_fixture):
    service, repo = service_fixture
    service_conflict = ClinicService(repo, simulate_booking_failure=True)

    res = service_conflict.book_appointment("pat_1", 1, "2026-10-10", "10:00")
    assert res.success is False
    assert res.error_code == "SLOT_ALREADY_BOOKED"
