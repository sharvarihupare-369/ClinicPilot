"""Appointment SQLAlchemy ORM model."""

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.appointment import AppointmentSchema

if TYPE_CHECKING:
    from app.models.doctor import DoctorModel
    from app.models.patient import PatientModel
    from app.models.availability import AvailabilityModel
    from app.models.payment import PaymentModel
    from app.models.review import ReviewModel


class AppointmentModel(Base):
    """Patient scheduled appointment entity."""
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    patient_ref_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    availability_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("doctor_availability.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    time: Mapped[str] = mapped_column(String(5), nullable=False)   # HH:MM
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING_PAYMENT")
    # Valid statuses: PENDING_PAYMENT | CONFIRMED | CANCELLED | COMPLETED
    patient_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    patient_phone: Mapped[Optional[str]] = mapped_column(String(25), nullable=True)
    created_at: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )

    doctor: Mapped["DoctorModel"] = relationship("DoctorModel", back_populates="appointments")
    patient: Mapped[Optional["PatientModel"]] = relationship("PatientModel", back_populates="appointments")
    availability: Mapped[Optional["AvailabilityModel"]] = relationship(
        "AvailabilityModel", back_populates="appointment"
    )
    payment: Mapped[Optional["PaymentModel"]] = relationship(
        "PaymentModel", back_populates="appointment", uselist=False
    )
    review: Mapped[Optional["ReviewModel"]] = relationship(
        "ReviewModel", back_populates="appointment", uselist=False
    )

    def to_schema(self) -> AppointmentSchema:
        p_name = self.patient_name
        if not p_name and self.patient:
            p_name = self.patient.name
        p_phone = self.patient_phone
        if not p_phone and self.patient:
            p_phone = self.patient.phone
            
        has_reviewed = False
        if self.doctor and self.doctor.reviews:
            for r in self.doctor.reviews:
                if r.patient_id == self.patient_id:
                    has_reviewed = True
                    break

        return AppointmentSchema(
            id=self.id,
            patient_id=self.patient_id,
            patient_name=p_name,
            patient_phone=p_phone,
            doctor_id=self.doctor_id,
            doctor_name=self.doctor.name if self.doctor else None,
            specialty=self.doctor.specialty if self.doctor else None,
            location=self.doctor.location if self.doctor else None,
            date=self.date,
            time=self.time,
            status=self.status,
            consultation_fee=self.doctor.consultation_fee if self.doctor else None,
            created_at=self.created_at,
            has_reviewed_doctor=has_reviewed,
        )
