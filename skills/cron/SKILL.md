---
name: cron
command: /cron
description: Manage recurring scheduled tasks using system crontab
allowed-tools: ["exec", "read"]
version: 1.0.0
---

# Cron

Manage recurring scheduled tasks using the system crontab.

- **List entries**: `exec: crontab -l`
- **Add entry**: `exec: (crontab -l; echo "EXPR COMMAND") | crontab -`
- **Remove entry**: `exec: crontab -l | grep -v "PATTERN" | crontab -`

Replace EXPR with cron expression (e.g. `0 9 * * *` for daily at 9am), COMMAND with the command to run, and PATTERN with a unique string matching the entry to remove.
