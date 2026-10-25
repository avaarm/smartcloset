#!/usr/bin/env bash
# Runs the professional-accounts behaviour scripts in supabase/tests/pro. Every scenario is one transaction that
# ends in ROLLBACK, so nothing it creates (users, items, connections) is left behind. A failed check raises an
# error that lists the failing checks, and this script exits non-zero. It never runs a committing script
# (supabase/tests/pro/race.sh is the only one, and it is run by hand).
#
# One command, on a machine with PostgreSQL 16 and no Supabase stack (what the build streams use):
#
#   scripts/run-pro-sql-tests.sh --scratch                    builds a throwaway database (a stub of Supabase's roles,
#                                                             auth and storage, then every file in supabase/migrations,
#                                                             in order), runs every scenario that exists, deletes it
#   scripts/run-pro-sql-tests.sh --scratch p1_profile_invite_connect p8_legacy_lockdown      only these scenarios
#   PRO_APPLY_TWICE=1 scripts/run-pro-sql-tests.sh --scratch      also applies every *_pro_*.sql file a second time
#                                                             (proves they are safe to run twice) before the scenarios
#   PRO_SCRATCH_PORT=54412 PRO_SCRATCH_DIR=/tmp/pdb2-pg scripts/run-pro-sql-tests.sh --scratch p2_sharing
#                                                             each stream uses its own port and data directory
#   scripts/run-pro-sql-tests.sh --scratch --build-only       builds the database, runs nothing, leaves the server running
#                                                             and prints how to reach it (for race.sh, or to explore); the
#                                                             same as PRO_SCRATCH_KEEP=1 with no scenario. Stop and delete it
#                                                             with the command it prints
#   PRO_SCRATCH_KEEP=1 scripts/run-pro-sql-tests.sh --scratch p2_sharing     runs, then leaves the server running too
#   PRO_SCRATCH_TCP=1 ...                                     also listens on 127.0.0.1 (trust login, this machine only), so
#                                                             a script that wants a postgresql://127.0.0.1:<port> URL can
#                                                             reach it; off by default (the socket in the directory only)
#
# Other databases:
#
#   PRO_TEST_DB_URL=postgresql://... scripts/run-pro-sql-tests.sh [scenario ...]   a database you reach with psql that
#                                                             already has every migration applied
#   scripts/run-pro-sql-tests.sh --linked [scenario ...]      the linked Supabase project (supabase db query --linked);
#                                                             only when spelled out. After a run against a real project
#                                                             confirm that  select to_regclass('t.log')  is null
#
# Environment for --scratch: PRO_PG_BIN (default /opt/homebrew/opt/postgresql@16/bin), PRO_SCRATCH_PORT (default 54411),
# PRO_SCRATCH_DIR (default $TMPDIR/pro-sql-scratch-<port>). The server listens on a unix socket in that directory only,
# and the locale is forced to en_US.UTF-8 (without a valid locale the server refuses to start).
#
# With no scenario named, the list below runs; a scenario whose file is not written yet is skipped with a note. The
# database must have every file in supabase/migrations applied (supabase db reset does that). Files in supabase/held are
# never applied. Direct SQL does not enforce the API's "UPDATE requires a WHERE clause" rule, so these scripts cannot
# catch a bare write; migrationSafeUpdate.test.ts and the API script do.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=supabase/tests/pro

scenarios=(p1_profile_invite_connect p2_sharing p3_work p4_edges p5_deletion p6_moderation p7_catalog p8_legacy_lockdown)

mode=""
build_only=0
names=()
for arg in "$@"; do
  case "$arg" in
    --scratch) mode=scratch ;;
    --build-only) build_only=1 ;;
    --linked) mode=linked ;;
    --*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) names+=("${arg%.sql}") ;;
  esac
done
if [ -z "$mode" ]; then
  if [ -n "${PRO_TEST_DB_URL:-}" ]; then mode=url; else
    echo "usage: scripts/run-pro-sql-tests.sh --scratch|--linked [scenario ...]   or set PRO_TEST_DB_URL (see the top of this file)" >&2
    exit 2
  fi
fi

if [ "$build_only" = "1" ] && [ "$mode" != "scratch" ]; then
  echo "--build-only goes with --scratch" >&2; exit 2
fi
explicit=1
if [ ${#names[@]} -eq 0 ]; then
  explicit=0
  names=("${scenarios[@]}")
fi

# The parts of a Supabase project the migrations rely on. Test only: it is written into the scratch directory and never
# applied anywhere else. The real tables (clothing_items, friend_requests, ...) come from the migrations, so none is
# stubbed here; a stand-in created first would make 001_initial_schema.sql skip the real one.
write_stub() {
  cat > "$1" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz default now(),
  last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
create function auth.role() returns text language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
create function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $f$;
create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid,
  metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $f$
  select string_to_array(name, '/') $f$;
grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
}

# Per mode: pq runs a file, pqs runs one statement and prints the bare result.
case "$mode" in
  scratch)
    pgbin="${PRO_PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
    port="${PRO_SCRATCH_PORT:-54411}"
    base="${TMPDIR:-/tmp}"; base="${base%/}"
    data="${PRO_SCRATCH_DIR:-$base/pro-sql-scratch-$port}"
    export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
    unset PGHOST PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE
    psql_base=("$pgbin/psql" -h "$data" -p "$port" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -At)
    stop_scratch() { "$pgbin/pg_ctl" -D "$data" -m immediate -w stop >/dev/null 2>&1 || true; }
    keep="${PRO_SCRATCH_KEEP:-0}"; [ "$build_only" = "1" ] && keep=1
    cleanup() {
      if [ "$keep" = "1" ]; then
        echo "scratch database left running: psql -h $data -p $port -U postgres -d postgres"
        [ "${PRO_SCRATCH_TCP:-0}" = "1" ] && echo "                              or: postgresql://postgres@127.0.0.1:$port/postgres"
        echo "stop and delete it with: $pgbin/pg_ctl -D $data -m immediate stop && rm -rf $data"
      else
        stop_scratch; rm -rf "$data"
      fi
    }
    trap cleanup EXIT
    [ -e "$data" ] && { echo "refusing to reuse $data (it exists): choose another PRO_SCRATCH_DIR or delete it" >&2; trap - EXIT; exit 2; }
    mkdir -p "$data"; chmod 700 "$data"
    "$pgbin/initdb" -D "$data" -U postgres -A trust -E UTF8 --locale=en_US.UTF-8 >/dev/null
    listen="''"; [ "${PRO_SCRATCH_TCP:-0}" = "1" ] && listen="127.0.0.1"
    "$pgbin/pg_ctl" -D "$data" -o "-p $port -k $data -c listen_addresses=$listen" -l "$data/server.log" -w start >/dev/null
    stub="$data/stub.sql"; write_stub "$stub"
    echo "== scratch database: stub, then every migration"
    "${psql_base[@]}" -f "$stub" >/dev/null
    for f in supabase/migrations/*.sql; do
      "${psql_base[@]}" -f "$f" >/dev/null 2>"$data/err.txt" || { echo "migration failed: $f" >&2; tail -n 12 "$data/err.txt" >&2; exit 1; }
    done
    if [ "${PRO_APPLY_TWICE:-0}" = "1" ]; then
      echo "== applying every pro migration a second time"
      for f in supabase/migrations/*_pro_*.sql; do
        [ -e "$f" ] || continue
        "${psql_base[@]}" -f "$f" >/dev/null 2>"$data/err.txt" || { echo "second run failed: $f" >&2; tail -n 12 "$data/err.txt" >&2; exit 1; }
      done
    fi
    pq() { "${psql_base[@]}" "$@" 2>&1; }
    ;;
  url)
    pq() { psql "$PRO_TEST_DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@" 2>&1; }
    ;;
  linked)
    pq() { supabase db query --linked "$@"; }
    ;;
esac

failed=0
[ "$build_only" = "1" ] && names=()
for s in ${names[@]+"${names[@]}"}; do
  if [ ! -f "$dir/$s.sql" ]; then
    if [ "$explicit" -eq 1 ]; then echo "== $s: no such scenario" >&2; failed=1; else echo "== $s (skipped: not written yet)"; fi
    continue
  fi
  file="$(mktemp)"
  { echo "begin;"; cat "$dir/00_lib.sql" "$dir/10_fixture_users.sql" "$dir/20_fixture_closets.sql" "$dir/$s.sql" "$dir/99_tail.sql"; } > "$file"
  echo "== $s"
  if [ "$mode" = "linked" ]; then
    supabase db query --linked -f "$file" || failed=1
  else
    # psql prints every select; only the last line (the count of checks that passed) matters. A run that ends on anything
    # else (a script that psql stopped reading, for one) is a failure, not a pass.
    if out="$(pq -f "$file")" && [[ "$(echo "$out" | tail -n 1)" =~ ^[0-9]+$ ]]; then
      echo "$out" | tail -n 1
    else
      # from the first error on: a failed check lists the failing checks right there
      if echo "$out" | grep -q 'ERROR:'; then
        echo "$out" | grep -v '^$' | awk '/ERROR:/ { p = 1 } p' | tail -n 60
      else
        echo "$out" | grep -v '^$' | tail -n 25
      fi
      failed=1
    fi
  fi
  rm -f "$file"
done
exit $failed
