---
name: transcript-hygiene
description: "Strips API keys and secrets from tool results before they persist in transcript"
metadata: { "openclaw": { "emoji": "🔒", "events": [] } }
---
Synchronous tool_result hook. Redacts common secret patterns (API keys, tokens, passwords).
