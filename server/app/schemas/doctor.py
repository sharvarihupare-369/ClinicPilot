"""Doctor schemas."""

from typing import Optional
from pydantic import BaseModel, ConfigDict


class DoctorSchema(BaseModel):
    id: int
    name: str
    specialty: str
    location: str
    qualification: Optional[str] = "MBBS, MD"
    experience_years: Optional[int] = 5
    bio: Optional[str] = None
    consultation_fee: Optional[int] = 500
    profile_image: Optional[str] = None
    is_verified: Optional[bool] = True
    average_rating: Optional[float] = None
    total_reviews: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class DoctorRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    specialty: str
    location: str
    qualification: Optional[str] = "MBBS, MD"
    experience_years: Optional[int] = 5
    bio: Optional[str] = None
    consultation_fee: Optional[int] = 500


class DoctorUpdateRequest(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    location: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    consultation_fee: Optional[int] = None
