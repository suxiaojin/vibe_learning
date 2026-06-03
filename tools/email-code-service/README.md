# Vibe Learning Email Code Service

This service runs on the 14 server and only sends email. The Next.js app generates and verifies the 4-digit code in PostgreSQL.

## API

`GET /health`

Checks whether SMTP and token environment variables are present.

`POST /send-email-code`

Headers:

```text
Authorization: Bearer <VIBE_EMAIL_SERVICE_TOKEN>
Content-Type: application/json
```

Request:

```json
{
  "email": "student@example.com",
  "code": "1234",
  "purpose": "register",
  "expiresInMinutes": 10
}
```

`purpose` supports `register`, `login`, and `password_reset`; the email subject/body will use 注册验证码、登录验证码 or 登录新密码 accordingly.

Response:

```json
{
  "ok": true
}
```

## Environment

```bash
export VIBE_EMAIL_SERVICE_TOKEN="replace-with-a-long-random-token"
export SMTP_HOST="smtp.example.com"
export SMTP_PORT="465"
export SMTP_USERNAME="admin@example.com"
export SMTP_PASSWORD="smtp-authorization-code"
export SMTP_FROM_EMAIL="admin@example.com"
export SMTP_FROM_NAME="Vibe Learning"
export SMTP_USE_SSL="true"
export SMTP_STARTTLS="false"
export SMTP_TIMEOUT="15"
export VIBE_EMAIL_LOG_FILE="/var/log/vibe-email-code/service.log"
```

Use `SMTP_USE_SSL=true` for port `465`. For port `587`, use `SMTP_USE_SSL=false` and `SMTP_STARTTLS=true`.

## 14 Server Setup

Run on the 14 server:

```bash
sudo mkdir -p /opt/vibe_email_code_service
sudo mkdir -p /var/log/vibe-email-code
cd /opt/vibe_email_code_service
```

Copy these repo files into `/opt/vibe_email_code_service/`:

```text
tools/email-code-service/app.py
tools/email-code-service/requirements.txt
```

Then install and test:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8002
```

In another terminal:

```bash
curl -s http://127.0.0.1:8002/health
```

Create a systemd service:

```bash
sudo tee /etc/systemd/system/vibe-email-code.service >/dev/null <<'EOF'
[Unit]
Description=Vibe Learning Email Code Service
After=network.target

[Service]
WorkingDirectory=/opt/vibe_email_code_service
Environment=VIBE_EMAIL_SERVICE_TOKEN=replace-with-a-long-random-token
Environment=SMTP_HOST=smtp.example.com
Environment=SMTP_PORT=465
Environment=SMTP_USERNAME=admin@example.com
Environment=SMTP_PASSWORD=smtp-authorization-code
Environment=SMTP_FROM_EMAIL=admin@example.com
Environment=SMTP_FROM_NAME=Vibe Learning
Environment=SMTP_USE_SSL=true
Environment=SMTP_STARTTLS=false
Environment=SMTP_TIMEOUT=15
Environment=VIBE_EMAIL_LOG_FILE=/var/log/vibe-email-code/service.log
ExecStart=/opt/vibe_email_code_service/.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8002
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vibe-email-code
sudo systemctl status vibe-email-code --no-pager
curl -s http://127.0.0.1:8002/health
```

## Logs

The service writes logs to both systemd journal and the optional file path configured by `VIBE_EMAIL_LOG_FILE`.

View startup errors, Python import errors, or systemd errors:

```bash
sudo journalctl -u vibe-email-code -n 200 --no-pager
sudo journalctl -u vibe-email-code -f
```

View send records and SMTP failures:

```bash
sudo tail -n 200 /var/log/vibe-email-code/service.log
sudo tail -f /var/log/vibe-email-code/service.log
```

Useful filters:

```bash
sudo grep "Email code sent successfully" /var/log/vibe-email-code/service.log
sudo grep "Failed to send email code" /var/log/vibe-email-code/service.log
sudo grep "Startup configuration incomplete" /var/log/vibe-email-code/service.log
```

Log examples:

```text
INFO [vibe_email_code] Vibe email code service starting with config={...}
INFO [vibe_email_code] Email code send requested email=st***t@example.com purpose=register expiresInMinutes=10
INFO [vibe_email_code] Email code sent successfully email=st***t@example.com purpose=register
ERROR [vibe_email_code] Failed to send email code email=st***t@example.com purpose=register
```

The verification code itself is intentionally not written to logs.

Configure the 71 Next.js app with the same token:

```bash
EMAIL_CODE_SERVICE_URL=http://172.18.255.14:8002
EMAIL_CODE_SERVICE_TOKEN=replace-with-the-same-long-random-token
EMAIL_CODE_SECRET=replace-with-a-long-random-secret
```

`EMAIL_CODE_SECRET` can be different from the service token. It is used by the Next.js app to hash verification codes before storing them.
