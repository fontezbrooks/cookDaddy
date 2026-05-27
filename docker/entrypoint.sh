#!/usr/bin/env bash
# Installs deps into the node_modules volume, then hands off to supercronic.
set -euo pipefail

cd /app
git config --global --add safe.directory /app || true

echo "[entrypoint] pnpm install…"
corepack enable
pnpm install --frozen-lockfile

echo "[entrypoint] starting supercronic (UTC)…"
exec supercronic -passthrough-logs /app/docker/crontab
