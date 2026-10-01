"""Secrets, token/OTP hashing, ops-key check and a small in-memory rate limiter."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request

from .config import settings

_pepper: bytes | None = None


def pepper() -> bytes:
    """Server-side secret mixed into OTP hashes, so a leaked DB cannot be brute-forced offline
    (a 6-digit code has only 1,000,000 values)."""
    global _pepper
    if _pepper is None:
        f = settings.db_path.parent / "server_secret.key"
        f.parent.mkdir(parents=True, exist_ok=True)
        if not f.exists():
            f.write_bytes(secrets.token_bytes(32))
        _pepper = f.read_bytes()
    return _pepper


def new_link_token() -> str:
    return secrets.token_urlsafe(32)  # 256 bits


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_otp() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def otp_hash(code: str, otp_scope: str) -> str:
    return hmac.new(pepper(), f"{otp_scope}:{code}".encode(), hashlib.sha256).hexdigest()


def otp_matches(code: str, otp_scope: str, stored: str) -> bool:
    return hmac.compare_digest(otp_hash(code, otp_scope), stored)


def require_ops_key(x_ops_key: str | None = Header(default=None, alias="X-Ops-Key")) -> str:
    expected = settings.resolve_ops_key()
    if not x_ops_key or not hmac.compare_digest(x_ops_key, expected):
        raise HTTPException(status_code=401, detail={"code": "ops_key_required",
                                                     "message": "Bank-operations endpoint: send a valid X-Ops-Key header."})
    return "bank_ops"


class RateLimiter:
    """Sliding one-minute window per (client IP, bucket). Enough for a single-process demo server."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, request: Request, bucket: str, limit: int | None = None) -> None:
        limit = limit or settings.rate_limit_per_min
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            q = self._hits[(ip, bucket)]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(status_code=429, detail={"code": "rate_limited",
                                                             "message": "Too many requests. Try again in a minute."})
            q.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def request_meta(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    ua = (request.headers.get("user-agent") or "")[:120]
    return f"request metadata: ip={ip}; user-agent={ua} (metadata only; does not identify a person)"
