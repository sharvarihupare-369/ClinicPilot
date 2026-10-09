from app.db.database import SessionLocal
from app.models.availability import AvailabilityModel

with SessionLocal() as db:
    slots = db.query(AvailabilityModel).filter_by(doctor_id=10, date="2026-10-09").all()
    print(f"Total slots in DB for Doctor 10 on 2026-10-09: {len(slots)}")
