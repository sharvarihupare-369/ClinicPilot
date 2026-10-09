from app.db.database import SessionLocal
from app.models.user import UserModel

with SessionLocal() as db:
    users = db.query(UserModel).filter_by(role="DOCTOR").all()
    for u in users:
        print(f"User ID: {u.id}, Email: {u.email}, Linked Doctor ID: {u.doctor_profile.id if u.doctor_profile else 'None'}")
