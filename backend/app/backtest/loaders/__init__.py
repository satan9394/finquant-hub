"""Extensible backtest data-loader registry."""
from __future__ import annotations

from ...services.market_data import MarketDataService
from .base import BaseLoader, LoaderUnavailableError, SUPPORTED_PERIODS
from .registry import LoaderRegistry, register, registered_loader_types
from . import providers as _providers  # noqa: F401 - imports fire @register decorators


def default_loader_registry(market: MarketDataService) -> LoaderRegistry:
    registry = LoaderRegistry()
    for loader_type in registered_loader_types():
        registry.register(loader_type(market))
    return registry


__all__ = [
    "BaseLoader",
    "LoaderRegistry",
    "LoaderUnavailableError",
    "SUPPORTED_PERIODS",
    "default_loader_registry",
    "register",
    "registered_loader_types",
]
