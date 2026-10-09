"""Authoritative Clinic Repository implementing transactional scheduling operations via SQLAlchemy 2.0."""

from typing import Optional, List, Union
from sqlalchemy import select, and_, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models import DoctorModel, AvailabilityModel, AppointmentModel, PatientModel, UserModel
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
        name: Optional[str] = None,
    ) -> List[DoctorSchema]:
        """Search for doctors with case-insensitive partial/exact matches."""
        stmt = select(DoctorModel)
        filters = []

        if name:
            clean_name = name.strip().lower().replace("dr.", "").replace("dr ", "").strip()
            if clean_name:
                filters.append(func.lower(DoctorModel.name).ilike(f"%{clean_name}%"))

        if specialty:
            from app.agent.parsers import extract_specialty
            canonical = extract_specialty(specialty) or specialty.strip()
            s_clean = specialty.strip().lower()
            c_clean = canonical.strip().lower()
            stem = s_clean[:6] if len(s_clean) >= 6 else s_clean
            filters.append(
                (func.lower(DoctorModel.specialty) == c_clean)
                | (func.lower(DoctorModel.specialty).ilike(f"%{s_clean}%"))
                | (func.lower(DoctorModel.specialty).ilike(f"%{c_clean}%"))
                | (func.lower(DoctorModel.specialty).ilike(f"%{stem}%"))
            )
        if location:
            loc_clean = location.strip().lower()
            filters.append(func.lower(DoctorModel.location).ilike(f"%{loc_clean}%"))

        if filters:
            stmt = stmt.where(and_(*filters))

        doctors = self.session.scalars(stmt).all()
        if not doctors and name:
            from app.agent.agent import DOCTORS_DIRECTORY
            q_clean = name.strip().lower().replace("dr.", "").replace("dr ", "").strip()
            for entry in DOCTORS_DIRECTORY:
                if q_clean and q_clean in entry[1].lower():
                    return [
                        DoctorSchema(
                            id=entry[0],
                            name=entry[1],
                            specialty=entry[2],
                            location=entry[3],
                            consultation_fee=entry[5] if len(entry) >= 6 else 500,
                            is_verified=True,
                        )
                    ]
        return [doc.to_schema() for doc in doctors]

    def get_doctor_by_id(self, doctor_id: int) -> Optional[DoctorSchema]:
        """Retrieve doctor details by integer primary key."""
        doc = self.session.get(DoctorModel, doctor_id)
        if doc:
            return doc.to_schema()
        from app.agent.agent import DOCTORS_DIRECTORY
        for entry in DOCTORS_DIRECTORY:
            if entry[0] == doctor_id:
                return DoctorSchema(
                    id=entry[0],
                    name=entry[1],
                    specialty=entry[2],
                    location=entry[3],
                    consultation_fee=entry[5] if len(entry) >= 6 else 500,
                    is_verified=True,
                )
        return None

    # ------------------------------------------------------------------------
    # Availability Slots
    # ------------------------------------------------------------------------

    def _ensure_slots_seeded(self, doctor_id: int, date: str) -> None:
        """Helper to seed default slots if none exist for the given doctor and date."""
        # Check if any slots exist in database for this doctor & date
        any_exist_stmt = select(AvailabilityModel.id).where(
            AvailabilityModel.doctor_id == doctor_id,
            AvailabilityModel.date == date,
        ).limit(1)
        if self.session.scalars(any_exist_stmt).first() is not None:
            return

        # Dynamic directory fallback for doctors not yet seeded in local DB
        from app.agent.agent import DOCTORS_DIRECTORY
        for entry in DOCTORS_DIRECTORY:
            if entry[0] == doctor_id:
                default_times = [
                    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"
                ]
                new_slots = [
                    AvailabilityModel(
                        doctor_id=doctor_id,
                        date=date,
                        time=t,
                        status="AVAILABLE",
                    )
                    for t in default_times
                ]
                self.session.add_all(new_slots)
                try:
                    self.session.commit()
                except Exception:
                    self.session.rollback()
                return

    def get_available_slots(self, doctor_id: int, date: str) -> List[AvailabilitySlotSchema]:
        """Retrieve available slots for a doctor on a specific date."""
        self._ensure_slots_seeded(doctor_id, date)
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

        stmt = stmt.order_by(AppointmentModel.date.desc(), AppointmentModel.time.desc())
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
        patient_name: Optional[str] = None,
    ) -> BookingResult:
        """Atomically book a slot and create confirmed appointment with autoincremented ID and concurrency locking."""
        doctor = self.session.get(DoctorModel, doctor_id)
        if not doctor:
            return BookingResult(
                success=False,
                error_code="DOCTOR_NOT_FOUND",
                message=f"Doctor with ID '{doctor_id}' does not exist.",
            )

        # Row-level locking to prevent race condition when multiple patients attempt to book the same slot
        slot = None
        try:
            lock_stmt = (
                select(AvailabilityModel)
                .where(
                    AvailabilityModel.doctor_id == doctor_id,
                    AvailabilityModel.date == date,
                    AvailabilityModel.time == time,
                )
                .with_for_update()
            )
            slot = self.session.scalars(lock_stmt).first()
        except Exception:
            # Fallback for SQLite in tests which does not support SELECT FOR UPDATE
            slot = self.get_slot(doctor_id, date, time)

        if not slot:
            # Check if doctor exists in directory and initialize slot if needed
            from app.agent.agent import DOCTORS_DIRECTORY
            if any(entry[0] == doctor_id for entry in DOCTORS_DIRECTORY):
                slot = AvailabilityModel(
                    doctor_id=doctor_id,
                    date=date,
                    time=time,
                    status="AVAILABLE",
                )
                self.session.add(slot)
                self.session.flush()
            else:
                return BookingResult(
                    success=False,
                    error_code="SLOT_NOT_FOUND",
                    message=f"No slot found for Doctor {doctor.name} on {date} at {time}.",
                )

        if slot.status != "AVAILABLE":
            return BookingResult(
                success=False,
                error_code="SLOT_ALREADY_BOOKED",
                message=f"This slot on {date} at {time} with {doctor.name} was just booked by another patient. You can book other available slots.",
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

        # Look up patient details to link patient_ref_id, patient_name, and patient_phone
        pat_query = select(PatientModel).where(
            (PatientModel.patient_code == patient_id)
            | (PatientModel.id == (int(patient_id) if patient_id.isdigit() else -1))
        )
        patient_obj = self.session.scalars(pat_query).first()
        patient_ref_id = patient_obj.id if patient_obj else None
        
        # If a patient_name was passed from the AI, prioritize it if we don't have a db record, or use db record
        resolved_patient_name = patient_name or (patient_obj.name if patient_obj else None)
        resolved_patient_phone = patient_obj.phone if patient_obj else None

        if not resolved_patient_name and patient_id.startswith("pat_"):
            try:
                parts = patient_id.split("_")
                if len(parts) >= 2 and parts[1].isdigit():
                    user_obj = self.session.get(UserModel, int(parts[1]))
                    if user_obj:
                        resolved_patient_name = user_obj.full_name
                        resolved_patient_phone = user_obj.phone
                        if user_obj.patient_profile:
                            patient_ref_id = user_obj.patient_profile.id
            except Exception:
                pass

        # Atomic reservation with autoincrement integer primary key and slot link
        slot.status = "BOOKED"

        appointment = AppointmentModel(
            patient_id=patient_id,
            patient_ref_id=patient_ref_id,
            patient_name=resolved_patient_name,
            patient_phone=resolved_patient_phone,
            doctor_id=doctor_id,
            availability_id=slot.id,
            date=date,
            time=time,
            status="CONFIRMED",
        )
        self.session.add(appointment)
        try:
            self.session.commit()
            self.session.refresh(appointment)
        except IntegrityError:
            self.session.rollback()
            return BookingResult(
                success=False,
                error_code="SLOT_ALREADY_BOOKED",
                message=f"This slot on {date} at {time} with {doctor.name} was just booked by another patient. You can book other available slots.",
            )

        return BookingResult(
            success=True,
            appointment_id=appointment.id,
            message="Appointment successfully booked and confirmed.",
            appointment=appointment.to_schema(),
        )

    # ------------------------------------------------------------------------
    # Doctor Portal Management Operations
    # ------------------------------------------------------------------------

    def get_doctor_by_user_id(self, user_id: int) -> Optional[DoctorModel]:
        """Fetch doctor entity linked to a specific user account."""
        stmt = select(DoctorModel).where(DoctorModel.user_id == user_id)
        return self.session.scalars(stmt).first()

    def update_doctor_profile(
        self,
        doctor_id: int,
        name: Optional[str] = None,
        specialty: Optional[str] = None,
        location: Optional[str] = None,
        qualification: Optional[str] = None,
        experience_years: Optional[int] = None,
        bio: Optional[str] = None,
        consultation_fee: Optional[int] = None,
    ) -> Optional[DoctorModel]:
        """Updates doctor profile details."""
        doc = self.session.get(DoctorModel, doctor_id)
        if not doc:
            return None

        if name:
            doc.name = name
        if specialty:
            doc.specialty = specialty
        if location:
            doc.location = location
        if qualification:
            doc.qualification = qualification
        if experience_years is not None:
            doc.experience_years = experience_years
        if bio is not None:
            doc.bio = bio
        if consultation_fee is not None:
            doc.consultation_fee = consultation_fee

        self.session.commit()
        self.session.refresh(doc)
        return doc

    def batch_create_availability(
        self,
        doctor_id: int,
        date: str,
        slots: List[str],
    ) -> List[AvailabilitySlotSchema]:
        """Adds multiple 30-min availability slots for a doctor on a specific date."""
        created = []
        for time_str in slots:
            # Check if slot already exists
            existing = self.session.scalars(
                select(AvailabilityModel).where(
                    AvailabilityModel.doctor_id == doctor_id,
                    AvailabilityModel.date == date,
                    AvailabilityModel.time == time_str,
                )
            ).first()

            if not existing:
                new_slot = AvailabilityModel(
                    doctor_id=doctor_id,
                    date=date,
                    time=time_str,
                    start_time=time_str,
                    status="AVAILABLE",
                )
                self.session.add(new_slot)
                created.append(new_slot)

        self.session.commit()
        for s in created:
            self.session.refresh(s)

        # Return all slots for that doctor on that date
        return self.get_doctor_all_slots(doctor_id, date)

    def get_doctor_all_slots(
        self,
        doctor_id: int,
        date: Optional[str] = None,
    ) -> List[AvailabilitySlotSchema]:
        """Retrieves all slots for a doctor (both AVAILABLE and BOOKED)."""
        if date:
            self._ensure_slots_seeded(doctor_id, date)

        stmt = select(AvailabilityModel).where(AvailabilityModel.doctor_id == doctor_id)
        if date:
            stmt = stmt.where(AvailabilityModel.date == date)
        stmt = stmt.order_by(AvailabilityModel.date, AvailabilityModel.time)

        slots = self.session.scalars(stmt).all()
        return [slot.to_schema() for slot in slots]

    def delete_availability_slot(self, doctor_id: int, slot_id: int) -> bool:
        """Deletes an unbooked availability slot."""
        slot = self.session.get(AvailabilityModel, slot_id)
        if not slot or slot.doctor_id != doctor_id:
            return False
        if slot.status == "BOOKED":
            return False  # Cannot delete booked slot without cancelling appointment

        self.session.delete(slot)
        self.session.commit()
        return True

    def get_doctor_appointments(self, doctor_id: int) -> List[AppointmentSchema]:
        """Retrieves all appointments scheduled with this doctor."""
        stmt = (
            select(AppointmentModel)
            .where(AppointmentModel.doctor_id == doctor_id)
            .order_by(AppointmentModel.date, AppointmentModel.time)
        )
        appts = self.session.scalars(stmt).all()
        return [a.to_schema() for a in appts]

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
        apt.availability_id = None

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

        # Check new slot with row lock
        new_slot = None
        try:
            lock_stmt = (
                select(AvailabilityModel)
                .where(
                    AvailabilityModel.doctor_id == apt.doctor_id,
                    AvailabilityModel.date == new_date,
                    AvailabilityModel.time == new_time,
                )
                .with_for_update()
            )
            new_slot = self.session.scalars(lock_stmt).first()
        except Exception:
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
        apt.availability_id = new_slot.id

        try:
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            return RescheduleResult(
                success=False,
                error_code="SLOT_UNAVAILABLE",
                message=f"Requested slot on {new_date} at {new_time} was just booked by another patient.",
            )

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
            {"id": 1, "name": "Dr. Sharma", "specialty": "Dermatology", "location": "Pune", "consultation_fee": 800},
            {"id": 2, "name": "Dr. Patel", "specialty": "Cardiology", "location": "Pune", "consultation_fee": 850},
            {"id": 3, "name": "Dr. Mehta", "specialty": "Dermatology", "location": "Mumbai", "consultation_fee": 900},
            {"id": 4, "name": "Dr. Ananya Iyer", "specialty": "Pediatrics", "location": "Pune", "consultation_fee": 600},
            {"id": 5, "name": "Dr. Rajesh Verma", "specialty": "Orthopedics", "location": "Mumbai", "consultation_fee": 750},
            {"id": 6, "name": "Dr. Vikram Deshmukh", "specialty": "General Medicine", "location": "Pune", "consultation_fee": 500},
            {"id": 7, "name": "Dr. Sneha Kulkarni", "specialty": "Neurology", "location": "Mumbai", "consultation_fee": 950},
            {"id": 8, "name": "Dr. Rajiv Joshi", "specialty": "ENT", "location": "Pune", "consultation_fee": 700},
        ]
        for doc_info in default_doctors:
            existing = self.session.get(DoctorModel, doc_info["id"])
            if not existing:
                self.session.add(DoctorModel(**doc_info))
            else:
                if "consultation_fee" in doc_info:
                    existing.consultation_fee = doc_info["consultation_fee"]
        self.session.flush()

        # In PostgreSQL, synchronize sequences after seeding explicit IDs to prevent duplicate key collisions
        try:
            bind = self.session.get_bind()
            if bind and bind.dialect.name == "postgresql":
                from sqlalchemy import text
                for seq, tbl in [
                    ("doctors_id_seq", "doctors"),
                    ("users_id_seq", "users"),
                    ("patients_id_seq", "patients"),
                    ("appointments_id_seq", "appointments"),
                    ("doctor_availability_id_seq", "doctor_availability"),
                ]:
                    try:
                        self.session.execute(text(f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM {tbl}), 1), true);"))
                    except Exception:
                        pass
                self.session.flush()
        except Exception:
            pass

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
