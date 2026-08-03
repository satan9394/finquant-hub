from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app import config
from app import main as main_module
from app.middleware.security import SecurityMiddleware


def _security_app(*, body_limit: int = 1024, rate_limit: int = 60) -> FastAPI:
    test_app = FastAPI()

    @test_app.get("/api/check")
    async def check() -> dict[str, bool]:
        return {"ok": True}

    @test_app.post("/api/sensitive")
    async def sensitive() -> dict[str, bool]:
        return {"ok": True}

    test_app.add_middleware(
        SecurityMiddleware,
        cookie_name="finquant_session",
        max_body_bytes=body_limit,
        sensitive_rate_limit=rate_limit,
        sensitive_paths=("/api/sensitive",),
    )
    return test_app


@pytest.mark.asyncio
async def test_security_headers_and_https_hsts() -> None:
    app = _security_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
        response = await client.get("/api/check")

    assert response.status_code == 200
    assert response.headers["content-security-policy"].startswith("default-src 'self'")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["strict-transport-security"].startswith("max-age=31536000")
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_csrf_rejects_cross_origin_cookie_writes() -> None:
    app = _security_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
        client.cookies.set("finquant_session", "opaque-session")
        evil = await client.post(
            "/api/sensitive",
            headers={"Origin": "https://evil.example"},
            json={"value": 1},
        )
        same_origin = await client.post(
            "/api/sensitive",
            headers={"Origin": "https://test", "Sec-Fetch-Site": "same-origin"},
            json={"value": 1},
        )
        same_site_subdomain = await client.post(
            "/api/sensitive",
            headers={"Sec-Fetch-Site": "same-site"},
            json={"value": 1},
        )

    assert evil.status_code == 403
    assert same_origin.status_code == 200
    assert same_site_subdomain.status_code == 403


@pytest.mark.asyncio
async def test_body_limit_catches_declared_and_streamed_bodies() -> None:
    app = _security_app(body_limit=8)

    async def chunks():
        yield b"12345"
        yield b"67890"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        declared = await client.post("/api/sensitive", content=b"123456789")
        streamed = await client.post("/api/sensitive", content=chunks())

    assert declared.status_code == 413
    assert streamed.status_code == 413
    assert streamed.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_sensitive_rate_limit_is_per_ip_and_path() -> None:
    app = _security_app(rate_limit=2)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/api/sensitive")).status_code == 200
        assert (await client.post("/api/sensitive")).status_code == 200
        limited = await client.post("/api/sensitive")

    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) >= 1


def test_public_compose_terminates_tls_and_keeps_backend_private() -> None:
    root = Path(__file__).resolve().parents[2]
    compose = (root / "docker-compose.yml").read_text(encoding="utf-8")
    nginx = (root / "docker" / "nginx.conf").read_text(encoding="utf-8")
    backend_service = compose.split("  frontend:", 1)[0]

    assert "MASTER_KEY is required" in compose
    assert "TLS_CERT_PATH" in compose and "TLS_KEY_PATH" in compose
    assert '      - "8000:8000"' not in backend_service
    assert '      - "8000"' in backend_service
    assert "listen 443 ssl" in nginx
    assert "ssl_protocols TLSv1.2 TLSv1.3" in nginx
    assert "return 308 https://$host$request_uri" in nginx


@pytest.mark.asyncio
async def test_production_startup_rejects_insecure_cookie_and_missing_smtp(monkeypatch) -> None:
    monkeypatch.setattr(config, "APP_ENV", "production")
    monkeypatch.setattr(main_module, "validate_master_key", lambda: None)
    monkeypatch.setattr(config, "AUTH_COOKIE_SECURE", False)
    with pytest.raises(RuntimeError, match="AUTH_COOKIE_SECURE"):
        async with main_module.lifespan(main_module.app):
            pass

    monkeypatch.setattr(config, "AUTH_COOKIE_SECURE", True)
    monkeypatch.setattr(config, "SMTP_HOST", "")
    monkeypatch.setattr(config, "SMTP_FROM", "")
    with pytest.raises(RuntimeError, match="SMTP_HOST"):
        async with main_module.lifespan(main_module.app):
            pass
