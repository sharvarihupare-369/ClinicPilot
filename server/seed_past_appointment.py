from app.db.database import SessionLocal
from app.models.appointment import AppointmentModel
from app.models.doctor import DoctorModel
from datetime import datetime, timedelta

def seed_past_appointment():
    with SessionLocal() as session:
        # Get a doctor
        doctor = session.query(DoctorModel).first()
        if not doctor:
            print("No doctors found.")
            return

        # We'll use patient id pat_3_4380 as seen earlier, or you can just query for existing appointments to find the user's patient ID
        existing_apt = session.query(AppointmentModel).first()
        patient_id = existing_apt.patient_id if existing_apt else "pat_3_4380"

        # Create an appointment in the past
        past_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
        
        apt = AppointmentModel(
            doctor_id=doctor.id,
            patient_id=patient_id,
            date=past_date,
            time="10:00",
            status="COMPLETED"
        )
        session.add(apt)
        session.commit()
        session.refresh(apt)
        print(f"Successfully created a past COMPLETED appointment (ID: {apt.id}) for patient {patient_id} with Dr. {doctor.name} on {past_date}!")

if __name__ == "__main__":
    seed_past_appointment()
