"""Doctor availability slot schemas."""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class AvailabilitySlotSchema(BaseModel):
    id: int
    doctor_id: int
    date: str
    time: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: str
    held_until: Optional[str] = None  # ISO datetime, present when status=HELD

    model_config = ConfigDict(from_attributes=True)


class CreateSlotRequest(BaseModel):
    date: str              # YYYY-MM-DD
    start_time: str        # HH:MM
    end_time: Optional[str] = None


class BatchCreateSlotsRequest(BaseModel):
    date: str              # YYYY-MM-DD
    slots: List[str]       # ["09:00", "09:30", "10:00", ...]
