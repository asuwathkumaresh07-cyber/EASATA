"""Adaptive friction: turn a calibrated probability + amount into a (simulated) response band.

level from probability (t = alert threshold chosen on validation):
    p < 0.5t -> 0 PROCEED | p < t -> 1 STEP_UP | p < 2t -> 2 HOLD | p >= 2t -> 3 BLOCK
expected loss (p x amount) >= EXPECTED_LOSS_HIGH raises the level by one (only if level >= 1).
A trusted pattern the customer confirmed with an OTP lowers the level by one, but never lowers BLOCK.
A frozen account always gives BLOCK.
"""
from __future__ import annotations

import numpy as np

BANDS = ["PROCEED", "STEP_UP", "HOLD", "BLOCK"]
LABELS = {
    "PROCEED": "Proceed (simulated)",
    "STEP_UP": "Step-up verification: OTP required (simulated)",
    "HOLD": "Hold and ask the customer 'Was this you?' (simulated)",
    "BLOCK": "Block, ask the customer and open a review (simulated)",
}
ACTIONS = {
    "PROCEED": [],
    "STEP_UP": ["send_otp"],
    "HOLD": ["hold_payment", "send_was_this_you_email"],
    "BLOCK": ["block_payment", "send_was_this_you_email", "priority_review"],
}


def pattern_key(row: dict) -> str:
    return f"{row['merchant_category']}|intl={int(row['is_international'])}|{row['device_type']}"


def pattern_description(row: dict) -> str:
    where = "international" if int(row["is_international"]) == 1 else "domestic"
    dev = str(row["device_type"])
    article = "an" if dev[:1].lower() in "aeiou" else "a"
    return f"{where} {row['merchant_category']} payments from {article} {dev} device"


def base_level(p: float, threshold: float) -> int:
    if p < 0.5 * threshold:
        return 0
    if p < threshold:
        return 1
    if p < 2 * threshold:
        return 2
    return 3


def decide(p: float, amount: float, threshold: float, el_high: float,
           frozen: bool = False, trusted: dict | None = None) -> dict:
    notes: list[str] = []
    level = base_level(p, threshold)
    notes.append(f"probability {p:.3f} vs alert threshold {threshold:.3f} gives {BANDS[level]}")
    el = p * float(amount)
    if 1 <= level < 3 and el >= el_high:
        level += 1
        notes.append(f"expected loss {el:,.2f} >= {el_high:,.2f} raises it to {BANDS[level]}")
    model_level = level
    trusted_applied = False
    if trusted and 0 < level < 3:
        level -= 1
        trusted_applied = True
        notes.append(f"trusted pattern ('{trusted['description']}', confirmed by the customer) lowers it to {BANDS[level]}")
    elif trusted and level == 3:
        notes.append("trusted pattern ignored: BLOCK is never lowered")
    if frozen:
        level = 3
        notes.append("account is frozen (simulated): all new payments are blocked")
    band = BANDS[level]
    return {"band": band, "level": level, "label": LABELS[band], "actions": ACTIONS[band],
            "model_band": BANDS[model_level], "expected_loss": round(el, 2), "expected_loss_high": round(el_high, 2),
            "trusted_pattern_applied": trusted_applied, "account_frozen": frozen, "notes": notes, "simulated": True}


def levels_vectorized(p, amount, threshold: float, el_high: float) -> np.ndarray:
    """Same rules as decide() for many rows at once (no trusted patterns / frozen accounts)."""
    p, amount = np.asarray(p, float), np.asarray(amount, float)
    level = np.select([p < 0.5 * threshold, p < threshold, p < 2 * threshold], [0, 1, 2], 3)
    bump = (level >= 1) & (level < 3) & (p * amount >= el_high)
    return level + bump.astype(int)
