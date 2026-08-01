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

DB_PATH = BASE_DIR / "data" / "finquant.db"
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
SCHEDULER_ENABLED = _env_flag("SCHEDULER_ENABLED")
SCHEDULER_CONCURRENCY = _bounded_int("SCHEDULER_CONCURRENCY", 2, 1, 20)
SCHEDULER_MAX_TARGETS = _bounded_int("SCHEDULER_MAX_TARGETS", 20, 1, 1000)
SCHEDULER_HOUR = _bounded_int("SCHEDULER_HOUR", 18, 0, 23)
SCHEDULER_MINUTE = _bounded_int("SCHEDULER_MINUTE", 0, 0, 59)
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

APP_VERSION = "1.0.0"
