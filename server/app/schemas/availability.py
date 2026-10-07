"""Doctor availability slot schemas."""

from pydantic import BaseModel


class AvailabilitySlotSchema(BaseModel):
    id: int
    doctor_id: int
    date: str
    time: str
    status: str
