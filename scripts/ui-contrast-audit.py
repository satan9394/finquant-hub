#!/usr/bin/env python3
"""Audit FinQuant semantic color-token pairs against WCAG contrast thresholds."""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

CSS_PATH = Path(__file__).resolve().parents[1] / "frontend" / "src" / "app.css"
TOKEN_RE = re.compile(r"--fq-([\w-]+):\s*(#[0-9a-fA-F]{6})")


@dataclass(frozen=True)
class ContrastCheck:
    theme: str
    pair: str
    ratio: float
    threshold: float

    @property
    def passed(self) -> bool:
        return self.ratio >= self.threshold


def _token_block(css: str, selector: str, *, containing: str | None = None) -> str:
    matches = re.findall(rf"{re.escape(selector)}\s*\{{(.*?)\n\}}", css, re.DOTALL)
    for block in matches:
        if containing is None or containing in block:
            return block
    raise ValueError(f"Missing token block: {selector}")


def _tokens(block: str) -> dict[str, str]:
    return dict(TOKEN_RE.findall(block))


def _rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))  # type: ignore[return-value]


def _luminance(value: str) -> float:
    channels = [channel / 255 for channel in _rgb(value)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _ratio(foreground: str, background: str) -> float:
    high, low = sorted((_luminance(foreground), _luminance(background)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def _mix(foreground: str, percentage: float, background: str) -> str:
    foreground_rgb = _rgb(foreground)
    background_rgb = _rgb(background)
    mixed = [round(foreground_rgb[index] * percentage + background_rgb[index] * (1 - percentage)) for index in range(3)]
    return "#" + "".join(f"{channel:02x}" for channel in mixed)


def _audit_theme(theme: str, values: dict[str, str]) -> list[ContrastCheck]:
    checks: list[ContrastCheck] = []

    def add(pair: str, foreground: str, background: str, threshold: float = 4.5) -> None:
        checks.append(ContrastCheck(theme, pair, _ratio(values[foreground], values[background]), threshold))

    for foreground in ("text-primary", "text-secondary", "text-tertiary"):
        for background in ("bg-page", "bg-subtle", "surface-1"):
            add(f"{foreground} on {background}", foreground, background)

    for foreground in (
        "ai-primary",
        "secondary",
        "price-up",
        "price-down",
        "system-info",
        "system-warning",
        "system-error",
        "opportunity",
        "risk",
        "warning",
    ):
        add(f"{foreground} on surface-1", foreground, "surface-1")

    for background in ("bg-page", "surface-1"):
        add(f"focus ai-primary on {background}", "ai-primary", background, 3.0)

    # ponytail: these mixes mirror the only token-generated chip/status backgrounds in app.css.
    for foreground in ("evidence-fact", "evidence-inference", "evidence-model"):
        chip_background = _mix(values[foreground], 0.09, values["surface-1"])
        checks.append(ContrastCheck(theme, f"{foreground} on 9% chip", _ratio(values[foreground], chip_background), 4.5))

    add("evidence-unknown on bg-subtle", "evidence-unknown", "bg-subtle")

    for foreground in ("system-info", "system-warning", "system-error", "opportunity"):
        status_background = _mix(values[foreground], 0.10, values["surface-1"])
        checks.append(ContrastCheck(theme, f"{foreground} on 10% status", _ratio(values[foreground], status_background), 4.5))

    return checks


def main() -> int:
    css = CSS_PATH.read_text(encoding="utf-8")
    themes = {
        "light": _tokens(_token_block(css, ":root", containing="--fq-ai-primary")),
        "dark": _tokens(_token_block(css, ".app-theme--dark")),
    }
    checks = [check for theme, values in themes.items() for check in _audit_theme(theme, values)]
    for check in checks:
        outcome = "PASS" if check.passed else "FAIL"
        print(f"{check.theme}\t{check.pair}\t{check.ratio:.2f}:1\t{outcome}\tthreshold={check.threshold:.1f}")
    failures = [check for check in checks if not check.passed]
    print(f"SUMMARY\ttotal={len(checks)}\tfail={len(failures)}\tmin={min(check.ratio for check in checks):.2f}:1")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
