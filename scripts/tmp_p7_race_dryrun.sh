#!/usr/bin/env bash
# Cloud-supabase pgTAP dry-run for the P7 race-invariant tests.
# Mirrors the savepoint-munging skill: wrap everything in one outer tx, run
# seed.sql to install the tests.* helpers, then run each test file inside a
# named savepoint so individual rollback statements don't blow up the outer
# transaction. Final outer rollback discards everything — cloud untouched.
set -euo pipefail

# Defend against shell env shadowing the project's .env (cookDaddy gotcha:
# global SUPABASE_URL points at the gulch project).
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
  "submit_swipe_race_invariants"
  "swipes_matches_rls_reverify"
)

{
  printf 'begin;\n'
  # seed.sql installs pgtap into the extensions schema (already there on
  # cloud, idempotent via `create extension if not exists`) and creates the
  # tests.* helper functions on the public-adjacent `tests` schema. We rely
  # on those helpers in the test file.
  cat supabase/seed.sql
  for t in "${TESTS[@]}"; do
    sp="sp_${t//[^a-z0-9_]/_}"
    printf '\nsavepoint %s;\n' "$sp"
    # On-the-fly munge: top-level `begin;` / `rollback;` become savepoint
    # operations. Test file is never modified on disk.
    sed -e "s/^begin;[[:space:]]*$/-- begin replaced/" \
        -e "s/^rollback;[[:space:]]*$/rollback to savepoint ${sp};/" \
        "supabase/tests/${t}.sql"
    printf 'release savepoint %s;\n' "$sp"
  done
  printf '\nrollback;\n'
} | PGPASSWORD="$SUPABASE_DB_PASSWORD" "${PSQL[@]}"
