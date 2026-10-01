"""EASATA alert emails: sends simulation alerts to one fixed recipient through SMTP.

The recipient is configured on the server (EASATA_EMAIL_TO), never taken from the request, so this
endpoint cannot be used to send mail to arbitrary addresses. Every attempt is also stored in the outbox
(the demo inbox), whether or not SMTP delivery worked.
"""
from __future__ import annotations

import logging
import os
import smtplib
import socket
from email.message import EmailMessage

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from . import clock
from .config import settings
from .security import limiter

log = logging.getLogger("stdetector.easata")
router = APIRouter(prefix="/api/easata", tags=["easata"])

EMAIL_TO = os.getenv("EASATA_EMAIL_TO", "customer@example.test")


class AlertEmail(BaseModel):
    subject: str = Field(..., min_length=1, max_length=300)
    body: str = Field(..., min_length=1, max_length=100_000)
    html: str | None = Field(None, max_length=200_000)  # optional HTML version (e.g. with a Freeze account button)


def _config_problem() -> str | None:
    """Why SMTP can't deliver to a real inbox, in plain words (None = looks configured)."""
    if not settings.smtp_enabled:
        return "Email sending is switched off (SMTP_ENABLED=0 in backend/.env)."
    if settings.smtp_host in ("localhost", "127.0.0.1") and not settings.smtp_user:
        return ("The backend is set to a local test mail server (Mailpit on localhost), so emails never reach Gmail. "
                "Add Gmail SMTP settings to backend/.env and restart the backend.")
    if settings.smtp_host.endswith("gmail.com") and not (settings.smtp_user and settings.smtp_password):
        return "Gmail SMTP needs SMTP_USER (your Gmail address) and SMTP_PASSWORD (a Gmail app password) in backend/.env."
    return None


def _send(subject: str, body: str, html: str | None = None) -> tuple[bool, str]:
    msg = EmailMessage()
    sender = settings.smtp_user or settings.mail_from
    msg["From"], msg["To"], msg["Subject"] = f"EASATA Alerts <{sender}>", EMAIL_TO, subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            if settings.smtp_starttls:
                s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return True, f"Sent to {EMAIL_TO}."
    except smtplib.SMTPAuthenticationError:
        return False, "Gmail refused the login. Use a Gmail app password (not your normal password) in SMTP_PASSWORD."
    except (socket.timeout, TimeoutError):
        return False, f"Timed out connecting to {settings.smtp_host}:{settings.smtp_port}."
    except (OSError, smtplib.SMTPException) as e:
        return False, f"Could not reach the mail server {settings.smtp_host}:{settings.smtp_port} ({e.__class__.__name__})."


@router.get("/email/status", summary="Is real email delivery set up?")
def email_status():
    problem = _config_problem()
    return {"to": EMAIL_TO, "smtp_host": settings.smtp_host, "smtp_port": settings.smtp_port,
            "configured": problem is None, "problem": problem}


@router.post("/email", summary="Send one EASATA alert email to the configured recipient")
def send_alert_email(body: AlertEmail, request: Request):
    limiter.check(request, "easata_email", 60)
    problem = _config_problem()
    ok, detail = (False, problem) if problem else _send(body.subject, body.body, body.html)
    with request.app.state.db.write() as conn:
        conn.execute(
            "INSERT INTO outbox(channel, recipient, customer_id, subject, body, delivery, created_at) VALUES ('email',?,?,?,?,?,?)",
            (EMAIL_TO, "EASATA", body.subject, body.body, "smtp" if ok else "outbox_only", clock.iso()),
        )
    log.info("EASATA alert email %s: %s", "sent" if ok else "not sent", detail)
    return {"sent": ok, "to": EMAIL_TO, "detail": detail}
