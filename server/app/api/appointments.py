"""Appointments REST API — list, direct-book, reschedule, and cancel."""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.db import SessionLocal
from app.repositories import ClinicRepository
from app.schemas import AppointmentSchema, BookingResult, CancellationResult, RescheduleResult

router = APIRouter(prefix="/appointments", tags=["appointments"])


def get_repo():
    """Provide a fresh ClinicRepository bound to a short-lived DB session."""
    with SessionLocal() as session:
        yield ClinicRepository(session)


# ── Request bodies ────────────────────────────────────────────────────────────

class BookRequest(BaseModel):
    """Direct booking request (bypasses chat — used from Doctors profile page)."""
    patient_id: str
    doctor_id: int
    date: str
    time: str


class RescheduleRequest(BaseModel):
    """Reschedule request body."""
    patient_id: str
    new_date: str
    new_time: str


# ── Response models ───────────────────────────────────────────────────────────

class AppointmentResponse(BaseModel):
    """Public appointment schema returned by REST endpoints."""
    id: int
    patient_id: str
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    doctor_id: int
    doctor_name: Optional[str] = None
    specialty: Optional[str] = None
    location: Optional[str] = None
    date: str
    time: str
    status: str
    consultation_fee: Optional[int] = None
    created_at: str
    has_reviewed_doctor: Optional[bool] = False


def _apt_to_response(a: AppointmentSchema) -> AppointmentResponse:
    return AppointmentResponse(
        id=a.id,
        patient_id=a.patient_id,
        patient_name=a.patient_name,
        patient_phone=a.patient_phone,
        doctor_id=a.doctor_id,
        doctor_name=a.doctor_name,
        specialty=a.specialty,
        location=a.location,
        date=a.date,
        time=a.time,
        status=a.status,
        consultation_fee=a.consultation_fee,
        created_at=a.created_at,
        has_reviewed_doctor=a.has_reviewed_doctor,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[AppointmentResponse])
def list_appointments(
    patient_id: str = Query(..., description="Patient identifier"),
    status: Optional[str] = Query(None, description="CONFIRMED | CANCELLED | (omit for all)"),
    repo: ClinicRepository = Depends(get_repo),
):
    """List appointments for a patient, optionally filtered by status."""
    apts = repo.get_patient_appointments(patient_id=patient_id, status=status)
    return [_apt_to_response(a) for a in apts]


@router.post("", response_model=AppointmentResponse, status_code=201)
def book_appointment(
    body: BookRequest,
    repo: ClinicRepository = Depends(get_repo),
):
    """Directly book an appointment (from the doctors profile 'Book Now' flow)."""
    from app.db.config import get_current_datetime
    cur_date, cur_time = get_current_datetime()
    if body.date < cur_date or (body.date == cur_date and body.time <= cur_time):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "APPOINTMENT_IN_PAST",
                "message": f"Cannot book an appointment in the past (requested {body.time} on {body.date}, current time {cur_time} on {cur_date}).",
            },
        )
    result = repo.book_appointment(
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        date=body.date,
        time=body.time,
    )
    if not result.success or not result.appointment:
        raise HTTPException(
            status_code=409,
            detail={"error": result.error_code, "message": result.message},
        )
    return _apt_to_response(result.appointment)


@router.delete("/{appointment_id}", response_model=dict)
def cancel_appointment(
    appointment_id: int,
    patient_id: str = Query(..., description="Patient identifier (ownership check)"),
    repo: ClinicRepository = Depends(get_repo),
):
    """Cancel an appointment and release the slot back to AVAILABLE."""
    result = repo.cancel_appointment(patient_id=patient_id, appointment_id=appointment_id)
    if not result.success:
        raise HTTPException(
            status_code=404,
            detail={"error": result.error_code, "message": result.message},
        )
    return {"success": True, "message": result.message, "appointment_id": appointment_id}


@router.patch("/{appointment_id}", response_model=dict)
def reschedule_appointment(
    appointment_id: int,
    body: RescheduleRequest,
    repo: ClinicRepository = Depends(get_repo),
):
    """Reschedule an appointment to a new date/time."""
    from app.db.config import get_current_datetime
    cur_date, cur_time = get_current_datetime()
    if body.new_date < cur_date or (body.new_date == cur_date and body.new_time <= cur_time):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "APPOINTMENT_IN_PAST",
                "message": f"Cannot reschedule to {body.new_date} at {body.new_time} because that time has already passed (current time: {cur_time} on {cur_date}).",
            },
        )
    result = repo.reschedule_appointment(
        patient_id=body.patient_id,
        appointment_id=appointment_id,
        new_date=body.new_date,
        new_time=body.new_time,
    )
    if not result.success:
        raise HTTPException(
            status_code=409,
            detail={"error": result.error_code, "message": result.message},
        )
    return {
        "success": True,
        "message": result.message,
        "appointment_id": appointment_id,
        "old_date": result.old_date,
        "old_time": result.old_time,
        "new_date": result.new_date,
        "new_time": result.new_time,
    }
