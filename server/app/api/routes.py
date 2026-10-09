"""Thin FastAPI routing layer delegating directly to the AI Agent Orchestrator."""

from fastapi import APIRouter, Depends
from app.schemas.chat import ChatRequest, ChatResponse
from app.agent.agent import AgentOrchestrator, get_agent
from app.db import reset_db
from app.repositories import ClinicRepository
from app.db import SessionLocal

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    agent: AgentOrchestrator = Depends(get_agent),
):
    """Wafer-thin chat endpoint delegating entirely to the AI Agent."""
    return await agent.run(
        patient_id=request.patient_id,
        message=request.message,
        session_id=request.session_id,
        language=request.language,
    )


@router.post("/reset")
def reset_database():
    """Administrative and test fixture hook to reset and re-seed the clinic database."""
    reset_db()
    with SessionLocal() as session:
        repo = ClinicRepository(session)
        repo.seed_default_clinic_data()
    return {"status": "success", "message": "Database reset and seeded with default clinic data."}


@router.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "ClinicPilot Agent API"}
