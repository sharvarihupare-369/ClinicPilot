"""Schemas module exposing all domain data models."""

from app.schemas.doctor import DoctorSchema
from app.schemas.availability import AvailabilitySlotSchema
from app.schemas.appointment import (
    AppointmentSchema,
    BookingResult,
    CancellationResult,
    RescheduleResult,
)
from app.schemas.chat import ChatRequest, ChatResponse

__all__ = [
    "DoctorSchema",
    "AvailabilitySlotSchema",
    "AppointmentSchema",
    "BookingResult",
    "CancellationResult",
    "RescheduleResult",
    "ChatRequest",
    "ChatResponse",
]
