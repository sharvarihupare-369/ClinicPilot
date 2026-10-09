"""Authentication request and response schemas."""

from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, ConfigDict


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: Literal["DOCTOR", "PATIENT"] = "PATIENT"
    name: str

    # Doctor-specific fields (required if role == "DOCTOR")
    specialty: Optional[str] = None
    location: Optional[str] = None
    qualification: Optional[str] = "MBBS, MD"
    experience_years: Optional[int] = 5
    bio: Optional[str] = None
    consultation_fee: Optional[int] = 500

    # Patient-specific fields
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthProfile(BaseModel):
    id: int
    name: str
    specialty: Optional[str] = None
    location: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    consultation_fee: Optional[int] = None
    phone: Optional[str] = None
    patient_code: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    role: str
    profile: Optional[AuthProfile] = None


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    created_at: str
    profile: Optional[AuthProfile] = None

    model_config = ConfigDict(from_attributes=True)
