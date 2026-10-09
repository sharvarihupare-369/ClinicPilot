"""Doctor availability slot SQLAlchemy ORM model."""

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.availability import AvailabilitySlotSchema

if TYPE_CHECKING:
    from app.models.doctor import DoctorModel
    from app.models.appointment import AppointmentModel


class AvailabilityModel(Base):
    """Doctor availability time slot entity."""
    __tablename__ = "doctor_availability"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    time: Mapped[str] = mapped_column(String(5), nullable=False)               # HH:MM
    start_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True) # HH:MM
    end_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)   # HH:MM
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="AVAILABLE")  # AVAILABLE | HELD | BOOKED
    held_until: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)        # ISO datetime when HELD expires
    held_by_patient_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Patient holding this slot
    created_at: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )

    doctor: Mapped["DoctorModel"] = relationship("DoctorModel", back_populates="availabilities")
    appointment: Mapped[Optional["AppointmentModel"]] = relationship(
        "AppointmentModel", back_populates="availability", uselist=False
    )

    def to_schema(self) -> AvailabilitySlotSchema:
        return AvailabilitySlotSchema(
            id=self.id,
            doctor_id=self.doctor_id,
            date=self.date,
            time=self.time,
            start_time=self.start_time or self.time,
            end_time=self.end_time,
            status=self.status,
            held_until=self.held_until,
        )
