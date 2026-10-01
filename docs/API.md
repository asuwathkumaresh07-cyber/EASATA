# API reference (for the frontend)

Base URL: `http://localhost:8000`. Interactive docs with live "Try it out": **`http://localhost:8000/docs`**.
All responses are JSON unless noted. All outcomes are **simulated**; data is **synthetic**.

## Conventions

| Topic | Rule |
|---|---|
| Errors | Always `{"error": {"code": "...", "message": "...", ...extra}}`. Show `message` to users; branch on `code`. |
| Validation | `422` with `error.code = "validation_error"` and `error.details = [{field, message}]`. Unknown category values return `error.code = "unknown_category"` and `error.allowed` (the valid values). |
| Paging | `?page=1&size=50` → `{total, page, size, items}` |
| Bank-ops auth | `/api/ops/*` needs header `X-Ops-Key: <key>` (from `OPS_API_KEY` or `backend/data/ops_api_key.txt`). Missing/wrong → `401 ops_key_required`. |
| Customer auth | `/api/respond/*` uses the single-use link token from the email (send it in the JSON **body**, never in a URL query). "It was me" and unfreeze also need a 6-digit OTP. |
| Idempotency | `POST /api/simulate?commit=true` accepts `Idempotency-Key: <uuid>`. Replays return the first result with `idempotent_replay: true`. |
| Tracing | Every response has `X-Request-ID` (send your own to correlate). |
| CORS | Allowed origins from `CORS_ORIGINS` (default `http://localhost:5173`). |
| Rate limits | `429 rate_limited` on `/api/respond/*`, unfreeze and simulate when abused. |
| Units | `score` = calibrated probability (0–1). `anomaly_percentile` = 0–100, **not a probability**. SHAP values are **log-odds**. |

Bands (adaptive friction): `PROCEED` → `STEP_UP` (OTP) → `HOLD` ("Was this you?") → `BLOCK`.
Colour suggestion: green / amber / orange / red.

---

## Pages → endpoints

| Page | Calls |
|---|---|
| Global banner / settings | `GET /api/meta` (disclaimer, threshold, bands, form options) |
| Overview | `GET /api/overview`, `GET /api/monitoring` |
| Transactions | `GET /api/transactions?customer_id=&alert=&min_score=&merchant_category=&source=&date_from=&date_to=&sort=-ts&page=&size=` |
| Alerts queue | `GET /api/alerts?status=ALL|NEW|NOTIFIED|CONFIRMED_NOT_ME|CONFIRMED_LEGIT&sort=expected_loss|score|ts|amount` |
| Alert detail | `GET /api/alerts/{transaction_id}` + button `POST /api/ops/alerts/{transaction_id}/notify` (ops key) |
| Customer | `GET /api/customers/{customer_id}`; revoke pattern `DELETE /api/customers/{id}/trusted-patterns/{pattern_id}` |
| Simulate | `GET /api/simulate/presets?customer_id=` → edit → `POST /api/simulate` (pending) or `POST /api/simulate?commit=true` |
| Replay | `GET /api/replay?cursor=0&limit=50` then keep passing `next_cursor` (poll with `setInterval`; speed = interval) |
| Customer inbox (demo) | `GET /api/demo/inbox?channel=email|sms&customer_id=` |
| `/respond?token=...` page | `POST /api/respond/info` → buttons → `POST /api/respond/not-me` or `was-me/start` + `was-me/confirm` |
| Unfreeze | `POST /api/customers/{id}/unfreeze/start` → `POST /api/customers/{id}/unfreeze/confirm {otp}` |
| Cases (bank ops) | `GET /api/ops/cases?status=`, `GET /api/ops/cases/{id}`, `POST .../transition`, `POST .../notes`, `GET /api/ops/audit` |
| Evaluation | `GET /api/evaluation` |
| Retraining export | `GET /api/ops/feedback.csv` (ops key, CSV download) |

---

## System

### `GET /api/health`
```json
{"status": "ok", "transactions": 150000, "model_loaded": true, "warnings": [], "time": "2026-09-29T06:47:01+00:00"}
```
`warnings` lists library-version mismatches with the bundle. Show them if non-empty.

### `GET /api/meta`
Keys: `disclaimer, dataset, threshold, threshold_mode, expected_loss_high, bands, band_labels, families, features, versions, split, options, amount_quantiles, token_ttl_min, otp_ttl_min, demo_mode, warnings`.
`options` holds the allowed values for `country, city, merchant_category, payment_method, device_type` (use for form dropdowns).

---

## Dashboard

### `GET /api/overview`
```json
{
  "disclaimer": "Synthetic data. ...",
  "transactions": 150000, "period": ["2024-03-31 12:41:00", "2024-12-30 23:58:00"],
  "alerts": 21283, "alerts_per_1000": 141.89,
  "bands": {"PROCEED": 97996, "STEP_UP": 29502, "HOLD": 20366, "BLOCK": 2136},
  "expected_loss_flagged_total": 123456.78,
  "synthetic_label_rate": 0.0549,
  "workflow": {"alerts_by_status": {"NOTIFIED": 1}, "frozen_accounts": 0, "cases_by_status": {"OPEN": 1},
               "feedback": {"not_me": 1, "was_me": 1}, "active_trusted_patterns": 1, "simulated_transactions": 0},
  "model": {"test_avg_precision": 0.1213, "test_precision": 0.136, "test_recall": 0.3511}
}
```

### `GET /api/alerts`
Review queue, default sort **expected loss = score × amount** (costliest first).
```json
{"total": 21283, "page": 1, "size": 1, "sort": "expected_loss", "items": [{
  "transaction_id": "TXN0000122174", "customer_id": "CUST00155309", "ts": "2024-05-20 13:55:00",
  "transaction_amount": 15474.76, "merchant_category": "Jewelry", "payment_method": "Debit Card", "device_type": "Desktop",
  "country": "Germany", "city": "Mumbai", "score": 0.2536, "anomaly_pct": 100.0, "source": "dataset",
  "expected_loss": 3924.76, "alert_status": "NEW", "alert_id": null, "account_status": "active", "band": "BLOCK"}]}
```

### `GET /api/alerts/{transaction_id}` (alert detail: the main screen)
Top-level keys: `transaction, score, stored_score, anomaly_percentile, anomaly_note, decision, explanation, what_changed, counterfactual, history, account, alert, case, notifications`.

```json
"decision": {"band": "BLOCK", "level": 3, "label": "Block, ask the customer and open a review (simulated)",
  "actions": ["block_payment", "send_was_this_you_email", "priority_review"], "model_band": "BLOCK",
  "expected_loss": 3924.76, "expected_loss_high": 90.31, "trusted_pattern_applied": false, "account_frozen": false,
  "notes": ["probability 0.254 vs alert threshold 0.110 gives BLOCK"], "simulated": true}
```
Render `decision.notes` as "why this band" bullet points.

```json
"explanation": {
  "score": 0.253623, "flagged": true, "threshold": 0.1099,
  "shap_units": "log-odds (before calibration)", "shap_base_value": -3.1,
  "summary": "Flagged for review. Main factors: 2 failed attempts before this transaction; merchant category: Jewelry; amount is 317.0% of the account balance (typical 1.0%).",
  "reasons": [{"feature": "failed_attempts", "family": "security", "shap": 1.2749, "value": 2,
               "text": "2 failed attempts before this transaction",
               "evidence": [{"source": "row", "key": "failed_attempts", "value": 2, "scale": 1}]}],
  "families": {"security": 1.2567, "amount": 0.6805, "profile": 0.4944, "location": -0.0327, "velocity": -0.041, "time": -0.2202},
  "shap_top": [{"feature": "failed_attempts", "family": "security", "shap": 1.2749, "value": 2}],
  "limited_history": false,
  "customer_message": "A Debit Card payment of 15,474.76 to a Jewelry merchant on 2024-05-20 13:55:00 (Mumbai, Germany) from a Desktop device. We noticed: 2 failed attempts before this transaction.",
  "numbers_verified": true, "unverified_reasons_dropped": 0}
```
* SHAP bar chart: `shap_top` (12 features, signed) or `families` (grouped). Axis label: "contribution (log-odds)".
* Show a **"✓ all numbers verified from data"** badge when `numbers_verified` is true.
* `customer_message` is the customer-safe wording used in the email (no scores).

```json
"what_changed": [{"family": "security", "features_replaced": ["failed_attempts", "pin_changed_recently", "device_type", "..."],
  "original_score": 0.253623, "hypothetical_score": 0.088753,
  "note": "Model behaviour under a hypothetical change. This is not proof of causation."}],
"counterfactual": {"needed": true, "original_score": 0.253623,
  "changes": [{"feature": "failed_attempts", "from": 2, "to": 0.0}], "final_score": 0.088753,
  "reaches_below_threshold": true, "note": "Hypothetical: ... Not proof of causation."},
"history": {"customer_id": "CUST00155309",
  "transactions": [{"transaction_id": "...", "ts": "...", "transaction_amount": 42.1, "merchant_category": "...", "score": 0.01, "alert": 0, "source": "dataset", "status": "completed"}],
  "normal_range": {"low": 17.18, "high": 473.18, "source": "population", "n": 1,
                   "note": "fewer than 5 transactions: showing the population's 10th-90th percentile"}}
```
Sender-history chart: plot `history.transactions` (x = `ts`, y = `transaction_amount`) with a shaded band from `normal_range.low` to `high`.

### `GET /api/customers/{customer_id}`
Keys: `customer_id, profile, account {status, frozen_at, frozen_reason}, trusted_patterns [{id, pattern_key, description, expires_at}], history, cases, feedback`.

### `GET /api/replay?cursor=0&limit=50`
```json
{"items": [{"cursor": 1, "transaction_id": "TXN0000557338", "ts": "2024-03-31 12:41:00", "transaction_amount": 62.1,
            "score": 0.0113, "alert": 0, "band": "PROCEED", "...": "..."}], "next_cursor": 1, "done": false}
```

### `GET /api/transactions/{transaction_id}`
`{transaction, score, decision}`: `decision` includes trusted patterns and frozen status for this customer *now*.

---

## Simulate a pending transaction

### `GET /api/simulate/presets?customer_id=CUST00155309`
Returns editable inputs: `presets.typical`, `presets.account_takeover_like`, `presets.travel_legit_like`.
```json
{"customer_id": "CUST00155309", "merchant_category": "Crypto Exchange", "payment_method": "Debit Card", "device_type": "Mobile",
 "country": "UK", "city": "Mumbai", "transaction_amount": 2465.01, "distance_from_home_km": 1500.0,
 "is_international": 1, "failed_attempts": 3, "pin_changed_recently": 1, "timestamp": "2024-05-27 02:14:00"}
```

### `POST /api/simulate` (body = a preset, edited)
* `?commit=false` (default): **pending**. Nothing is stored; history features are not changed.
* `?commit=true`: stored as a simulated transaction; HOLD/BLOCK sends the "Was this you?" email automatically; STEP_UP sends an OTP SMS. Use `Idempotency-Key`.

Response keys: `mode, transaction, score, anomaly_percentile, decision, explanation, counterfactual, features_used, note` (+ `stored_status`, `notification` or `step_up` when committed).
Show `decision.label` prominently with the word **simulated**.

---

## Customer: "Was this you?"

The email link is `PUBLIC_URL/respond?token=...`. The frontend `/respond` page reads `token` from its URL and calls:

| Step | Call | Response |
|---|---|---|
| Load page (read-only) | `POST /api/respond/info {"token"}` | `{alert_status, link_usable, expired, used, expires_at, transaction{...}, message, case, options: ["not_me","was_me"]}` |
| "Not me" | `POST /api/respond/not-me {"token"}` | case view (below) + `idempotent_replay` |
| "It was me" (1) | `POST /api/respond/was-me/start {"token"}` | `{otp_sent, channel: "sms", to: "******0000", expires_at}` |
| "It was me" (2) | `POST /api/respond/was-me/confirm {"token","otp"}` | `{confirmed: true, trusted_pattern{pattern_key, description, expires_at, effect}}` or `{confirmed: false, error: "wrong_code", attempts_left}` |

Error codes to handle: `invalid_token` (404), `link_used` (409), `alert_already_resolved` (409), `link_expired` (410),
`no_active_code` (400), `code_expired` (410), `code_locked` (429), `otp_limit` (429).

Design rules for this page:
1. Opening the page never changes anything (email scanners open links). Actions happen only on button click (POST).
2. Never show a password/PIN/card field on this page. The OTP goes to the phone, not the email.
3. Show `link_usable=false` states clearly (expired / already used), with "contact the bank via its official app".

### Unfreeze (customer, OTP)
`POST /api/customers/{id}/unfreeze/start` → `{otp_sent, to, expires_at}`; then
`POST /api/customers/{id}/unfreeze/confirm {"otp"}` → `{unfrozen: true, account}`. Error `not_frozen` (409) if already active.

---

## Bank operations (header `X-Ops-Key`)

### `POST /api/ops/alerts/{transaction_id}/notify`
`{alert_id, notification_id, status: "NOTIFIED", expires_at, delivery: {channel, recipient, delivery: "smtp"|"outbox_only"}}`.
The token is **never** returned by the API. It exists only inside the email.

### Case view (`GET /api/ops/cases/{id}`, also returned by "Not me" and transitions)
```json
{"case": {"case_id": 1, "status": "OPEN", "customer_id": "CUST00155309", "transaction_id": "TXN0000122174",
          "notified_at": "...", "reported_at": "...", "zero_liability": 1, "shadow_credit_due": "...", "resolution_due": "...", "resolution": null},
 "sla": {"zero_liability": true, "shadow_credit_due": "2026-10-13T06:47:02+00:00", "shadow_credit_overdue": false,
         "hours_to_shadow_credit_due": 336.0, "resolution_due": "2026-12-28T06:47:02+00:00", "resolution_overdue": false,
         "days_to_resolution_due": 90.0, "basis": "Modelled on the RBI framework ..."},
 "actions": [{"action": "ACCOUNT_FROZEN", "actor": "system", "note": "Outgoing payments blocked (simulated). ...", "created_at": "..."}],
 "transaction": {"transaction_id": "...", "ts": "...", "transaction_amount": 15474.76, "merchant_category": "Jewelry", "score": 0.2536},
 "account": {"status": "frozen"}, "allowed_transitions": ["INVESTIGATING"], "simulated": true}
```
Render `actions` as a timeline; `sla` as countdowns; `allowed_transitions` as buttons.

### `POST /api/ops/cases/{id}/transition {"to", "note"}`
Lifecycle: `OPEN → INVESTIGATING → SHADOW_CREDITED → RESOLVED_REFUNDED`, or `INVESTIGATING|SHADOW_CREDITED → RESOLVED_REJECTED`.
Invalid → `409 invalid_transition` with `error.allowed`. Resolving without a note → `422 note_required`.

### Others
`GET /api/ops/cases?status=&page=&size=`, `POST /api/ops/cases/{id}/notes {"note"}`, `GET /api/ops/audit?limit=200` (append-only log),
`GET /api/ops/feedback.csv` (customer-confirmed labels + model features, for retraining).

---

## Model

* `GET /api/evaluation`: `{evaluation: {catboost, isolation_forest, amount_threshold_baseline, calibration, recall_by_fraud_type, group_check, explanation_audit, global_importance, false_positive_example}, threshold, threshold_mode, best_params, split, dataset, notes}`. These are measured values from the notebook; render them, never hardcode.
* `GET /api/monitoring`: `{reference_month, skipped_small_months, monthly: [{month, transactions, alert_rate, mean_score, label_rate}], psi: [{month, <feature>: psi, max_psi}], features_monitored, status: "stable"|"moderate_shift"|"large_shift", notes}`.

## Demo only
`GET /api/demo/inbox?channel=email|sms&customer_id=&limit=`: every email/SMS the system "sent". Disable with `DEMO_MODE=0`.
