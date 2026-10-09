"""Patient appointment booking, lookup, cancellation, and rescheduling agent tools."""

import re
from typing import Optional, Dict, Any, Union
from app.services.clinic_service import ClinicService


def get_patient_appointments(
    service: ClinicService,
    patient_id: str,
    status: Optional[str] = "CONFIRMED",
) -> Dict[str, Any]:
    """Retrieve active or historical appointments for a patient."""
    if not patient_id or not patient_id.strip():
        return {
            "success": False,
            "error_code": "INVALID_PATIENT_ID",
            "message": "patient_id is required.",
            "appointments": [],
        }

    try:
        apts = service.get_patient_appointments(patient_id=patient_id.strip(), status=status)
        return {
            "success": True,
            "patient_id": patient_id,
            "count": len(apts),
            "appointments": [a.model_dump() for a in apts],
            "message": f"Found {len(apts)} appointment(s)." if apts else "No appointments found.",
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "APPOINTMENT_LOOKUP_ERROR",
            "message": f"Failed to retrieve appointments: {str(e)}",
            "appointments": [],
        }


def book_appointment(
    service: ClinicService,
    patient_id: str,
    doctor_id: Union[int, str],
    date: str,
    time: str,
    current_date: str = None,
    current_time: str = None,
) -> Dict[str, Any]:
    """Authoritative booking tool. Reserves slot and creates appointment record."""
    if not patient_id or not str(patient_id).strip():
        return {"success": False, "error_code": "INVALID_PATIENT_ID", "message": "patient_id is required."}
    if doctor_id is None or str(doctor_id).strip() == "":
        return {"success": False, "error_code": "INVALID_DOCTOR_ID", "message": "doctor_id is required."}
    try:
        from datetime import date as dt_date
        dt_date.fromisoformat(str(date).strip())
    except (ValueError, TypeError):
        return {"success": False, "error_code": "INVALID_DATE_FORMAT", "message": f"date '{date}' is an invalid calendar date."}
    if not re.match(r"^\d{2}:\d{2}$", str(time).strip()):
        return {"success": False, "error_code": "INVALID_TIME_FORMAT", "message": "time must be in HH:MM format."}


    from app.db.config import get_current_datetime
    if current_date and current_time:
        cur_date, cur_time = current_date, current_time
    else:
        cur_date, cur_time = get_current_datetime()
    date_clean = str(date).strip()
    time_clean = str(time).strip()
    if date_clean < cur_date or (date_clean == cur_date and time_clean <= cur_time):
        return {
            "success": False,
            "error_code": "APPOINTMENT_IN_PAST",
            "message": f"Cannot book an appointment for {date_clean} at {time_clean} because that time has already passed (current time: {cur_time} on {cur_date}).",
        }

    result = service.book_appointment(
        patient_id=str(patient_id).strip(),
        doctor_id=doctor_id,
        date=date_clean,
        time=time_clean,
    )

    return result.model_dump()


def cancel_appointment(
    service: ClinicService,
    patient_id: str,
    appointment_id: Union[int, str],
) -> Dict[str, Any]:
    """Authoritative cancellation tool. Releases reserved slot back to AVAILABLE."""
    if not patient_id or not str(patient_id).strip():
        return {"success": False, "error_code": "INVALID_PATIENT_ID", "message": "patient_id is required."}
    if appointment_id is None or str(appointment_id).strip() == "":
        return {"success": False, "error_code": "INVALID_APPOINTMENT_ID", "message": "appointment_id is required."}

    result = service.cancel_appointment(
        patient_id=str(patient_id).strip(),
        appointment_id=appointment_id,
    )
    return result.model_dump()


def reschedule_appointment(
    service: ClinicService,
    patient_id: str,
    appointment_id: Union[int, str],
    new_date: str,
    new_time: str,
    current_date: str = None,
    current_time: str = None,
) -> Dict[str, Any]:
    """Authoritative rescheduling tool. Releases old slot and books new slot atomically."""
    if not patient_id or not str(patient_id).strip():
        return {"success": False, "error_code": "INVALID_PATIENT_ID", "message": "patient_id is required."}
    if appointment_id is None or str(appointment_id).strip() == "":
        return {"success": False, "error_code": "INVALID_APPOINTMENT_ID", "message": "appointment_id is required."}
    try:
        from datetime import date as dt_date
        dt_date.fromisoformat(str(new_date).strip())
    except (ValueError, TypeError):
        return {"success": False, "error_code": "INVALID_DATE_FORMAT", "message": f"new_date '{new_date}' is an invalid calendar date."}
    if not re.match(r"^\d{2}:\d{2}$", str(new_time).strip()):
        return {"success": False, "error_code": "INVALID_TIME_FORMAT", "message": "new_time must be in HH:MM format."}

    from app.db.config import get_current_datetime
    if current_date and current_time:
        cur_date, cur_time = current_date, current_time
    else:
        cur_date, cur_time = get_current_datetime()
    new_date_clean = str(new_date).strip()
    new_time_clean = str(new_time).strip()
    if new_date_clean < cur_date or (new_date_clean == cur_date and new_time_clean <= cur_time):
        return {
            "success": False,
            "error_code": "APPOINTMENT_IN_PAST",
            "message": f"Cannot reschedule to {new_date_clean} at {new_time_clean} because that time has already passed (current time: {cur_time} on {cur_date}).",
        }

    result = service.reschedule_appointment(
        patient_id=str(patient_id).strip(),
        appointment_id=appointment_id,
        new_date=new_date_clean,
        new_time=new_time_clean,
    )
    return result.model_dump()


GET_PATIENT_APPOINTMENTS_DEFINITION = {
    "name": "get_patient_appointments",
    "description": "Fetch current appointments for a patient. Must be called when patient asks to cancel, reschedule, or review existing appointments.",
    "parameters": {
        "type": "object",
        "properties": {
            "patient_id": {
                "type": "string",
                "description": "The unique patient identifier.",
            },
            "status": {
                "type": "string",
                "description": "Filter by appointment status (default: CONFIRMED).",
                "enum": ["CONFIRMED", "CANCELLED"],
            },
        },
        "required": ["patient_id"],
    },
}

BOOK_APPOINTMENT_DEFINITION = {
    "name": "book_appointment",
    "description": "Authoritatively books a clinic appointment. Must ONLY be called AFTER patient has explicitly confirmed doctor, date, and time.",
    "parameters": {
        "type": "object",
        "properties": {
            "patient_id": {
                "type": "string",
                "description": "The unique patient identifier.",
            },
            "doctor_id": {
                "type": "integer",
                "description": "The integer ID of the doctor (e.g. 1, 2, 3).",
            },
            "date": {
                "type": "string",
                "description": "Appointment date in YYYY-MM-DD format.",
            },
            "time": {
                "type": "string",
                "description": "Appointment time in HH:MM format (24-hour).",
            },
        },
        "required": ["patient_id", "doctor_id", "date", "time"],
    },
}

CANCEL_APPOINTMENT_DEFINITION = {
    "name": "cancel_appointment",
    "description": "Cancels an existing appointment. If the patient has multiple appointments, you must disambiguate and ask the patient to specify which appointment before calling this tool.",
    "parameters": {
        "type": "object",
        "properties": {
            "patient_id": {
                "type": "string",
                "description": "The patient identifier.",
            },
            "appointment_id": {
                "type": "integer",
                "description": "The integer ID of the appointment to cancel (e.g. 1, 2).",
            },
        },
        "required": ["patient_id", "appointment_id"],
    },
}

RESCHEDULE_APPOINTMENT_DEFINITION = {
    "name": "reschedule_appointment",
    "description": "Reschedules an existing appointment to a new date and time.",
    "parameters": {
        "type": "object",
        "properties": {
            "patient_id": {
                "type": "string",
                "description": "The patient identifier.",
            },
            "appointment_id": {
                "type": "integer",
                "description": "The integer ID of the appointment to reschedule.",
            },
            "new_date": {
                "type": "string",
                "description": "New appointment date in YYYY-MM-DD format.",
            },
            "new_time": {
                "type": "string",
                "description": "New appointment time in HH:MM format.",
            },
        },
        "required": ["patient_id", "appointment_id", "new_date", "new_time"],
    },
}
