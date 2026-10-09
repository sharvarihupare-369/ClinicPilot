"""Appointment schemas and transactional result schemas."""

from typing import Optional
from pydantic import BaseModel


class AppointmentSchema(BaseModel):
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


class BookingResult(BaseModel):
    success: bool
    appointment_id: Optional[int] = None
    error_code: Optional[str] = None
    message: str
    appointment: Optional[AppointmentSchema] = None


class CancellationResult(BaseModel):
    success: bool
    appointment_id: Optional[int] = None
    error_code: Optional[str] = None
    message: str


class RescheduleResult(BaseModel):
    success: bool
    appointment_id: Optional[int] = None
    old_date: Optional[str] = None
    old_time: Optional[str] = None
    new_date: Optional[str] = None
    new_time: Optional[str] = None
    error_code: Optional[str] = None
    message: str
