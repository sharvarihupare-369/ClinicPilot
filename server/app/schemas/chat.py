"""Chat request and response schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming patient chat message request."""
    patient_id: str = Field(..., description="Unique patient identifier", json_schema_extra={"example": "patient_101"})
    message: str = Field(..., description="Natural language message from patient", json_schema_extra={"example": "I need a dermatologist in Pune"})
    session_id: Optional[str] = Field(None, description="Optional conversation session ID")
    language: Optional[str] = Field(None, description="The preferred language of the patient (e.g. English, Marathi)")


class ActivityStep(BaseModel):
    """A single high-level tool activity event surfaced to the UI."""
    icon: str = Field(..., description="Icon key: search | calendar | shield | check | loader")
    label: str = Field(..., description="Human-readable activity label shown in UI")
    done: bool = Field(default=True, description="Whether this step completed successfully")


class ConfirmationCard(BaseModel):
    """Rich booking summary shown before final confirmation."""
    doctor: str
    specialty: str
    location: str
    date: str
    time: str
    doctor_id: Optional[int] = None
    consultation_fee: Optional[int] = None


class ChatResponse(BaseModel):
    """Outgoing agent chat message response."""
    patient_id: str
    response: str
    session_id: str
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    activity_steps: List[ActivityStep] = Field(
        default_factory=list,
        description="High-level tool activity events for the UI agent activity panel"
    )
    confirmation_card: Optional[ConfirmationCard] = Field(
        None,
        description="Pre-booking confirmation summary rendered as a rich card in the chat UI"
    )
    state: Optional[Dict[str, Any]] = None
