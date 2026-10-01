"""Model health: monthly alert rate / mean score and population stability (PSI) of key features.

Reference = the first full month of the demo period (the bundle does not contain the training rows), so PSI answers
'has the input mix shifted since the start of the monitored period?'.
PSI rule of thumb: < 0.10 stable, 0.10-0.25 moderate shift, > 0.25 large shift.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .db import Database

_cache: dict = {}


def _psi(ref: np.ndarray, cur: np.ndarray) -> float:
    eps = 1e-4
    ref, cur = np.clip(ref, eps, None), np.clip(cur, eps, None)
    return float(np.sum((cur - ref) * np.log(cur / ref)))


def _dist_numeric(ref: pd.Series, cur: pd.Series, bins: int = 10) -> tuple[np.ndarray, np.ndarray]:
    edges = np.unique(np.quantile(ref.dropna(), np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        edges = np.unique(np.concatenate([edges, [edges[0] - 1, edges[-1] + 1]]))
    edges[0], edges[-1] = -np.inf, np.inf
    r = np.histogram(ref.dropna(), edges)[0] / max(ref.notna().sum(), 1)
    c = np.histogram(cur.dropna(), edges)[0] / max(cur.notna().sum(), 1)
    return r, c


def _dist_cat(ref: pd.Series, cur: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    cats = sorted(set(ref.astype(str)) | set(cur.astype(str)))
    r = ref.astype(str).value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy()
    c = cur.astype(str).value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy()
    return r, c


def compute(db: Database, features: list[str], cats: list[str], threshold: float, top_features: list[str]) -> dict:
    with db.read() as conn:
        n = conn.execute("SELECT COUNT(*) FROM transactions WHERE source='dataset'").fetchone()[0]
        if _cache.get("n") == n:
            return _cache["result"]
        cols = sorted(set(["ts", "score", "alert", "is_fraud"] + top_features))
        df = pd.read_sql(f"SELECT {', '.join(cols)} FROM transactions WHERE source='dataset'", conn)
    df["month"] = pd.to_datetime(df["ts"]).dt.to_period("M").astype(str)
    monthly = df.groupby("month").agg(transactions=("score", "size"), alert_rate=("alert", "mean"),
                                      mean_score=("score", "mean"), label_rate=("is_fraud", "mean")).reset_index()
    months = monthly["month"].tolist()
    # Reference = first month with at least half the median monthly volume (a partial first month is too small).
    big = monthly[monthly["transactions"] >= 0.5 * monthly["transactions"].median()]["month"].tolist()
    ref_month = big[0] if big else months[0]
    ref = df[df["month"] == ref_month]
    psi_rows = []
    for m in months[months.index(ref_month) + 1:]:
        if m not in big:
            continue
        cur = df[df["month"] == m]
        entry = {"month": m}
        for f in top_features:
            r, c = (_dist_cat if f in cats else _dist_numeric)(ref[f], cur[f])
            entry[f] = round(_psi(r, c), 4)
        entry["max_psi"] = max(entry[f] for f in top_features)
        psi_rows.append(entry)
    worst = max(psi_rows, key=lambda e: e["max_psi"]) if psi_rows else None
    status = "stable" if not worst or worst["max_psi"] < 0.10 else "moderate_shift" if worst["max_psi"] < 0.25 else "large_shift"
    result = {
        "reference_month": ref_month, "threshold": threshold,
        "skipped_small_months": [m for m in months if m not in big],
        "monthly": monthly.round(5).to_dict("records"),
        "psi": psi_rows, "features_monitored": top_features, "status": status,
        "notes": ["label_rate is the synthetic dataset label, shown for evaluation only.",
                  "PSI < 0.10 stable, 0.10-0.25 moderate shift, > 0.25 large shift (rule of thumb)."],
    }
    _cache.update(n=n, result=result)
    return result
