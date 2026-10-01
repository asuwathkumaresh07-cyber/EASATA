"""Email/SMS delivery. Every message is stored in the outbox (the demo inbox). Emails are additionally
sent through SMTP when a server is reachable (Mailpit locally, or a real SMTP account)."""
from __future__ import annotations

import logging
import smtplib
import sqlite3
from email.message import EmailMessage

from . import clock
from .config import settings

log = logging.getLogger("stdetector.notify")


def _smtp_send(to: str, subject: str, body: str) -> bool:
    if not settings.smtp_enabled:
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.mail_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=3) as s:
            if settings.smtp_starttls:
                s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as e:
        log.info("SMTP not available (%s); message kept in outbox only", e.__class__.__name__)
        return False


def send_email(conn: sqlite3.Connection, customer_id: str, subject: str, body: str) -> dict:
    to = settings.demo_email
    delivered = _smtp_send(to, subject, body)
    cur = conn.execute("INSERT INTO outbox(channel, recipient, customer_id, subject, body, delivery, created_at) "
                       "VALUES ('email',?,?,?,?,?,?)",
                       (to, customer_id, subject, body, "smtp" if delivered else "outbox_only", clock.iso()))
    return {"outbox_id": cur.lastrowid, "channel": "email", "recipient": to, "delivery": "smtp" if delivered else "outbox_only"}


def send_sms(conn: sqlite3.Connection, customer_id: str, body: str) -> dict:
    to = settings.demo_phone
    cur = conn.execute("INSERT INTO outbox(channel, recipient, customer_id, subject, body, delivery, created_at) "
                       "VALUES ('sms',?,?,NULL,?,'outbox_only',?)", (to, customer_id, body, clock.iso()))
    return {"outbox_id": cur.lastrowid, "channel": "sms", "recipient": mask_phone(to), "delivery": "outbox_only"}


def mask_phone(p: str) -> str:
    digits = [c for c in p if c.isdigit()]
    return "******" + "".join(digits[-4:]) if len(digits) >= 4 else "****"
