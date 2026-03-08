---
name: email
command: /email
description: Send emails via SMTP or API
allowed-tools: ["exec", "web_fetch"]
version: 1.0.0
---

# Email

Send emails via SMTP or API.

Use `web_fetch` with an email API (SendGrid, Mailgun, etc.) or `exec: curl` with SMTP. Requires API key or credentials from the vault. Never expose credentials in output.
