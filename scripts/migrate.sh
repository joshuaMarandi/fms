#!/usr/bin/env bash
# Apply database migrations in order, once each. Run on the server from the app folder.
#
# Self-hosted Supabase in Docker (no password needed). The container is DB_CONTAINER, read from the
# environment or from .env.local (DB_CONTAINER=fms-db); without it, supabase-db:
#   bash scripts/migrate.sh
# Or with a connection string:
#   DB_URL='postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres' bash scripts/migrate.sh
#
# Applied files are recorded in public.fms_migrations, so running it again only applies new ones.
# It stops, changing nothing, when the database is not the FMS one (no FMS tables) unless --fresh is
# given for a new, empty database, and when the FMS tables are there but no migration is recorded.
# Add --seed-base to also load the production base data (modules, roles, packages).
# Add --new-seed to also load sample records for the newer features (supabase/new_seed.sql);
# --remove-new-seed removes that sample again.
# Add --maintenance-seed for 12 months of maintenance records per vehicle (supabase/maintenance_seed.sql);
# --remove-maintenance-seed removes them.
# Add --check to only show which database would be used and what is applied (changes nothing).
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() {
  [ -f .env.local ] || return 0
  grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- | tr -d "\"'" || true
}
DB_CONTAINER="${DB_CONTAINER:-$(env_value DB_CONTAINER)}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_URL="${DB_URL:-$(env_value DB_URL)}"

sql() {
  # Reads SQL from stdin.
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"
  else
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"
  fi
}

fresh=false
check=false
for arg in "$@"; do
  case "$arg" in
    --fresh) fresh=true ;;
    --check) check=true ;;
  esac
done

if [ -n "${DB_URL:-}" ]; then echo "Database: connection string (DB_URL)"; else echo "Database: container $DB_CONTAINER"; fi

# Is this the FMS database, and what has been applied?
fms_tables="$(echo "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('companies', 'vehicles', 'drivers', 'resources');" | sql -tA)"
recorded=0
if [ "$(echo "select to_regclass('public.fms_migrations') is not null;" | sql -tA)" = "t" ]; then
  recorded="$(echo "select count(*) from public.fms_migrations;" | sql -tA)"
fi
total="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
echo "FMS tables found: $fms_tables of 4; migrations recorded: $recorded of $total files"

if [ "$fms_tables" != "4" ] && [ "$fresh" != true ]; then
  echo "Stopped: this does not look like the FMS database (no FMS tables). Nothing was changed." >&2
  echo "Set the right container in .env.local (for example DB_CONTAINER=fms-db), or add --fresh for a new, empty database." >&2
  exit 1
fi
if [ "$fms_tables" = "4" ] && [ "$recorded" = "0" ]; then
  echo "Stopped: the FMS tables are here but no migration is recorded, so every migration would run again. Nothing was changed." >&2
  echo "Record the ones already applied first (see the deploy notes), then run this again." >&2
  exit 1
fi
if [ "$check" = true ]; then
  echo "Latest recorded:"
  echo "select name from public.fms_migrations order by name desc limit 5;" | sql -tA | sed 's/^/  /'
  echo "Not applied yet:"
  for f in supabase/migrations/*.sql; do
    name="$(basename "$f")"
    [ "$(echo "select 1 from public.fms_migrations where name = '$name';" | sql -tA)" = "1" ] || echo "  $name"
  done
  exit 0
fi

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

for arg in "$@"; do
  case "$arg" in
    --seed-base) echo "load  supabase/seed_base.sql"; sql < supabase/seed_base.sql ;;
    --new-seed) echo "load  supabase/new_seed.sql"; sql < supabase/new_seed.sql ;;
    --remove-new-seed) echo "load  supabase/new_seed_remove.sql"; sql < supabase/new_seed_remove.sql ;;
    --maintenance-seed) echo "load  supabase/maintenance_seed.sql"; sql < supabase/maintenance_seed.sql ;;
    --remove-maintenance-seed) echo "load  supabase/maintenance_seed_remove.sql"; sql < supabase/maintenance_seed_remove.sql ;;
  esac
done
echo "Database up to date."
