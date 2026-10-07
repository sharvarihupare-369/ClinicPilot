"""Authoritative Clinic Repository implementing transactional scheduling operations via SQLAlchemy 2.0."""

from typing import Optional, List, Union
from sqlalchemy import select, and_, func
from sqlalchemy.orm import Session

from app.models import DoctorModel, AvailabilityModel, AppointmentModel
from app.schemas import (
    DoctorSchema,
    AvailabilitySlotSchema,
    AppointmentSchema,
    BookingResult,
    CancellationResult,
    RescheduleResult,
)


class ClinicRepository:
    """Repository handling all clinic queries and atomic scheduling transactions with autoincrement IDs."""

    def __init__(self, session: Session):
        self.session = session

    # ------------------------------------------------------------------------
    # Doctors
    # ------------------------------------------------------------------------

    def search_doctors(
        self,
        specialty: Optional[str] = None,
        location: Optional[str] = None,
    ) -> List[DoctorSchema]:
        """Search for doctors with case-insensitive partial/exact matches."""
        stmt = select(DoctorModel)
        filters = []

        if specialty:
            from app.agent.parsers import extract_specialty
            canonical = extract_specialty(specialty) or specialty.strip()
            filters.append(func.lower(DoctorModel.specialty) == canonical.lower())
        if location:
            filters.append(func.lower(DoctorModel.location) == location.strip().lower())

        if filters:
            stmt = stmt.where(and_(*filters))

        doctors = self.session.scalars(stmt).all()
        return [doc.to_schema() for doc in doctors]

    def get_doctor_by_id(self, doctor_id: int) -> Optional[DoctorSchema]:
        """Retrieve doctor details by integer primary key."""
        doc = self.session.get(DoctorModel, doctor_id)
        return doc.to_schema() if doc else None

    # ------------------------------------------------------------------------
    # Availability Slots
    # ------------------------------------------------------------------------

    def get_available_slots(self, doctor_id: int, date: str) -> List[AvailabilitySlotSchema]:
        """Retrieve available slots for a doctor on a specific date."""
        stmt = select(AvailabilityModel).where(
            AvailabilityModel.doctor_id == doctor_id,
            AvailabilityModel.date == date,
            AvailabilityModel.status == "AVAILABLE",
        ).order_by(AvailabilityModel.time)

        slots = self.session.scalars(stmt).all()
        return [slot.to_schema() for slot in slots]

    def get_slot(self, doctor_id: int, date: str, time: str) -> Optional[AvailabilityModel]:
        """Get an exact slot entity."""
        stmt = select(AvailabilityModel).where(
            AvailabilityModel.doctor_id == doctor_id,
            AvailabilityModel.date == date,
            AvailabilityModel.time == time,
        )
        return self.session.scalars(stmt).first()

    # ------------------------------------------------------------------------
    # Appointments
    # ------------------------------------------------------------------------

    def get_patient_appointments(
        self,
        patient_id: str,
        status: Optional[str] = "CONFIRMED",
    ) -> List[AppointmentSchema]:
        """Retrieve appointments for a patient, optionally filtering by status."""
        stmt = select(AppointmentModel).where(AppointmentModel.patient_id == patient_id)
        if status:
            stmt = stmt.where(AppointmentModel.status == status)

        stmt = stmt.order_by(AppointmentModel.date, AppointmentModel.time)
        appointments = self.session.scalars(stmt).all()
        return [apt.to_schema() for apt in appointments]

    def get_appointment_by_id(self, appointment_id: int) -> Optional[AppointmentSchema]:
        """Retrieve appointment by integer primary key."""
        apt = self.session.get(AppointmentModel, appointment_id)
        return apt.to_schema() if apt else None

    # ------------------------------------------------------------------------
    # Transactional Scheduling Operations
    # ------------------------------------------------------------------------

    def book_appointment(
        self,
        patient_id: str,
        doctor_id: int,
        date: str,
        time: str,
    ) -> BookingResult:
        """Atomically book a slot and create confirmed appointment with autoincremented ID."""
        doctor = self.session.get(DoctorModel, doctor_id)
        if not doctor:
            return BookingResult(
                success=False,
                error_code="DOCTOR_NOT_FOUND",
                message=f"Doctor with ID '{doctor_id}' does not exist.",
            )

        slot = self.get_slot(doctor_id, date, time)
        if not slot:
            return BookingResult(
                success=False,
                error_code="SLOT_NOT_FOUND",
                message=f"No slot found for Doctor {doctor.name} on {date} at {time}.",
            )

        if slot.status != "AVAILABLE":
            return BookingResult(
                success=False,
                error_code="SLOT_ALREADY_BOOKED",
                message=f"The slot on {date} at {time} with {doctor.name} is no longer available.",
            )

        # Check for patient conflict
        conflict_stmt = select(AppointmentModel).where(
            AppointmentModel.patient_id == patient_id,
            AppointmentModel.date == date,
            AppointmentModel.time == time,
            AppointmentModel.status == "CONFIRMED",
        )
        if self.session.scalars(conflict_stmt).first():
            return BookingResult(
                success=False,
                error_code="PATIENT_CONFLICTING_APPOINTMENT",
                message=f"Patient {patient_id} already has another confirmed appointment on {date} at {time}.",
            )

        # Atomic reservation with autoincrement integer primary key
        slot.status = "BOOKED"

        appointment = AppointmentModel(
            patient_id=patient_id,
            doctor_id=doctor_id,
            date=date,
            time=time,
            status="CONFIRMED",
        )
        self.session.add(appointment)
        self.session.commit()
        self.session.refresh(appointment)

        return BookingResult(
            success=True,
            appointment_id=appointment.id,
            message="Appointment successfully booked and confirmed.",
            appointment=appointment.to_schema(),
        )

    def cancel_appointment(
        self,
        patient_id: str,
        appointment_id: int,
    ) -> CancellationResult:
        """Atomically cancel an appointment and release slot back to AVAILABLE."""
        apt = self.session.get(AppointmentModel, appointment_id)
        if not apt or apt.patient_id != patient_id:
            return CancellationResult(
                success=False,
                error_code="APPOINTMENT_NOT_FOUND",
                message=f"No appointment found with ID '{appointment_id}' for patient '{patient_id}'.",
            )

        if apt.status == "CANCELLED":
            return CancellationResult(
                success=False,
                error_code="APPOINTMENT_ALREADY_CANCELLED",
                message=f"Appointment '{appointment_id}' is already cancelled.",
            )

        # Mark cancelled
        apt.status = "CANCELLED"

        # Release slot if present
        slot = self.get_slot(apt.doctor_id, apt.date, apt.time)
        if slot:
            slot.status = "AVAILABLE"

        self.session.commit()

        return CancellationResult(
            success=True,
            appointment_id=appointment_id,
            message=f"Appointment '{appointment_id}' has been successfully cancelled.",
        )

    def reschedule_appointment(
        self,
        patient_id: str,
        appointment_id: int,
        new_date: str,
        new_time: str,
    ) -> RescheduleResult:
        """Atomically release old slot, reserve new slot, and update appointment date/time."""
        apt = self.session.get(AppointmentModel, appointment_id)
        if not apt or apt.patient_id != patient_id:
            return RescheduleResult(
                success=False,
                error_code="APPOINTMENT_NOT_FOUND",
                message=f"Appointment '{appointment_id}' not found for patient '{patient_id}'.",
            )

        if apt.status != "CONFIRMED":
            return RescheduleResult(
                success=False,
                error_code="INVALID_APPOINTMENT_STATUS",
                message=f"Cannot reschedule an appointment with status '{apt.status}'.",
            )

        # Check new slot
        new_slot = self.get_slot(apt.doctor_id, new_date, new_time)
        if not new_slot or new_slot.status != "AVAILABLE":
            return RescheduleResult(
                success=False,
                error_code="SLOT_UNAVAILABLE",
                message=f"Requested slot on {new_date} at {new_time} is not available.",
            )

        old_date, old_time = apt.date, apt.time

        # Release old slot
        old_slot = self.get_slot(apt.doctor_id, old_date, old_time)
        if old_slot:
            old_slot.status = "AVAILABLE"

        # Book new slot
        new_slot.status = "BOOKED"
        apt.date = new_date
        apt.time = new_time

        self.session.commit()

        return RescheduleResult(
            success=True,
            appointment_id=appointment_id,
            old_date=old_date,
            old_time=old_time,
            new_date=new_date,
            new_time=new_time,
            message=f"Appointment '{appointment_id}' rescheduled to {new_date} at {new_time}.",
        )

    # ------------------------------------------------------------------------
    # Seeding
    # ------------------------------------------------------------------------

    def seed_default_clinic_data(self) -> None:
        """Seeds initial doctors and slots with autoincrement integer IDs."""
        default_doctors = [
            {"id": 1, "name": "Dr. Sharma", "specialty": "Dermatology", "location": "Pune"},
            {"id": 2, "name": "Dr. Patel", "specialty": "Cardiology", "location": "Pune"},
            {"id": 3, "name": "Dr. Mehta", "specialty": "Dermatology", "location": "Mumbai"},
            {"id": 4, "name": "Dr. Ananya Iyer", "specialty": "Pediatrics", "location": "Pune"},
            {"id": 5, "name": "Dr. Rajesh Verma", "specialty": "Orthopedics", "location": "Mumbai"},
            {"id": 6, "name": "Dr. Vikram Deshmukh", "specialty": "General Medicine", "location": "Pune"},
            {"id": 7, "name": "Dr. Sneha Kulkarni", "specialty": "Neurology", "location": "Mumbai"},
            {"id": 8, "name": "Dr. Rajiv Joshi", "specialty": "ENT", "location": "Pune"},
        ]
        for doc_info in default_doctors:
            existing = self.session.get(DoctorModel, doc_info["id"])
            if not existing:
                self.session.add(DoctorModel(**doc_info))
        self.session.flush()

        doctors = list(self.session.scalars(select(DoctorModel)).all())

        # Expanded calendar dates (covers 2026-10-05 through 2026-11-01)
        from datetime import date as dt_date, timedelta
        start_d = dt_date(2026, 10, 5)
        dates = [(start_d + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(28)]

        # Expanded appointment slots (morning, afternoon, and evening)
        # Note: 13:00 (1 PM) is excluded for clinic lunch break / unlisted slot validation
        times = [
            "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
            "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
        ]

        slots_to_add = []
        for doc in doctors:
            for d in dates:
                for t in times:
                    existing = self.session.scalars(
                        select(AvailabilityModel).where(
                            AvailabilityModel.doctor_id == doc.id,
                            AvailabilityModel.date == d,
                            AvailabilityModel.time == t,
                        )
                    ).first()
                    if not existing:
                        slots_to_add.append(
                            AvailabilityModel(
                                doctor_id=doc.id,
                                date=d,
                                time=t,
                                status="AVAILABLE",
                            )
                        )

        if slots_to_add:
            self.session.add_all(slots_to_add)
        self.session.commit()
