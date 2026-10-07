"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

# BASE_DIR resolves to project root (two levels up from app/db)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./clinic.db")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "simulation")
CURRENT_DATE = os.getenv("CURRENT_DATE", "2026-10-05")
CURRENT_TIME = os.getenv("CURRENT_TIME", "")


def get_current_datetime() -> tuple[str, str]:
    """Returns the authoritative (current_date, current_time) string tuple."""
    from datetime import datetime

    now = datetime.now()
    cur_date = os.getenv("CURRENT_DATE") or now.strftime("%Y-%m-%d")
    cur_time = os.getenv("CURRENT_TIME")
    if not cur_time:
        if cur_date == now.strftime("%Y-%m-%d"):
            cur_time = now.strftime("%H:%M")
        else:
            cur_time = "08:00"
    return cur_date, cur_time
