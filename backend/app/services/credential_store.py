"""Fernet-encrypted per-user credentials with safe metadata-only responses."""
from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from .. import config, database

LOGGER = logging.getLogger(__name__)
_SERVICE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,79}$")
_LOCAL_MASTER_KEY = Fernet.generate_key().decode()
_warned_local_key = False


class CredentialDecryptionError(RuntimeError):
    """Credential ciphertext cannot be decrypted by the configured master key."""


def normalize_service(service: str) -> str:
    value = service.strip().lower()
    if not _SERVICE_PATTERN.fullmatch(value):
        raise ValueError("service 仅允许小写字母、数字及 ._:-，长度不超过 80")
    return value


def _master_key() -> str:
    global _warned_local_key
    if config.MASTER_KEY:
        return config.MASTER_KEY
    if config.APP_ENV == "production":
        raise RuntimeError("生产环境必须配置 MASTER_KEY")
    if not _warned_local_key:
        LOGGER.warning(
            "Using ephemeral local credential key; encrypted credentials will not survive restart",
            extra={"event": "credentials.master_key.ephemeral"},
        )
        _warned_local_key = True
    return _LOCAL_MASTER_KEY


@lru_cache(maxsize=8)
def _fernet(key: str) -> Fernet:
    try:
        return Fernet(key.encode())
    except (TypeError, ValueError) as exc:
        raise RuntimeError("MASTER_KEY 必须是有效的 Fernet key") from exc


def encrypt_value(value: str) -> bytes:
    if not value:
        raise ValueError("凭据不能为空")
    return _fernet(_master_key()).encrypt(value.encode())


def validate_master_key() -> None:
    """Fail startup in production when the credential root key is missing or invalid."""
    _fernet(_master_key())


def decrypt_value(encrypted_value: bytes | memoryview) -> str:
    payload = bytes(encrypted_value)
    try:
        return _fernet(_master_key()).decrypt(payload).decode()
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise CredentialDecryptionError("凭据无法解密，请重新保存") from exc


def _public_status(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "service": row["service"],
        "has_key": True,
        "provider": row.get("provider") or "",
        "updated_at": row["updated_at"],
    }


async def put_credential(
    user_id: int,
    service: str,
    value: str,
    provider: str = "",
) -> dict[str, Any]:
    normalized = normalize_service(service)
    encrypted = encrypt_value(value)
    await database.execute(
        """
        INSERT INTO user_credentials (user_id, service, encrypted_value, provider)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, service) DO UPDATE SET
            encrypted_value=excluded.encrypted_value,
            provider=excluded.provider,
            updated_at=datetime('now')
        """,
        (user_id, normalized, encrypted, provider.strip()[:100]),
    )
    row = await database.query_one(
        "SELECT service, provider, updated_at FROM user_credentials WHERE user_id=? AND service=?",
        (user_id, normalized),
    )
    assert row is not None
    return _public_status(row)


async def delete_credential(user_id: int, service: str) -> bool:
    db = database.get_db()
    cursor = await db.execute(
        "DELETE FROM user_credentials WHERE user_id=? AND service=?",
        (user_id, normalize_service(service)),
    )
    await db.commit()
    return cursor.rowcount == 1


async def list_credentials(user_id: int) -> list[dict[str, Any]]:
    rows = await database.query_all(
        "SELECT service, provider, updated_at FROM user_credentials WHERE user_id=? ORDER BY service",
        (user_id,),
    )
    return [_public_status(row) for row in rows]


async def credential_status(user_id: int, service: str) -> dict[str, Any]:
    normalized = normalize_service(service)
    row = await database.query_one(
        "SELECT service, provider, updated_at FROM user_credentials WHERE user_id=? AND service=?",
        (user_id, normalized),
    )
    if row is None:
        return {"service": normalized, "has_key": False, "provider": ""}
    return _public_status(row)


async def get_credential(user_id: int, service: str) -> str | None:
    row = await database.query_one(
        "SELECT encrypted_value FROM user_credentials WHERE user_id=? AND service=?",
        (user_id, normalize_service(service)),
    )
    return decrypt_value(row["encrypted_value"]) if row else None


async def get_credentials(user_id: int, services: tuple[str, ...]) -> dict[str, str]:
    values: dict[str, str] = {}
    for service in services:
        value = await get_credential(user_id, service)
        if value is not None:
            values[normalize_service(service)] = value
    return values


async def migrate_legacy_model_api_keys(user_id: int | None = None) -> int:
    """Move legacy plaintext model keys into encrypted storage, then clear the source."""
    owner_clause = "AND user_id=?" if user_id is not None else ""
    params: tuple[int, ...] = (user_id,) if user_id is not None else ()
    rows = await database.query_all(
        "SELECT id, user_id, provider, api_key FROM model_configs "
        "WHERE user_id IS NOT NULL AND api_key IS NOT NULL AND api_key<>'' " + owner_clause,
        params,
    )
    for row in rows:
        await put_credential(
            int(row["user_id"]),
            f"model:{row['id']}",
            str(row["api_key"]),
            str(row.get("provider") or ""),
        )
        await database.execute(
            "UPDATE model_configs SET api_key=NULL WHERE id=? AND user_id=?",
            (row["id"], row["user_id"]),
        )
    return len(rows)
