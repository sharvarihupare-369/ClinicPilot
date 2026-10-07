"""Deterministic safety guardrails for the agent execution pipeline."""

from typing import Dict, Any, Optional
from app.agent.state import SessionState
from app.services.clinic_service import ClinicService


class GuardrailResult:
    def __init__(self, allowed: bool, error_code: Optional[str] = None, message: Optional[str] = None):
        self.allowed = allowed
        self.error_code = error_code
        self.message = message

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": False,
            "error_code": self.error_code,
            "message": self.message,
            "guardrail_blocked": not self.allowed,
        }


def check_pre_booking_confirmation(
    arguments: Dict[str, Any],
    state: SessionState,
) -> GuardrailResult:
    """Safety Guardrail: Explicit patient confirmation is required before booking."""
    if not state.patient_confirmed:
        return GuardrailResult(
            allowed=False,
            error_code="MISSING_CONFIRMATION",
            message="Explicit patient confirmation is required before booking.",
        )
    return GuardrailResult(allowed=True)


def check_multiple_appointment_disambiguation(
    arguments: Dict[str, Any],
    state: SessionState,
    service: ClinicService,
) -> GuardrailResult:
    """Safety Guardrail: Invariant protection preventing cancellation of ambiguous targets when multiple exist."""
    patient_id = arguments.get("patient_id") or state.patient_id
    active_apts = service.get_patient_appointments(patient_id=patient_id, status="CONFIRMED")

    # If patient has multiple appointments and hasn't explicitly specified the target in dialogue
    if len(active_apts) > 1:
        if state.target_appointment_id:
            return GuardrailResult(allowed=True)

        target_id = arguments.get("appointment_id")
        # If appointments were retrieved and the target ID matches a verified active appointment:
        if state.last_tool_called == "get_patient_appointments" and target_id is not None:
            if any(a.id == int(target_id) for a in active_apts):
                state.target_appointment_id = int(target_id)
                return GuardrailResult(allowed=True)

        return GuardrailResult(
            allowed=False,
            error_code="AMBIGUOUS_APPOINTMENT_TARGET",
            message="Cancellation blocked by safety guardrail: Patient has multiple confirmed appointments. You must first retrieve appointments and ask the patient which one to cancel.",
        )

    return GuardrailResult(allowed=True)


def check_past_time_scheduling(
    tool_name: str,
    arguments: Dict[str, Any],
    state: SessionState,
) -> GuardrailResult:
    """Safety Guardrail: Prevent booking or rescheduling in the past."""
    if tool_name in ["book_appointment", "reschedule_appointment"]:
        date = str(arguments.get("date") or arguments.get("new_date") or "").strip()
        time = str(arguments.get("time") or arguments.get("new_time") or "").strip()
        from app.db.config import get_current_datetime
        cur_date, cur_time = get_current_datetime()
        cur_date = getattr(state, "current_date", None) or cur_date
        cur_time = getattr(state, "current_time", None) or cur_time

        if date and time:
            if date < cur_date or (date == cur_date and time <= cur_time):
                return GuardrailResult(
                    allowed=False,
                    error_code="CANNOT_BOOK_PAST_APPOINTMENT",
                    message=f"Scheduling blocked by safety guardrail: Cannot schedule an appointment in the past ({date} at {time}). Current time is {cur_time} on {cur_date}.",
                )
    return GuardrailResult(allowed=True)

