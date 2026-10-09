"""Authentication endpoints and security dependencies."""

from typing import Generator
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.user import UserModel
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services.auth_service import AuthService, create_access_token, decode_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)


def get_session() -> Generator[Session, None, None]:
    """Dependency yielding a database session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session),
) -> UserModel:
    """Dependency extracting and validating the bearer token to yield the active UserModel."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload["sub"])
    user = session.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
        )
    return user


def require_doctor(user: UserModel = Depends(get_current_user)) -> UserModel:
    """Dependency enforcing that the authenticated user has the DOCTOR role."""
    if user.role != "DOCTOR" or not user.doctor_profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor credentials required for this endpoint.",
        )
    return user


def require_patient(user: UserModel = Depends(get_current_user)) -> UserModel:
    """Dependency enforcing that the authenticated user has the PATIENT role."""
    if user.role != "PATIENT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient credentials required for this endpoint.",
        )
    return user


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, session: Session = Depends(get_session)):
    """Registers a new User and Doctor/Patient entity, returning an access token."""
    auth_service = AuthService(session)
    try:
        user = auth_service.register_user(req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role}
    )
    profile = auth_service.get_user_profile(user)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        role=user.role,
        profile=profile,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, session: Session = Depends(get_session)):
    """Authenticates credentials and returns an access token with profile info."""
    auth_service = AuthService(session)
    user = auth_service.authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role}
    )
    profile = auth_service.get_user_profile(user)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        role=user.role,
        profile=profile,
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: UserModel = Depends(get_current_user), session: Session = Depends(get_session)):
    """Returns the authenticated user entity and active role profile."""
    auth_service = AuthService(session)
    profile = auth_service.get_user_profile(user)
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        created_at=user.created_at,
        profile=profile,
    )


@router.post("/logout")
def logout():
    """Client-side token disposal confirmation."""
    return {"status": "success", "message": "Logged out successfully."}
