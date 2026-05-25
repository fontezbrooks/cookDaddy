#!/usr/bin/env bash
# Cloud-supabase pgTAP dry-run for P12 Slice 4b deck_size start_session flag (migration 024 + test).
# Savepoint-munging skill: one outer tx -> apply migration 024 DDL -> install
# tests.* helpers (seed.sql) -> run each test file inside a named savepoint
# (so the test's own begin/rollback don't blow up the outer tx) -> outer
# rollback discards EVERYTHING. Cloud schema/data untouched.
set -euo pipefail

# Defend against shell env shadowing the project's .env.
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

[[ -f .env ]] && { set -a; source .env; set +a; }

if [[ -z "${SUPABASE_REF:-}" || -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Missing SUPABASE_REF / SUPABASE_DB_PASSWORD" >&2
  exit 1
fi

PSQL=(psql -h "db.${SUPABASE_REF}.supabase.co" -p 5432 \
      -U postgres -d postgres \
      -v ON_ERROR_STOP=1 -X)

TESTS=(
  "start_session_deck_size"
)

{
  printf 'begin;\n'
  # 1) Apply the migration DDL (plain forward DDL, no tx of its own).
  cat supabase/migrations/024_start_session_deck_size.sql
  # 2) Install tests.* helpers (idempotent create-or-replace).
  cat supabase/seed.sql
  # 3) Run each test inside a savepoint, munging its begin;/rollback;.
  for t in "${TESTS[@]}"; do
    sp="sp_${t//[^a-z0-9_]/_}"
    printf '\nsavepoint %s;\n' "$sp"
    sed -e "s/^begin;[[:space:]]*$/-- begin replaced/" \
        -e "s/^rollback;[[:space:]]*$/rollback to savepoint ${sp};/" \
        "supabase/tests/${t}.sql"
    printf 'release savepoint %s;\n' "$sp"
  done
  printf '\nrollback;\n'
} | PGPASSWORD="$SUPABASE_DB_PASSWORD" "${PSQL[@]}"
