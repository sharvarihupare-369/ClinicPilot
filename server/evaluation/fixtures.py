"""Evaluation database fixtures and state reset mechanisms."""

from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.database import Base, reset_db, seed_db, SessionLocal
from app.models import AppointmentModel, AvailabilityModel, DoctorModel


def reset_eval_db() -> None:
    """Resets appointments and restores availability slots for evaluation without dropping user accounts."""
    with SessionLocal() as session:
        session.query(AppointmentModel).delete()
        session.query(AvailabilityModel).update({"status": "AVAILABLE"})
        session.commit()
    seed_db()


def seed_scenario_fixtures(session: Session, scenario_id: str, patient_id: str = "patient_1") -> None:
    """Seeds scenario-specific preconditions in the evaluation database."""
    if scenario_id == "s4_descriptive_cancellation":
        # Ensure Dr. Sharma exists
        dr_sharma = session.scalars(
            select(DoctorModel).where(DoctorModel.name == "Dr. Sharma")
        ).first()
        doc_id = dr_sharma.id if dr_sharma else 1

        # Mark slot booked
        slot = session.scalars(
            select(AvailabilityModel).where(
                AvailabilityModel.doctor_id == doc_id,
                AvailabilityModel.date == "2026-10-10",
                AvailabilityModel.time == "10:00",
            )
        ).first()
        if slot:
            slot.status = "BOOKED"

        # Create confirmed appointment
        apt = AppointmentModel(
            id=101,  # Authoritative ID is 101, not 10!
            patient_id=patient_id,
            doctor_id=doc_id,
            date="2026-10-10",
            time="10:00",
            status="CONFIRMED",
        )
        session.add(apt)
        session.commit()

    elif scenario_id == "s5_multiple_appointments_disambiguation":
        dr_sharma = session.scalars(
            select(DoctorModel).where(DoctorModel.name == "Dr. Sharma")
        ).first()
        dr_patel = session.scalars(
            select(DoctorModel).where(DoctorModel.name == "Dr. Patel")
        ).first()

        doc1_id = dr_sharma.id if dr_sharma else 1
        doc2_id = dr_patel.id if dr_patel else 2

        # Create two confirmed appointments for the same patient
        apt1 = AppointmentModel(
            id=201,
            patient_id=patient_id,
            doctor_id=doc1_id,
            date="2026-10-10",
            time="10:00",
            status="CONFIRMED",
        )
        apt2 = AppointmentModel(
            id=202,
            patient_id=patient_id,
            doctor_id=doc2_id,
            date="2026-10-12",
            time="14:00",
            status="CONFIRMED",
        )
        session.add_all([apt1, apt2])
        session.commit()
