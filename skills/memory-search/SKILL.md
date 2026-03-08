---
name: memory-search
command: /memsearch
description: Search through stored memories and notes
allowed-tools: ["exec", "read", "memory_read"]
version: 1.0.0
---

# Memory Search

Search through stored memories and notes.

Use `memory_read` first to query the memory store. Then use `exec: grep -r PATTERN groups/` to search across all group memories. Combine and present relevant results to the user.
