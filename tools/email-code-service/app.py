from __future__ import annotations

import hmac
import html
import logging
from logging.handlers import RotatingFileHandler
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel


LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def configure_logging() -> None:
  handlers: list[logging.Handler] = [logging.StreamHandler()]
  log_file = os.getenv("VIBE_EMAIL_LOG_FILE", "").strip()

  if log_file:
    try:
      path = Path(log_file)
      path.parent.mkdir(parents=True, exist_ok=True)
      handlers.append(RotatingFileHandler(path, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"))
    except Exception:
      logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, handlers=handlers, force=True)
      logging.getLogger("vibe_email_code").exception("Failed to configure file logging: %s", log_file)
      return

  logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, handlers=handlers, force=True)


configure_logging()
logger = logging.getLogger("vibe_email_code")

app = FastAPI(title="Vibe Learning Email Code Service")

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class EmailCodeRequest(BaseModel):
  email: str
  code: str
  purpose: str = "register"
  expiresInMinutes: int = 10


def env_bool(name: str, default: str = "false") -> bool:
  return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def require_token(authorization: str | None) -> None:
  expected = os.getenv("VIBE_EMAIL_SERVICE_TOKEN", "")
  if not expected:
    raise HTTPException(status_code=500, detail="VIBE_EMAIL_SERVICE_TOKEN is not configured")

  prefix = "Bearer "
  provided = authorization[len(prefix) :].strip() if authorization and authorization.startswith(prefix) else ""
  if not hmac.compare_digest(provided, expected):
    raise HTTPException(status_code=401, detail="Invalid service token")


def get_required_env(name: str) -> str:
  value = os.getenv(name, "").strip()
  if not value:
    logger.error("Missing required environment variable: %s", name)
    raise HTTPException(status_code=500, detail=f"{name} is not configured")
  return value


def mask_email(email: str) -> str:
  value = email.strip().lower()
  if "@" not in value:
    return value[:2] + "***"
  local, domain = value.split("@", 1)
  if len(local) <= 2:
    masked_local = local[:1] + "***"
  else:
    masked_local = local[:2] + "***" + local[-1:]
  return f"{masked_local}@{domain}"


def smtp_config_summary() -> dict[str, object]:
  return {
    "logFile": os.getenv("VIBE_EMAIL_LOG_FILE", "") or "stderr/journal only",
    "smtpHostConfigured": bool(os.getenv("SMTP_HOST")),
    "smtpPort": os.getenv("SMTP_PORT", "465"),
    "smtpUsernameConfigured": bool(os.getenv("SMTP_USERNAME")),
    "smtpPasswordConfigured": bool(os.getenv("SMTP_PASSWORD")),
    "smtpFromEmailConfigured": bool(os.getenv("SMTP_FROM_EMAIL")),
    "smtpUseSsl": env_bool("SMTP_USE_SSL", "true"),
    "smtpStarttls": env_bool("SMTP_STARTTLS", "false"),
    "serviceTokenConfigured": bool(os.getenv("VIBE_EMAIL_SERVICE_TOKEN")),
  }


def log_startup_config() -> None:
  summary = smtp_config_summary()
  logger.info("Vibe email code service starting with config=%s", summary)
  missing = [
    name
    for name in ("VIBE_EMAIL_SERVICE_TOKEN", "SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD")
    if not os.getenv(name, "").strip()
  ]
  if missing:
    logger.error("Startup configuration incomplete. Missing environment variables: %s", ", ".join(missing))


def build_message(request: EmailCodeRequest) -> EmailMessage:
  email = request.email.strip().lower()
  code = request.code.strip()
  if not EMAIL_PATTERN.match(email):
    raise HTTPException(status_code=400, detail="Invalid email")
  if not re.fullmatch(r"\d{4}", code):
    raise HTTPException(status_code=400, detail="Invalid code")

  smtp_user = get_required_env("SMTP_USERNAME")
  from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user).strip() or smtp_user
  from_name = os.getenv("SMTP_FROM_NAME", "Vibe Learning").strip() or "Vibe Learning"
  expires = max(1, min(60, int(request.expiresInMinutes or 10)))
  safe_code = html.escape(code)

  message = EmailMessage()
  message["Subject"] = "VibeLearning 注册邮箱验证码"
  message["From"] = formataddr((from_name, from_email))
  message["To"] = email
  message.set_content(
    "\n".join(
      [
        "您好，",
        "",
        f"您的 VibeLearning 注册验证码是：{code}",
        f"验证码 {expires} 分钟内有效，请勿转发给他人。",
        "",
        "如果这不是您本人操作，请忽略本邮件。",
      ]
    )
  )
  message.add_alternative(
    f"""
    <html>
      <body>
        <p>您好，</p>
        <p>您的 VibeLearning 注册验证码是：</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:4px;">{safe_code}</p>
        <p>验证码 {expires} 分钟内有效，请勿转发给他人。</p>
        <p>如果这不是您本人操作，请忽略本邮件。</p>
      </body>
    </html>
    """,
    subtype="html",
  )
  return message


def send_message(message: EmailMessage) -> None:
  host = get_required_env("SMTP_HOST")
  port = int(os.getenv("SMTP_PORT", "465"))
  username = get_required_env("SMTP_USERNAME")
  password = get_required_env("SMTP_PASSWORD")
  timeout = float(os.getenv("SMTP_TIMEOUT", "15"))
  use_ssl = env_bool("SMTP_USE_SSL", "true")
  use_starttls = env_bool("SMTP_STARTTLS", "false")

  if use_ssl:
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) as server:
      server.login(username, password)
      server.send_message(message)
    return

  with smtplib.SMTP(host, port, timeout=timeout) as server:
    server.ehlo()
    if use_starttls:
      server.starttls(context=ssl.create_default_context())
      server.ehlo()
    server.login(username, password)
    server.send_message(message)


@app.on_event("startup")
def startup_event() -> None:
  log_startup_config()


@app.get("/health")
def health() -> dict[str, object]:
  return {
    "status": "ok",
    "smtpConfigured": bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USERNAME") and os.getenv("SMTP_PASSWORD")),
    "tokenConfigured": bool(os.getenv("VIBE_EMAIL_SERVICE_TOKEN")),
    "logFile": os.getenv("VIBE_EMAIL_LOG_FILE", "") or "stderr/journal only",
  }


@app.post("/send-email-code")
def send_email_code(request: EmailCodeRequest, authorization: str | None = Header(default=None)) -> dict[str, bool]:
  require_token(authorization)
  masked_email = mask_email(request.email)
  logger.info("Email code send requested email=%s purpose=%s expiresInMinutes=%s", masked_email, request.purpose, request.expiresInMinutes)
  message = build_message(request)
  try:
    send_message(message)
  except Exception as exc:
    logger.exception("Failed to send email code email=%s purpose=%s", masked_email, request.purpose)
    raise HTTPException(status_code=502, detail=f"SMTP send failed: {exc}") from exc

  logger.info("Email code sent successfully email=%s purpose=%s", masked_email, request.purpose)
  return {"ok": True}


if __name__ == "__main__":
  print({"service": "Vibe Learning Email Code Service", "status": "ready"})
