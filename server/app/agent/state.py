"""Multi-turn conversation session state management."""

import uuid
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field


class TurnMessage(BaseModel):
    role: str  # "user" | "assistant" | "tool"
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_results: Optional[List[Dict[str, Any]]] = None


class SessionState(BaseModel):
    """Tracks state across conversation turns for a patient."""
    session_id: str
    patient_id: str
    intent: Optional[str] = None  # BOOK, CANCEL, RESCHEDULE, INQUIRE

    # Progressive clinical slots
    specialty: Optional[str] = None
    location: Optional[str] = None
    doctor_id: Optional[int] = None
    doctor_name: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    target_appointment_id: Optional[Union[int, str]] = None

    current_date: str = "2026-10-05"
    current_time: str = ""

    # Confirmation safety flags
    confirmation_requested: bool = False
    patient_confirmed: bool = False

    # Cache of authoritative available slots for currently selected doctor & date
    available_slots: Optional[List[str]] = None


    # Trace & history
    messages: List[TurnMessage] = Field(default_factory=list)
    last_tool_called: Optional[str] = None
    last_tool_result: Optional[Dict[str, Any]] = None

    def add_user_message(self, text: str) -> None:
        self.messages.append(TurnMessage(role="user", content=text))

    def add_assistant_message(
        self,
        text: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self.messages.append(
            TurnMessage(
                role="assistant",
                content=text,
                tool_calls=tool_calls,
                tool_results=tool_results,
            )
        )

    def to_summary_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "patient_id": self.patient_id,
            "current_date": self.current_date,
            "intent": self.intent,
            "specialty": self.specialty,
            "location": self.location,
            "doctor_id": self.doctor_id,
            "doctor_name": self.doctor_name,
            "date": self.date,
            "time": self.time,
            "target_appointment_id": self.target_appointment_id,
            "available_slots": self.available_slots,
            "confirmation_requested": self.confirmation_requested,
            "patient_confirmed": self.patient_confirmed,
        }



class SessionStore:
    """Thread-safe in-memory session store."""

    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}

    def get_or_create(self, patient_id: str, session_id: Optional[str] = None) -> SessionState:
        sid = session_id or f"sess_{patient_id}"
        if sid not in self._sessions:
            self._sessions[sid] = SessionState(session_id=sid, patient_id=patient_id)
        return self._sessions[sid]

    def get(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def clear(self) -> None:
        self._sessions.clear()
