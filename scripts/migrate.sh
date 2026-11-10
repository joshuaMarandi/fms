#!/usr/bin/env bash
# Apply database migrations in order, once each. Run on the server from the app folder.
#
# Self-hosted Supabase in Docker (default, no password needed):
#   bash scripts/migrate.sh
# Or with a connection string:
#   DB_URL='postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres' bash scripts/migrate.sh
#
# Applied files are recorded in public.fms_migrations, so running it again only applies new ones.
# Add --seed-base to also load the production base data (modules, roles, packages).
set -euo pipefail
cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
sql() {
  # Reads SQL from stdin.
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"
  else
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"
  fi
}

echo "create table if not exists public.fms_migrations (name text primary key, applied_at timestamptz not null default now());" | sql

for f in supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if [ "$(echo "select 1 from public.fms_migrations where name = '$name';" | sql -tA)" = "1" ]; then
    echo "skip  $name"
    continue
  fi
  echo "apply $name"
  { echo "begin;"; cat "$f"; echo; echo "insert into public.fms_migrations (name) values ('$name');"; echo "commit;"; } | sql
done

if [ "${1:-}" = "--seed-base" ]; then
  echo "load  supabase/seed_base.sql"
  sql < supabase/seed_base.sql
fi
echo "Database up to date."
