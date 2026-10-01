"""Business logic: scoring decisions, alerts, 'Was this you?' links, OTPs, freeze, cases, trusted patterns,
simulation. All state changes run inside one atomic SQLite transaction."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import sqlite3
import uuid
from datetime import timedelta

import numpy as np
import pandas as pd

from . import clock, decision, notifier, security
from .config import settings
from .db import Database, rows
from .features import HISTORY_COLUMNS, derived_features, history_features, time_flags
from .model_service import ModelService

log = logging.getLogger("stdetector.workflow")

CASE_TRANSITIONS = {
    "OPEN": {"INVESTIGATING"},
    "INVESTIGATING": {"SHADOW_CREDITED", "RESOLVED_REJECTED"},
    "SHADOW_CREDITED": {"RESOLVED_REFUNDED", "RESOLVED_REJECTED"},
    "RESOLVED_REFUNDED": set(),
    "RESOLVED_REJECTED": set(),
}
FINAL_ALERT = {"CONFIRMED_NOT_ME", "CONFIRMED_LEGIT"}
PROFILE_FIELDS = ["customer_age", "credit_score", "account_age_years", "account_balance",
                  "num_prev_transactions", "transaction_freq_monthly", "time_since_last_txn_hrs"]


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}


class Engine:
    def __init__(self, db: Database, model: ModelService):
        self.db, self.model = db, model
        with db.read() as conn:
            amounts = pd.read_sql("SELECT transaction_amount FROM transactions WHERE source='dataset'", conn)["transaction_amount"]
        q = amounts.quantile([0.10, 0.50, 0.90, 0.95]).to_dict()
        self.amount_quantiles = {"p10": q[0.10], "p50": q[0.50], "p90": q[0.90], "p95": q[0.95]}
        # Default "high expected loss": what a threshold-level probability would lose on a 95th-percentile payment.
        self.el_high = settings.expected_loss_high or float(model.threshold * q[0.95])

    # ------------------------------------------------------------------ reads
    def txn(self, conn: sqlite3.Connection, txn_id: str) -> dict:
        r = conn.execute("SELECT * FROM transactions WHERE transaction_id=?", (txn_id,)).fetchone()
        if not r:
            raise AppError(404, "transaction_not_found", f"No transaction {txn_id}")
        return {k: _py(v) for k, v in dict(r).items()}

    def account(self, conn: sqlite3.Connection, customer_id: str) -> dict:
        r = conn.execute("SELECT * FROM accounts WHERE customer_id=?", (customer_id,)).fetchone()
        return dict(r) if r else {"customer_id": customer_id, "status": "active", "frozen_at": None, "frozen_reason": None}

    def trusted_for(self, conn: sqlite3.Connection, customer_id: str, key: str | None = None) -> list[dict]:
        q = "SELECT * FROM trusted_patterns WHERE customer_id=? AND revoked_at IS NULL AND expires_at>?"
        args: list = [customer_id, clock.iso()]
        if key:
            q += " AND pattern_key=?"
            args.append(key)
        return rows(conn.execute(q + " ORDER BY created_at DESC", args))

    def decide_for(self, conn: sqlite3.Connection, row: dict, score: float) -> dict:
        frozen = self.account(conn, row["customer_id"])["status"] == "frozen"
        trusted = self.trusted_for(conn, row["customer_id"], decision.pattern_key(row))
        return decision.decide(score, float(row["transaction_amount"]), self.model.threshold, self.el_high,
                               frozen=frozen, trusted=trusted[0] if trusted else None)

    def analyse(self, txn_id: str) -> dict:
        """Everything the alert-detail view needs."""
        with self.db.read() as conn:
            row = self.txn(conn, txn_id)
            score = self.model.score(row)
            expl = self.model.explain(row)
            dec = self.decide_for(conn, row, score)
            alert = conn.execute("SELECT * FROM alerts WHERE transaction_id=?", (txn_id,)).fetchone()
            alert = dict(alert) if alert else None
            case = None
            if alert:
                c = conn.execute("SELECT case_id, status FROM cases WHERE alert_id=?", (alert["alert_id"],)).fetchone()
                case = dict(c) if c else None
            notes = rows(conn.execute("SELECT id, sent_at, expires_at, used_at FROM notifications n JOIN alerts a "
                                      "USING(alert_id) WHERE a.transaction_id=? ORDER BY id", (txn_id,)))
            history = self.customer_history(conn, row["customer_id"], until_ts=row["ts"], limit=60)
            account = self.account(conn, row["customer_id"])
        fam_sorted = sorted(expl["families"].items(), key=lambda kv: -kv[1])
        what_changed = [self.model.what_changed(row, fam) for fam, v in fam_sorted[:3] if v > 0]
        return {
            "transaction": _public_txn(row),
            "score": expl["score"], "stored_score": row.get("score"),
            "anomaly_percentile": self.model.anomaly_pct(row),
            "anomaly_note": "Isolation Forest percentile vs training data (100 = most unusual). Not a probability.",
            "decision": dec, "explanation": expl, "what_changed": what_changed,
            "counterfactual": self.model.counterfactual(row),
            "history": history, "account": account, "alert": alert, "case": case, "notifications": notes,
        }

    def customer_history(self, conn, customer_id: str, until_ts: str | None = None, limit: int = 60) -> dict:
        q = ("SELECT transaction_id, ts, transaction_amount, merchant_category, score, alert, source, status "
             "FROM transactions WHERE customer_id=?")
        args: list = [customer_id]
        if until_ts:
            q += " AND ts<=?"
            args.append(until_ts)
        items = rows(conn.execute(q + " ORDER BY ts DESC, rowid DESC LIMIT ?", (*args, limit)))[::-1]
        amts = [r["transaction_amount"] for r in items if r["status"] == "completed"]
        if len(amts) >= 5:
            lo, hi = np.percentile(amts, [10, 90])
            rng = {"low": float(lo), "high": float(hi), "source": "customer", "n": len(amts)}
        else:
            rng = {"low": self.amount_quantiles["p10"], "high": self.amount_quantiles["p90"], "source": "population",
                   "n": len(amts), "note": "fewer than 5 transactions: showing the population's 10th-90th percentile"}
        return {"customer_id": customer_id, "transactions": items, "normal_range": rng}

    # ------------------------------------------------------------------ alerts + notifications
    def _ensure_alert(self, conn, row: dict, score: float, band: str) -> dict:
        now = clock.iso()
        conn.execute("INSERT OR IGNORE INTO alerts(transaction_id, customer_id, score, band, status, created_at, updated_at) "
                     "VALUES (?,?,?,?, 'NEW', ?, ?)", (row["transaction_id"], row["customer_id"], score, band, now, now))
        return dict(conn.execute("SELECT * FROM alerts WHERE transaction_id=?", (row["transaction_id"],)).fetchone())

    def notify(self, txn_id: str) -> dict:
        with self.db.write() as conn:
            return self._notify(conn, self.txn(conn, txn_id))

    def _notify(self, conn, row: dict) -> dict:
        score = self.model.score(row)
        dec = self.decide_for(conn, row, score)
        alert = self._ensure_alert(conn, row, score, dec["band"])
        if alert["status"] in FINAL_ALERT:
            raise AppError(409, "alert_already_resolved", f"Alert is already {alert['status']}")
        token = security.new_link_token()
        sent, exp = clock.now(), clock.now() + timedelta(minutes=settings.token_ttl_min)
        cur = conn.execute("INSERT INTO notifications(alert_id, token_hash, expires_at, sent_at) VALUES (?,?,?,?)",
                           (alert["alert_id"], security.token_hash(token), clock.iso(exp), clock.iso(sent)))
        conn.execute("UPDATE alerts SET status='NOTIFIED', updated_at=? WHERE alert_id=?", (clock.iso(), alert["alert_id"]))
        expl = self.model.explain(row)
        link = f"{settings.public_url}/respond?token={token}"
        body = (
            "[DEMO - synthetic data, simulated bank]\n\n"
            "Was this you?\n\n"
            f"{expl['customer_message'] or 'We noticed an unusual transaction on your account.'}\n\n"
            f"Review it here (link valid for {settings.token_ttl_min} minutes, single use):\n{link}\n\n"
            "- If it was NOT you, choose 'Not me' and we will freeze outgoing payments and open a case.\n"
            "- If it was you, you will be asked for a code sent to your registered phone.\n\n"
            "We will never ask for your PIN, OTP, password or card number by email or on this page.\n"
        )
        amount = f"{float(row['transaction_amount']):,.2f}"
        out = notifier.send_email(conn, row["customer_id"], f"Was this you? Payment of {amount} to {row['merchant_category']}", body)
        return {"alert_id": alert["alert_id"], "notification_id": cur.lastrowid, "status": "NOTIFIED",
                "expires_at": clock.iso(exp), "delivery": out}

    def _token_lookup(self, conn, token: str) -> tuple[dict, dict]:
        if not token or len(token) > 200:
            raise AppError(400, "invalid_token", "This link is not valid.")
        n = conn.execute("SELECT * FROM notifications WHERE token_hash=?", (security.token_hash(token),)).fetchone()
        if not n:
            raise AppError(404, "invalid_token", "This link is not valid.")
        a = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (n["alert_id"],)).fetchone()
        return dict(n), dict(a)

    def respond_info(self, token: str) -> dict:
        """Read-only: what the /respond page shows. Never changes state (email scanners may open links)."""
        with self.db.read() as conn:
            n, a = self._token_lookup(conn, token)
            row = self.txn(conn, a["transaction_id"])
            expired = clock.parse(n["expires_at"]) <= clock.now()
            expl = self.model.explain(row)
            case = conn.execute("SELECT case_id, status FROM cases WHERE alert_id=?", (a["alert_id"],)).fetchone()
        usable = n["used_at"] is None and not expired and a["status"] == "NOTIFIED"
        return {"alert_status": a["status"], "link_usable": usable, "expired": expired, "used": n["used_at"] is not None,
                "expires_at": n["expires_at"], "transaction": {k: row[k] for k in (
                    "transaction_id", "ts", "transaction_amount", "merchant_category", "payment_method", "device_type", "city", "country")},
                "message": expl["customer_message"], "case": dict(case) if case else None,
                "options": ["not_me", "was_me"] if usable else []}

    def _usable(self, n: dict, a: dict) -> None:
        if n["used_at"] is not None:
            raise AppError(409, "link_used", "This link has already been used.")
        if clock.parse(n["expires_at"]) <= clock.now():
            raise AppError(410, "link_expired", "This link has expired. Contact the bank through its official app or number.")
        if a["status"] != "NOTIFIED":
            raise AppError(409, "alert_already_resolved", f"This alert is already {a['status']}.")

    # ------------------------------------------------------------------ "Not me"
    def not_me(self, token: str, meta: str) -> dict:
        with self.db.write() as conn:
            n, a = self._token_lookup(conn, token)
            if n["used_at"] is not None and a["status"] == "CONFIRMED_NOT_ME":
                case = dict(conn.execute("SELECT * FROM cases WHERE alert_id=?", (a["alert_id"],)).fetchone())
                return {"idempotent_replay": True, **self._case_view(conn, case)}
            self._usable(n, a)
            now = clock.now()
            row = self.txn(conn, a["transaction_id"])
            cid = row["customer_id"]
            conn.execute("UPDATE notifications SET used_at=? WHERE id=?", (clock.iso(now), n["id"]))
            conn.execute("UPDATE notifications SET used_at=? WHERE alert_id=? AND used_at IS NULL", (clock.iso(now), a["alert_id"]))
            conn.execute("UPDATE alerts SET status='CONFIRMED_NOT_ME', updated_at=? WHERE alert_id=?", (clock.iso(now), a["alert_id"]))
            conn.execute("INSERT INTO accounts(customer_id, status, frozen_at, frozen_reason, updated_at) VALUES (?, 'frozen', ?, ?, ?) "
                         "ON CONFLICT(customer_id) DO UPDATE SET status='frozen', frozen_at=excluded.frozen_at, "
                         "frozen_reason=excluded.frozen_reason, updated_at=excluded.updated_at",
                         (cid, clock.iso(now), f"customer reported transaction {row['transaction_id']} as not theirs", clock.iso(now)))
            conn.execute("INSERT OR REPLACE INTO feedback(transaction_id, customer_id, response, created_at) VALUES (?,?, 'not_me', ?)",
                         (row["transaction_id"], cid, clock.iso(now)))
            conn.execute("UPDATE trusted_patterns SET revoked_at=? WHERE customer_id=? AND revoked_at IS NULL", (clock.iso(now), cid))

            notified = clock.parse(n["sent_at"])
            wd = clock.working_days_between(notified, now)
            zero = wd <= settings.zero_liability_working_days
            shadow_due = clock.add_working_days(now, settings.shadow_credit_working_days)
            resolution_due = now + timedelta(days=settings.resolution_days)
            cur = conn.execute("INSERT INTO cases(alert_id, customer_id, transaction_id, status, notified_at, reported_at, zero_liability, "
                               "shadow_credit_due, resolution_due, updated_at) VALUES (?,?,?,'OPEN',?,?,?,?,?,?)",
                               (a["alert_id"], cid, row["transaction_id"], n["sent_at"], clock.iso(now), int(zero),
                                clock.iso(shadow_due), clock.iso(resolution_due), clock.iso(now)))
            case_id = cur.lastrowid
            related = rows(conn.execute(
                "SELECT transaction_id, ts, transaction_amount, score FROM transactions WHERE customer_id=? AND transaction_id<>? "
                "AND status='completed' AND ts BETWEEN datetime(?, '-7 days') AND ? AND score>=? ORDER BY ts",
                (cid, row["transaction_id"], row["ts"], row["ts"], 0.5 * self.model.threshold)))
            amt = f"{float(row['transaction_amount']):,.2f}"
            acts = [
                ("REPORTED_BY_CUSTOMER", "customer", f"Customer chose 'Not me' for {row['transaction_id']}. {meta}"),
                ("ACCOUNT_FROZEN", "system", "Outgoing payments blocked (simulated). Incoming payments still allowed."),
                ("SESSIONS_REVOKED", "system", "All sessions and registered devices signed out (simulated)."),
                ("CREDENTIAL_RESET_REQUIRED", "system", "PIN / password reset required before unfreezing (simulated)."),
                ("DISPUTED_TXN_HOLD", "system", f"Hold / recall requested for {row['transaction_id']}, amount {amt} (simulated)."),
                ("TRUSTED_PATTERNS_REVOKED", "system", "Any trusted patterns for this customer were revoked."),
                ("RELATED_TXNS_FOR_REVIEW", "system", f"{len(related)} other transaction(s) in the 7 days before with score >= half the "
                                                      f"alert threshold: {', '.join(r['transaction_id'] for r in related) or 'none'}."),
                ("LIABILITY_ASSESSED", "system", f"Reported {wd} working day(s) after the bank's alert: "
                                                 + ("within 3 working days -> zero customer liability (RBI framework)." if zero
                                                    else "after 3 working days -> liability per bank policy (RBI framework).")),
            ]
            for action, actor, note in acts:
                self._act(conn, case_id, action, actor, note)
            out = notifier.send_email(conn, cid, f"Case #{case_id} opened: your account is frozen (simulated)",
                                      "[DEMO - synthetic data, simulated bank]\n\n"
                                      f"Thank you. We opened case #{case_id} for the payment of {amt} on {row['ts']}.\n"
                                      "Outgoing payments are frozen (simulated). To unfreeze, use the code sent to your registered phone.\n"
                                      f"Target for a provisional (shadow) credit: {shadow_due.date()} (10 working days).\n"
                                      f"Target for resolution: {resolution_due.date()} (90 days).\n")
            self._act(conn, case_id, "CUSTOMER_NOTIFIED", "system", f"Case confirmation sent ({out['delivery']}).")
            case = dict(conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone())
            return {"idempotent_replay": False, **self._case_view(conn, case)}

    # ------------------------------------------------------------------ "Yes, it was me" (needs OTP)
    def was_me_start(self, token: str) -> dict:
        with self.db.write() as conn:
            n, a = self._token_lookup(conn, token)
            self._usable(n, a)
            return self._send_otp(conn, a["customer_id"], "confirm_legit", a["alert_id"],
                                  "Code to confirm the payment was yours")

    def was_me_confirm(self, token: str, otp: str) -> dict:
        with self.db.write() as conn:
            n, a = self._token_lookup(conn, token)
            self._usable(n, a)
            ok = self._check_otp(conn, a["customer_id"], "confirm_legit", otp, a["alert_id"])
            if not ok["valid"]:
                return {"confirmed": False, **ok}
            now = clock.iso()
            row = self.txn(conn, a["transaction_id"])
            conn.execute("UPDATE notifications SET used_at=? WHERE alert_id=? AND used_at IS NULL", (now, a["alert_id"]))
            conn.execute("UPDATE alerts SET status='CONFIRMED_LEGIT', updated_at=? WHERE alert_id=?", (now, a["alert_id"]))
            conn.execute("INSERT OR REPLACE INTO feedback(transaction_id, customer_id, response, created_at) VALUES (?,?, 'was_me', ?)",
                         (row["transaction_id"], row["customer_id"], now))
            key, desc = decision.pattern_key(row), decision.pattern_description(row)
            exp = clock.iso(clock.now() + timedelta(days=settings.trusted_pattern_days))
            conn.execute("UPDATE trusted_patterns SET revoked_at=? WHERE customer_id=? AND pattern_key=? AND revoked_at IS NULL",
                         (now, row["customer_id"], key))
            conn.execute("INSERT INTO trusted_patterns(customer_id, pattern_key, description, source_alert_id, created_at, expires_at) "
                         "VALUES (?,?,?,?,?,?)", (row["customer_id"], key, desc, a["alert_id"], now, exp))
            return {"confirmed": True, "alert_status": "CONFIRMED_LEGIT",
                    "trusted_pattern": {"pattern_key": key, "description": desc, "expires_at": exp,
                                        "effect": "Similar payments get one level less friction until expiry. BLOCK is never lowered."}}

    # ------------------------------------------------------------------ unfreeze (customer, needs OTP)
    def unfreeze_start(self, customer_id: str) -> dict:
        with self.db.write() as conn:
            if self.account(conn, customer_id)["status"] != "frozen":
                raise AppError(409, "not_frozen", "Account is not frozen.")
            return self._send_otp(conn, customer_id, "unfreeze", None, "Code to unfreeze your account")

    def unfreeze_confirm(self, customer_id: str, otp: str, meta: str) -> dict:
        with self.db.write() as conn:
            if self.account(conn, customer_id)["status"] != "frozen":
                raise AppError(409, "not_frozen", "Account is not frozen.")
            ok = self._check_otp(conn, customer_id, "unfreeze", otp, None)
            if not ok["valid"]:
                return {"unfrozen": False, **ok}
            now = clock.iso()
            conn.execute("UPDATE accounts SET status='active', updated_at=? WHERE customer_id=?", (now, customer_id))
            for c in rows(conn.execute("SELECT case_id FROM cases WHERE customer_id=? AND status NOT LIKE 'RESOLVED%'", (customer_id,))):
                self._act(conn, c["case_id"], "ACCOUNT_UNFROZEN", "customer", f"Unfrozen after OTP verification. {meta}")
            return {"unfrozen": True, "account": self.account(conn, customer_id)}

    def _send_otp(self, conn, customer_id: str, purpose: str, alert_id: int | None, text: str) -> dict:
        now = clock.now()
        recent = conn.execute("SELECT COUNT(*) FROM otps WHERE customer_id=? AND purpose=? AND created_at>?",
                              (customer_id, purpose, clock.iso(now - timedelta(minutes=15)))).fetchone()[0]
        if recent >= 5:
            raise AppError(429, "otp_limit", "Too many codes requested. Try again later.")
        conn.execute("UPDATE otps SET used_at=? WHERE customer_id=? AND purpose=? AND used_at IS NULL", (clock.iso(now), customer_id, purpose))
        code = security.new_otp()
        exp = now + timedelta(minutes=settings.otp_ttl_min)
        conn.execute("INSERT INTO otps(customer_id, purpose, alert_id, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)",
                     (customer_id, purpose, alert_id, security.otp_hash(code, f"{customer_id}:{purpose}"), clock.iso(exp), clock.iso(now)))
        out = notifier.send_sms(conn, customer_id, f"[DEMO] {text}: {code}. Valid {settings.otp_ttl_min} min. "
                                                   "Never share this code. The bank will never ask for it.")
        return {"otp_sent": True, "channel": "sms", "to": out["recipient"], "expires_at": clock.iso(exp)}

    def _check_otp(self, conn, customer_id: str, purpose: str, code: str, alert_id: int | None) -> dict:
        o = conn.execute("SELECT * FROM otps WHERE customer_id=? AND purpose=? AND used_at IS NULL ORDER BY id DESC LIMIT 1",
                         (customer_id, purpose)).fetchone()
        if not o:
            raise AppError(400, "no_active_code", "Request a new code first.")
        if alert_id is not None and o["alert_id"] != alert_id:
            raise AppError(400, "no_active_code", "Request a new code for this alert.")
        if clock.parse(o["expires_at"]) <= clock.now():
            raise AppError(410, "code_expired", "The code has expired. Request a new one.")
        if o["attempts"] >= settings.otp_max_attempts:
            raise AppError(429, "code_locked", "Too many wrong attempts. Request a new code.")
        if not (isinstance(code, str) and code.isdigit() and len(code) == 6) or \
                not security.otp_matches(code, f"{customer_id}:{purpose}", o["code_hash"]):
            conn.execute("UPDATE otps SET attempts=attempts+1 WHERE id=?", (o["id"],))
            left = settings.otp_max_attempts - o["attempts"] - 1
            return {"valid": False, "error": "wrong_code", "attempts_left": max(left, 0)}
        conn.execute("UPDATE otps SET used_at=? WHERE id=?", (clock.iso(), o["id"]))
        return {"valid": True}

    # ------------------------------------------------------------------ trusted patterns
    def revoke_trusted(self, customer_id: str, pattern_id: int) -> dict:
        with self.db.write() as conn:
            cur = conn.execute("UPDATE trusted_patterns SET revoked_at=? WHERE id=? AND customer_id=? AND revoked_at IS NULL",
                               (clock.iso(), pattern_id, customer_id))
            if cur.rowcount == 0:
                raise AppError(404, "pattern_not_found", "No active trusted pattern with that id.")
            return {"revoked": True, "id": pattern_id}

    # ------------------------------------------------------------------ cases (bank ops)
    def _act(self, conn, case_id: int, action: str, actor: str, note: str) -> None:
        conn.execute("INSERT INTO case_actions(case_id, action, actor, note, created_at) VALUES (?,?,?,?,?)",
                     (case_id, action, actor, note, clock.iso()))

    def _case_view(self, conn, case: dict) -> dict:
        now = clock.now()
        open_ = not case["status"].startswith("RESOLVED")
        shadow_due, res_due = clock.parse(case["shadow_credit_due"]), clock.parse(case["resolution_due"])
        sla = {
            "zero_liability": bool(case["zero_liability"]),
            "shadow_credit_due": case["shadow_credit_due"],
            "shadow_credit_overdue": open_ and case["status"] in ("OPEN", "INVESTIGATING") and now > shadow_due,
            "hours_to_shadow_credit_due": round((shadow_due - now).total_seconds() / 3600, 1),
            "resolution_due": case["resolution_due"],
            "resolution_overdue": open_ and now > res_due,
            "days_to_resolution_due": round((res_due - now).total_seconds() / 86400, 1),
            "basis": "Modelled on the RBI framework for unauthorised electronic banking transactions; weekends skipped, bank holidays not modelled.",
        }
        acts = rows(conn.execute("SELECT action, actor, note, created_at FROM case_actions WHERE case_id=? ORDER BY id", (case["case_id"],)))
        txn = conn.execute("SELECT transaction_id, ts, transaction_amount, merchant_category, score FROM transactions WHERE transaction_id=?",
                           (case["transaction_id"],)).fetchone()
        return {"case": case, "sla": sla, "actions": acts, "transaction": dict(txn) if txn else None,
                "account": self.account(conn, case["customer_id"]),
                "allowed_transitions": sorted(CASE_TRANSITIONS[case["status"]]), "simulated": True}

    def get_case(self, case_id: int) -> dict:
        with self.db.read() as conn:
            c = conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()
            if not c:
                raise AppError(404, "case_not_found", f"No case {case_id}")
            return self._case_view(conn, dict(c))

    def list_cases(self, status: str | None, page: int, size: int) -> dict:
        with self.db.read() as conn:
            where, args = ("WHERE status=?", [status]) if status else ("", [])
            total = conn.execute(f"SELECT COUNT(*) FROM cases {where}", args).fetchone()[0]
            items = rows(conn.execute(f"SELECT * FROM cases {where} ORDER BY case_id DESC LIMIT ? OFFSET ?", (*args, size, (page - 1) * size)))
            out = []
            for c in items:
                v = self._case_view(conn, c)
                out.append({**c, "sla": v["sla"], "account_status": v["account"]["status"]})
        return {"total": total, "page": page, "size": size, "items": out}

    def transition(self, case_id: int, to: str, note: str) -> dict:
        with self.db.write() as conn:
            c = conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()
            if not c:
                raise AppError(404, "case_not_found", f"No case {case_id}")
            if to not in CASE_TRANSITIONS[c["status"]]:
                raise AppError(409, "invalid_transition", f"Cannot move a case from {c['status']} to {to}.",
                               {"allowed": sorted(CASE_TRANSITIONS[c["status"]])})
            if to.startswith("RESOLVED") and not note.strip():
                raise AppError(422, "note_required", "A resolution note is required.")
            conn.execute("UPDATE cases SET status=?, updated_at=?, resolution=COALESCE(?, resolution) WHERE case_id=?",
                         (to, clock.iso(), note if to.startswith("RESOLVED") else None, case_id))
            self._act(conn, case_id, f"STATUS_{c['status']}_TO_{to}", "bank_ops", note or "")
            if to == "SHADOW_CREDITED":
                self._act(conn, case_id, "SHADOW_CREDIT_ISSUED", "bank_ops", "Provisional credit of the disputed amount (simulated).")
            return self._case_view(conn, dict(conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()))

    def add_note(self, case_id: int, note: str) -> dict:
        with self.db.write() as conn:
            if not conn.execute("SELECT 1 FROM cases WHERE case_id=?", (case_id,)).fetchone():
                raise AppError(404, "case_not_found", f"No case {case_id}")
            self._act(conn, case_id, "NOTE", "bank_ops", note)
            return self._case_view(conn, dict(conn.execute("SELECT * FROM cases WHERE case_id=?", (case_id,)).fetchone()))

    # ------------------------------------------------------------------ simulation
    def customer_profile(self, conn, customer_id: str) -> dict | None:
        r = conn.execute(f"SELECT {', '.join(PROFILE_FIELDS)}, ts FROM transactions WHERE customer_id=? AND status='completed' "
                         "ORDER BY ts DESC, rowid DESC LIMIT 1", (customer_id,)).fetchone()
        return {k: _py(v) for k, v in dict(r).items()} if r else None

    def build_row(self, conn, p: dict) -> dict:
        cid = p["customer_id"]
        profile = self.customer_profile(conn, cid)
        base = self.model.baseline
        if profile is None:
            profile = {k: base[k] for k in PROFILE_FIELDS}
            profile["ts"] = None
        ts = pd.Timestamp(p["timestamp"]) if p.get("timestamp") else (
            pd.Timestamp(profile["ts"]) + pd.Timedelta(hours=1) if profile["ts"] else pd.Timestamp("2024-12-31 12:00:00"))
        ts = ts.floor("s")
        row = {"transaction_id": p.get("transaction_id") or f"SIM{uuid.uuid4().hex[:12].upper()}", "customer_id": cid,
               "ts": ts.strftime("%Y-%m-%d %H:%M:%S")}
        for k in ("country", "city", "merchant_category", "payment_method", "device_type"):
            row[k] = p[k]
        for k in ("transaction_amount", "distance_from_home_km"):
            row[k] = float(p[k])
        for k in ("is_international", "failed_attempts", "pin_changed_recently"):
            row[k] = int(p[k])
        for k in ("customer_age", "credit_score", "account_age_years", "account_balance", "transaction_freq_monthly"):
            row[k] = float(p[k]) if p.get(k) is not None else profile[k]
        row["num_prev_transactions"] = (profile["num_prev_transactions"] or 0) + 1
        prior = pd.read_sql(f"SELECT {', '.join(HISTORY_COLUMNS)} FROM transactions WHERE customer_id=? AND status='completed' AND ts<?",
                            conn, params=(cid, row["ts"]))
        row["time_since_last_txn_hrs"] = (
            (ts - pd.to_datetime(prior["ts"]).max()).total_seconds() / 3600 if len(prior) else profile["time_since_last_txn_hrs"])
        row.update(time_flags(ts))
        row.update(derived_features(row))
        row.update(history_features(prior, ts, row["transaction_amount"], row))
        return row

    def simulate(self, p: dict, commit: bool) -> dict:
        ctx = self.db.write() if commit else self.db.read()
        with ctx as conn:
            if commit and conn.execute("SELECT 1 FROM transactions WHERE transaction_id=?", (p.get("transaction_id"),)).fetchone():
                raise AppError(409, "duplicate_transaction_id", "transaction_id already exists")
            row = self.build_row(conn, p)
            score = self.model.score(row)
            anomaly = self.model.anomaly_pct(row)
            dec = self.decide_for(conn, row, score)
            expl = self.model.explain(row)
            result = {"mode": "completed" if commit else "pending", "transaction": _public_txn(row), "score": round(score, 6),
                      "anomaly_percentile": anomaly, "decision": dec, "explanation": expl,
                      "counterfactual": self.model.counterfactual(row),
                      "features_used": {f: _py(row.get(f)) for f in self.model.features},
                      "note": ("Pending: nothing was stored and history features are unchanged." if not commit else
                               "Completed: stored as a simulated transaction; later history features include it.")}
            if not commit:
                return result
            status = "blocked" if dec["band"] == "BLOCK" and dec["account_frozen"] else "completed"
            db_row = {**{k: v for k, v in row.items()}, "score": score, "alert": int(score >= self.model.threshold),
                      "anomaly_pct": anomaly, "is_fraud": None, "fraud_type": None, "source": "simulated", "status": status}
            cols = [r[1] for r in conn.execute("PRAGMA table_info(transactions)").fetchall()]
            vals = [_sqlval(db_row.get(c)) for c in cols]
            conn.execute(f"INSERT INTO transactions({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", vals)
            result["stored_status"] = status
            if dec["band"] in ("HOLD", "BLOCK") and not dec["account_frozen"]:
                result["notification"] = self._notify(conn, row)
            elif dec["band"] == "STEP_UP":
                result["step_up"] = self._send_otp(conn, row["customer_id"], "confirm_legit", None,
                                                   "Code to approve your payment (step-up, simulated)")
            return result

    # ------------------------------------------------------------------ idempotency for POST endpoints
    def idempotent(self, key: str | None, endpoint: str, payload: dict, fn):
        if not key:
            return fn()
        if len(key) > 100:
            raise AppError(400, "bad_idempotency_key", "Idempotency-Key is too long")
        h = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
        with self.db.read() as conn:
            r = conn.execute("SELECT request_hash, response FROM idempotency WHERE key=? AND endpoint=?", (key, endpoint)).fetchone()
        if r:
            if r["request_hash"] != h:
                raise AppError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request.")
            return {**json.loads(r["response"]), "idempotent_replay": True}
        res = fn()
        with self.db.write() as conn:
            conn.execute("INSERT OR IGNORE INTO idempotency(key, endpoint, request_hash, response, created_at) VALUES (?,?,?,?,?)",
                         (key, endpoint, h, json.dumps(res, default=str), clock.iso()))
        return res


def _py(v):
    if isinstance(v, (np.floating,)):
        v = float(v)
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    return v


def _sqlval(v):
    v = _py(v)
    if isinstance(v, (bool, np.bool_)):
        return int(v)
    return v


def _public_txn(row: dict) -> dict:
    """Transaction fields for the API. The synthetic label is exposed separately and only for evaluation."""
    hide = {"is_fraud", "fraud_type"}
    return {k: _py(v) for k, v in row.items() if k not in hide}
