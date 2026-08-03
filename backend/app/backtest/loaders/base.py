"""Shared contract for backtest market-data loaders."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ...services.market_data import MarketDataService


SUPPORTED_PERIODS = frozenset({"1d", "60m", "30m", "15m", "5m"})


class LoaderUnavailableError(RuntimeError):
    """A loader cannot serve the current request, so fallback may continue."""


class BaseLoader(ABC):
    """Minimal async loader contract used by the backtest engine."""

    name = "base"
    markets: frozenset[str] = frozenset()
    periods: frozenset[str] = SUPPORTED_PERIODS
    priority = 100

    def __init__(self, market: MarketDataService | None = None) -> None:
        self.market = market

    def is_available(self) -> bool:
        return True

    def supports(self, market: str, period: str | None = None) -> bool:
        return market in self.markets and (period is None or period in self.periods)

    @abstractmethod
    async def load(self, symbol: str, period: str, count: int) -> dict[str, Any]:
        """Return InstrumentService-compatible bars and provenance."""

    def require_market_service(self) -> MarketDataService:
        if self.market is None:
            raise LoaderUnavailableError(f"Loader {self.name} 缺少 MarketDataService")
        return self.market
