"""Clinic domain service orchestrating business rules, repository operations, and simulation hooks."""

from typing import Optional, List, Union
from app.repositories.clinic_repository import ClinicRepository
from app.schemas import (
    DoctorSchema,
    AvailabilitySlotSchema,
    AppointmentSchema,
    BookingResult,
    CancellationResult,
    RescheduleResult,
)


class ClinicService:
    """Domain service layer for clinic scheduling operations."""

    def __init__(
        self,
        repository: ClinicRepository,
        simulate_availability_failure: bool = False,
        simulate_booking_failure: bool = False,
    ):
        self.repo = repository
        self.simulate_availability_failure = simulate_availability_failure
        self.simulate_booking_failure = simulate_booking_failure

    def _to_int(self, val: Union[int, str], field_name: str) -> int:
        if isinstance(val, int):
            return val
        val_str = str(val).strip()
        # Handle string like "doc_1" or "apt_1" or "1"
        if val_str.isdigit():
            return int(val_str)
        import re
        match = re.search(r"\d+", val_str)
        if match:
            return int(match.group(0))
        raise ValueError(f"Invalid integer value for {field_name}: '{val}'")

    def search_doctors(
        self,
        specialty: Optional[str] = None,
        location: Optional[str] = None,
        name: Optional[str] = None,
    ) -> List[DoctorSchema]:
        """Search available clinic doctors by specialty, city, and/or doctor name."""
        from app.agent.parsers import extract_specialty
        if specialty:
            canonical = extract_specialty(specialty)
            if canonical:
                specialty = canonical
            else:
                specialty = specialty.strip()
        return self.repo.search_doctors(specialty=specialty, location=location, name=name)

    def get_doctor_by_id(self, doctor_id: Union[int, str]) -> Optional[DoctorSchema]:
        """Retrieve a single doctor by integer primary key."""
        doc_id = self._to_int(doctor_id, "doctor_id")
        return self.repo.get_doctor_by_id(doctor_id=doc_id)

    def get_available_slots(self, doctor_id: Union[int, str], date: str) -> List[AvailabilitySlotSchema]:
        """Get open slots for doctor on date. Supports simulated external service outage."""
        if self.simulate_availability_failure:
            raise RuntimeError("SERVICE_UNAVAILABLE: External availability provider is unreachable.")

        doc_id = self._to_int(doctor_id, "doctor_id")
        return self.repo.get_available_slots(doctor_id=doc_id, date=date)

    def get_patient_appointments(
        self,
        patient_id: str,
        status: Optional[str] = "CONFIRMED",
    ) -> List[AppointmentSchema]:
        """Fetch all confirmed or historical appointments for a given patient."""
        return self.repo.get_patient_appointments(patient_id=patient_id, status=status)

    def book_appointment(
        self,
        patient_id: str,
        doctor_id: Union[int, str],
        date: str,
        time: str,
    ) -> BookingResult:
        """Attempt authoritative booking with transactional integrity."""
        if self.simulate_booking_failure:
            return BookingResult(
                success=False,
                error_code="SLOT_ALREADY_BOOKED",
                message=f"Simulated conflict: The slot on {date} at {time} was just booked by another patient.",
            )

        doc_id = self._to_int(doctor_id, "doctor_id")
        return self.repo.book_appointment(
            patient_id=patient_id,
            doctor_id=doc_id,
            date=date,
            time=time,
        )

    def cancel_appointment(
        self,
        patient_id: str,
        appointment_id: Union[int, str],
    ) -> CancellationResult:
        """Cancel confirmed appointment and restore time slot availability."""
        apt_id = self._to_int(appointment_id, "appointment_id")
        return self.repo.cancel_appointment(
            patient_id=patient_id,
            appointment_id=apt_id,
        )

    def reschedule_appointment(
        self,
        patient_id: str,
        appointment_id: Union[int, str],
        new_date: str,
        new_time: str,
    ) -> RescheduleResult:
        """Reschedule an existing appointment to a new open slot."""
        apt_id = self._to_int(appointment_id, "appointment_id")
        return self.repo.reschedule_appointment(
            patient_id=patient_id,
            appointment_id=apt_id,
            new_date=new_date,
            new_time=new_time,
        )
