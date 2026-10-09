"""Background tasks: expired slot cleanup and stale payment cancellation."""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def run_slot_expiry_loop() -> None:
    """
    Every 60 seconds, find HELD slots whose held_until has passed
    and release them back to AVAILABLE. Also cancels their PENDING_PAYMENT appointments.
    """
    while True:
        try:
            await asyncio.sleep(60)
            from app.db import SessionLocal
            from app.services.payment_service import expire_held_slots

            with SessionLocal() as session:
                released = expire_held_slots(session)
                if released:
                    logger.info(f"[slot-expiry] Released {released} expired HELD slot(s).")
        except Exception as exc:
            logger.error(f"[slot-expiry] Error during slot expiry: {exc}")
