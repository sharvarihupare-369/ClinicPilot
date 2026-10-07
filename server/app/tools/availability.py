"""Doctor availability agent tools."""

import re
from typing import Dict, Any, Union
from app.services.clinic_service import ClinicService


def get_available_slots(
    service: ClinicService,
    doctor_id: Union[int, str],
    date: str,
) -> Dict[str, Any]:
    """Retrieve available appointment slots for a specific doctor and date (YYYY-MM-DD)."""
    # Input validation
    if doctor_id is None or str(doctor_id).strip() == "":
        return {
            "success": False,
            "error_code": "INVALID_DOCTOR_ID",
            "message": "doctor_id is required.",
            "slots": [],
        }

    date_str = str(date).strip()
    try:
        from datetime import date as dt_date
        dt_date.fromisoformat(date_str)
    except (ValueError, TypeError):
        return {
            "success": False,
            "error_code": "INVALID_DATE_FORMAT",
            "message": f"Date '{date}' is an invalid calendar date. Please specify date in YYYY-MM-DD format.",
            "slots": [],
        }


    try:
        from app.db.config import get_current_datetime
        cur_date, cur_time = get_current_datetime()

        if date_str < cur_date:
            return {
                "success": True,
                "doctor_id": doctor_id,
                "date": date_str,
                "count": 0,
                "slots": [],
                "message": f"The requested date {date_str} has already passed. Please choose an upcoming date.",
            }

        slots = service.get_available_slots(doctor_id=doctor_id, date=date_str)

        # Filter out slots that have already passed for today
        if date_str == cur_date:
            future_slots = [s for s in slots if s.time > cur_time]
        else:
            future_slots = slots

        if not future_slots and date_str == cur_date:
            msg = f"All appointment slots for today ({date_str}) have already passed (current time: {cur_time}). Please choose an upcoming date (such as tomorrow)."
        elif not future_slots:
            msg = f"No available slots found on {date_str}."
        else:
            msg = f"Found {len(future_slots)} available slot(s) on {date_str}."

        return {
            "success": True,
            "doctor_id": doctor_id,
            "date": date_str,
            "count": len(future_slots),
            "slots": [s.model_dump() for s in future_slots],
            "message": msg,
        }
    except RuntimeError as e:
        return {
            "success": False,
            "error_code": "AVAILABILITY_SERVICE_OUTAGE",
            "message": f"Availability service currently unavailable: {str(e)}",
            "slots": [],
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "AVAILABILITY_LOOKUP_ERROR",
            "message": f"Error retrieving slots: {str(e)}",
            "slots": [],
        }


GET_AVAILABLE_SLOTS_DEFINITION = {
    "name": "get_available_slots",
    "description": "Get available appointment time slots for a specific doctor on a specific date (format YYYY-MM-DD). Always call this before proposing specific times to the patient.",
    "parameters": {
        "type": "object",
        "properties": {
            "doctor_id": {
                "type": "integer",
                "description": "The unique integer ID of the doctor (e.g. 1, 2, 3).",
            },
            "date": {
                "type": "string",
                "description": "Date to check availability for in YYYY-MM-DD format (e.g. 2026-10-10).",
            },
        },
        "required": ["doctor_id", "date"],
    },
}
