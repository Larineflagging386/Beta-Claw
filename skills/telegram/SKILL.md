---
name: telegram
command: /telegram
description: Send messages via Telegram Bot API
allowed-tools: ["exec", "web_fetch"]
version: 1.0.0
---

# Telegram

Send messages via the Telegram Bot API.

Use `web_fetch` to call `https://api.telegram.org/bot{TOKEN}/sendMessage` with `chat_id` and `text` as query or body parameters. Read the bot token from environment variables or the vault. Never expose the token in logs or output.
