"""Request bodies (validated by FastAPI/Pydantic; errors come back as 422 with details)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SimulateRequest(BaseModel):
    customer_id: str = Field(..., min_length=1, max_length=40, examples=["CUST00001496"])
    transaction_amount: float = Field(..., gt=0, le=10_000_000, examples=[4250.0])
    merchant_category: str = Field(..., examples=["Crypto Exchange"])
    payment_method: str = Field(..., examples=["Mobile Payment"])
    device_type: str = Field(..., examples=["Mobile"])
    country: str = Field(..., examples=["India"])
    city: str = Field(..., examples=["Mumbai"])
    distance_from_home_km: float = Field(0, ge=0, le=25_000)
    is_international: int = Field(0, ge=0, le=1)
    failed_attempts: int = Field(0, ge=0, le=20)
    pin_changed_recently: int = Field(0, ge=0, le=1)
    timestamp: str | None = Field(None, description="'YYYY-MM-DD HH:MM:SS'. Default: 1 hour after the customer's latest transaction.",
                                  examples=["2024-12-20 02:14:00"])
    customer_age: float | None = Field(None, ge=16, le=120, description="Default: from the customer's profile")
    credit_score: float | None = Field(None, ge=300, le=900)
    account_age_years: float | None = Field(None, ge=0, le=100)
    account_balance: float | None = Field(None, ge=0)
    transaction_freq_monthly: float | None = Field(None, ge=0, le=1000)
    transaction_id: str | None = Field(None, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")


class TokenBody(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)


class TokenOtpBody(TokenBody):
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class OtpBody(BaseModel):
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TransitionBody(BaseModel):
    to: Literal["INVESTIGATING", "SHADOW_CREDITED", "RESOLVED_REFUNDED", "RESOLVED_REJECTED"]
    note: str = Field("", max_length=2000)


class NoteBody(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)
