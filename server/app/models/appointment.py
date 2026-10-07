"""Appointment SQLAlchemy ORM model."""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.appointment import AppointmentSchema

if TYPE_CHECKING:
    from app.models.doctor import DoctorModel


class AppointmentModel(Base):
    """Patient scheduled appointment entity."""
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    time: Mapped[str] = mapped_column(String(5), nullable=False)   # HH:MM
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="CONFIRMED")  # CONFIRMED | CANCELLED
    created_at: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )

    doctor: Mapped["DoctorModel"] = relationship("DoctorModel", back_populates="appointments")

    def to_schema(self) -> AppointmentSchema:
        return AppointmentSchema(
            id=self.id,
            patient_id=self.patient_id,
            doctor_id=self.doctor_id,
            doctor_name=self.doctor.name if self.doctor else None,
            specialty=self.doctor.specialty if self.doctor else None,
            location=self.doctor.location if self.doctor else None,
            date=self.date,
            time=self.time,
            status=self.status,
            created_at=self.created_at,
        )
