"""Doctors REST API — public directory, doctor portal profile, availability, and appointments."""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.repositories import ClinicRepository
from app.schemas.doctor import DoctorSchema, DoctorUpdateRequest
from app.schemas.availability import AvailabilitySlotSchema, BatchCreateSlotsRequest, CreateSlotRequest
from app.schemas.appointment import AppointmentSchema
from app.api.auth import require_doctor, get_session
from app.models.user import UserModel

router = APIRouter(prefix="/doctors", tags=["doctors"])


def get_repo(session: Session = Depends(get_session)) -> ClinicRepository:
    """Provide a fresh ClinicRepository bound to the request DB session."""
    return ClinicRepository(session)


class DoctorDetailResponse(BaseModel):
    id: int
    name: str
    specialty: str
    location: str
    qualification: Optional[str] = "MBBS, MD"
    experience_years: Optional[int] = 5
    bio: Optional[str] = None
    consultation_fee: Optional[int] = 500
    is_verified: bool = True


class DoctorMetrics(BaseModel):
    total_slots: int
    available_slots: int
    booked_appointments: int


class DoctorMeResponse(BaseModel):
    profile: DoctorDetailResponse
    metrics: DoctorMetrics


# ── DOCTOR PORTAL ENDPOINTS (Protected with require_doctor) ───────────────────

@router.get("/me", response_model=DoctorMeResponse)
def get_doctor_me(
    user: UserModel = Depends(require_doctor),
    repo: ClinicRepository = Depends(get_repo),
):
    """Retrieve logged-in doctor's complete profile and operational schedule metrics."""
    doc = user.doctor_profile
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor profile not found.")

    all_slots = repo.get_doctor_all_slots(doc.id)
    appts = repo.get_doctor_appointments(doc.id)

    available_count = sum(1 for s in all_slots if s.status == "AVAILABLE")
    booked_count = sum(1 for a in appts if a.status == "CONFIRMED")

    return DoctorMeResponse(
        profile=DoctorDetailResponse(
            id=doc.id,
            name=doc.name,
            specialty=doc.specialty,
            location=doc.location,
            qualification=doc.qualification,
            experience_years=doc.experience_years,
            bio=doc.bio,
            consultation_fee=doc.consultation_fee,
            is_verified=doc.is_verified,
        ),
        metrics=DoctorMetrics(
            total_slots=len(all_slots),
            available_slots=available_count,
            booked_appointments=booked_count,
        ),
    )


@router.patch("/me", response_model=DoctorDetailResponse)
def update_doctor_me(
    req: DoctorUpdateRequest,
    user: UserModel = Depends(require_doctor),
    repo: ClinicRepository = Depends(get_repo),
):
    """Updates the logged-in doctor's profile details."""
    doc = user.doctor_profile
    updated = repo.update_doctor_profile(
        doctor_id=doc.id,
        name=req.name,
        specialty=req.specialty,
        location=req.location,
        qualification=req.qualification,
        experience_years=req.experience_years,
        bio=req.bio,
        consultation_fee=req.consultation_fee,
    )
    if not updated:
        raise HTTPException(status_code=400, detail="Failed to update profile.")

    return DoctorDetailResponse(
        id=updated.id,
        name=updated.name,
        specialty=updated.specialty,
        location=updated.location,
        qualification=updated.qualification,
        experience_years=updated.experience_years,
        bio=updated.bio,
        consultation_fee=updated.consultation_fee,
        is_verified=updated.is_verified,
    )


@router.get("/me/availability", response_model=List[AvailabilitySlotSchema])
def get_my_availability(
    date: Optional[str] = Query(None, description="Optional date filter YYYY-MM-DD"),
    user: UserModel = Depends(require_doctor),
    repo: ClinicRepository = Depends(get_repo),
):
    """Retrieves all availability slots published by the logged-in doctor."""
    return repo.get_doctor_all_slots(user.doctor_profile.id, date=date)


@router.post("/me/availability", response_model=List[AvailabilitySlotSchema])
def create_my_availability(
    req: BatchCreateSlotsRequest,
    user: UserModel = Depends(require_doctor),
    repo: ClinicRepository = Depends(get_repo),
):
    """Batch-creates availability time slots for a given date."""
    if not req.slots:
        raise HTTPException(status_code=400, detail="At least one time slot is required.")
    return repo.batch_create_availability(
        doctor_id=user.doctor_profile.id,
        date=req.date,
        slots=req.slots,
    )


@router.delete("/me/availability/{slot_id}")
def delete_my_availability_slot(
    slot_id: int,
    user: UserModel = Depends(require_doctor),
    repo: ClinicRepository = Depends(get_repo),
):
    """Deletes an unbooked availability slot."""
    success = repo.delete_availability_slot(
        doctor_id=user.doctor_profile.id,
        slot_id=slot_id,
    )
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete slot. It may not exist, belongs to another doctor, or is already booked.",
        )
    return {"status": "success", "message": f"Slot {slot_id} deleted."}


@router.get("/me/appointments", response_model=List[AppointmentSchema])
def get_my_appointments(
    user: UserModel = Depends(require_doctor),
    repo: ClinicRepository = Depends(get_repo),
):
    """Retrieves all patient appointments scheduled with the logged-in doctor."""
    return repo.get_doctor_appointments(user.doctor_profile.id)


# ── PUBLIC PATIENT & AGENT ENDPOINTS ──────────────────────────────────────────

@router.get("", response_model=List[DoctorDetailResponse])
def list_doctors(
    specialty: Optional[str] = Query(None, description="Filter by specialty (e.g. Dermatology)"),
    location: Optional[str] = Query(None, description="Filter by city (e.g. Pune)"),
    repo: ClinicRepository = Depends(get_repo),
):
    """List all certified clinic doctors, optionally filtered by specialty and/or location."""
    doctors = repo.search_doctors(specialty=specialty, location=location)
    return [
        DoctorDetailResponse(
            id=d.id,
            name=d.name,
            specialty=d.specialty,
            location=d.location,
            qualification=d.qualification,
            experience_years=d.experience_years,
            bio=d.bio,
            consultation_fee=d.consultation_fee,
            is_verified=d.is_verified,
        )
        for d in doctors
    ]


@router.get("/{doctor_id}", response_model=DoctorDetailResponse)
def get_doctor(
    doctor_id: int,
    repo: ClinicRepository = Depends(get_repo),
):
    """Get a single doctor by ID."""
    doctor = repo.get_doctor_by_id(doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail=f"Doctor {doctor_id} not found.")
    return DoctorDetailResponse(
        id=doctor.id,
        name=doctor.name,
        specialty=doctor.specialty,
        location=doctor.location,
        qualification=doctor.qualification,
        experience_years=doctor.experience_years,
        bio=doctor.bio,
        consultation_fee=doctor.consultation_fee,
        is_verified=doctor.is_verified,
    )


@router.get("/{doctor_id}/slots", response_model=List[AvailabilitySlotSchema])
def get_doctor_slots(
    doctor_id: int,
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    include_past: bool = Query(False, description="Whether to include past slots marked with status=PAST"),
    repo: ClinicRepository = Depends(get_repo),
):
    """Retrieve available appointment slots for a doctor."""
    from app.db.config import get_current_datetime
    cur_date, cur_time = get_current_datetime()
    target_date = date or cur_date

    slots = repo.get_available_slots(doctor_id=doctor_id, date=target_date)

    # Requested date is in the past
    if target_date < cur_date:
        if include_past:
            for s in slots:
                s.status = "PAST"
            return slots
        return []

    # Requested date is today: slots at or before cur_time are past
    if target_date == cur_date:
        if include_past:
            for s in slots:
                if s.time <= cur_time:
                    s.status = "PAST"
            return slots
        else:
            return [s for s in slots if s.time > cur_time]

    return slots
