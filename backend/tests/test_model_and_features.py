"""Model bundle, explanations and point-in-time features."""
import math
import re

import numpy as np
import pandas as pd

from app.features import history_features
from app.reasons import verify
from conftest import fresh_alert


def test_bundle_scores_reproduce(client):
    """Scores recomputed by the API equal the scores the Colab notebook saved."""
    m, db = client.app.state.model, client.app.state.db
    with db.read() as conn:
        df = pd.read_sql("SELECT * FROM transactions WHERE source='dataset' ORDER BY RANDOM() LIMIT 300", conn)
    got = m.score_df(m.frame(df.to_dict("records")))
    assert np.allclose(got, df["score"].to_numpy(), atol=1e-9)


def test_forbidden_columns_not_features(client):
    feats = set(client.app.state.model.features)
    assert not feats & {"is_fraud", "fraud_type", "transaction_id", "customer_id", "ts"}


def test_alert_count_matches_notebook_flag(client):
    """API's 'score >= threshold' equals the notebook's stored alert flag for every row."""
    m, db = client.app.state.model, client.app.state.db
    with db.read() as conn:
        df = pd.read_sql("SELECT score, alert FROM transactions WHERE source='dataset'", conn)
    assert ((df.score >= m.threshold).astype(int) == df.alert).all()


def test_every_number_in_explanations_comes_from_data(client):
    m, db = client.app.state.model, client.app.state.db
    with db.read() as conn:
        df = pd.read_sql("SELECT * FROM transactions WHERE alert=1 ORDER BY RANDOM() LIMIT 40", conn)
    for row in df.to_dict("records"):
        e = m.explain(row)
        assert e["numbers_verified"], row["transaction_id"]
        for r in e["reasons"]:
            assert verify(r["text"], r["evidence"], row, m.baseline)
            for ev in r["evidence"]:                      # evidence really is the row / training baseline value
                src = row if ev["source"] == "row" else m.baseline
                if isinstance(ev["value"], str):
                    assert str(src[ev["key"]]) == ev["value"]
                else:
                    assert math.isclose(float(src[ev["key"]]), float(ev["value"]), rel_tol=0, abs_tol=1e-9)


def test_verifier_rejects_invented_numbers(client):
    m = client.app.state.model
    row = {"failed_attempts": 2}
    assert verify("2 failed attempts before this transaction", [{"source": "row", "key": "failed_attempts", "value": 2, "scale": 1}], row, m.baseline)
    assert not verify("5 failed attempts before this transaction", [{"source": "row", "key": "failed_attempts", "value": 2, "scale": 1}], row, m.baseline)
    assert not verify("2 failed attempts, 9x usual", [{"source": "row", "key": "failed_attempts", "value": 2, "scale": 1}], row, m.baseline)
    # evidence that no longer matches the row is rejected too
    assert not verify("2 failed attempts", [{"source": "row", "key": "failed_attempts", "value": 2, "scale": 1}], {"failed_attempts": 3}, m.baseline)


def test_customer_message_has_no_model_internals(client):
    e = client.get(f"/api/alerts/{fresh_alert(client)['transaction_id']}").json()["explanation"]
    msg = e["customer_message"]
    assert msg
    for word in ("score", "shap", "threshold", "probability", "log-odds", "model"):
        assert word not in msg.lower()


def _prior(rows):
    return pd.DataFrame(rows, columns=["ts", "transaction_amount", "city", "country", "device_type", "payment_method", "merchant_category"])


def test_history_features_bruteforce_and_no_future_leak():
    rng = np.random.default_rng(1)
    base = pd.Timestamp("2024-05-01 00:00:00")
    ts = sorted(base + pd.to_timedelta(rng.integers(0, 20 * 86400, 40), unit="s"))
    rows = [[t, float(rng.uniform(5, 500)), rng.choice(["A", "B"]), "IN", rng.choice(["Mobile", "ATM"]), "UPI",
             rng.choice(["Grocery", "Travel"])] for t in ts]
    df = _prior(rows)
    cats = {"city": "C", "country": "IN", "device_type": "Mobile", "payment_method": "UPI", "merchant_category": "Grocery"}
    now = ts[25]
    f = history_features(df, now, 123.0, cats)
    past = df[df.ts < now]
    assert f["cust_prior_txns"] == len(past)
    assert f["cust_txns_24h"] == int((past.ts >= now - pd.Timedelta("24h")).sum())
    assert math.isclose(f["cust_amt_7d"], past[past.ts >= now - pd.Timedelta("7d")].transaction_amount.sum())
    assert math.isclose(f["amt_z_cust"], (123 - past.transaction_amount.mean()) / (past.transaction_amount.std(ddof=1) + 1))
    assert f["new_city_for_cust"] == 1 and f["new_country_for_cust"] == 0
    # adding future rows (and a same-timestamp row) must not change anything
    future = _prior(rows + [[now, 999.0, "Z", "US", "ATM", "Card", "Crypto"], [now + pd.Timedelta("1h"), 5.0, "C", "IN", "Mobile", "UPI", "Grocery"]])
    g = history_features(future, now, 123.0, cats)
    for k in f:
        a, b = f[k], g[k]
        assert (isinstance(a, float) and math.isnan(a) and math.isnan(b)) or a == b, k


def test_cold_start_flags():
    f = history_features(_prior([]), pd.Timestamp("2024-01-01 10:00"), 50.0,
                         {"city": "A", "country": "B", "device_type": "C", "payment_method": "D", "merchant_category": "E"})
    assert f["limited_history"] == 1 and f["unusual_hour_for_cust"] == -1 and f["new_city_for_cust"] == -1
    assert math.isnan(f["amt_vs_cust_mean"])


def test_counterfactual_and_what_changed(client):
    d = client.get(f"/api/alerts/{fresh_alert(client)['transaction_id']}").json()
    cf = d["counterfactual"]
    assert cf["needed"] and cf["changes"]
    if cf["reaches_below_threshold"]:
        assert cf["final_score"] < d["explanation"]["threshold"]
    assert all("not proof of causation" in w["note"] for w in d["what_changed"])
    assert "Not a probability" in d["anomaly_note"]
