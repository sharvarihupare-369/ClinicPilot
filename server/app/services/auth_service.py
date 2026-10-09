"""Authentication service handling password hashing, JWT generation, and registration."""

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.db.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_MINUTES
from app.models.user import UserModel
from app.models.doctor import DoctorModel
from app.models.patient import PatientModel
from app.schemas.auth import RegisterRequest, AuthProfile


def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Encodes a JWT payload with an expiration timestamp."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRATION_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


class AuthService:
    """Domain service managing user registrations and authentication sessions."""

    def __init__(self, session: Session):
        self.session = session

    def register_user(self, req: RegisterRequest) -> UserModel:
        """Registers a new User entity and linked Doctor or Patient profile."""
        existing = self.session.query(UserModel).filter(UserModel.email == req.email.lower()).first()
        if existing:
            raise ValueError(f"An account with email '{req.email}' already exists.")

        hashed_pwd = hash_password(req.password)
        user = UserModel(
            email=req.email.lower(),
            password_hash=hashed_pwd,
            role=req.role,
        )
        self.session.add(user)
        self.session.flush()  # Populates user.id

        if req.role == "DOCTOR":
            if not req.specialty or not req.location:
                raise ValueError("Specialty and Location are required for doctor registration.")

            doctor = DoctorModel(
                user_id=user.id,
                name=req.name,
                specialty=req.specialty.strip(),
                location=req.location.strip(),
                qualification=req.qualification or "MBBS, MD",
                experience_years=req.experience_years or 5,
                bio=req.bio,
                consultation_fee=req.consultation_fee or 500,
                is_verified=True,
            )
            self.session.add(doctor)
        else:
            patient_code = f"pat_{user.id}_{int(datetime.now().timestamp()) % 10000}"
            patient = PatientModel(
                user_id=user.id,
                patient_code=patient_code,
                name=req.name,
                phone=req.phone,
                date_of_birth=req.date_of_birth,
            )
            self.session.add(patient)

        self.session.commit()
        self.session.refresh(user)
        return user

    def authenticate_user(self, email: str, password: str) -> Optional[UserModel]:
        """Authenticates user credentials against the database."""
        user = self.session.query(UserModel).filter(UserModel.email == email.lower()).first()
        if not user or not verify_password(password, user.password_hash):
            return None
        return user

    def get_user_profile(self, user: UserModel) -> Optional[AuthProfile]:
        """Builds public profile details depending on user role."""
        if user.role == "DOCTOR" and user.doctor_profile:
            doc = user.doctor_profile
            return AuthProfile(
                id=doc.id,
                name=doc.name,
                specialty=doc.specialty,
                location=doc.location,
                qualification=doc.qualification,
                experience_years=doc.experience_years,
                consultation_fee=doc.consultation_fee,
            )
        elif user.role == "PATIENT" and user.patient_profile:
            pat = user.patient_profile
            return AuthProfile(
                id=pat.id,
                name=pat.name,
                phone=pat.phone,
                patient_code=pat.patient_code,
            )
        return None
