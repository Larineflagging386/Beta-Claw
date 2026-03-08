---
name: browser
command: /browser
description: Control a headless Chromium browser via Playwright
allowed-tools: ["exec", "write", "read"]
version: 1.0.0
---

# Browser

Control a headless Chromium browser via Playwright.

Use `exec` to run `node -e` with inline Playwright scripts. Launch chromium, navigate to URLs, click elements, type text, and take screenshots. Always close the browser when done to avoid orphaned processes.

Example flow: launch → navigate → interact → screenshot (if needed) → close.
