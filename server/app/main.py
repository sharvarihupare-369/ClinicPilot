"""FastAPI application entrypoint for ClinicPilot."""

import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.routes import router as chat_router
from app.api.doctors import router as doctors_router
from app.api.appointments import router as appointments_router
from app.api.evaluation import router as evaluation_router
from app.api.payments import router as payments_router
from app.api.reviews import router as reviews_router
from app.db import init_db
from app.background import run_slot_expiry_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup and shutdown hooks."""
    init_db()
    # Launch background slot-expiry task (releases stale HELD slots every 60s)
    expiry_task = asyncio.create_task(run_slot_expiry_loop())
    yield
    expiry_task.cancel()
    try:
        await expiry_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="ClinicPilot AI Agent API",
    description="Safe clinic appointment scheduling agent with multi-turn conversation and closed-loop evaluation.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the Next.js dev server (port 3000) and any origin listed in CORS_ORIGINS env var.
_cors_origins_env = os.getenv("CORS_ORIGINS", "")
_extra_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    import logging
    from fastapi.responses import JSONResponse
    logging.getLogger("app.main").exception(f"Unhandled error handling {request.method} {request.url.path}: {exc}")
    
    env_mode = os.getenv("ENVIRONMENT", "development")
    message = "An unexpected error occurred." if env_mode == "prod" else str(exc)
    
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_SERVER_ERROR", "message": message},
    )


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(doctors_router, prefix="/api")
app.include_router(appointments_router, prefix="/api")
app.include_router(evaluation_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(reviews_router, prefix="/api")
