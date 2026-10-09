"""
Comprehensive automated tests for Razorpay payment integration:
- Slot holding with TTL and race condition guard
- Razorpay order creation
- Webhook signature verification and idempotency
- Payment failure & slot release
- Background slot expiry
- Payment REST API endpoints
"""

import hmac
import hashlib
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.models.doctor import DoctorModel
from app.models.availability import AvailabilityModel
from app.models.appointment import AppointmentModel
from app.models.payment import PaymentModel
from app.services.payment_service import (
    hold_slot,
    create_razorpay_order,
    verify_and_confirm_payment,
    handle_payment_failure,
    expire_held_slots,
    get_payment_status,
    SlotNotAvailableError,
    PaymentAlreadyProcessedError,
    InvalidSignatureError,
    RAZORPAY_KEY_SECRET,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def test_doctor_and_slot():
    """Ensure a doctor with known fee and available slot exists for testing."""
    with SessionLocal() as session:
        # Check or create doctor
        doc = session.get(DoctorModel, 1)
        if not doc:
            doc = DoctorModel(
                id=1,
                name="Dr. Sharma",
                specialty="Dermatology",
                location="Pune",
                consultation_fee=800,
            )
            session.add(doc)
            session.commit()
            session.refresh(doc)

        # Create fresh test slot
        test_date = "2026-11-20"
        test_time = "11:00"
        existing_slot = session.query(AvailabilityModel).filter_by(
            doctor_id=doc.id, date=test_date, time=test_time
        ).first()

        if existing_slot:
            # Clean up any existing appointments on this slot
            session.query(AppointmentModel).filter_by(
                doctor_id=doc.id, date=test_date, time=test_time
            ).delete()
            existing_slot.status = "AVAILABLE"
            existing_slot.held_until = None
            existing_slot.held_by_patient_id = None
            session.commit()
            session.refresh(existing_slot)
            slot = existing_slot
        else:
            slot = AvailabilityModel(
                doctor_id=doc.id,
                date=test_date,
                time=test_time,
                status="AVAILABLE",
            )
            session.add(slot)
            session.commit()
            session.refresh(slot)

        return doc.id, test_date, test_time


def test_hold_slot_success(test_doctor_and_slot):
    """Holding an available slot sets status to HELD and creates PENDING_PAYMENT appointment."""
    doc_id, date, time = test_doctor_and_slot
    patient_id = "pat_test_payer_1"

    with SessionLocal() as session:
        slot, appointment = hold_slot(
            session=session,
            doctor_id=doc_id,
            date=date,
            time=time,
            patient_id=patient_id,
        )

        assert slot.status == "HELD"
        assert slot.held_by_patient_id == patient_id
        assert slot.held_until is not None
        assert appointment.status == "PENDING_PAYMENT"
        assert appointment.patient_id == patient_id
        assert appointment.doctor_id == doc_id


def test_hold_slot_race_condition_prevented(test_doctor_and_slot):
    """A second patient attempting to hold an already held slot is rejected."""
    doc_id, date, time = test_doctor_and_slot

    with SessionLocal() as session:
        # Patient 1 holds slot
        hold_slot(
            session=session,
            doctor_id=doc_id,
            date=date,
            time=time,
            patient_id="pat_first_in_line",
        )

        # Patient 2 tries same slot
        with pytest.raises(SlotNotAvailableError):
            hold_slot(
                session=session,
                doctor_id=doc_id,
                date=date,
                time=time,
                patient_id="pat_second_in_line",
            )


def test_order_creation_and_payment_flow(test_doctor_and_slot):
    """Test full cycle: hold -> create order -> verify signature -> confirm appointment."""
    doc_id, date, time = test_doctor_and_slot
    patient_id = "pat_test_checkout"

    with SessionLocal() as session:
        slot, appointment = hold_slot(
            session=session,
            doctor_id=doc_id,
            date=date,
            time=time,
            patient_id=patient_id,
        )
        apt_id = appointment.id

        # Create Razorpay order
        order_info = create_razorpay_order(
            session=session,
            appointment_id=apt_id,
            patient_id=patient_id,
        )

        assert order_info["appointment_id"] == apt_id
        assert order_info["amount"] == 800 * 100  # 80000 paise = ₹800
        assert order_info["currency"] == "INR"
        order_id = order_info["razorpay_order_id"]

        # Generate valid HMAC signature matching the server's secret
        payment_id = "pay_test_trans_123"
        secret = RAZORPAY_KEY_SECRET or "test_secret"
        expected_sig = hmac.new(
            secret.encode("utf-8"),
            f"{order_id}|{payment_id}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Confirm payment
        confirmed_payment = verify_and_confirm_payment(
            session=session,
            razorpay_order_id=order_id,
            razorpay_payment_id=payment_id,
            razorpay_signature=expected_sig,
        )
        assert confirmed_payment is not None
        assert confirmed_payment.status == "PAID"

        # Verify DB state
        session.refresh(appointment)
        session.refresh(slot)
        assert appointment.status == "CONFIRMED"
        assert slot.status == "BOOKED"

        # Verify idempotency: duplicate confirmation raises PaymentAlreadyProcessedError
        with pytest.raises(PaymentAlreadyProcessedError):
            verify_and_confirm_payment(
                session=session,
                razorpay_order_id=order_id,
                razorpay_payment_id=payment_id,
                razorpay_signature=expected_sig,
            )


def test_payment_failure_releases_slot(test_doctor_and_slot):
    """Payment failure marks appointment CANCELLED and returns slot to AVAILABLE."""
    doc_id, date, time = test_doctor_and_slot
    patient_id = "pat_failed_checkout"

    with SessionLocal() as session:
        slot, appointment = hold_slot(
            session=session,
            doctor_id=doc_id,
            date=date,
            time=time,
            patient_id=patient_id,
        )
        order_info = create_razorpay_order(
            session=session,
            appointment_id=appointment.id,
            patient_id=patient_id,
        )

        # Simulate failure
        handle_payment_failure(session=session, razorpay_order_id=order_info["razorpay_order_id"])

        session.refresh(appointment)
        session.refresh(slot)
        assert appointment.status == "CANCELLED"
        assert slot.status == "AVAILABLE"
        assert slot.held_by_patient_id is None


def test_slot_expiry_background_task(test_doctor_and_slot):
    """Held slots whose TTL has passed are cleanly expired back to AVAILABLE."""
    doc_id, date, time = test_doctor_and_slot

    with SessionLocal() as session:
        slot, appointment = hold_slot(
            session=session,
            doctor_id=doc_id,
            date=date,
            time=time,
            patient_id="pat_abandoned_cart",
        )

        # Artificially set held_until to 10 minutes in the past
        past_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        slot.held_until = past_time
        session.commit()

        # Run expiry cleanup
        released = expire_held_slots(session)
        assert released >= 1

        session.refresh(slot)
        session.refresh(appointment)
        assert slot.status == "AVAILABLE"
        assert slot.held_until is None
        assert appointment.status == "CANCELLED"


def test_payment_api_endpoints(client, test_doctor_and_slot):
    """Test REST API endpoints: /hold-slot, /create-order, and polling status."""
    doc_id, date, time = test_doctor_and_slot
    patient_id = "pat_api_tester"

    # 1. POST /api/payments/hold-slot
    hold_res = client.post(
        "/api/payments/hold-slot",
        json={
            "patient_id": patient_id,
            "doctor_id": doc_id,
            "date": date,
            "time": time,
        },
    )
    assert hold_res.status_code == 201
    hold_data = hold_res.json()
    assert "appointment_id" in hold_data
    assert hold_data["amount"] == 80000
    apt_id = hold_data["appointment_id"]

    # 2. Duplicate hold returns 409
    dup_res = client.post(
        "/api/payments/hold-slot",
        json={
            "patient_id": "other_patient",
            "doctor_id": doc_id,
            "date": date,
            "time": time,
        },
    )
    assert dup_res.status_code == 409

    # 3. GET /api/payments/{id} polling endpoint
    status_res = client.get(f"/api/payments/{apt_id}?patient_id={patient_id}")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["appointment_status"] == "PENDING_PAYMENT"


def test_hold_slot_past_time_rejected():
    """Attempting to hold a slot on a past date or past time must raise SlotNotAvailableError."""
    with SessionLocal() as session:
        with pytest.raises(SlotNotAvailableError) as exc_info:
            hold_slot(
                session=session,
                doctor_id=1,
                date="2026-10-01",
                time="10:00",
                patient_id="pat_past_tester",
            )
        assert "past" in str(exc_info.value).lower()


def test_hold_slot_past_time_api_returns_409(client):
    """API endpoint /api/payments/hold-slot returns 409 when slot is in the past."""
    res = client.post(
        "/api/payments/hold-slot",
        json={
            "patient_id": "pat_past_api_tester",
            "doctor_id": 1,
            "date": "2026-10-01",
            "time": "10:00",
        },
    )
    assert res.status_code == 409
    data = res.json()
    assert data["detail"]["error"] == "SLOT_NOT_AVAILABLE"
    assert "past" in data["detail"]["message"].lower()

