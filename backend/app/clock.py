"""Single source of 'now' so tests can move time forward (token expiry, OTP expiry, deadlines)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_offset = timedelta(0)


def now() -> datetime:
    return datetime.now(timezone.utc) + _offset


def iso(dt: datetime | None = None) -> str:
    return (dt or now()).astimezone(timezone.utc).isoformat(timespec="seconds")


def parse(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def advance(**kwargs) -> None:
    """Test helper: move the clock forward, e.g. advance(minutes=31)."""
    global _offset
    _offset += timedelta(**kwargs)


def reset() -> None:
    global _offset
    _offset = timedelta(0)


def add_working_days(start: datetime, days: int) -> datetime:
    """Add working days, skipping Saturday and Sunday (bank holidays are not modelled)."""
    d = start
    added = 0
    while added < days:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def working_days_between(start: datetime, end: datetime) -> int:
    """Number of working days after `start` up to and including `end`."""
    if end <= start:
        return 0
    n, d = 0, start
    while d.date() < end.date():
        d += timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return n
