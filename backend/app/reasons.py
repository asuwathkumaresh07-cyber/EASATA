"""Plain-English reasons built from templates + an automatic check that every number shown comes from data.

Each reason carries `evidence`: the exact row/baseline values its text uses. `verify()` re-reads those values
from the transaction row and the training baseline and checks every number in the text against them.
An explanation that fails verification is not shown (the API returns verified=false and drops the reason).
"""
from __future__ import annotations

import math
import re
from typing import Any

from .features import BAND_NAMES, hour_band

# Features a customer may see in an email. Model internals (scores, SHAP, thresholds) never go to customers.
CUSTOMER_SAFE = {
    "failed_attempts", "pin_changed_recently", "is_international", "is_night_transaction", "hour_of_day",
    "distance_from_home_km", "merchant_category", "device_type", "payment_method",
    "new_city_for_cust", "new_country_for_cust", "new_device_type_for_cust", "new_payment_method_for_cust",
    "new_merchant_category_for_cust", "unusual_hour_for_cust", "unusual_day_for_cust", "amt_vs_cust_mean",
    "cust_txns_1h", "cust_txns_24h",
}
SKIP = {"log_amount", "limited_history"}  # duplicates / meta, never a reason on their own


def _num(v: float, d: int = 2) -> str:
    return f"{v:,.{d}f}"


def _ev(source: str, key: str, value: Any, scale: int = 1) -> dict:
    return {"source": source, "key": key, "value": value, "scale": scale}


def _isnan(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


def reason_for(f: str, x: dict, base: dict) -> tuple[str, list[dict]] | None:
    """Return (text, evidence) or None when the evidence does not support mentioning this feature."""
    v = x.get(f)
    if f in SKIP or _isnan(v):
        return None
    R, B = (lambda k: _ev("row", k, x[k])), (lambda k: _ev("baseline", k, base[k]))
    if f == "failed_attempts":
        return (f"{int(v)} failed attempts before this transaction", [R(f)]) if v >= 1 else None
    if f == "pin_changed_recently":
        return ("PIN was changed recently", []) if v == 1 else None
    if f == "is_international":
        return ("international transaction", []) if v == 1 else None
    if f == "is_night_transaction":
        return ("made at night (22:00-06:59)", []) if v == 1 else None
    if f == "is_weekend":
        return ("made on a weekend", []) if v == 1 else None
    if f == "hour_of_day":
        return f"made at hour {int(v)} of the day (typical {int(base[f])})", [R(f), B(f)]
    if f == "unusual_hour_for_cust":
        if v != 1:
            return None
        s = x["hour_band_share_cust"]
        return (f"unusual time for this customer: {s * 100:.0f}% of their earlier transactions were in the "
                f"{BAND_NAMES[hour_band(int(x['hour_of_day']))]} band", [_ev("row", "hour_band_share_cust", s, 100)])
    if f == "hour_band_share_cust":
        return f"{v * 100:.0f}% of this customer's earlier transactions were at this time of day", [_ev("row", f, v, 100)]
    if f == "unusual_day_for_cust":
        if v != 1:
            return None
        s = x["weekday_share_cust"]
        return f"unusual day for this customer: {s * 100:.0f}% of their earlier transactions were on this weekday", [_ev("row", "weekday_share_cust", s, 100)]
    if f == "weekday_share_cust":
        return f"{v * 100:.0f}% of this customer's earlier transactions were on this weekday", [_ev("row", f, v, 100)]
    if f == "night_share_cust":
        if x.get("is_night_transaction") != 1:
            return None
        return f"night-time transaction; {v * 100:.0f}% of this customer's earlier transactions were at night", [_ev("row", f, v, 100)]
    if f == "amt_vs_cust_mean":
        return f"amount is {v:.1f}x this customer's usual amount", [R(f)]
    if f == "amt_z_cust":
        return f"amount is {v:.1f} standard deviations from this customer's usual amount", [R(f)]
    if f.startswith("new_") and f.endswith("_for_cust"):
        return (f"first transaction with this {f[4:-9].replace('_', ' ')} for this customer", []) if v == 1 else None
    if f.startswith("cust_txns_"):
        return f"{int(v)} earlier transactions by this customer in the past {f.split('_')[-1]}", [R(f)]
    if f.startswith("cust_amt_"):
        return f"{_num(v)} spent by this customer in the past {f.split('_')[-1]}", [R(f)]
    if f == "cust_prior_txns":
        return f"{int(v)} earlier transactions by this customer in this dataset", [R(f)]
    if f == "hrs_since_cust_prev":
        return f"{v:.2f} hours since this customer's previous transaction", [R(f)]
    if f == "time_since_last_txn_hrs":
        return f"{v:.2f} hours since the previous transaction (typical {base[f]:.2f})", [R(f), B(f)]
    if f == "distance_from_home_km":
        return f"{_num(v, 0)} km from home (typical {_num(base[f], 0)} km)", [R(f), B(f)]
    if f == "transaction_amount":
        return f"amount {_num(v)} (typical {_num(base[f])})", [R(f), B(f)]
    if f == "amount_to_balance":
        return f"amount is {v * 100:.1f}% of the account balance (typical {base[f] * 100:.1f}%)", [_ev("row", f, v, 100), _ev("baseline", f, base[f], 100)]
    if f == "account_balance":
        return f"account balance {_num(v)} (typical {_num(base[f])})", [R(f), B(f)]
    if f == "credit_score":
        return f"credit score {int(v)} (typical {int(base[f])})", [R(f), B(f)]
    if f == "customer_age":
        return f"customer age {int(v)}", [R(f)]
    if f == "account_age_years":
        return f"account age {v:.1f} years (typical {base[f]:.1f})", [R(f), B(f)]
    if f == "num_prev_transactions":
        return f"{int(v)} previous transactions on record (typical {int(base[f])})", [R(f), B(f)]
    if f == "transaction_freq_monthly":
        return f"{int(v)} transactions per month (typical {int(base[f])})", [R(f), B(f)]
    if f in ("merchant_category", "payment_method", "device_type", "country", "city"):
        label = f.replace("_", " ")
        return f"{label}: {v}", [_ev("row", f, str(v))]
    return f"{f.replace('_', ' ')} = {v}", [R(f)]


_NUM = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?")


def verify(text: str, evidence: list[dict], row: dict, base: dict) -> bool:
    """True when (1) every evidence value equals the current row/baseline value and (2) every number
    in the text matches one evidence value at the precision it is displayed with."""
    nums: list[float] = []
    for e in evidence:
        src = row if e["source"] == "row" else base
        actual = src.get(e["key"])
        if isinstance(e["value"], str):
            if str(actual) != e["value"]:
                return False
            text = text.replace(e["value"], " ")          # text evidence (e.g. a city) may contain digits
            continue
        if _isnan(actual) or abs(float(actual) - float(e["value"])) > 1e-9:
            return False
        nums.append(float(e["value"]) * e["scale"])
    # fixed, template-owned numbers (time-of-day band names, 22:00-06:59, 24h/1h/7d windows)
    text = re.sub(r"\d{2}:\d{2}-\d{2}:\d{2}", " ", text)
    text = re.sub(r"past (1h|24h|7d)", " ", text)
    for tok in _NUM.findall(text):
        t = float(tok.replace(",", ""))
        dec = len(tok.split(".")[1]) if "." in tok else 0
        tol = 0.5 * 10 ** (-dec) + 1e-9
        if not any(abs(t - n) <= tol or abs(t - math.trunc(n)) < 1e-9 for n in nums):
            return False
    return True


def _unusual_for_customer(f: str, row: dict, base: dict) -> bool:
    """Customers only see facts that are unusual on their face (a model may still weigh ordinary values)."""
    v = row.get(f)
    if f in ("merchant_category", "device_type", "payment_method", "hour_of_day"):
        return False
    if f == "distance_from_home_km":
        return v is not None and v >= 2 * max(float(base[f]), 1.0)
    if f == "amt_vs_cust_mean":
        return v is not None and v >= 2
    if f in ("cust_txns_1h", "cust_txns_24h"):
        return v is not None and v >= 3
    return True  # binary flags and "unusual hour/day" reasons only exist when they are set


def customer_message(row: dict, reasons: list[dict], base: dict) -> dict:
    """Short, customer-safe description: transaction facts + the customer-safe reasons. No scores."""
    facts = (f"A {row['payment_method']} payment of {_num(float(row['transaction_amount']))} to a "
             f"{row['merchant_category']} merchant on {row['ts']} ({row['city']}, {row['country']}) from a {row['device_type']} device.")
    ev = [_ev("row", "payment_method", str(row["payment_method"])), _ev("row", "merchant_category", str(row["merchant_category"])),
          _ev("row", "ts", str(row["ts"])), _ev("row", "city", str(row["city"])), _ev("row", "country", str(row["country"])),
          _ev("row", "device_type", str(row["device_type"])), _ev("row", "transaction_amount", float(row["transaction_amount"]))]
    noticed = [r for r in reasons if r["feature"] in CUSTOMER_SAFE and _unusual_for_customer(r["feature"], row, base)][:3]
    text = facts + (" We noticed: " + "; ".join(r["text"] for r in noticed) + "." if noticed else "")
    for r in noticed:
        ev += r["evidence"]
    return {"text": text, "evidence": ev}
