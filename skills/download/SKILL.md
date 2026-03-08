---
name: download
command: /download
description: Download files from URLs
allowed-tools: ["exec"]
version: 1.0.0
---

# Download

Download files from URLs.

Use `exec: curl -L -o FILENAME URL` to download files. The `-L` flag follows redirects. Verify the download succeeded by checking the exit code. Report the saved path to the user.
