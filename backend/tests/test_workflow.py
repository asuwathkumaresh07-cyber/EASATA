"""'Was this you?' links, freeze, cases, OTP, trusted patterns, adaptive friction, security properties."""
import re

import pytest

from app import clock, decision
from app.security import limiter
from conftest import OPS, fresh_alert, latest_otp, notify_and_get_token, table_counts


def test_ops_endpoints_need_key(client):
    txn = fresh_alert(client)["transaction_id"]
    assert client.post(f"/api/ops/alerts/{txn}/notify").status_code == 401
    assert client.post(f"/api/ops/alerts/{txn}/notify", headers={"X-Ops-Key": "wrong"}).status_code == 401
    assert client.get("/api/ops/cases").json()["error"]["code"] == "ops_key_required"


def test_token_never_stored_in_plaintext(client):
    txn = fresh_alert(client)["transaction_id"]
    token = notify_and_get_token(client, txn)
    with client.app.state.db.read() as conn:
        dump = "\n".join(str(tuple(r)) for t in ("notifications", "alerts", "otps", "cases", "case_actions")
                         for r in conn.execute(f"SELECT * FROM {t}"))
    assert token not in dump


def test_respond_info_is_read_only(client):
    """Email link scanners open links: viewing must never change state."""
    token = notify_and_get_token(client, fresh_alert(client)["transaction_id"])
    before = table_counts(client)
    for _ in range(3):
        r = client.post("/api/respond/info", json={"token": token})
        assert r.status_code == 200 and r.json()["link_usable"]
    assert table_counts(client) == before
    assert r.headers["cache-control"] == "no-store" and r.headers["referrer-policy"] == "no-referrer"


def test_not_me_freezes_opens_case_and_is_idempotent(client):
    a = fresh_alert(client)
    token = notify_and_get_token(client, a["transaction_id"])
    r1 = client.post("/api/respond/not-me", json={"token": token}).json()
    assert r1["idempotent_replay"] is False and r1["case"]["status"] == "OPEN"
    assert r1["account"]["status"] == "frozen"
    assert r1["sla"]["zero_liability"] is True
    actions = [x["action"] for x in r1["actions"]]
    for needed in ("ACCOUNT_FROZEN", "SESSIONS_REVOKED", "DISPUTED_TXN_HOLD", "LIABILITY_ASSESSED", "CUSTOMER_NOTIFIED"):
        assert needed in actions
    r2 = client.post("/api/respond/not-me", json={"token": token}).json()        # double click
    assert r2["idempotent_replay"] is True and r2["case"]["case_id"] == r1["case"]["case_id"]
    with client.app.state.db.read() as conn:
        assert conn.execute("SELECT COUNT(*) FROM cases WHERE transaction_id=?", (a["transaction_id"],)).fetchone()[0] == 1
    # other actions on the same link are refused
    assert client.post("/api/respond/was-me/start", json={"token": token}).status_code == 409


def test_frozen_account_blocks_new_payments(client):
    a = fresh_alert(client)
    token = notify_and_get_token(client, a["transaction_id"])
    client.post("/api/respond/not-me", json={"token": token})
    p = client.get(f"/api/simulate/presets?customer_id={a['customer_id']}").json()["presets"]["typical"]
    r = client.post("/api/simulate", json=p).json()
    assert r["decision"]["band"] == "BLOCK" and r["decision"]["account_frozen"]


def test_expired_link_rejected(client):
    token = notify_and_get_token(client, fresh_alert(client)["transaction_id"])
    clock.advance(minutes=31)
    r = client.post("/api/respond/not-me", json={"token": token})
    assert r.status_code == 410 and r.json()["error"]["code"] == "link_expired"
    assert client.post("/api/respond/info", json={"token": token}).json()["expired"] is True


def test_invalid_token(client):
    r = client.post("/api/respond/not-me", json={"token": "x" * 43})
    assert r.status_code == 404 and r.json()["error"]["code"] == "invalid_token"


def test_was_me_needs_otp_then_creates_trusted_pattern(client):
    a = fresh_alert(client)
    token = notify_and_get_token(client, a["transaction_id"])
    start = client.post("/api/respond/was-me/start", json={"token": token}).json()
    assert start["otp_sent"] and start["to"].startswith("******")
    otp = latest_otp(client, a["customer_id"])
    wrong = "000000" if otp != "000000" else "999999"
    bad = client.post("/api/respond/was-me/confirm", json={"token": token, "otp": wrong}).json()
    assert bad["confirmed"] is False and bad["error"] == "wrong_code" and bad["attempts_left"] == 4
    ok = client.post("/api/respond/was-me/confirm", json={"token": token, "otp": otp}).json()
    assert ok["confirmed"] and ok["trusted_pattern"]["pattern_key"]
    cust = client.get(f"/api/customers/{a['customer_id']}").json()
    assert cust["account"]["status"] == "active" and len(cust["trusted_patterns"]) == 1
    assert cust["feedback"][0]["response"] == "was_me"
    # link is spent now
    assert client.post("/api/respond/not-me", json={"token": token}).status_code == 409


def test_otp_locks_after_max_attempts(client):
    a = fresh_alert(client)
    token = notify_and_get_token(client, a["transaction_id"])
    client.post("/api/respond/was-me/start", json={"token": token})
    real = latest_otp(client, a["customer_id"])
    wrong = "111111" if real != "111111" else "222222"
    for _ in range(5):
        client.post("/api/respond/was-me/confirm", json={"token": token, "otp": wrong})
    r = client.post("/api/respond/was-me/confirm", json={"token": token, "otp": real})
    assert r.status_code == 429 and r.json()["error"]["code"] == "code_locked"


def test_otp_expires(client):
    a = fresh_alert(client)
    token = notify_and_get_token(client, a["transaction_id"])
    client.post("/api/respond/was-me/start", json={"token": token})
    otp = latest_otp(client, a["customer_id"])
    clock.advance(minutes=6)
    r = client.post("/api/respond/was-me/confirm", json={"token": token, "otp": otp})
    assert r.status_code == 410 and r.json()["error"]["code"] == "code_expired"


def test_unfreeze_requires_customer_otp(client):
    a = fresh_alert(client)
    token = notify_and_get_token(client, a["transaction_id"])
    client.post("/api/respond/not-me", json={"token": token})
    cid = a["customer_id"]
    assert client.post(f"/api/customers/{cid}/unfreeze/confirm", json={"otp": "123456"}).status_code == 400  # no code requested
    client.post(f"/api/customers/{cid}/unfreeze/start")
    otp = latest_otp(client, cid)
    r = client.post(f"/api/customers/{cid}/unfreeze/confirm", json={"otp": otp}).json()
    assert r["unfrozen"] and r["account"]["status"] == "active"


def test_case_transitions(client):
    token = notify_and_get_token(client, fresh_alert(client)["transaction_id"])
    case_id = client.post("/api/respond/not-me", json={"token": token}).json()["case"]["case_id"]
    bad = client.post(f"/api/ops/cases/{case_id}/transition", json={"to": "RESOLVED_REFUNDED"}, headers=OPS)
    assert bad.status_code == 409 and bad.json()["error"]["allowed"] == ["INVESTIGATING"]
    for step in ("INVESTIGATING", "SHADOW_CREDITED"):
        assert client.post(f"/api/ops/cases/{case_id}/transition", json={"to": step, "note": "ok"}, headers=OPS).status_code == 200
    assert client.post(f"/api/ops/cases/{case_id}/transition", json={"to": "RESOLVED_REFUNDED"}, headers=OPS).status_code == 422
    done = client.post(f"/api/ops/cases/{case_id}/transition", json={"to": "RESOLVED_REFUNDED", "note": "refunded"}, headers=OPS).json()
    assert done["case"]["status"] == "RESOLVED_REFUNDED" and done["allowed_transitions"] == []
    assert "SHADOW_CREDIT_ISSUED" in [x["action"] for x in done["actions"]]


def test_case_actions_are_append_only(client):
    with client.app.state.db.read() as conn:
        if conn.execute("SELECT COUNT(*) FROM case_actions").fetchone()[0] == 0:
            pytest.skip("no actions yet")
        with pytest.raises(Exception, match="append-only"):
            conn.execute("UPDATE case_actions SET note='x'")
        with pytest.raises(Exception, match="append-only"):
            conn.execute("DELETE FROM case_actions")


def test_working_day_deadlines():
    from datetime import datetime, timezone
    fri = datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc)          # Friday
    assert clock.add_working_days(fri, 3).date().isoformat() == "2026-10-07"   # Wednesday
    assert clock.working_days_between(fri, datetime(2026, 10, 5, 9, 0, tzinfo=timezone.utc)) == 1   # Monday


def test_decision_bands():
    t, el = 0.1, 100.0
    assert decision.decide(0.01, 50, t, el)["band"] == "PROCEED"
    assert decision.decide(0.07, 50, t, el)["band"] == "STEP_UP"
    assert decision.decide(0.07, 5000, t, el)["band"] == "HOLD"          # expected loss raises one level
    assert decision.decide(0.15, 50, t, el)["band"] == "HOLD"
    assert decision.decide(0.25, 50, t, el)["band"] == "BLOCK"
    trusted = {"description": "x"}
    assert decision.decide(0.15, 50, t, el, trusted=trusted)["band"] == "STEP_UP"   # lowered by one
    assert decision.decide(0.25, 50, t, el, trusted=trusted)["band"] == "BLOCK"     # BLOCK never lowered
    assert decision.decide(0.01, 50, t, el, frozen=True)["band"] == "BLOCK"


def test_trusted_pattern_lowers_friction_end_to_end(client):
    a = fresh_alert(client, band="HOLD")
    before = client.get(f"/api/transactions/{a['transaction_id']}").json()["decision"]
    assert before["band"] == "HOLD" and not before["trusted_pattern_applied"]
    token = notify_and_get_token(client, a["transaction_id"])
    client.post("/api/respond/was-me/start", json={"token": token})
    client.post("/api/respond/was-me/confirm", json={"token": token, "otp": latest_otp(client, a["customer_id"])})
    after = client.get(f"/api/transactions/{a['transaction_id']}").json()["decision"]
    assert after["model_band"] == "HOLD" and after["band"] == "STEP_UP" and after["trusted_pattern_applied"]
    # revoking the pattern restores the original friction
    pid = client.get(f"/api/customers/{a['customer_id']}").json()["trusted_patterns"][0]["id"]
    assert client.delete(f"/api/customers/{a['customer_id']}/trusted-patterns/{pid}").json()["revoked"]
    assert client.get(f"/api/transactions/{a['transaction_id']}").json()["decision"]["band"] == "HOLD"
    # an expired pattern no longer applies
    token2_alert = fresh_alert(client, band="HOLD")
    tok = notify_and_get_token(client, token2_alert["transaction_id"])
    client.post("/api/respond/was-me/start", json={"token": tok})
    client.post("/api/respond/was-me/confirm", json={"token": tok, "otp": latest_otp(client, token2_alert["customer_id"])})
    clock.advance(days=15)
    assert client.get(f"/api/transactions/{token2_alert['transaction_id']}").json()["decision"]["band"] == "HOLD"


def test_pending_simulation_writes_nothing(client):
    a = fresh_alert(client)
    p = client.get(f"/api/simulate/presets?customer_id={a['customer_id']}").json()["presets"]["account_takeover_like"]
    before = table_counts(client)
    r = client.post("/api/simulate", json=p).json()
    assert r["mode"] == "pending" and "decision" in r and r["explanation"]["numbers_verified"]
    assert table_counts(client) == before


def test_completed_simulation_runs_workflow_and_updates_history(client):
    a = fresh_alert(client)
    presets = client.get(f"/api/simulate/presets?customer_id={a['customer_id']}").json()["presets"]
    p = presets["account_takeover_like"]
    pending = client.post("/api/simulate", json=p).json()
    done = client.post("/api/simulate?commit=true", json=p).json()
    assert done["mode"] == "completed" and done["stored_status"] == "completed"
    assert done["score"] == pending["score"]                  # same features before it is stored
    if done["decision"]["band"] in ("HOLD", "BLOCK"):
        assert done["notification"]["status"] == "NOTIFIED"
    # the stored transaction is now history for the next one (1 hour later)
    nxt = dict(p, timestamp=(__import__("pandas").Timestamp(p["timestamp"]) + __import__("pandas").Timedelta("1h")).strftime("%Y-%m-%d %H:%M:%S"))
    after = client.post("/api/simulate", json=nxt).json()["features_used"]
    assert after["cust_txns_1h"] >= 1


def test_idempotency_key(client):
    a = fresh_alert(client)
    p = client.get(f"/api/simulate/presets?customer_id={a['customer_id']}").json()["presets"]["typical"]
    h = {"Idempotency-Key": f"k-{a['transaction_id']}"}
    r1 = client.post("/api/simulate?commit=true", json=p, headers=h).json()
    r2 = client.post("/api/simulate?commit=true", json=p, headers=h).json()
    assert r2["idempotent_replay"] and r1["transaction"]["transaction_id"] == r2["transaction"]["transaction_id"]
    with client.app.state.db.read() as conn:
        assert conn.execute("SELECT COUNT(*) FROM transactions WHERE transaction_id=?", (r1["transaction"]["transaction_id"],)).fetchone()[0] == 1
    other = dict(p, transaction_amount=p["transaction_amount"] + 1)
    assert client.post("/api/simulate?commit=true", json=other, headers=h).status_code == 422


def test_validation_errors_are_structured(client):
    r = client.post("/api/simulate", json={"customer_id": "X", "transaction_amount": -5})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    a = fresh_alert(client)
    p = client.get(f"/api/simulate/presets?customer_id={a['customer_id']}").json()["presets"]["typical"]
    r = client.post("/api/simulate", json=dict(p, merchant_category="Casino"))
    assert r.status_code == 422 and "merchant_category" in r.json()["error"]["allowed"]


def test_rate_limit(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "rate_limit_per_min", 3)
    limiter.reset()
    codes = [client.post("/api/respond/info", json={"token": "y" * 43}).status_code for _ in range(5)]
    limiter.reset()
    assert codes[:3] == [404, 404, 404] and codes[3] == 429


def test_feedback_export_and_dashboards(client):
    csv = client.get("/api/ops/feedback.csv", headers=OPS)
    assert csv.status_code == 200 and csv.text.splitlines()[0].startswith("transaction_id,customer_id,response")
    assert len(csv.text.splitlines()) > 1
    o = client.get("/api/overview").json()
    assert sum(o["bands"].values()) == o["transactions"]
    mon = client.get("/api/monitoring").json()
    assert mon["monthly"] and mon["status"] in ("stable", "moderate_shift", "large_shift")
    r1 = client.get("/api/replay?limit=5").json()
    r2 = client.get(f"/api/replay?cursor={r1['next_cursor']}&limit=5").json()
    assert r1["items"][-1]["ts"] <= r2["items"][0]["ts"]
    assert client.get("/api/evaluation").json()["evaluation"]["catboost"]["avg_precision"] > 0
    q = client.get("/api/alerts?size=20").json()["items"]
    el = [i["expected_loss"] for i in q]
    assert el == sorted(el, reverse=True)
