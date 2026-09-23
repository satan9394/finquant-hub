"""Small, dependency-free parser for standard five-field cron expressions."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class _Field:
    values: frozenset[int]
    wildcard: bool


def _parse_field(text: str, minimum: int, maximum: int, *, sunday_alias: bool = False) -> _Field:
    wildcard = text == "*"
    values: set[int] = set()
    for part in text.split(","):
        base, separator, step_text = part.partition("/")
        if separator:
            try:
                step = int(step_text)
            except ValueError as exc:
                raise ValueError(f"无效 cron 步长：{part}") from exc
            if step <= 0:
                raise ValueError(f"cron 步长必须大于 0：{part}")
        else:
            step = 1
        if base == "*":
            start, end = minimum, maximum
        elif "-" in base:
            start_text, end_text = base.split("-", 1)
            try:
                start, end = int(start_text), int(end_text)
            except ValueError as exc:
                raise ValueError(f"无效 cron 范围：{part}") from exc
        else:
            try:
                start = end = int(base)
            except ValueError as exc:
                raise ValueError(f"无效 cron 字段：{part}") from exc
        if start < minimum or end > maximum or start > end:
            raise ValueError(f"cron 字段超出范围 {minimum}-{maximum}：{part}")
        values.update(range(start, end + 1, step))
    if sunday_alias and 7 in values:
        values.remove(7)
        values.add(0)
    return _Field(frozenset(values), wildcard)


@dataclass(frozen=True)
class CronExpression:
    minute: _Field
    hour: _Field
    day: _Field
    month: _Field
    weekday: _Field
    raw: str

    @classmethod
    def parse(cls, expression: str) -> "CronExpression":
        fields = expression.strip().split()
        if len(fields) != 5:
            raise ValueError("cron 必须包含 5 个字段：分 时 日 月 周")
        return cls(
            minute=_parse_field(fields[0], 0, 59),
            hour=_parse_field(fields[1], 0, 23),
            day=_parse_field(fields[2], 1, 31),
            month=_parse_field(fields[3], 1, 12),
            weekday=_parse_field(fields[4], 0, 7, sunday_alias=True),
            raw=" ".join(fields),
        )

    def matches(self, value: datetime) -> bool:
        if value.minute not in self.minute.values or value.hour not in self.hour.values:
            return False
        if value.month not in self.month.values:
            return False
        day_match = value.day in self.day.values
        weekday_match = ((value.weekday() + 1) % 7) in self.weekday.values
        if self.day.wildcard:
            calendar_match = weekday_match
        elif self.weekday.wildcard:
            calendar_match = day_match
        else:
            calendar_match = day_match or weekday_match
        return calendar_match

    def next_after(self, value: datetime) -> datetime:
        candidate = value.replace(second=0, microsecond=0) + timedelta(minutes=1)
        # Six years covers the sparsest standard expression, including leap-day schedules.
        for _ in range(6 * 366 * 24 * 60):
            if self.matches(candidate):
                return candidate
            candidate += timedelta(minutes=1)
        raise ValueError("cron 在未来 6 年内没有可执行时间")
