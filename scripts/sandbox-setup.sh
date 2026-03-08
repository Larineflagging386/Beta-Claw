#!/usr/bin/env bash
# One-time build of the MicroClaw sandbox image.
# Run once: bash scripts/sandbox-setup.sh
set -e

IMAGE="microclaw-sandbox:latest"
echo "[sandbox-setup] Building $IMAGE ..."

docker build -t "$IMAGE" - <<'DOCKERFILE'
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git sqlite3 python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash sandbox
USER sandbox
WORKDIR /workspace
DOCKERFILE

echo "[sandbox-setup] Done. Image: $IMAGE"
