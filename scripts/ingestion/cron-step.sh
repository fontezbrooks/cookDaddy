#!/usr/bin/env bash
# Hourly Spoonacular ingestion wrapper.
#
# Pulls a batch of recipes via test-spoon.ps1, then upserts into cloud Supabase
# via pnpm ingest. Designed to be invoked by cron and stay alive on transient
# failures — per-file errors in the importer don't break the loop, and a missing
# pwsh/pnpm degrades gracefully.
#
# All stdout/stderr is prefixed with an ISO-8601 UTC timestamp so the log file
# at $HOME/spoonacular-cron.log can be audited for cadence and quota usage.
#
# Cron's default PATH is `/usr/bin:/bin` on macOS — Homebrew, Node, pnpm, and
# pwsh all live elsewhere. We extend PATH explicitly so the wrapper works under
# cron.

set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/sbin:/usr/local/sbin:$PATH"

REPO_ROOT="$HOME/Development/cookDaddy"
PWSH_BIN="$(command -v pwsh || true)"
PNPM_BIN="$(command -v pnpm || true)"

main() {
  echo "[cron-step] tick start (pid=$$)"

  if [[ -z "$PNPM_BIN" ]]; then
    echo "[cron-step] pnpm missing on PATH; cannot run importer" >&2
    return 0
  fi

  if [[ -z "$PWSH_BIN" ]]; then
    echo "[cron-step] pwsh missing; skipping fetch, importing existing files only" >&2
  else
    # The PS1 emits its own [spoon] lines including X-API-Quota-* headers.
    "$PWSH_BIN" -NoProfile -ExecutionPolicy Bypass \
      -File "$REPO_ROOT/scripts/ingestion/test-spoon.ps1" \
      || echo "[cron-step] spoon fetch failed; continuing to import existing files" >&2
  fi

  # The importer is exit-0 on per-file failures and emits its own [ingest] summary.
  cd "$REPO_ROOT" && "$PNPM_BIN" ingest

  echo "[cron-step] tick end"
}

# Prefix every line of stdout/stderr with a UTC ISO-8601 timestamp. The awk
# subprocess shells out to `date` once per line — fine at our volume (a few
# dozen lines per tick) and avoids a dependency on `ts` from moreutils.
main 2>&1 | awk '{
  cmd = "date -u +%Y-%m-%dT%H:%M:%SZ"
  cmd | getline ts
  close(cmd)
  print ts " " $0
  fflush()
}'

exit 0
