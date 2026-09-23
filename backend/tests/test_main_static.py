"""Opt-in frontend hosting with isolated module imports and temporary build artifacts."""
import importlib.util
import logging
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import dotenv
import pytest
from fastapi.testclient import TestClient

from app import config, database
from app.services import logging as app_logging


INDEX = "<!doctype html><html><body>temporary FinQuant SPA</body></html>"
ASSETS = {"app.css": ("body { color: blue; }", "text/css"), "app.js": ("console.log('fixture');", "javascript")}


@pytest.fixture
def dist(tmp_path):
    directory = tmp_path / "frontend" / "dist"
    (directory / "assets").mkdir(parents=True)
    (directory / "index.html").write_text(INDEX, encoding="utf-8")
    for name, (content, _) in ASSETS.items():
        (directory / "assets" / name).write_text(content, encoding="utf-8")
    return directory


@pytest.fixture
def make_app(tmp_path, monkeypatch):
    clients = []
    # Do not reload app.main: existing suites keep references to its original app.
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(app_logging, "configure_logging", lambda: None)
    unrelated_cwd = tmp_path / "unrelated-cwd"
    unrelated_cwd.mkdir()
    monkeypatch.chdir(unrelated_cwd)

    def create(enabled=True):
        monkeypatch.setattr(config, "SERVE_FRONTEND", enabled)
        spec = importlib.util.spec_from_file_location("app._main_static_test", Path(config.__file__).with_name("main.py"))
        module = importlib.util.module_from_spec(spec)
        # Execute real main.py, resolving dist from a synthetic repository root.
        monkeypatch.setattr(module, "__file__", str(tmp_path / "backend" / "app" / "main.py"))
        spec.loader.exec_module(module)
        # No context manager: lifespan/DB/market/network startup is intentionally not run.
        client = TestClient(module.app)
        clients.append(client)
        return client

    yield create
    for client in clients:
        client.close()


@pytest.mark.parametrize("value, enabled", [(None, False), ("0", False), ("false", False), ("1", True), ("true", True)])
def test_environment_switch_controls_hosting(value, enabled, dist, make_app, monkeypatch):
    monkeypatch.delenv("SERVE_FRONTEND", raising=False)
    if value is not None:
        monkeypatch.setenv("SERVE_FRONTEND", value)
    # Keep the developer's .env out of the configuration default/boolean tests.
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *_args: None)
    spec = importlib.util.spec_from_file_location("app._config_static_test", config.__file__)
    isolated_config = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(isolated_config)

    assert isolated_config.SERVE_FRONTEND is enabled
    client = make_app(isolated_config.SERVE_FRONTEND)
    for path in ("/", "/research/600519", "/assets/app.css"):
        response = client.get(path)
        assert response.status_code == (200 if enabled else 404)
    if not enabled:
        assert all(getattr(route, "path", None) not in ("/assets", "/{full_path:path}") for route in client.app.routes)


@pytest.mark.parametrize("path", ["/", "/research/600519", "/research/600519?tab=overview", "/apiary"])
def test_index_and_spa_fallback(path, dist, make_app):
    response = make_app().get(path)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.text == INDEX


@pytest.mark.parametrize("name", ASSETS)
def test_static_assets(name, dist, make_app):
    response = make_app().get(f"/assets/{name}")
    content, media_type = ASSETS[name]
    assert response.status_code == 200
    assert media_type in response.headers["content-type"]
    assert response.text == content


@pytest.mark.parametrize("path", ["/assets/missing.js", "/assets/%2e%2e/index.html"])
def test_missing_or_escaping_asset_is_not_spa(path, dist, make_app):
    response = make_app().get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_health_still_uses_api_handler(dist, make_app, monkeypatch):
    query = AsyncMock(return_value={"journal_mode": "wal"})
    monkeypatch.setattr(database, "query_one", query)
    response = make_app().get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": config.APP_VERSION, "db": "wal"}
    query.assert_awaited_once_with("PRAGMA journal_mode")


@pytest.mark.parametrize("path", ["/api", "/api/", "/api/nope"])
def test_unknown_api_is_not_spa(path, dist, make_app):
    response = make_app().get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_existing_api_auth_is_preserved(dist, make_app):
    response = make_app().get("/api/models")
    assert response.status_code == 401
    assert response.json() == {"detail": "未登录或会话已过期"}


def test_missing_dist_warns_and_skips_hosting(make_app, monkeypatch):
    warning = Mock()
    monkeypatch.setattr(logging.getLogger("app._main_static_test"), "warning", warning)
    client = make_app()
    warning.assert_called_once_with("SERVE_FRONTEND=1 但未找到 frontend/dist，跳过静态托管")
    for path in ("/", "/research/600519", "/assets/app.css"):
        assert client.get(path).status_code == 404
    assert all(getattr(route, "path", None) not in ("/assets", "/{full_path:path}") for route in client.app.routes)
    assert client.get("/openapi.json").status_code == 200


def test_missing_assets_still_serves_index(tmp_path, make_app):
    directory = tmp_path / "frontend" / "dist"
    directory.mkdir(parents=True)
    (directory / "index.html").write_text(INDEX, encoding="utf-8")
    client = make_app()
    response = client.get("/")
    assert response.status_code == 200
    assert response.text == INDEX
    assert all(getattr(route, "path", None) != "/assets" for route in client.app.routes)


def test_hosting_preserves_openapi_contract(dist, make_app):
    disabled = make_app(False).get("/openapi.json")
    enabled = make_app(True).get("/openapi.json")
    assert disabled.status_code == enabled.status_code == 200
    assert enabled.json() == disabled.json()
    assert "/api/health" in enabled.json()["paths"]
    assert "/{full_path}" not in enabled.json()["paths"]


def test_root_favicon_is_served_as_svg(dist, make_app):
    content = '<svg xmlns="http://www.w3.org/2000/svg"><title>FinQuant</title></svg>'
    (dist / "favicon.svg").write_text(content, encoding="utf-8")
    response = make_app().get("/favicon.svg")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert response.text == content


def test_other_root_static_file_is_served(dist, make_app):
    content = "User-agent: *\nDisallow: /api/\n"
    (dist / "robots.txt").write_text(content, encoding="utf-8", newline="\n")
    response = make_app().get("/robots.txt")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.text == content


@pytest.mark.parametrize("path", [
    "/%2e%2e/%2e%2e/backend/private.txt",
    "/%2e%2e%2f%2e%2e%2fbackend/private.txt",
    "/%2e%2e/%2e%2e/backend/missing.txt",
    "/%2e%2e/dist-other/private.txt",
])
def test_fallback_rejects_paths_outside_dist(path, tmp_path, dist, make_app):
    for directory in (tmp_path / "backend", dist.parent / "dist-other"):
        directory.mkdir()
        (directory / "private.txt").write_text("outside dist fixture", encoding="utf-8")
    response = make_app().get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_spa_route_with_root_static_files_still_returns_index(dist, make_app):
    (dist / "favicon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8")
    (dist / "robots.txt").write_text("User-agent: *\n", encoding="utf-8")
    response = make_app().get("/research/600519")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.text == INDEX
