#!/usr/bin/env bash
# Container ingestion tick: heartbeat-wrapped fetch + import. REPO_ROOT is the
# bind-mounted /app (the Mac scripts/ingestion/cron-step.sh hardcodes a $HOME
# path, so the container uses this wrapper instead — pipeline behavior is identical).
set -uo pipefail

REPO_ROOT=/app
PING="${HEALTHCHECK_PING_URL:-}"

hc() { [ -n "$PING" ] && curl -fsS -m 10 --retry 3 "${PING}${1}" >/dev/null 2>&1 || true; }

run() {
  echo "[cron-step] tick start (pid=$$)"
  if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -ExecutionPolicy Bypass \
      -File "$REPO_ROOT/scripts/ingestion/test-spoon.ps1" \
      || echo "[cron-step] spoon fetch failed; importing existing files only" >&2
  else
    echo "[cron-step] pwsh missing; importing existing files only" >&2
  fi
  cd "$REPO_ROOT" && pnpm ingest
  echo "[cron-step] tick end"
}

hc /start
# Timestamp every line (UTC) so `docker logs` mirrors the old spoonacular-cron.log cadence audit.
if run 2>&1 | awk '{ "date -u +%Y-%m-%dT%H:%M:%SZ" | getline t; close("date -u +%Y-%m-%dT%H:%M:%SZ"); print t" "$0; fflush() }'; then
  hc ""        # success ping
else
  hc /fail     # failure ping
fi
exit 0
