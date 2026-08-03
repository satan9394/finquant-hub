"""Minimal per-provider circuit breaker used by market-data fallbacks."""

from dataclasses import dataclass, field
from time import monotonic
from typing import Callable


@dataclass
class CircuitBreaker:
    """Closed/open/half-open state machine with one probe after cooldown."""

    failure_threshold: int = 3
    recovery_seconds: float = 30.0
    clock: Callable[[], float] = field(default=monotonic, repr=False)
    failures: int = 0
    state: str = "closed"
    opened_at: float | None = None
    half_open_probe: bool = False
    last_error: str | None = None

    def allow_request(self) -> bool:
        if self.state == "closed":
            return True
        if self.state == "open":
            elapsed = self.clock() - (self.opened_at or 0.0)
            if elapsed < self.recovery_seconds:
                return False
            self.state = "half_open"
            self.half_open_probe = False
        if self.half_open_probe:
            return False
        self.half_open_probe = True
        return True

    def record_success(self) -> None:
        self.failures = 0
        self.state = "closed"
        self.opened_at = None
        self.half_open_probe = False
        self.last_error = None

    def record_failure(self, error: Exception | str) -> None:
        self.last_error = str(error)[:300]
        self.failures += 1
        if self.state == "half_open" or self.failures >= self.failure_threshold:
            self.state = "open"
            self.opened_at = self.clock()
        self.half_open_probe = False

    def snapshot(self) -> dict[str, object]:
        retry_after = None
        if self.state == "open" and self.opened_at is not None:
            retry_after = max(0.0, self.recovery_seconds - (self.clock() - self.opened_at))
        return {
            "state": self.state,
            "available": self.state != "open" or retry_after == 0,
            "failures": self.failures,
            "retry_after_seconds": round(retry_after, 1) if retry_after is not None else None,
            "last_error": self.last_error,
        }
