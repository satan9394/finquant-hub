"""Pure execution constraints for conservative A-share backtests."""

from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_HALF_UP


def _trade_date(value: object) -> str:
    return str(value)[:10]


def _cn_code(symbol: str | None) -> str | None:
    if not symbol:
        return None
    value = symbol.strip().upper().replace(".SS", "").replace(".SZ", "")
    if value.startswith(("SH", "SZ")):
        value = value[2:]
    return value if len(value) == 6 and value.isdigit() else None


def _rounded_price(value: float, tick_size: float) -> float:
    tick = Decimal(str(tick_size))
    return float((Decimal(str(value)) / tick).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * tick)


@dataclass(frozen=True)
class ExecutionRules:
    market: str
    t_plus_one: bool
    allow_short: bool
    price_limit_ratio: float | None
    tick_size: float = 0.01
    assumptions: tuple[str, ...] = ()

    def limit_prices(self, previous_close: float) -> tuple[float | None, float | None]:
        if self.price_limit_ratio is None:
            return None, None
        return (
            _rounded_price(previous_close * (1 + self.price_limit_ratio), self.tick_size),
            _rounded_price(previous_close * (1 - self.price_limit_ratio), self.tick_size),
        )

    def check_fill(
        self,
        side: str,
        bar: dict,
        *,
        previous_close: float | None,
        entry_date: str | None = None,
    ) -> tuple[bool, str | None]:
        if side not in {"buy", "sell", "short"}:
            raise ValueError(f"未知订单方向：{side}")
        if side == "short" and not self.allow_short:
            return False, "short_selling_forbidden"
        if side == "sell" and self.t_plus_one and entry_date == _trade_date(bar.get("day")):
            return False, "t_plus_one"
        if previous_close in (None, 0) or self.price_limit_ratio is None:
            return True, None

        inferred_up, inferred_down = self.limit_prices(float(previous_close))
        limit_up = float(bar.get("limit_up") or inferred_up)
        limit_down = float(bar.get("limit_down") or inferred_down)
        open_price = float(bar["open"])
        tolerance = self.tick_size / 2
        if side == "buy" and open_price >= limit_up - tolerance:
            return False, "limit_up"
        if side == "sell" and open_price <= limit_down + tolerance:
            return False, "limit_down"
        return True, None

    def metadata(self) -> dict:
        payload = asdict(self)
        payload["assumptions"] = list(self.assumptions)
        return payload


def execution_rules_for(
    symbol: str | None,
    *,
    mode: str = "auto",
    price_limit_ratio: float | None = None,
) -> ExecutionRules:
    if mode not in {"auto", "none"}:
        raise ValueError("market_rules 必须是 auto 或 none")
    code = _cn_code(symbol)
    if mode == "none" or code is None:
        return ExecutionRules(
            market="CN" if code else "OTHER",
            t_plus_one=False,
            allow_short=True,
            price_limit_ratio=None,
            assumptions=(),
        )

    if price_limit_ratio is not None:
        ratio = float(price_limit_ratio)
        if not 0 < ratio <= 0.5:
            raise ValueError("price_limit_ratio 必须在 0 到 0.5 之间")
        assumptions = (
            "price_limit_ratio_explicit",
            "adjusted_bars_may_distort_historical_limit_prices",
        )
    elif code.startswith(("300", "301", "688", "689")):
        ratio = 0.20
        assumptions = (
            "board_limit_inferred_20pct",
            "st_and_listing_exceptions_not_inferred",
            "adjusted_bars_may_distort_historical_limit_prices",
        )
    else:
        ratio = 0.10
        assumptions = (
            "board_limit_inferred_10pct",
            "st_and_listing_exceptions_not_inferred",
            "adjusted_bars_may_distort_historical_limit_prices",
        )
    return ExecutionRules(
        market="CN",
        t_plus_one=True,
        allow_short=False,
        price_limit_ratio=ratio,
        assumptions=assumptions,
    )
