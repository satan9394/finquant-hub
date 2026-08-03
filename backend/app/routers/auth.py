"""Passwordless email authentication endpoints."""
import logging
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import config
from ..services import auth as auth_service

LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


class EmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class VerifyCodeIn(EmailIn):
    code: str = Field(pattern=r"^\d{6}$")


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def get_current_user(
    session_token: Annotated[str | None, Cookie(alias=config.AUTH_COOKIE_NAME)] = None,
) -> dict[str, Any]:
    user = await auth_service.user_for_session(session_token)
    if user is None:
        raise HTTPException(status_code=401, detail="未登录或会话已过期")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


async def authenticated_context(user: CurrentUser) -> AsyncIterator[None]:
    token = auth_service.set_current_user(user)
    try:
        yield
    finally:
        auth_service.reset_current_user(token)


@router.post("/request-code")
async def request_code(body: EmailIn, request: Request) -> dict[str, Any]:
    request_ip = _client_ip(request)
    try:
        cooldown = await auth_service.request_login_code(body.email, request_ip)
    except auth_service.InvalidEmailError as exc:
        auth_service.log_auth_event("request_code", "failed", request_ip, email=body.email, reason="invalid_email")
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except auth_service.RateLimitError as exc:
        auth_service.log_auth_event("request_code", "failed", request_ip, email=body.email, reason="rate_limited")
        raise HTTPException(
            status_code=429,
            detail="请求过于频繁，请稍后重试",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except RuntimeError as exc:
        LOGGER.error("Login code delivery unavailable", extra={"event": "auth.code.delivery_failed"})
        auth_service.log_auth_event("request_code", "failed", request_ip, email=body.email, reason="delivery_failed")
        raise HTTPException(status_code=503, detail="验证码发送服务暂不可用") from exc
    auth_service.log_auth_event("request_code", "success", request_ip, email=body.email)
    return {"message": "验证码已发送", "cooldown_seconds": cooldown}


@router.post("/verify-code")
async def verify_code(body: VerifyCodeIn, request: Request, response: Response) -> dict[str, Any]:
    request_ip = _client_ip(request)
    try:
        result = await auth_service.verify_login_code(body.email, body.code)
    except (auth_service.InvalidEmailError, auth_service.InvalidCodeError) as exc:
        auth_service.log_auth_event("verify_code", "failed", request_ip, email=body.email, reason="invalid_code")
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    response.set_cookie(
        key=config.AUTH_COOKIE_NAME,
        value=result.token,
        max_age=config.AUTH_SESSION_DAYS * 86400,
        httponly=True,
        secure=config.AUTH_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    auth_service.log_auth_event(
        "verify_code",
        "success",
        request_ip,
        email=result.user["email"],
        user_id=int(result.user["id"]),
    )
    return {"user": result.user}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    session_token: Annotated[str | None, Cookie(alias=config.AUTH_COOKIE_NAME)] = None,
) -> dict[str, bool]:
    user = await auth_service.user_for_session(session_token)
    await auth_service.revoke_session(session_token)
    response.delete_cookie(config.AUTH_COOKIE_NAME, path="/", secure=config.AUTH_COOKIE_SECURE, httponly=True, samesite="strict")
    auth_service.log_auth_event(
        "logout",
        "success",
        _client_ip(request),
        email=user["email"] if user else "",
        reason="revoked" if user else "no_active_session",
        user_id=int(user["id"]) if user else None,
    )
    return {"ok": True}


@router.get("/me")
async def me(user: CurrentUser) -> dict[str, Any]:
    return {"user": user}
