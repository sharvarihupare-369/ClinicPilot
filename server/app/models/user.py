"""User SQLAlchemy ORM model for authentication and role-based access control."""

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.doctor import DoctorModel
    from app.models.patient import PatientModel


class UserModel(Base):
    """Core user authentication entity for doctors, patients, and admins."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), index=True, nullable=False, default="PATIENT")  # DOCTOR | PATIENT | ADMIN
    created_at: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )

    doctor_profile: Mapped[Optional["DoctorModel"]] = relationship(
        "DoctorModel", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    patient_profile: Mapped[Optional["PatientModel"]] = relationship(
        "PatientModel", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
