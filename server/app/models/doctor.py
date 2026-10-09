"""Doctor SQLAlchemy ORM model."""

from datetime import datetime, timezone
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.doctor import DoctorSchema

if TYPE_CHECKING:
    from app.models.user import UserModel
    from app.models.availability import AvailabilityModel
    from app.models.appointment import AppointmentModel
    from app.models.review import ReviewModel


class DoctorModel(Base):
    """Clinic Doctor database entity."""
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    specialty: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    location: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    qualification: Mapped[str] = mapped_column(String(100), nullable=False, default="MBBS, MD")
    experience_years: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consultation_fee: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    profile_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )

    user: Mapped[Optional["UserModel"]] = relationship("UserModel", back_populates="doctor_profile")
    availabilities: Mapped[List["AvailabilityModel"]] = relationship(
        "AvailabilityModel", back_populates="doctor", cascade="all, delete-orphan"
    )
    appointments: Mapped[List["AppointmentModel"]] = relationship(
        "AppointmentModel", back_populates="doctor"
    )
    reviews: Mapped[List["ReviewModel"]] = relationship(
        "ReviewModel", back_populates="doctor", cascade="all, delete-orphan"
    )

    def to_schema(self) -> DoctorSchema:
        total_reviews = len(self.reviews) if self.reviews else 0
        avg_rating = sum(r.rating for r in self.reviews) / total_reviews if total_reviews > 0 else None
        
        return DoctorSchema(
            id=self.id,
            name=self.name,
            specialty=self.specialty,
            location=self.location,
            qualification=self.qualification,
            experience_years=self.experience_years,
            bio=self.bio,
            consultation_fee=self.consultation_fee,
            profile_image=self.profile_image,
            is_verified=self.is_verified,
            average_rating=avg_rating,
            total_reviews=total_reviews,
        )
