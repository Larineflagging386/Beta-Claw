---
name: docker
command: /docker
description: Manage Docker containers and images
allowed-tools: ["exec", "read"]
version: 1.0.0
---

# Docker

Manage Docker containers and images.

Use `exec` to run docker commands: `docker ps`, `docker build`, `docker run`, `docker stop`, `docker logs`, `docker images`, `docker rm`, etc. Use `read` to inspect Dockerfiles or config when needed.
