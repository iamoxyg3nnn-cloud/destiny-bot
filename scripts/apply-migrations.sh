#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

# Keep migration history outside the exposed public schema. Previous runner
# versions applied every SQL file directly with psql and did not record history.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA IF NOT EXISTS destiny_internal'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'REVOKE ALL ON SCHEMA destiny_internal FROM PUBLIC, anon, authenticated'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS destiny_internal.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'

for migration in /workspace/supabase/migrations/*.sql; do
  [ -f "$migration" ] || continue
  version="$(basename "$migration")"
  applied="$(psql "$DATABASE_URL" -v migration_version="$version" -Atqc "SELECT 1 FROM destiny_internal.schema_migrations WHERE version = :'migration_version'")"

  if [ "$applied" = "1" ]; then
    echo "Skipping already applied migration $version"
    continue
  fi

  echo "Applying migration $version"
  # Run each migration atomically. Record it only after the SQL succeeds.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v migration_version="$version" \
    -c "INSERT INTO destiny_internal.schema_migrations (version) VALUES (:'migration_version') ON CONFLICT (version) DO NOTHING"
done
