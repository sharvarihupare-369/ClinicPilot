"""Payment SQLAlchemy ORM model — tracks Razorpay orders and their verification status."""

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.appointment import AppointmentModel


class PaymentModel(Base):
    """Razorpay payment record for an appointment booking."""

    __tablename__ = "payments"

    # Idempotency: one payment record per Razorpay order
    __table_args__ = (
        UniqueConstraint("provider_order_id", name="uq_provider_order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Amount in paise (₹800 = 80000 paise)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    # Provider info
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="RAZORPAY")
    provider_order_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    provider_payment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    provider_signature: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    # Status: PENDING | PAID | FAILED | CANCELLED
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")

    # Timestamps
    created_at: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=lambda: datetime.now(timezone.utc).isoformat(),
    )
    paid_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Relationship
    appointment: Mapped["AppointmentModel"] = relationship(
        "AppointmentModel", back_populates="payment"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "appointment_id": self.appointment_id,
            "patient_id": self.patient_id,
            "amount": self.amount,
            "currency": self.currency,
            "provider": self.provider,
            "provider_order_id": self.provider_order_id,
            "provider_payment_id": self.provider_payment_id,
            "status": self.status,
            "created_at": self.created_at,
            "paid_at": self.paid_at,
        }
