from app.services.source_health import CircuitBreaker


def test_circuit_breaker_opens_allows_one_probe_and_recovers():
    now = [100.0]
    breaker = CircuitBreaker(failure_threshold=2, recovery_seconds=10, clock=lambda: now[0])

    assert breaker.allow_request() is True
    breaker.record_failure("timeout 1")
    assert breaker.state == "closed"
    assert breaker.allow_request() is True
    breaker.record_failure("timeout 2")
    assert breaker.snapshot()["available"] is False
    assert breaker.allow_request() is False

    now[0] = 111.0
    assert breaker.allow_request() is True
    assert breaker.state == "half_open"
    assert breaker.allow_request() is False
    breaker.record_success()
    assert breaker.snapshot() == {
        "state": "closed",
        "available": True,
        "failures": 0,
        "retry_after_seconds": None,
        "last_error": None,
    }


def test_failed_half_open_probe_reopens_breaker():
    now = [0.0]
    breaker = CircuitBreaker(failure_threshold=1, recovery_seconds=5, clock=lambda: now[0])
    breaker.record_failure(ValueError("bad payload"))
    now[0] = 6.0
    assert breaker.allow_request() is True
    breaker.record_failure("still bad")
    assert breaker.state == "open"
    assert breaker.last_error == "still bad"
