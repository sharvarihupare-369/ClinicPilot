"""Patient SQLAlchemy ORM model."""

from datetime import datetime, timezone
from typing import List, Optional, TYPE_CHECKING
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.user import UserModel
    from app.models.appointment import AppointmentModel


class PatientModel(Base):
    """Patient entity registered in MediAI."""
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    patient_code: Mapped[Optional[str]] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(25), nullable=True)
    date_of_birth: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    created_at: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )

    user: Mapped[Optional["UserModel"]] = relationship(
        "UserModel", back_populates="patient_profile"
    )
    appointments: Mapped[List["AppointmentModel"]] = relationship(
        "AppointmentModel", back_populates="patient"
    )
