from app.db.database import SessionLocal
from app.models.doctor import DoctorModel

with SessionLocal() as db:
    docs = db.query(DoctorModel).all()
    for d in docs:
        print(f"ID: {d.id}, Name: {d.name}")
