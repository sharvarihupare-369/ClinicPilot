"""Reviews REST API — endpoint to create and list doctor reviews."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.auth import require_patient, get_session
from app.models.review import ReviewModel
from app.models.appointment import AppointmentModel
from app.models.doctor import DoctorModel
from app.models.user import UserModel
from app.schemas.review import ReviewCreate, ReviewSchema
from app.db.config import get_current_datetime

router = APIRouter(prefix="/doctors/{doctor_id}/reviews", tags=["reviews"])


@router.get("", response_model=List[ReviewSchema])
def list_doctor_reviews(
    doctor_id: int,
    session: Session = Depends(get_session)
):
    """List all reviews for a specific doctor."""
    doctor = session.get(DoctorModel, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
        
    reviews = session.scalars(
        select(ReviewModel)
        .where(ReviewModel.doctor_id == doctor_id)
        .order_by(ReviewModel.created_at.desc())
    ).all()
    
    return [r.to_schema(patient_name=r.appointment.patient.name if r.appointment.patient else "Anonymous") for r in reviews]


@router.post("", response_model=ReviewSchema)
def create_review(
    doctor_id: int,
    req: ReviewCreate,
    user: UserModel = Depends(require_patient),
    session: Session = Depends(get_session)
):
    """Create a new review for a completed appointment."""
    # Determine the patient_id associated with this authenticated user
    patient_id = user.patient_profile.patient_code if user.patient_profile else f"pat_{user.id}"

    doctor = session.get(DoctorModel, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    appointment = session.get(AppointmentModel, req.appointment_id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if appointment.doctor_id != doctor_id:
        raise HTTPException(status_code=400, detail="Appointment does not belong to this doctor")

    if appointment.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Not authorized to review this appointment")

    if appointment.status != "COMPLETED" and appointment.status != "CONFIRMED":
        raise HTTPException(status_code=400, detail="Can only review confirmed or completed appointments")

    cur_date, cur_time = get_current_datetime()
    # If the appointment is today, it must be in the past time
    # If the appointment is in the future, prevent review
    if appointment.date > cur_date or (appointment.date == cur_date and appointment.time >= cur_time):
        raise HTTPException(status_code=400, detail="Cannot review an appointment that has not happened yet")

    # Check if a review already exists for this doctor by this patient
    existing = session.scalar(
        select(ReviewModel).where(
            ReviewModel.doctor_id == doctor_id,
            ReviewModel.patient_id == patient_id
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="You have already reviewed this doctor")

    review = ReviewModel(
        doctor_id=doctor_id,
        patient_id=patient_id,
        appointment_id=req.appointment_id,
        rating=req.rating,
        review_text=req.review_text
    )
    session.add(review)

    # Update doctor's aggregated rating
    if doctor.total_reviews is None:
        doctor.total_reviews = 0
    if doctor.average_rating is None:
        doctor.average_rating = 0.0

    new_total = doctor.total_reviews + 1
    new_avg = ((doctor.average_rating * doctor.total_reviews) + req.rating) / new_total
    
    doctor.total_reviews = new_total
    doctor.average_rating = round(new_avg, 1)

    session.commit()
    session.refresh(review)

    patient_name = appointment.patient.name if appointment.patient else "Anonymous"
    return review.to_schema(patient_name=patient_name)
