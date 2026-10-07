"""Appointment schemas and transactional result schemas."""

from typing import Optional
from pydantic import BaseModel


class AppointmentSchema(BaseModel):
    id: int
    patient_id: str
    doctor_id: int
    doctor_name: Optional[str] = None
    specialty: Optional[str] = None
    location: Optional[str] = None
    date: str
    time: str
    status: str
    created_at: str


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
