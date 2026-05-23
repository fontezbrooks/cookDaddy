#!/usr/bin/env bash
# Installs the hourly Spoonacular ingestion cron entry. Idempotent — re-running is safe.
# The cron invokes cron-step.sh which does both the API fetch AND the DB import.
set -euo pipefail

WRAPPER="$HOME/Development/cookDaddy/scripts/ingestion/cron-step.sh"
LOG_FILE="$HOME/spoonacular-cron.log"
# Every 2h on the hour. At ~3.55 measured pts/call × 12 calls/day = ~43 pts/day,
# well under Spoonacular Starter's 200 pts/day cap. Produces ~60 recipes/day.
CRON_SCHEDULE="0 */2 * * *"

if [[ ! -f "$WRAPPER" ]]; then
  echo "Error: cron-step wrapper not found at: $WRAPPER"
  exit 1
fi

if ! command -v pwsh >/dev/null 2>&1; then
  echo "Error: pwsh not in PATH. Install PowerShell before scheduling the cron."
  exit 1
fi

CRON_COMMAND="$CRON_SCHEDULE bash \"$WRAPPER\" >> \"$LOG_FILE\" 2>&1"

if crontab -l 2>/dev/null | grep -F "$WRAPPER" >/dev/null; then
  echo "Cron job already exists for: $WRAPPER"
else
  (crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -
  echo "Cron job created: $CRON_COMMAND"
fi

echo "Logs will write to: $LOG_FILE"