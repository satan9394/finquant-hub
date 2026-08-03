"""Small public-deployment security boundary for the ASGI application."""
from __future__ import annotations

from collections import defaultdict, deque
from http.cookies import CookieError, SimpleCookie
import logging
import threading
import time
from urllib.parse import urlsplit

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

LOGGER = logging.getLogger(__name__)

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_DEFAULT_SENSITIVE_PATHS = (
    "/api/auth/request-code",
    "/api/auth/verify-code",
    "/api/auth/logout",
    "/api/me/credentials",
    "/api/models",
    "/api/mcp/configs",
    "/api/settings",
)
_SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
_MAX_RATE_KEYS = 10_000


def _origin_tuple(value: str) -> tuple[str, str, int] | None:
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            return None
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return None
    return parsed.scheme.lower(), parsed.hostname.lower(), port


class SecurityMiddleware:
    """Add headers, bound bodies, reject cross-origin writes, and throttle sensitive writes."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        cookie_name: str,
        max_body_bytes: int = 1_048_576,
        sensitive_rate_limit: int = 60,
        rate_window_seconds: int = 60,
        sensitive_paths: tuple[str, ...] = _DEFAULT_SENSITIVE_PATHS,
    ) -> None:
        self.app = app
        self.cookie_name = cookie_name
        self.max_body_bytes = max_body_bytes
        self.sensitive_rate_limit = sensitive_rate_limit
        self.rate_window_seconds = rate_window_seconds
        self.sensitive_paths = sensitive_paths
        self._rate_events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._rate_lock = threading.Lock()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        method = str(scope.get("method", "GET")).upper()
        path = str(scope.get("path", ""))

        async def secure_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                for name, value in _SECURITY_HEADERS.items():
                    response_headers.setdefault(name, value)
                if path.startswith("/api/"):
                    response_headers.setdefault("Cache-Control", "no-store")
                forwarded_proto = headers.get(b"x-forwarded-proto", b"").split(b",", 1)[0].strip()
                if scope.get("scheme") == "https" or forwarded_proto == b"https":
                    response_headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
            await send(message)

        if method in _UNSAFE_METHODS and self._has_session_cookie(headers):
            reason = self._csrf_failure(scope, headers)
            if reason:
                LOGGER.warning(
                    "Cross-origin state change rejected",
                    extra={"event": "security.csrf.rejected", "http_path": path, "reason": reason},
                )
                await JSONResponse(status_code=403, content={"detail": "跨站请求已拒绝"})(scope, receive, secure_send)
                return

        if method in _UNSAFE_METHODS and any(path.startswith(prefix) for prefix in self.sensitive_paths):
            retry_after = self._rate_retry_after(scope, path)
            if retry_after:
                await JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后重试"},
                    headers={"Retry-After": str(retry_after)},
                )(scope, receive, secure_send)
                return

        replay: deque[Message] = deque()
        if method in _UNSAFE_METHODS:
            content_length = headers.get(b"content-length")
            try:
                declared_size = int(content_length) if content_length else 0
            except ValueError:
                declared_size = self.max_body_bytes + 1
            if declared_size > self.max_body_bytes:
                await self._body_too_large(scope, receive, secure_send)
                return

            received_size = 0
            while True:
                message = await receive()
                replay.append(message)
                if message["type"] != "http.request":
                    break
                received_size += len(message.get("body", b""))
                if received_size > self.max_body_bytes:
                    await self._body_too_large(scope, receive, secure_send)
                    return
                if not message.get("more_body", False):
                    break

        async def replay_receive() -> Message:
            return replay.popleft() if replay else await receive()

        await self.app(scope, replay_receive, secure_send)

    def _has_session_cookie(self, headers: dict[bytes, bytes]) -> bool:
        raw_cookie = headers.get(b"cookie", b"").decode("latin-1")
        if not raw_cookie:
            return False
        cookie = SimpleCookie()
        try:
            cookie.load(raw_cookie)
        except CookieError:
            return False
        return self.cookie_name in cookie

    @staticmethod
    def _csrf_failure(scope: Scope, headers: dict[bytes, bytes]) -> str | None:
        fetch_site = headers.get(b"sec-fetch-site", b"").decode("latin-1").lower()
        if fetch_site and fetch_site != "same-origin":
            return "fetch_site"

        source = headers.get(b"origin") or headers.get(b"referer")
        if not source:
            # Non-browser API clients do not always send browser origin metadata.
            return None
        forwarded_proto = headers.get(b"x-forwarded-proto", b"").split(b",", 1)[0].strip()
        scheme = forwarded_proto.decode("latin-1") if forwarded_proto else str(scope.get("scheme", "http"))
        host = headers.get(b"host", b"").decode("latin-1")
        source_origin = _origin_tuple(source.decode("latin-1"))
        target_origin = _origin_tuple(f"{scheme}://{host}")
        return None if source_origin is not None and source_origin == target_origin else "origin"

    def _rate_retry_after(self, scope: Scope, path: str) -> int:
        client = scope.get("client")
        client_ip = str(client[0]) if client else "unknown"
        key = (client_ip, path)
        now = time.monotonic()
        cutoff = now - self.rate_window_seconds
        with self._rate_lock:
            if key not in self._rate_events and len(self._rate_events) >= _MAX_RATE_KEYS:
                self._rate_events.pop(next(iter(self._rate_events)))
            events = self._rate_events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.sensitive_rate_limit:
                return max(1, int(self.rate_window_seconds - (now - events[0])))
            events.append(now)
        return 0

    async def _body_too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        await JSONResponse(status_code=413, content={"detail": "请求体过大"})(scope, receive, send)
