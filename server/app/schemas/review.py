from pydantic import BaseModel
from typing import Optional

class ReviewCreate(BaseModel):
    appointment_id: int
    rating: int
    review_text: Optional[str] = None

class ReviewSchema(BaseModel):
    id: int
    doctor_id: int
    patient_id: str
    appointment_id: int
    rating: int
    review_text: Optional[str] = None
    created_at: str
    patient_name: str

    class Config:
        from_attributes = True
