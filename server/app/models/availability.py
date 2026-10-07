"""Doctor availability slot SQLAlchemy ORM model."""

from typing import TYPE_CHECKING
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.availability import AvailabilitySlotSchema

if TYPE_CHECKING:
    from app.models.doctor import DoctorModel


class AvailabilityModel(Base):
    """Doctor availability time slot entity."""
    __tablename__ = "availabilities"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    time: Mapped[str] = mapped_column(String(5), nullable=False)               # HH:MM
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="AVAILABLE")  # AVAILABLE | BOOKED

    doctor: Mapped["DoctorModel"] = relationship("DoctorModel", back_populates="availabilities")

    def to_schema(self) -> AvailabilitySlotSchema:
        return AvailabilitySlotSchema(
            id=self.id,
            doctor_id=self.doctor_id,
            date=self.date,
            time=self.time,
            status=self.status,
        )
