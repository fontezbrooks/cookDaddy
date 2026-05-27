#!/usr/bin/env bash
# Pull latest main; reinstall deps only if the lockfile changed. Code changes
# take effect on the next tick (scripts are read fresh); a dependency change is
# picked up here without a full image rebuild.
set -uo pipefail
cd /app || exit 1
git config --global --add safe.directory /app || true

before=$(sha1sum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)
git fetch --quiet origin main && git reset --hard --quiet origin/main
after=$(sha1sum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)

if [ "$before" != "$after" ]; then
  echo "[auto-update] lockfile changed → pnpm install"
  corepack enable && pnpm install --frozen-lockfile
fi
echo "[auto-update] now at $(git rev-parse --short HEAD)"
