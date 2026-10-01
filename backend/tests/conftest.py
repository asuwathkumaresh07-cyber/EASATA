import os
import re
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="stdetector-test-")
os.environ.update({
    "DB_PATH": str(Path(_TMP) / "test.db"),
    "DEMO_MAX_ROWS": "8000",
    "SMTP_ENABLED": "0",
    "OPS_API_KEY": "test-ops-key",
    "RATE_LIMIT_PER_MIN": "1000",
    "PUBLIC_URL": "http://frontend.test",
})
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import clock  # noqa: E402
from app.main import app  # noqa: E402

OPS = {"X-Ops-Key": "test-ops-key"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_clock():
    clock.reset()
    yield
    clock.reset()


_used: set[str] = set()


def fresh_alert(c, band: str | None = None) -> dict:
    """A flagged dataset transaction whose alert is untouched and whose customer is not frozen/used yet."""
    page = 1
    while True:
        items = c.get(f"/api/alerts?status=NEW&sort=score&size=200&page={page}").json()["items"]
        assert items, "ran out of fresh alerts"
        for it in items:
            if it["transaction_id"] in _used or it["customer_id"] in _used or it["account_status"] != "active" or it["source"] != "dataset":
                continue
            if band and it["band"] != band:
                continue
            _used.update({it["transaction_id"], it["customer_id"]})
            return it
        page += 1


def notify_and_get_token(c, txn_id: str) -> str:
    r = c.post(f"/api/ops/alerts/{txn_id}/notify", headers=OPS)
    assert r.status_code == 200, r.text
    inbox = c.get("/api/demo/inbox?channel=email&limit=5").json()["items"]
    body = next(m["body"] for m in inbox if "Was this you?" in (m["subject"] or ""))
    return re.search(r"token=([A-Za-z0-9_\-]+)", body).group(1)


def latest_otp(c, customer_id: str) -> str:
    sms = c.get(f"/api/demo/inbox?channel=sms&customer_id={customer_id}&limit=1").json()["items"][0]
    return re.search(r": (\d{6})\.", sms["body"]).group(1)


def table_counts(c) -> dict:
    db = c.app.state.db
    with db.read() as conn:
        return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in
                ("transactions", "alerts", "notifications", "otps", "accounts", "cases", "case_actions",
                 "feedback", "trusted_patterns", "outbox", "idempotency")}
