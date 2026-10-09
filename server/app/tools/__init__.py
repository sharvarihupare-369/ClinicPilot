"""Agent tools registry and execution dispatcher."""

from typing import Dict, Any, List
from app.services.clinic_service import ClinicService
from app.tools.doctors import search_doctors, SEARCH_DOCTORS_DEFINITION
from app.tools.availability import get_available_slots, GET_AVAILABLE_SLOTS_DEFINITION
from app.tools.appointments import (
    get_patient_appointments,
    book_appointment,
    cancel_appointment,
    reschedule_appointment,
    GET_PATIENT_APPOINTMENTS_DEFINITION,
    BOOK_APPOINTMENT_DEFINITION,
    CANCEL_APPOINTMENT_DEFINITION,
    RESCHEDULE_APPOINTMENT_DEFINITION,
)

ALL_TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    SEARCH_DOCTORS_DEFINITION,
    GET_AVAILABLE_SLOTS_DEFINITION,
    GET_PATIENT_APPOINTMENTS_DEFINITION,
    BOOK_APPOINTMENT_DEFINITION,
    CANCEL_APPOINTMENT_DEFINITION,
    RESCHEDULE_APPOINTMENT_DEFINITION,
]


def execute_tool(
    tool_name: str,
    arguments: Dict[str, Any],
    service: ClinicService,
    current_date: str = None,
    current_time: str = None,
) -> Dict[str, Any]:
    """Centralized dispatcher executing agent tools against the domain service."""
    dispatch_map = {
        "search_doctors": lambda args: search_doctors(
            service=service,
            specialty=args.get("specialty"),
            location=args.get("location"),
            doctor_name=args.get("doctor_name") or args.get("name"),
        ),
        "get_available_slots": lambda args: get_available_slots(
            service=service,
            doctor_id=args.get("doctor_id", ""),
            date=args.get("date", ""),
            current_date=current_date,
            current_time=current_time,
        ),
        "get_patient_appointments": lambda args: get_patient_appointments(
            service=service,
            patient_id=args.get("patient_id", ""),
            status=args.get("status", "CONFIRMED"),
        ),
        "book_appointment": lambda args: book_appointment(
            service=service,
            patient_id=args.get("patient_id", ""),
            doctor_id=args.get("doctor_id", ""),
            date=args.get("date", ""),
            time=args.get("time", ""),
            current_date=current_date,
            current_time=current_time,
        ),
        "cancel_appointment": lambda args: cancel_appointment(
            service=service,
            patient_id=args.get("patient_id", ""),
            appointment_id=args.get("appointment_id", ""),
        ),
        "reschedule_appointment": lambda args: reschedule_appointment(
            service=service,
            patient_id=args.get("patient_id", ""),
            appointment_id=args.get("appointment_id", ""),
            new_date=args.get("new_date", ""),
            new_time=args.get("new_time", ""),
            current_date=current_date,
            current_time=current_time,
        ),
    }

    if tool_name not in dispatch_map:
        return {
            "success": False,
            "error_code": "UNKNOWN_TOOL",
            "message": f"Tool '{tool_name}' is not recognized.",
        }

    try:
        return dispatch_map[tool_name](arguments)
    except Exception as e:
        return {
            "success": False,
            "error_code": "TOOL_EXECUTION_EXCEPTION",
            "message": f"Unexpected error executing tool '{tool_name}': {str(e)}",
        }


__all__ = [
    "search_doctors",
    "get_available_slots",
    "get_patient_appointments",
    "book_appointment",
    "cancel_appointment",
    "reschedule_appointment",
    "ALL_TOOL_DEFINITIONS",
    "execute_tool",
]
