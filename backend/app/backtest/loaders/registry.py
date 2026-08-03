"""Loader registration and deterministic market-aware fallback."""
from __future__ import annotations

from collections.abc import Iterator
from typing import Any, TypeVar

from ...services.market_data import normalize_code
from .base import BaseLoader, LoaderUnavailableError, SUPPORTED_PERIODS


LoaderType = TypeVar("LoaderType", bound=type[BaseLoader])
_LOADER_TYPES: dict[str, type[BaseLoader]] = {}


def register(loader_type: LoaderType) -> LoaderType:
    """Register one loader class by its stable provider name."""
    if not issubclass(loader_type, BaseLoader):
        raise TypeError("Loader 必须继承 BaseLoader")
    name = loader_type.name.strip().lower()
    if not name or name == "base":
        raise ValueError("Loader 必须声明非空 name")
    existing = _LOADER_TYPES.get(name)
    if existing is not None and existing is not loader_type:
        raise ValueError(f"Loader 名称已注册：{name}")
    _LOADER_TYPES[name] = loader_type
    return loader_type


def registered_loader_types() -> tuple[type[BaseLoader], ...]:
    return tuple(_LOADER_TYPES.values())


def _symbol_market(symbol: str) -> str:
    prefix = normalize_code(symbol)[:2]
    return {"sh": "CN", "sz": "CN", "hk": "HK", "us": "US"}[prefix]


class LoaderRegistry:
    """Resolve available loaders by market, priority, and supported period."""

    def __init__(self) -> None:
        self._loaders: dict[str, list[BaseLoader]] = {}

    def register(self, loader: BaseLoader) -> None:
        conflicts = [
            market
            for market in loader.markets
            if any(candidate.name == loader.name for candidate in self._loaders.get(market, ()))
        ]
        if conflicts:
            raise ValueError(f"Loader 已注册：{loader.name}/{','.join(sorted(conflicts))}")
        for market in loader.markets:
            candidates = self._loaders.setdefault(market, [])
            candidates.append(loader)
            candidates.sort(key=lambda candidate: (candidate.priority, candidate.name))

    def candidates(
        self,
        symbol: str,
        period: str | None = None,
        source: str | None = None,
    ) -> Iterator[BaseLoader]:
        market = _symbol_market(symbol)
        requested_source = source.strip().lower() if source else None
        for loader in self._loaders.get(market, ()):
            if requested_source and loader.name != requested_source:
                continue
            if loader.supports(market, period) and loader.is_available():
                yield loader

    def resolve(
        self,
        symbol: str,
        period: str | None = None,
        source: str | None = None,
    ) -> BaseLoader:
        loader = next(self.candidates(symbol, period, source), None)
        if loader is not None:
            return loader
        market = _symbol_market(symbol)
        suffix = f"，数据源 {source}" if source else ""
        raise ValueError(f"市场 {market}{suffix} 没有可用的回测 Loader")

    async def load(
        self,
        symbol: str,
        period: str,
        count: int,
        source: str | None = None,
    ) -> dict[str, Any]:
        if period not in SUPPORTED_PERIODS:
            raise ValueError(f"不支持的周期：{period}")
        if count <= 0:
            raise ValueError("K线数量必须大于 0")

        failures: list[str] = []
        for loader in self.candidates(symbol, period, source):
            try:
                return await loader.load(symbol, period, count)
            except LoaderUnavailableError as exc:
                failures.append(f"{loader.name}: {exc}")
        if failures:
            raise LoaderUnavailableError("；".join(failures))
        return await self.resolve(symbol, period, source).load(symbol, period, count)
