"""Transactional email — activation + password-reset messages.

Two send modes controlled by `settings.RESEND_API_KEY`:

  1. **Resend (production).** POST to Resend's REST API using the
     API key. No SDK — Resend has a tiny HTTP surface and we already
     depend on httpx for the Salesforce client, so this stays a
     single-import feature.

  2. **Log-to-console (dev / staging without a key).** The email
     content — including the full activation URL — is written to the
     backend logs at WARNING level. An admin can copy the link from
     Railway logs and share it manually. Lets the flow work
     end-to-end before a Resend account exists.

The mode is chosen per-call based on the current API key, so an
operator can flip between them by setting/unsetting the env var
without a code change.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


async def send_activation_email(
    *,
    to_email: str,
    to_name: Optional[str],
    activation_url: str,
    invited_by_email: Optional[str],
) -> None:
    """Fire an account-activation email.

    Never raises on delivery failure — logs and returns. The caller
    (admin creating a user) shouldn't see a 500 because a transient
    Resend hiccup blocked the email; the token exists in the DB and
    can be re-sent via the "Resend activation" admin action.
    """
    subject = "Activate your AccessGraph account"
    greeting_name = to_name or to_email
    inviter_line = (
        f"{invited_by_email} invited you to AccessGraph."
        if invited_by_email
        else "You've been invited to AccessGraph."
    )
    html_body = _activation_html(
        greeting=greeting_name,
        inviter_line=inviter_line,
        activation_url=activation_url,
    )
    text_body = _activation_text(
        greeting=greeting_name,
        inviter_line=inviter_line,
        activation_url=activation_url,
    )
    await _send(
        to_email=to_email,
        subject=subject,
        html=html_body,
        text=text_body,
    )


async def _send(
    *, to_email: str, subject: str, html: str, text: str
) -> None:
    """Underlying send. Chooses Resend vs. log-to-console based on key."""
    api_key = (settings.RESEND_API_KEY or "").strip()
    from_addr = (settings.FROM_EMAIL or "onboarding@resend.dev").strip()

    if not api_key:
        # Dev / bootstrap mode — surface the full email in the log
        # stream. Snippet the HTML because it's noisy; the plaintext
        # (which contains the URL) is the useful part.
        logger.warning(
            "auth.email: RESEND_API_KEY unset. Logging activation "
            "email instead of sending.\n"
            "--- BEGIN EMAIL ---\n"
            "To: %s\nSubject: %s\n\n%s\n"
            "--- END EMAIL ---",
            to_email, subject, text,
        )
        return

    payload = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code >= 400:
                logger.error(
                    "auth.email: Resend rejected send to %s (HTTP %s): %s",
                    to_email, resp.status_code, resp.text[:500],
                )
                return
            logger.info(
                "auth.email: sent to %s via Resend (id=%s)",
                to_email,
                resp.json().get("id", "?"),
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "auth.email: Resend send crashed for %s: %s", to_email, exc
        )


# ----------------------------------------------------------------------
# Template rendering — simple f-strings, no Jinja dep. Grove-themed HTML.
# ----------------------------------------------------------------------


def _activation_html(
    *, greeting: str, inviter_line: str, activation_url: str
) -> str:
    """Grove-styled activation email. Inline styles because email
    clients strip <style> blocks unpredictably. Uses evergreen +
    copper accents from the app's theme so the email feels like a
    natural extension of the product."""
    return f"""\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Activate your AccessGraph account</title>
</head>
<body style="margin:0;padding:0;background:#f6f2e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#16221a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2e7;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fdfaf1;border:1px solid #e2ddc9;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 40px 0 40px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.14em;color:#c26b47;text-transform:uppercase;margin-bottom:24px;">
            AccessGraph
          </div>
          <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:600;color:#094230;">
            Hi {greeting},
          </h1>
          <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#16221a;">
            {inviter_line}
          </p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#16221a;">
            Click below to activate your account and set a password.
            This link expires in 24 hours.
          </p>
          <p style="margin:0 0 32px 0;">
            <a href="{activation_url}"
               style="display:inline-block;background:#094230;color:#f6f2e7;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 4px 12px rgba(9,66,48,0.25);">
              Activate account
            </a>
          </p>
          <p style="margin:0 0 8px 0;font-size:13px;color:rgba(22,34,26,0.65);">
            If the button doesn't work, paste this URL into your browser:
          </p>
          <p style="margin:0 0 32px 0;font-size:12px;font-family:'JetBrains Mono',ui-monospace,monospace;color:rgba(22,34,26,0.7);word-break:break-all;">
            {activation_url}
          </p>
        </td></tr>
        <tr><td style="padding:16px 40px 24px 40px;border-top:1px solid #e2ddc9;">
          <p style="margin:0;font-size:12px;color:rgba(22,34,26,0.55);line-height:1.5;">
            If you weren't expecting this invitation, you can safely
            ignore it. No account will be created without you clicking
            the link above.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _activation_text(
    *, greeting: str, inviter_line: str, activation_url: str
) -> str:
    return (
        f"Hi {greeting},\n\n"
        f"{inviter_line}\n\n"
        "Activate your account and set a password by opening this link "
        "in your browser. It expires in 24 hours.\n\n"
        f"{activation_url}\n\n"
        "If you weren't expecting this invitation, you can safely "
        "ignore it. No account will be created without you clicking "
        "the link above.\n\n"
        "— AccessGraph\n"
    )
