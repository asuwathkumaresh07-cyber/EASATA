"""Point-in-time per-customer history features for ONE new transaction.

Definitions match the training notebook (section 6) exactly: only transactions strictly earlier than the
new transaction's timestamp are used, so a pending transaction never sees itself or anything later.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

CATEGORY_NEW_FLAGS = ("city", "country", "device_type", "payment_method", "merchant_category")
HISTORY_COLUMNS = ["ts", "transaction_amount", *CATEGORY_NEW_FLAGS]
WINDOWS = (("1h", 3600), ("24h", 86400), ("7d", 7 * 86400))


def hour_band(hour: int) -> int:
    """0 night (00-05), 1 morning (06-11), 2 afternoon (12-17), 3 evening (18-23)."""
    return 0 if hour < 6 else 1 if hour < 12 else 2 if hour < 18 else 3


BAND_NAMES = {0: "night (00:00-05:59)", 1: "morning (06:00-11:59)", 2: "afternoon (12:00-17:59)", 3: "evening (18:00-23:59)"}


def history_features(prior: pd.DataFrame, ts: pd.Timestamp, amount: float, cats: dict) -> dict:
    """prior: this customer's completed transactions (any order, may include later ones - they are ignored)."""
    ts = pd.Timestamp(ts)
    if len(prior):
        prior = prior.assign(ts=pd.to_datetime(prior["ts"]))
        prior = prior[prior["ts"] < ts]
    n = int(len(prior))
    f: dict = {"cust_prior_txns": n}
    amts = prior["transaction_amount"].astype(float).to_numpy() if n else np.array([])
    mean = float(amts.mean()) if n else math.nan

    f["amt_vs_cust_mean"] = amount / (mean + 1) if n else math.nan
    for name, secs in WINDOWS:
        m = (prior["ts"] >= ts - pd.Timedelta(seconds=secs)).to_numpy() if n else np.array([], dtype=bool)
        f[f"cust_txns_{name}"] = int(m.sum())
        f[f"cust_amt_{name}"] = float(amts[m].sum()) if n else 0.0
    f["hrs_since_cust_prev"] = (ts - prior["ts"].max()).total_seconds() / 3600 if n else math.nan

    if n:
        hours = prior["ts"].dt.hour.to_numpy()
        bands = np.array([hour_band(h) for h in hours])
        band_share = float((bands == hour_band(ts.hour)).mean())
        day_share = float((prior["ts"].dt.dayofweek.to_numpy() == ts.dayofweek).mean())
        night_share = float((hours < 6).mean())
    else:
        band_share = day_share = night_share = math.nan
    enough = n >= 5
    f["hour_band_share_cust"] = band_share
    f["unusual_hour_for_cust"] = int(band_share < 0.10) if enough else -1
    f["night_share_cust"] = night_share
    f["weekday_share_cust"] = day_share
    f["unusual_day_for_cust"] = int(day_share < 0.05) if enough else -1

    if n >= 2:
        std = float(amts.std(ddof=1))
        f["amt_z_cust"] = (amount - mean) / (std + 1)
    else:
        f["amt_z_cust"] = math.nan

    for c in CATEGORY_NEW_FLAGS:
        if n:
            f[f"new_{c}_for_cust"] = int(str(cats[c]) not in set(prior[c].astype(str)))
        else:
            f[f"new_{c}_for_cust"] = -1
    f["limited_history"] = int(n < 3)
    return f


def derived_features(row: dict) -> dict:
    """Dataset-level derived columns (same as notebook section 6)."""
    amt = float(row["transaction_amount"])
    out = {"log_amount": math.log1p(max(amt, 0.0))}
    out["amount_to_balance"] = amt / (abs(float(row["account_balance"])) + 1)
    return out


def time_flags(ts: pd.Timestamp) -> dict:
    """Same definitions as the dataset: night = 22:00-06:59, weekend = Sat/Sun."""
    h = ts.hour
    return {"hour_of_day": h, "is_weekend": int(ts.dayofweek >= 5), "is_night_transaction": int(h <= 6 or h >= 22)}
