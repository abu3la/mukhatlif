#!/usr/bin/env bash
#
# Applies the Supabase migrations in order, stopping at the first failure.
#
# The connection string is read from the gitignored root .env.local and is never
# echoed. psql comes from the keg-only libpq install, so no PATH change or extra
# package is needed.
#
#   ./scripts/migrate.sh          apply every pending migration, then verify
#   ./scripts/migrate.sh --verify run the read-only verification only
#   ./scripts/migrate.sh --dry    list what would run, connect to nothing
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
MIGRATIONS="$ROOT/apps/api/supabase/migrations"
VERIFY="$ROOT/apps/api/supabase/verify_deployment.sql"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
dim()   { printf '\033[2m%s\033[0m\n' "$*"; }

mode="${1:-apply}"

if [ "$mode" = "--dry" ]; then
  echo "Would apply, in this order:"
  for file in "$MIGRATIONS"/*.sql; do echo "  $(basename "$file")"; done
  exit 0
fi

[ -x "$PSQL" ] || { red "psql not found at $PSQL"; exit 1; }
[ -f "$ROOT/.env.local" ] || { red ".env.local is missing"; exit 1; }

# shellcheck disable=SC1091
set -a; . "$ROOT/.env.local"; set +a

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  red "SUPABASE_DB_URL is empty in .env.local"; exit 1
fi
case "$SUPABASE_DB_URL" in
  *PASTE_DB_PASSWORD_HERE*)
    red "SUPABASE_DB_URL still has the PASTE_DB_PASSWORD_HERE placeholder."
    dim "Replace that one token with the database password, then re-run."
    exit 1;;
  *:6543/*)
    # 0015 opens an explicit transaction and takes an advisory lock; neither
    # survives transaction pooling, and the failure is obscure.
    red "That is the transaction pooler (6543). Use the session pooler on 5432."
    exit 1;;
esac

run() { "$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --quiet "$@"; }

echo "Checking connectivity…"
server=$(run -tAc "select current_database() || ' on ' || split_part(version(), ' ', 2)")
green "connected: $server"
echo

if [ "$mode" = "--verify" ]; then
  run -f "$VERIFY"
  exit 0
fi

# A ledger makes the runner resumable. Without it, re-running after a mid-chain
# failure replays 0001 against tables that already exist and fails for the wrong
# reason, which hides the real error.
run -c "create table if not exists public.schema_migrations (
          filename text primary key,
          applied_at timestamptz not null default now()
        );
        alter table public.schema_migrations enable row level security;
        revoke all on table public.schema_migrations from anon, authenticated;" >/dev/null

recorded="$(run -tAc 'select filename from public.schema_migrations')"

applied=0
skipped=0
for file in "$MIGRATIONS"/*.sql; do
  name="$(basename "$file")"
  if printf '%s\n' "$recorded" | grep -qxF "$name"; then
    printf '  %-46s' "$name"; dim "already applied"
    skipped=$((skipped + 1))
    continue
  fi
  printf '  %-46s' "$name"
  if run -f "$file" >/dev/null 2>"$ROOT/.migrate-error.log"; then
    # Recorded immediately after the file succeeds. Several migrations manage
    # their own transaction, so this cannot be folded into theirs.
    run -c "insert into public.schema_migrations (filename) values ('$name')" >/dev/null
    green "ok"
    applied=$((applied + 1))
  else
    red "FAILED"
    echo
    red "── error ──"
    # The log can only contain server output, never the connection string.
    sed -n '1,25p' "$ROOT/.migrate-error.log"
    echo
    dim "Stopped at $name. Nothing after it was applied."
    dim "Fix the cause, then re-run — earlier migrations are already in place."
    exit 1
  fi
done
rm -f "$ROOT/.migrate-error.log"

echo
if [ "$skipped" -gt 0 ]; then
  green "Applied $applied migrations ($skipped already in place)."
else
  green "Applied $applied migrations."
fi
echo
echo "Verifying…"
run -f "$VERIFY"
