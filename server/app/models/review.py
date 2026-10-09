"""Review SQLAlchemy ORM model."""

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.review import ReviewSchema

if TYPE_CHECKING:
    from app.models.doctor import DoctorModel
    from app.models.appointment import AppointmentModel


class ReviewModel(Base):
    """Patient review for a doctor's appointment."""
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(String(50), nullable=False)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), unique=True)
    
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat())

    doctor: Mapped["DoctorModel"] = relationship("DoctorModel", back_populates="reviews")
    appointment: Mapped["AppointmentModel"] = relationship("AppointmentModel", back_populates="review")

    def to_schema(self, patient_name: str = "Anonymous") -> ReviewSchema:
        return ReviewSchema(
            id=self.id,
            doctor_id=self.doctor_id,
            patient_id=self.patient_id,
            appointment_id=self.appointment_id,
            rating=self.rating,
            review_text=self.review_text,
            created_at=self.created_at,
            patient_name=patient_name
        )
