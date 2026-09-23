"""环境变量配置（读取 backend/.env）。"""
from pathlib import Path

from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(BASE_DIR / ".env")


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return min(maximum, max(minimum, int(os.getenv(name, str(default)))))
    except ValueError:
        return default

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "deepseek-v4-flash")
LLM_PROXY_URL = os.getenv("LLM_PROXY_URL", "").strip()
NEWS_PROXY_URL = os.getenv("NEWS_PROXY_URL", "").strip()

DB_PATH = BASE_DIR / "data" / "finquant.db"
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
SERVE_FRONTEND: bool = _env_flag("SERVE_FRONTEND")
SCHEDULER_ENABLED = _env_flag("SCHEDULER_ENABLED")
SCHEDULER_CONCURRENCY = _bounded_int("SCHEDULER_CONCURRENCY", 2, 1, 20)
SCHEDULER_MAX_TARGETS = _bounded_int("SCHEDULER_MAX_TARGETS", 20, 1, 1000)
SCHEDULER_HOUR = _bounded_int("SCHEDULER_HOUR", 18, 0, 23)
SCHEDULER_MINUTE = _bounded_int("SCHEDULER_MINUTE", 0, 0, 59)
MEMORY_CANDIDATE_EXTRACTION_ENABLED = _env_flag("MEMORY_CANDIDATE_EXTRACTION_ENABLED")
MEMORY_TYPED_SHADOW_ENABLED = _env_flag("MEMORY_TYPED_SHADOW_ENABLED")
MEMORY_TYPED_CONTEXT_ENABLED = _env_flag("MEMORY_TYPED_CONTEXT_ENABLED")
EXTERNAL_SENDERS_ENABLED = _env_flag("EXTERNAL_SENDERS_ENABLED")
WECOM_WEBHOOK_URL = os.getenv("WECOM_WEBHOOK_URL", "")
FEISHU_WEBHOOK_URL = os.getenv("FEISHU_WEBHOOK_URL", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = _bounded_int("SMTP_PORT", 465, 1, 65535)
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")
SMTP_TO = tuple(address.strip() for address in os.getenv("SMTP_TO", "").split(",") if address.strip())
SMTP_USE_SSL = _env_flag("SMTP_USE_SSL", True)

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
LOCAL_ONLY_MODE = _env_flag("LOCAL_ONLY_MODE")
MASTER_KEY = os.getenv("MASTER_KEY", "").strip()
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "finquant_session")
AUTH_COOKIE_SECURE = _env_flag("AUTH_COOKIE_SECURE", APP_ENV == "production")
AUTH_CODE_TTL_SECONDS = _bounded_int("AUTH_CODE_TTL_SECONDS", 600, 60, 3600)
AUTH_CODE_COOLDOWN_SECONDS = _bounded_int("AUTH_CODE_COOLDOWN_SECONDS", 60, 1, 3600)
AUTH_CODE_MAX_ATTEMPTS = _bounded_int("AUTH_CODE_MAX_ATTEMPTS", 5, 1, 20)
AUTH_IP_HOURLY_LIMIT = _bounded_int("AUTH_IP_HOURLY_LIMIT", 5, 1, 1000)
AUTH_SESSION_DAYS = _bounded_int("AUTH_SESSION_DAYS", 30, 1, 365)

APP_VERSION = "1.0.0"
