"""Passwordless email codes and server-side session lifecycle."""
import asyncio
import hashlib
import logging
import re
import secrets
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from .. import config, database
from .credential_store import migrate_legacy_model_api_keys
from .senders import EmailSender

LOGGER = logging.getLogger(__name__)
_EMAIL_RE = re.compile(r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$", re.IGNORECASE)
_AUTH_LOCK = asyncio.Lock()
_CURRENT_USER: ContextVar[dict[str, Any] | None] = ContextVar("current_user", default=None)


class InvalidEmailError(ValueError):
    pass


class RateLimitError(RuntimeError):
    def __init__(self, retry_after: int) -> None:
        super().__init__("请求过于频繁")
        self.retry_after = max(1, retry_after)


class InvalidCodeError(ValueError):
    pass


@dataclass(frozen=True)
class SessionResult:
    token: str
    user: dict[str, Any]


def log_auth_event(
    action: str,
    outcome: str,
    request_ip: str,
    *,
    email: str = "",
    reason: str = "",
    user_id: int | None = None,
) -> None:
    """Write one structured authentication audit event without secrets or tokens."""
    log = LOGGER.info if outcome == "success" else LOGGER.warning
    log(
        "Authentication audit",
        extra={
            "event": f"auth.{action}.{outcome}",
            "request_ip": request_ip,
            "email": email.strip().lower()[:254],
            "reason": reason,
            "user_id": user_id,
        },
    )


def set_current_user(user: dict[str, Any]) -> Token[dict[str, Any] | None]:
    return _CURRENT_USER.set(user)


def reset_current_user(token: Token[dict[str, Any] | None]) -> None:
    _CURRENT_USER.reset(token)


def current_user_id() -> int:
    user = _CURRENT_USER.get()
    if user is None:
        raise RuntimeError("authenticated user context is required")
    return int(user["id"])


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not _EMAIL_RE.fullmatch(email):
        raise InvalidEmailError("邮箱格式不正确")
    return email


def _hash_code(email: str, code: str) -> str:
    return hashlib.sha256(f"{email}:{code}".encode()).hexdigest()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _db_time(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")


async def _send_login_code(email: str, code: str) -> None:
    if config.SMTP_HOST and config.SMTP_FROM:
        sender = EmailSender(
            host=config.SMTP_HOST,
            port=config.SMTP_PORT,
            username=config.SMTP_USERNAME,
            password=config.SMTP_PASSWORD,
            from_address=config.SMTP_FROM,
            recipients=(email,),
            use_ssl=config.SMTP_USE_SSL,
        )
        async with httpx.AsyncClient(timeout=20) as http:
            await sender.send("FinQuant Hub 登录验证码", f"您的验证码是：{code}\n\n{config.AUTH_CODE_TTL_SECONDS // 60} 分钟内有效。", http)
        return
    if config.APP_ENV == "production":
        raise RuntimeError("生产环境未配置 SMTP")
    LOGGER.warning("Local login code", extra={"event": "auth.code.local", "email": email, "code": code})


async def request_login_code(email_value: str, request_ip: str) -> int:
    email = normalize_email(email_value)
    now = datetime.now(UTC)
    async with _AUTH_LOCK:
        recent = await database.query_one(
            "SELECT created_at FROM login_codes WHERE email=? "
            "AND created_at > datetime('now', ?) ORDER BY id DESC LIMIT 1",
            (email, f"-{config.AUTH_CODE_COOLDOWN_SECONDS} seconds"),
        )
        if recent:
            created = datetime.strptime(recent["created_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)
            elapsed = int((now - created).total_seconds())
            raise RateLimitError(config.AUTH_CODE_COOLDOWN_SECONDS - elapsed)

        ip_count = await database.query_one(
            "SELECT COUNT(*) AS n FROM login_codes WHERE request_ip=? AND created_at > datetime('now', '-1 hour')",
            (request_ip,),
        )
        if ip_count and int(ip_count["n"]) >= config.AUTH_IP_HOURLY_LIMIT:
            raise RateLimitError(3600)

        code = f"{secrets.randbelow(1_000_000):06d}"
        await database.execute(
            "UPDATE login_codes SET used_at=datetime('now') WHERE email=? AND used_at IS NULL",
            (email,),
        )
        code_id = await database.execute(
            "INSERT INTO login_codes (email, code_hash, request_ip, expires_at) VALUES (?, ?, ?, ?)",
            (email, _hash_code(email, code), request_ip, _db_time(now + timedelta(seconds=config.AUTH_CODE_TTL_SECONDS))),
        )
        try:
            await _send_login_code(email, code)
        except Exception:
            await database.execute("DELETE FROM login_codes WHERE id=?", (code_id,))
            raise
    return config.AUTH_CODE_COOLDOWN_SECONDS


async def verify_login_code(email_value: str, code: str) -> SessionResult:
    email = normalize_email(email_value)
    if not re.fullmatch(r"\d{6}", code):
        raise InvalidCodeError("验证码无效或已过期")
    async with _AUTH_LOCK:
        row = await database.query_one(
            "SELECT id, code_hash, attempts FROM login_codes "
            "WHERE email=? AND used_at IS NULL AND expires_at > datetime('now') "
            "ORDER BY id DESC LIMIT 1",
            (email,),
        )
        if not row:
            raise InvalidCodeError("验证码无效或已过期")
        if int(row["attempts"]) >= config.AUTH_CODE_MAX_ATTEMPTS:
            await database.execute("UPDATE login_codes SET used_at=datetime('now') WHERE id=?", (row["id"],))
            raise InvalidCodeError("验证码无效或已过期")
        if not secrets.compare_digest(row["code_hash"], _hash_code(email, code)):
            attempts = int(row["attempts"]) + 1
            await database.execute(
                "UPDATE login_codes SET attempts=?, used_at=CASE WHEN ? >= ? THEN datetime('now') ELSE used_at END WHERE id=?",
                (attempts, attempts, config.AUTH_CODE_MAX_ATTEMPTS, row["id"]),
            )
            raise InvalidCodeError("验证码无效或已过期")

        await database.execute("UPDATE login_codes SET used_at=datetime('now') WHERE id=?", (row["id"],))
        user = await database.query_one("SELECT id, email, is_admin, is_active FROM users WHERE email=?", (email,))
        if user is None:
            count = await database.query_one("SELECT COUNT(*) AS n FROM users")
            user_id = await database.execute(
                "INSERT INTO users (email, is_admin, last_login_at) VALUES (?, ?, datetime('now'))",
                (email, int(not count or int(count["n"]) == 0)),
            )
            user = await database.query_one("SELECT id, email, is_admin, is_active FROM users WHERE id=?", (user_id,))
        elif not user["is_active"]:
            raise InvalidCodeError("用户已停用")
        else:
            await database.execute("UPDATE users SET last_login_at=datetime('now') WHERE id=?", (user["id"],))

        assert user is not None
        if user["is_admin"]:
            await database.claim_unowned_data(int(user["id"]))
        await database.seed_models_for_user(int(user["id"]))
        await migrate_legacy_model_api_keys(int(user["id"]))
        token = secrets.token_urlsafe(32)
        await database.execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (user["id"], _hash_token(token), _db_time(datetime.now(UTC) + timedelta(days=config.AUTH_SESSION_DAYS))),
        )
    return SessionResult(token=token, user={"id": user["id"], "email": user["email"], "is_admin": bool(user["is_admin"])})


async def user_for_session(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    row = await database.query_one(
        "SELECT u.id, u.email, u.is_admin FROM sessions s JOIN users u ON u.id=s.user_id "
        "WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > datetime('now') AND u.is_active=1",
        (_hash_token(token),),
    )
    if row is None:
        return None
    return {"id": row["id"], "email": row["email"], "is_admin": bool(row["is_admin"])}


async def revoke_session(token: str | None) -> None:
    if token:
        await database.execute(
            "UPDATE sessions SET revoked_at=datetime('now') WHERE token_hash=? AND revoked_at IS NULL",
            (_hash_token(token),),
        )
