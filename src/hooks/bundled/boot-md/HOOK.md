---
name: boot-md
description: "Runs BOOT.md instructions on gateway startup for each group that has one"
metadata: { "openclaw": { "emoji": "🚀", "events": ["gateway:startup"] } }
---
If groups/{groupId}/BOOT.md exists and is non-empty, its content is queued
as a bootstrap injection for the next agent turn in that group.
