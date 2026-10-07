"""Doctor search agent tools."""

from typing import Optional, Dict, Any
from app.services.clinic_service import ClinicService


def search_doctors(
    service: ClinicService,
    specialty: Optional[str] = None,
    location: Optional[str] = None,
) -> Dict[str, Any]:
    """Search for clinic doctors by specialty and/or city location."""
    try:
        from app.agent.parsers import extract_specialty
        if specialty:
            canonical = extract_specialty(specialty)
            if canonical:
                specialty = canonical
            else:
                specialty = specialty.strip()
        doctors = service.search_doctors(specialty=specialty, location=location)
        return {
            "success": True,
            "count": len(doctors),
            "doctors": [d.model_dump() for d in doctors],
            "message": f"Found {len(doctors)} doctor(s) matching criteria.",
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "SEARCH_DOCTORS_ERROR",
            "message": f"Failed to search doctors: {str(e)}",
            "doctors": [],
        }


SEARCH_DOCTORS_DEFINITION = {
    "name": "search_doctors",
    "description": "Search for doctors in the clinic by medical specialty (e.g. Dermatology, Cardiology) and/or city location (e.g. Pune, Mumbai).",
    "parameters": {
        "type": "object",
        "properties": {
            "specialty": {
                "type": "string",
                "description": "Medical specialty such as Dermatology or Cardiology.",
            },
            "location": {
                "type": "string",
                "description": "City or clinic location such as Pune or Mumbai.",
            },
        },
    },
}
