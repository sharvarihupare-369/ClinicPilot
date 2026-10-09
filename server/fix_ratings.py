from app.db.database import SessionLocal
from app.models.doctor import DoctorModel
from app.models.review import ReviewModel
from sqlalchemy import func

def fix_ratings():
    with SessionLocal() as session:
        doctors = session.query(DoctorModel).all()
        for doc in doctors:
            # Get reviews for doc
            reviews = session.query(ReviewModel).filter_by(doctor_id=doc.id).all()
            if reviews:
                doc.total_reviews = len(reviews)
                doc.average_rating = round(sum(r.rating for r in reviews) / len(reviews), 1)
            else:
                doc.total_reviews = 0
                doc.average_rating = 0.0
        session.commit()
        print("Updated all doctor ratings!")

if __name__ == "__main__":
    fix_ratings()
