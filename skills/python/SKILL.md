---
name: python
command: /python
description: Execute Python 3 code snippets
allowed-tools: ["exec", "write", "read"]
version: 1.0.0
---

# Python

Execute Python 3 code snippets.

Write the Python code to a temp file using `write`, then run it with `exec: python3 /path/to/file.py`. Capture and report stdout/stderr. Clean up the temp file after execution.
