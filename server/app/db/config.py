"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# BASE_DIR resolves to project root (two levels up from app/db)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load the correct env file based on the ENVIRONMENT shell variable
env_mode = os.getenv("ENVIRONMENT", "development")
env_file = ".env.prod" if env_mode == "prod" else ".env"

load_dotenv(BASE_DIR / env_file, override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if env_mode == "prod":
        raise ValueError("DATABASE_URL must be set securely in the environment for production.")
    DATABASE_URL = "postgresql+psycopg2://sharvarihupare@localhost:5432/clinicpilot"
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    if env_mode == "prod":
        raise ValueError("JWT_SECRET_KEY must be set securely in the environment for production.")
    JWT_SECRET_KEY = "clinicpilot_super_secret_jwt_key_2026"
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_MINUTES = 60 * 24 * 7  # 7 days
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "simulation")
CURRENT_DATE = os.getenv("CURRENT_DATE", "").strip() or datetime.now().strftime("%Y-%m-%d")
CURRENT_TIME = os.getenv("CURRENT_TIME", "")


def get_current_datetime() -> tuple[str, str]:
    """Returns the authoritative (current_date, current_time) string tuple."""
    from datetime import datetime

    now = datetime.now()
    cur_date = os.getenv("CURRENT_DATE", "").strip() or now.strftime("%Y-%m-%d")
    cur_time = os.getenv("CURRENT_TIME", "").strip()
    if not cur_time:
        if cur_date == now.strftime("%Y-%m-%d"):
            cur_time = now.strftime("%H:%M")
        else:
            cur_time = "08:00"
    return cur_date, cur_time
