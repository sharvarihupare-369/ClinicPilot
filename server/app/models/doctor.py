"""Doctor SQLAlchemy ORM model."""

from typing import List, TYPE_CHECKING
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.schemas.doctor import DoctorSchema

if TYPE_CHECKING:
    from app.models.availability import AvailabilityModel
    from app.models.appointment import AppointmentModel


class DoctorModel(Base):
    """Clinic Doctor database entity."""
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    specialty: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    location: Mapped[str] = mapped_column(String(100), index=True, nullable=False)

    availabilities: Mapped[List["AvailabilityModel"]] = relationship(
        "AvailabilityModel", back_populates="doctor", cascade="all, delete-orphan"
    )
    appointments: Mapped[List["AppointmentModel"]] = relationship(
        "AppointmentModel", back_populates="doctor"
    )

    def to_schema(self) -> DoctorSchema:
        return DoctorSchema(
            id=self.id,
            name=self.name,
            specialty=self.specialty,
            location=self.location,
        )
