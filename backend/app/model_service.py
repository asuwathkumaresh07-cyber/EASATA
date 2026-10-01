"""Loads the Colab model bundle and provides scoring, anomaly percentile, SHAP explanations,
'What changed?' and a minimal counterfactual."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import catboost
import joblib
import numpy as np
import pandas as pd
import sklearn
from catboost import CatBoostClassifier, Pool

from . import reasons as R

log = logging.getLogger("stdetector.model")

# Features a person could plausibly change for a single payment (used by the counterfactual).
TRANSACTION_CONTEXT = {
    "failed_attempts", "pin_changed_recently", "is_international", "is_night_transaction", "hour_of_day",
    "is_weekend", "distance_from_home_km", "merchant_category", "payment_method", "device_type", "country", "city",
    "transaction_amount", "log_amount", "amount_to_balance", "time_since_last_txn_hrs",
}


class BundleError(RuntimeError):
    pass


class ModelService:
    def __init__(self, bundle_dir: Path):
        bundle_dir = Path(bundle_dir)
        need = ["config.json", "catboost_model.cbm", "calibrator.json", "iforest.joblib",
                "iforest_quantiles.json", "evaluation.json", "demo_transactions.csv.gz"]
        missing = [f for f in need if not (bundle_dir / f).exists()]
        if missing:
            raise BundleError(f"model bundle at {bundle_dir} is missing: {missing}. Unzip model_bundle.zip there.")
        self.dir = bundle_dir
        self.cfg = json.loads((bundle_dir / "config.json").read_text())
        self.features: list[str] = self.cfg["features"]
        self.cats: list[str] = self.cfg["cat_features"]
        self.nums: list[str] = self.cfg["num_features"]
        self.family: dict[str, str] = self.cfg["family"]
        self.baseline: dict = self.cfg["baseline"]
        # The threshold is itself one of the isotonic output values, and CSV round-trips can shave ~1e-16 off
        # stored scores. Comparing against (threshold - 1e-9) keeps "score >= threshold" identical to training.
        self.threshold: float = float(self.cfg["threshold"]) - 1e-9
        self.if_fill: dict = self.cfg["if_fill"]
        self.evaluation = json.loads((bundle_dir / "evaluation.json").read_text())

        self.warnings: list[str] = []
        v = self.cfg.get("versions", {})
        if v.get("catboost") and v["catboost"] != catboost.__version__:
            self.warnings.append(f"catboost {catboost.__version__} installed, bundle trained with {v['catboost']}")
        if v.get("scikit_learn") and v["scikit_learn"] != sklearn.__version__:
            self.warnings.append(f"scikit-learn {sklearn.__version__} installed, bundle trained with {v['scikit_learn']} "
                                 "(Isolation Forest pickle may not load; install the same version)")
        for w in self.warnings:
            log.warning(w)

        self.model = CatBoostClassifier()
        self.model.load_model(str(bundle_dir / "catboost_model.cbm"))
        cal = json.loads((bundle_dir / "calibrator.json").read_text())
        self.cal_x, self.cal_y = np.asarray(cal["x"], float), np.asarray(cal["y"], float)
        try:
            self.iforest = joblib.load(bundle_dir / "iforest.joblib")
        except Exception as e:  # version mismatch etc.
            raise BundleError(f"could not load iforest.joblib ({e}). Install scikit-learn=={v.get('scikit_learn')}") from e
        self.if_q = np.asarray(json.loads((bundle_dir / "iforest_quantiles.json").read_text())["quantiles"], float)
        leak = {"is_fraud", "fraud_type", "transaction_id", "customer_id"} & set(self.features)
        if leak:
            raise BundleError(f"bundle uses forbidden feature columns: {leak}")

    # ---------- core ----------
    def frame(self, rows: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame([{f: r.get(f) for f in self.features} for r in rows], columns=self.features)
        for c in self.nums:
            df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
        for c in self.cats:
            df[c] = df[c].astype(str)
        return df

    def _pool(self, df: pd.DataFrame) -> Pool:
        return Pool(df[self.features], cat_features=self.cats)

    def calibrate(self, p: np.ndarray) -> np.ndarray:
        return np.interp(p, self.cal_x, self.cal_y)

    def score_df(self, df: pd.DataFrame) -> np.ndarray:
        return self.calibrate(self.model.predict_proba(self._pool(df))[:, 1])

    def score(self, row: dict) -> float:
        return float(self.score_df(self.frame([row]))[0])

    def anomaly_pct(self, row: dict) -> float:
        df = self.frame([row])
        X = df[self.nums].astype(float).fillna(self.if_fill).to_numpy()
        return float(min(np.searchsorted(self.if_q, -self.iforest.score_samples(X)[0]) / 10.0, 100.0))

    def shap_full(self, row: dict) -> np.ndarray:
        return self.model.get_feature_importance(self._pool(self.frame([row])), type="ShapValues")[0]

    def shap(self, row: dict) -> np.ndarray:
        return self.shap_full(row)[:-1]

    # ---------- explanations ----------
    def explain(self, row: dict, top: int = 5) -> dict:
        x = {**row}
        full = self.shap_full(x)
        sv, base_value = full[:-1], float(full[-1])
        order = np.argsort(-np.abs(sv))
        reasons, dropped = [], 0
        for i in order:
            if sv[i] <= 0 or len(reasons) >= top:
                continue
            f = self.features[i]
            built = R.reason_for(f, x, self.baseline)
            if not built:
                continue
            text, evidence = built
            if not R.verify(text, evidence, x, self.baseline):
                dropped += 1
                continue
            reasons.append({"feature": f, "family": self.family.get(f, "profile"), "shap": round(float(sv[i]), 4),
                            "value": _jsonable(x.get(f)), "text": text, "evidence": evidence})
        fam = pd.Series(sv, index=self.features).groupby(self.family).sum().sort_values(ascending=False)
        score = self.score(x)
        summary = ("Flagged for review" if score >= self.threshold else "Not flagged") + \
                  (". Main factors: " + "; ".join(r["text"] for r in reasons[:3]) + "." if reasons else ". No factor raised the score.")
        limited = int(x.get("limited_history") or 0) == 1
        if limited:
            summary += " Limited history for this customer: comparisons with their usual behaviour are less reliable."
        cust = R.customer_message(x, reasons, self.baseline)
        cust_ok = R.verify(cust["text"], cust["evidence"], x, self.baseline)
        return {
            "score": round(score, 6),
            "flagged": score >= self.threshold,
            "threshold": self.threshold,
            "shap_units": "log-odds (before calibration)",
            "shap_base_value": round(base_value, 4),
            "reasons": reasons,
            "families": {k: round(float(v), 4) for k, v in fam.items()},
            "shap_top": [{"feature": self.features[i], "family": self.family.get(self.features[i], "profile"),
                          "shap": round(float(sv[i]), 4), "value": _jsonable(x.get(self.features[i]))} for i in order[:12]],
            "summary": summary,
            "limited_history": limited,
            "customer_message": cust["text"] if cust_ok else None,
            "numbers_verified": dropped == 0 and cust_ok,
            "unverified_reasons_dropped": dropped,
        }

    def what_changed(self, row: dict, family: str) -> dict:
        """Replace one reason family with training-baseline values and re-score."""
        feats = [f for f in self.features if self.family.get(f) == family]
        hyp = {**row, **{f: self.baseline[f] for f in feats}}
        return {"family": family, "features_replaced": feats, "original_score": round(self.score(row), 6),
                "hypothetical_score": round(self.score(hyp), 6),
                "note": "Model behaviour under a hypothetical change. This is not proof of causation."}

    def counterfactual(self, row: dict, max_steps: int = 6) -> dict:
        """Greedy: reset the most score-raising transaction-context features to typical values, one at a time,
        until the score falls below the alert threshold."""
        start = self.score(row)
        if start < self.threshold:
            return {"needed": False, "original_score": round(start, 6), "changes": [], "final_score": round(start, 6)}
        sv = self.shap(row)
        cand = [i for i in np.argsort(-sv) if sv[i] > 0 and self.features[i] in TRANSACTION_CONTEXT]
        cur, changes, score = {**row}, [], start
        for i in cand[:max_steps]:
            f = self.features[i]
            if str(cur.get(f)) == str(self.baseline[f]):
                continue
            changes.append({"feature": f, "from": _jsonable(cur.get(f)), "to": _jsonable(self.baseline[f])})
            cur[f] = self.baseline[f]
            if f == "transaction_amount":
                cur["log_amount"] = float(np.log1p(max(float(self.baseline[f]), 0)))
            score = self.score(cur)
            if score < self.threshold:
                break
        return {"needed": True, "original_score": round(start, 6), "changes": changes, "final_score": round(score, 6),
                "reaches_below_threshold": score < self.threshold,
                "note": "Hypothetical: the smallest set of typical values (found greedily) that brings the score "
                        "below the alert threshold. Not proof of causation."}


def _jsonable(v):
    if v is None:
        return None
    if isinstance(v, (np.floating, float)):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.integer):
        return int(v)
    return v
