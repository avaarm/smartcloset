#!/usr/bin/env bash
# Two sessions accept two different proposals that both want the same piece, at the same time.
# Exactly one may win; the other must be told "unavailable" and nothing may be reserved twice.
#
# LOCAL DATABASE ONLY (supabase start): this script COMMITS its fixtures so two sessions can see
# them, then deletes them. It refuses to run against anything that is not localhost.
#
#   SWAP_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/swaps/race.sh
set -euo pipefail
: "${SWAP_TEST_DB_URL:?set SWAP_TEST_DB_URL to a local database}"
# The host is read from the URL itself, not searched for anywhere in the text: "localhost" in a password, a
# database name or a query string must not let a remote database through. libpq also lets a query option
# replace the host (host, hostaddr, service, in plain or %-encoded spelling), and a comma-separated host list
# falls through to the next host when the first is down, so the host must be exactly one local address and the
# only options allowed are ones that cannot move the connection.
case "$SWAP_TEST_DB_URL" in postgres://*|postgresql://*) ;; *) echo "refusing to run: SWAP_TEST_DB_URL must be a postgresql:// URL" >&2; exit 1;; esac
refuse() { echo "refusing to run: $1" >&2; exit 1; }
authority="${SWAP_TEST_DB_URL#*://}"; authority="${authority%%[/?]*}"
case "${authority#*@}" in *@*) refuse "more than one @ before the host";; esac
hostport="${authority##*@}"
local_host='^(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?$'
[[ "$hostport" =~ $local_host ]] || refuse "not a local database"
query=""; case "$SWAP_TEST_DB_URL" in *\?*) query="${SWAP_TEST_DB_URL#*\?}";; esac
case "$query" in *%*) refuse "the URL options are percent-encoded";; esac
set -f; ifs_saved="$IFS"; IFS='&'
for option in $query; do case "${option%%=*}" in sslmode|connect_timeout|application_name) ;; *) refuse "the URL carries an option that could change its host";; esac; done
IFS="$ifs_saved"; set +f
unset PGHOSTADDR PGSERVICE PGSERVICEFILE   # the same overrides, set in the environment
dir="$(cd "$(dirname "$0")" && pwd)"
q() { psql "$SWAP_TEST_DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

cleanup() { q -c "delete from auth.users where email like '%@example.test'; drop schema if exists t cascade; drop table if exists public.race_ids;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

setup="$(mktemp)"
{
  echo "begin;"; echo "\\o /dev/null"
  cat "$dir/00_lib.sql" "$dir/10_fixture_users.sql" "$dir/20_fixture_listings.sql"
  cat <<'SQL'
create function t.propose2(p_who uuid, p_req uuid, p_off uuid) returns uuid language plpgsql as $$
begin perform t.as_user(p_who); return public.propose_swap(array[p_req], array[p_off], null, gen_random_uuid()); end $$;
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Denim jacket', 'outerwear', 'L', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000009.jpg');
select t.as_service();
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'friends', null, 'stripped');
  insert into pub values ('d1', lid);
end $$;
select t.as_admin();
create table public.race_ids (k text primary key, id uuid);
insert into public.race_ids select 'sb', t.propose2('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
insert into public.race_ids select 'sd', t.propose2('d0000000-0000-0000-0000-00000000000d', (select id from pub where k='a1'), (select id from pub where k='d1'));
select t.as_admin();
commit;
SQL
} > "$setup"
q -f "$setup" >/dev/null
rm -f "$setup"

first="$(mktemp)"; second="$(mktemp)"
cat > "$first" <<'SQL'
begin;
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select 'first:' || public.respond_to_swap((select id from public.race_ids where k = 'sb'), 'accept');
select pg_sleep(4);
commit;
SQL
cat > "$second" <<'SQL'
begin;
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select 'second:' || public.respond_to_swap((select id from public.race_ids where k = 'sd'), 'accept');
commit;
SQL

q -f "$first" > "$first.out" &
pid=$!
sleep 1.5
q -f "$second" > "$second.out"
wait "$pid"

won="$(grep -h 'first:' "$first.out" | tail -1)"
lost="$(grep -h 'second:' "$second.out" | tail -1)"
reserved="$(q -c "select count(distinct swap_id) from swap_items where reserved")"
rm -f "$first" "$second" "$first.out" "$second.out"
echo "$won / $lost / swaps holding a reservation: $reserved"
[ "$won" = "first:accepted" ] && [ "$lost" = "second:unavailable" ] && [ "$reserved" = "1" ] && echo "RACE OK" || { echo "RACE FAILED" >&2; exit 1; }
