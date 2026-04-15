"""
Transactional email via OpenSMTPD relay.

Sends MIME multipart messages with optional PDF attachments.
Failures are logged but do NOT raise — the caller decides whether to abort.
"""

import smtplib
import structlog
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings

log = structlog.get_logger()


def send_email(
    to_address: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    attachment_bytes: Optional[bytes] = None,
    attachment_filename: Optional[str] = None,
) -> bool:
    """
    Send a transactional email.
    Returns True on success, False on failure.
    """
    try:
        msg = MIMEMultipart("mixed")
        msg["From"] = f"{settings.mail_from_name} <{settings.mail_from}>"
        msg["To"] = to_address
        msg["Subject"] = subject

        # Body part
        body_part = MIMEMultipart("alternative")
        body_part.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            body_part.attach(MIMEText(body_html, "html", "utf-8"))
        msg.attach(body_part)

        # Optional PDF attachment
        if attachment_bytes and attachment_filename:
            pdf_part = MIMEApplication(attachment_bytes, _subtype="pdf")
            pdf_part.add_header(
                "Content-Disposition", "attachment", filename=attachment_filename
            )
            msg.attach(pdf_part)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.sendmail(settings.mail_from, [to_address], msg.as_string())

        log.info("email_sent", to=to_address, subject=subject)
        return True

    except Exception as exc:
        log.error("email_failed", to=to_address, subject=subject, error=str(exc))
        return False
