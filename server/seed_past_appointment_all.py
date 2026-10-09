from app.db.database import SessionLocal
from app.models.appointment import AppointmentModel
from app.models.doctor import DoctorModel
from datetime import datetime, timedelta

def seed_past_appointment_all():
    with SessionLocal() as session:
        doctor = session.query(DoctorModel).first()
        if not doctor:
            return

        # Get all distinct patients who have booked appointments
        patient_ids = session.query(AppointmentModel.patient_id).distinct().all()
        
        past_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
        
        for p in patient_ids:
            pid = p[0]
            apt = AppointmentModel(
                doctor_id=doctor.id,
                patient_id=pid,
                date=past_date,
                time="10:00",
                status="COMPLETED"
            )
            session.add(apt)
        
        session.commit()
        print("Created past appointments for all active patients!")

if __name__ == "__main__":
    seed_past_appointment_all()
