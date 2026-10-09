"""
Payment REST API — slot hold, Razorpay order creation, webhook verification,
and payment status polling.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel

from app.db import SessionLocal
from app.schemas.payment import (
    HoldSlotRequest,
    HoldSlotResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    PaymentStatusResponse,
)
from app.services.payment_service import (
    hold_slot,
    create_razorpay_order,
    verify_and_confirm_payment,
    handle_payment_failure,
    get_payment_status,
    SlotNotAvailableError,
    PaymentAlreadyProcessedError,
    InvalidSignatureError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])


def get_session():
    with SessionLocal() as session:
        yield session


# ── POST /api/payments/hold-slot ─────────────────────────────────────────────

@router.post("/hold-slot", response_model=HoldSlotResponse, status_code=201)
def hold_appointment_slot(
    body: HoldSlotRequest,
    session=Depends(get_session),
):
    """
    Temporarily hold a slot for 15 minutes using a row-level DB lock.
    Only one patient can hold a slot at a time — the second request gets a 409.
    Creates a PENDING_PAYMENT appointment and returns the appointment_id.
    """
    try:
        from app.models.doctor import DoctorModel
        slot, appointment = hold_slot(
            session=session,
            doctor_id=body.doctor_id,
            date=body.date,
            time=body.time,
            patient_id=body.patient_id,
        )
        doctor = session.get(DoctorModel, body.doctor_id)
        return HoldSlotResponse(
            appointment_id=appointment.id,
            slot_id=slot.id,
            held_until=slot.held_until,
            amount=doctor.consultation_fee * 100,  # paise
            doctor_name=doctor.name,
            doctor_id=doctor.id,
            date=slot.date,
            time=slot.time,
        )
    except SlotNotAvailableError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "SLOT_NOT_AVAILABLE", "message": str(exc)},
        )
    except Exception as exc:
        logger.error(f"[hold-slot] Unexpected error: {exc}")
        raise HTTPException(status_code=500, detail={"error": "INTERNAL_ERROR", "message": str(exc)})


# ── POST /api/payments/create-order ──────────────────────────────────────────

@router.post("/create-order", response_model=CreateOrderResponse)
def create_payment_order(
    body: CreateOrderRequest,
    session=Depends(get_session),
):
    """
    Create a Razorpay order for a PENDING_PAYMENT appointment.
    Returns order_id + public key for the frontend checkout.
    """
    try:
        result = create_razorpay_order(
            session=session,
            appointment_id=body.appointment_id,
            patient_id=body.patient_id,
        )
        return CreateOrderResponse(**result)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"error": "FORBIDDEN", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "INVALID_REQUEST", "message": str(exc)})
    except Exception as exc:
        logger.error(f"[create-order] Unexpected error: {exc}")
        raise HTTPException(status_code=500, detail={"error": "INTERNAL_ERROR", "message": str(exc)})


# ── POST /api/payments/webhook ────────────────────────────────────────────────

@router.post("/webhook", status_code=200)
async def razorpay_webhook(request: Request, session=Depends(get_session)):
    """
    Razorpay webhook endpoint.
    - Reads raw body bytes (required for HMAC verification — do NOT parse first)
    - Verifies X-Razorpay-Signature header
    - Handles: payment.captured (success) and payment.failed
    - Idempotent: duplicate webhooks are safely absorbed

    IMPORTANT: Always return 200 quickly — Razorpay retries on non-200.
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    event = payload.get("event", "")
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id", "")
    payment_id = payment_entity.get("id", "")

    logger.info(f"[webhook] Received event={event} order_id={order_id} payment_id={payment_id}")

    if event == "payment.captured":
        try:
            verify_and_confirm_payment(
                session=session,
                razorpay_order_id=order_id,
                razorpay_payment_id=payment_id,
                razorpay_signature=signature,
            )
            logger.info(f"[webhook] ✓ Payment confirmed for order {order_id}")
        except PaymentAlreadyProcessedError:
            logger.info(f"[webhook] Duplicate webhook ignored for order {order_id}")
        except InvalidSignatureError as exc:
            logger.warning(f"[webhook] ✗ Invalid signature: {exc}")
            raise HTTPException(status_code=400, detail={"error": "INVALID_SIGNATURE"})
        except Exception as exc:
            logger.error(f"[webhook] Error processing payment.captured: {exc}")
            # Still return 200 to prevent Razorpay from retrying with same data
            return {"status": "error_logged"}

    elif event == "payment.failed":
        try:
            handle_payment_failure(session=session, razorpay_order_id=order_id)
            logger.info(f"[webhook] ✓ Payment failure handled for order {order_id}")
        except Exception as exc:
            logger.error(f"[webhook] Error processing payment.failed: {exc}")

    # Always return 200 to Razorpay
    return {"status": "ok", "event": event}


# ── GET /api/payments/{appointment_id} ───────────────────────────────────────

@router.get("/{appointment_id}", response_model=PaymentStatusResponse)
def get_appointment_payment_status(
    appointment_id: int,
    patient_id: str = Query(..., description="Patient ID for ownership verification"),
    session=Depends(get_session),
):
    """
    Poll this endpoint after opening Razorpay checkout.
    Frontend polls every 2 seconds until appointment_status = CONFIRMED.
    Returns 404 if not found or patient_id mismatch.
    """
    result = get_payment_status(
        session=session,
        appointment_id=appointment_id,
        patient_id=patient_id,
    )
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "NOT_FOUND", "message": f"Appointment {appointment_id} not found."},
        )
    return PaymentStatusResponse(**result)


# ── POST /api/payments/verify ────────────────────────────────────────────────
# Fallback: frontend-side verification (secondary, NOT primary source of truth)

class FrontendVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    appointment_id: int
    patient_id: str


@router.post("/verify", response_model=PaymentStatusResponse)
def verify_payment_frontend(
    body: FrontendVerifyRequest,
    session=Depends(get_session),
):
    """
    Frontend verification endpoint — called after Razorpay checkout handler fires.
    This is a secondary check only. The webhook is the primary confirmation mechanism.
    This endpoint allows the UI to confirm payment without waiting for the webhook.
    """
    try:
        verify_and_confirm_payment(
            session=session,
            razorpay_order_id=body.razorpay_order_id,
            razorpay_payment_id=body.razorpay_payment_id,
            razorpay_signature=body.razorpay_signature,
        )
    except PaymentAlreadyProcessedError:
        pass  # Already confirmed via webhook — that's fine
    except InvalidSignatureError as exc:
        raise HTTPException(status_code=400, detail={"error": "INVALID_SIGNATURE", "message": str(exc)})
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "INTERNAL_ERROR", "message": str(exc)})

    result = get_payment_status(
        session=session,
        appointment_id=body.appointment_id,
        patient_id=body.patient_id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    return PaymentStatusResponse(**result)
