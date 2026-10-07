"""Chat request and response schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming patient chat message request."""
    patient_id: str = Field(..., description="Unique patient identifier", json_schema_extra={"example": "patient_101"})
    message: str = Field(..., description="Natural language message from patient", json_schema_extra={"example": "I need a dermatologist in Pune"})
    session_id: Optional[str] = Field(None, description="Optional conversation session ID")


class ChatResponse(BaseModel):
    """Outgoing agent chat message response."""
    patient_id: str
    response: str
    session_id: str
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    state: Optional[Dict[str, Any]] = None
