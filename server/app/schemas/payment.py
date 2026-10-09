"""Payment schemas — request bodies and response models for the payment API."""

from typing import Optional
from pydantic import BaseModel


class HoldSlotRequest(BaseModel):
    """Request to temporarily hold a slot for 15 minutes before payment."""
    patient_id: str
    doctor_id: int
    date: str       # YYYY-MM-DD
    time: str       # HH:MM


class HoldSlotResponse(BaseModel):
    """Response after successfully holding a slot."""
    appointment_id: int
    slot_id: int
    held_until: str   # ISO datetime
    amount: int       # consultation fee in paise
    doctor_name: str
    doctor_id: int
    date: str
    time: str


class CreateOrderRequest(BaseModel):
    """Request to create a Razorpay order for a held slot."""
    appointment_id: int
    patient_id: str


class CreateOrderResponse(BaseModel):
    """Razorpay order details needed by the frontend checkout."""
    razorpay_order_id: str
    amount: int          # in paise
    currency: str
    key_id: str          # public key for frontend
    appointment_id: int


class PaymentStatusResponse(BaseModel):
    """Current payment status for an appointment."""
    appointment_id: int
    payment_id: Optional[int] = None
    status: str              # PENDING | PAID | FAILED | CANCELLED
    appointment_status: str  # PENDING_PAYMENT | CONFIRMED | CANCELLED
    amount: Optional[int] = None
    paid_at: Optional[str] = None
    provider_order_id: Optional[str] = None
    provider_payment_id: Optional[str] = None


class PaymentSchema(BaseModel):
    """Full payment record schema."""
    id: int
    appointment_id: int
    patient_id: str
    amount: int
    currency: str
    provider: str
    provider_order_id: str
    provider_payment_id: Optional[str] = None
    status: str
    created_at: str
    paid_at: Optional[str] = None
