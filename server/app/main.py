"""FastAPI application entrypoint for ClinicPilot."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.api.routes import router
from app.db import init_db, seed_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup and shutdown hooks."""
    init_db()
    seed_db()
    yield


app = FastAPI(
    title="ClinicPilot AI Agent API",
    description="Safe clinic appointment scheduling agent with multi-turn conversation and closed-loop evaluation.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)
