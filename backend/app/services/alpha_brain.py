"""Minimal, injectable bridge for WorldQuant BRAIN simulation APIs."""
from __future__ import annotations

import os
import re
from typing import Any

import httpx


_DEFAULT_BASE_URL = "https://api.worldquantbrain.com"
_DEFAULT_SETTINGS = {
    "instrumentType": "EQUITY",
    "region": "USA",
    "universe": "TOP3000",
    "delay": 1,
    "decay": 0,
    "neutralization": "SUBINDUSTRY",
    "truncation": 0.08,
    "pasteurization": "ON",
    "unitHandling": "VERIFY",
    "nanHandling": "ON",
    "language": "FASTEXPR",
    "visualization": False,
}
_RESOURCE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class AlphaBrainError(RuntimeError):
    """Sanitized BRAIN error that never includes credentials or response bodies."""


class AlphaBrainClient:
    def __init__(
        self,
        *,
        username: str | None = None,
        password: str | None = None,
        base_url: str = _DEFAULT_BASE_URL,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self.username = username or os.getenv("WQ_BRAIN_USERNAME", "")
        self.password = password or os.getenv("WQ_BRAIN_PASSWORD", "")
        self._owns_http = http is None
        self.http = http or httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(20.0, connect=5.0),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )

    async def authenticate(self) -> None:
        if not self.username or not self.password:
            raise AlphaBrainError("缺少 WQ_BRAIN_USERNAME/WQ_BRAIN_PASSWORD")
        await self._request("POST", "/authentication", auth=(self.username, self.password), expected={200, 201})

    async def create_simulation(
        self,
        expression: str,
        *,
        settings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        expression = expression.strip()
        if not expression or len(expression) > 10_000:
            raise ValueError("因子表达式不能为空且不能超过 10000 字符")
        simulation_settings = {**_DEFAULT_SETTINGS, **(settings or {})}
        response = await self._request(
            "POST",
            "/simulations",
            json={"type": "REGULAR", "settings": simulation_settings, "regular": expression},
            expected={201},
        )
        location = response.headers.get("Location", "")
        simulation_id = location.rstrip("/").rsplit("/", 1)[-1] if location else ""
        return {"simulation_id": simulation_id or None, "status": "accepted"}

    async def get_simulation(self, simulation_id: str) -> dict[str, Any]:
        response = await self._request("GET", f"/simulations/{self._safe_id(simulation_id)}", expected={200})
        return self._json(response)

    async def get_alpha(self, alpha_id: str) -> dict[str, Any]:
        response = await self._request("GET", f"/alphas/{self._safe_id(alpha_id)}", expected={200})
        return self._json(response)

    async def aclose(self) -> None:
        if self._owns_http:
            await self.http.aclose()

    async def __aenter__(self) -> AlphaBrainClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def _request(self, method: str, path: str, *, expected: set[int], **kwargs: Any) -> httpx.Response:
        try:
            response = await self.http.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise AlphaBrainError("BRAIN 服务暂时不可用") from exc
        if response.status_code not in expected:
            raise AlphaBrainError(f"BRAIN 请求失败 (HTTP {response.status_code})")
        return response

    @staticmethod
    def _safe_id(value: str) -> str:
        if not _RESOURCE_ID.fullmatch(value):
            raise ValueError("资源 ID 格式无效")
        return value

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise AlphaBrainError("BRAIN 返回了无效 JSON") from exc
        if not isinstance(payload, dict):
            raise AlphaBrainError("BRAIN 返回结构无效")
        return payload
