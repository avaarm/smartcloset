#!/usr/bin/env bash
# Parallel sessions against the professional-accounts functions. Each scenario runs two real database sessions: the
# first does its action and then holds its locks (it sleeps inside its transaction) until the second has been started
# and is waiting; the second then runs the competing call. What may and may not be true afterwards is checked from the
# final state. The second session never starts before the first has finished its action (the first tells it with a
# marker file), so the order does not depend on how loaded the machine is.
#
#   redeem            two clients redeem one single-use code at once: exactly one wins, one connection
#   revoke            a redeem racing revoke_pro_invite, in both orders: a revoked code is never redeemed
#   close             a redeem racing close_stylist_profile: no active connection to a stylist without a profile
#   accepting         a redeem racing set_stylist_accepting(false): no connection starts after the switch
#   confirm           two sessions confirm overlapping sessions of one stylist: exactly one wins
#   end               set_pro_grant, send_pro_message and respond_pro_appointment racing end_pro_connection, in both
#                     orders: nothing lands after the end
#   retry             a retried save_pro_recommendation racing the original returns the same look
#   cap               two proposals racing for the last open place on a connection: one wins
#   refresh           two reads that both sweep an expired grant write one 'expired' event
#   block             a block made through Friends (block_user) racing a redeem, in both orders: no active connection is
#                     left between the blocked pair
#
# LOCAL DATABASE ONLY (a local Supabase stack, or the scratch PostgreSQL 16 of scripts/run-pro-sql-tests.sh with
# PRO_SCRATCH_TCP=1): this script COMMITS its fixtures so two sessions can see them, then deletes them, and puts the
# server switch back as it found it. It refuses to run against anything that is not localhost. Every migration of
# supabase/migrations must already be applied.
#
#   PRO_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/pro/race.sh [scenario ...]
set -euo pipefail
: "${PRO_TEST_DB_URL:?set PRO_TEST_DB_URL to a local database}"
# The host is read from the URL itself, not searched for anywhere in the text: "localhost" in a password, a
# database name or a query string must not let a remote database through. libpq also lets a query option
# replace the host (host, hostaddr, service, in plain or %-encoded spelling), and a comma-separated host list
# falls through to the next host when the first is down, so the host must be exactly one local address and the
# only options allowed are ones that cannot move the connection.
case "$PRO_TEST_DB_URL" in postgres://*|postgresql://*) ;; *) echo "refusing to run: PRO_TEST_DB_URL must be a postgresql:// URL" >&2; exit 1;; esac
refuse() { echo "refusing to run: $1" >&2; exit 1; }
authority="${PRO_TEST_DB_URL#*://}"; authority="${authority%%[/?]*}"
case "${authority#*@}" in *@*) refuse "more than one @ before the host";; esac
hostport="${authority##*@}"
local_host='^(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?$'
[[ "$hostport" =~ $local_host ]] || refuse "not a local database"
query=""; case "$PRO_TEST_DB_URL" in *\?*) query="${PRO_TEST_DB_URL#*\?}";; esac
case "$query" in *%*) refuse "the URL options are percent-encoded";; esac
set -f; ifs_saved="$IFS"; IFS='&'
for option in $query; do case "${option%%=*}" in sslmode|connect_timeout|application_name) ;; *) refuse "the URL carries an option that could change its host";; esac; done
IFS="$ifs_saved"; set +f
unset PGHOSTADDR PGSERVICE PGSERVICEFILE   # the same overrides, set in the environment
dir="$(cd "$(dirname "$0")" && pwd)"
q() { psql "$PRO_TEST_DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

want=("$@")
tmp="$(mktemp -d)"
switch_before="$(q -c "select value::text from public.pro_config where key = 'pro_enabled'" 2>/dev/null || echo false)"
clean_db() {
  q -c "delete from auth.users where email like '%@example.test'; delete from public.pro_connections where stylist_id is null and client_id is null; drop schema if exists t cascade; update public.pro_config set value = '${switch_before:-false}'::jsonb where key = 'pro_enabled';" >/dev/null 2>&1 || true
}
trap 'clean_db; rm -rf "$tmp"' EXIT
clean_db

setup="$tmp/setup.sql"
{ echo "begin;"; echo "\\o /dev/null"; cat "$dir/00_lib.sql"; cat <<'SQL'
-- a call that reports its error text instead of raising, so the second session can print what happened to it
create function t.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function t.try(text) to public;
commit;
SQL
} > "$setup"
q -f "$setup" >/dev/null

failures=0
fail() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }
n=0

# race <first sql> <second sql>: runs the first session, waits until it has done its action and holds its locks, runs the
# second to completion, waits for the first. Their output lines are left in $tmp/first.out and $tmp/second.out.
race() {
  n=$((n + 1))
  local ready="$tmp/ready.$n"
  { echo "begin;"; echo "$1"; echo "\\! touch '$ready'"; echo "select pg_sleep(3);"; echo "commit;"; } > "$tmp/first.sql"
  { echo "begin;"; echo "$2"; echo "commit;"; } > "$tmp/second.sql"
  q -f "$tmp/first.sql" > "$tmp/first.out" 2> "$tmp/first.err" &
  local pid=$!
  local waited=0
  while [ ! -e "$ready" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 0.1; waited=$((waited + 1)); [ "$waited" -lt 300 ] || break
  done
  if [ ! -e "$ready" ]; then
    kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true
    echo "the first session did not reach its marker: $(head -c 400 "$tmp/first.err")" >&2
    : > "$tmp/second.out"; return 1
  fi
  q -f "$tmp/second.sql" > "$tmp/second.out" 2> "$tmp/second.err" || echo "second session: $(head -c 400 "$tmp/second.err")" >&2
  wait "$pid" || echo "first session: $(head -c 400 "$tmp/first.err")" >&2
}
out1() { grep -E '^(first|actor|ender):' "$tmp/first.out" 2>/dev/null | tail -n 1 || true; }
out2() { grep -E '^(second|actor|ender):' "$tmp/second.out" 2>/dev/null | tail -n 1 || true; }
expect() { [ "$2" = "$3" ] || fail "$1: got '$2', expected '$3'"; }
selected() { [ ${#want[@]} -eq 0 ] && return 0; local w; for w in "${want[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

stylist() { q -c "select t.mk_stylist('$1', true)"; }
client() { q -c "select t.mk_user('$1', true)"; }
conn() { q -c "select t.mk_conn('$1', '$2', 'Client')"; }
as() { echo "select t.as_user('$1');"; }

if selected redeem; then
  echo "== redeem: two clients, one code"
  s="$(stylist rs1)"; a="$(client rc1a)"; b="$(client rc1b)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$a") select 'first:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');" \
       "$(as "$b") select 'second:' || (public.redeem_pro_invite('$code', 'Bob')->>'ok');"
  expect "redeem: the first" "$(out1)" "first:true"; expect "redeem: the second" "$(out2)" "second:false"
  expect "redeem: one connection" "$(q -c "select count(*) from public.pro_connections where stylist_id = '$s' and status = 'active'")" 1
  expect "redeem: the code is used once" "$(q -c "select status from public.pro_invites where code = '$code'")" used
  s="$(stylist rs1b)"; a="$(client rc1c)"; b="$(client rc1d)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$b") select 'first:' || (public.redeem_pro_invite('$code', 'Bob')->>'ok');" \
       "$(as "$a") select 'second:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');"
  expect "redeem (other order): the first" "$(out1)" "first:true"; expect "redeem (other order): the second" "$(out2)" "second:false"
  expect "redeem (other order): one connection" "$(q -c "select count(*) from public.pro_connections where stylist_id = '$s' and status = 'active'")" 1
fi

if selected revoke; then
  echo "== revoke: a redeem racing the stylist revoking the code"
  s="$(stylist rs2)"; a="$(client rc2a)"; code="$(q -c "select t.mk_invite('$s')")"; inv="$(q -c "select id from public.pro_invites where code = '$code'")"
  race "$(as "$s") select public.revoke_pro_invite('$inv');" \
       "$(as "$a") select 'second:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');"
  expect "revoke first: the redeem is refused" "$(out2)" "second:false"
  expect "revoke first: no connection came from the code" "$(q -c "select count(*) from public.pro_connections where invite_id = '$inv'")" 0
  expect "revoke first: the code is revoked" "$(q -c "select status from public.pro_invites where id = '$inv'")" revoked
  s="$(stylist rs2b)"; a="$(client rc2b)"; code="$(q -c "select t.mk_invite('$s')")"; inv="$(q -c "select id from public.pro_invites where code = '$code'")"
  race "$(as "$a") select 'first:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');" \
       "$(as "$s") select public.revoke_pro_invite('$inv');"
  expect "redeem first: the redeem worked" "$(out1)" "first:true"
  expect "redeem first: the connection exists" "$(q -c "select count(*) from public.pro_connections where invite_id = '$inv' and status = 'active'")" 1
  expect "redeem first: the revoke changed nothing (the code was already used)" "$(q -c "select status from public.pro_invites where id = '$inv'")" used
fi

if selected close; then
  echo "== close: a redeem racing close_stylist_profile"
  s="$(stylist rs3)"; a="$(client rc3a)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$s") select public.close_stylist_profile();" \
       "$(as "$a") select 'second:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');"
  expect "close first: the redeem is refused" "$(out2)" "second:false"
  expect "close first: no connection to the stylist" "$(q -c "select count(*) from public.pro_connections where stylist_id = '$s'")" 0
  s="$(stylist rs3b)"; a="$(client rc3b)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$a") select 'first:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');" \
       "$(as "$s") select public.close_stylist_profile();"
  expect "redeem first: the redeem worked" "$(out1)" "first:true"
  expect "redeem first, then the close: no active connection to a stylist without a profile" "$(q -c "select count(*) from public.pro_connections c where c.status = 'active' and not exists (select 1 from public.pro_stylists p where p.user_id = c.stylist_id) and c.stylist_id = '$s'")" 0
  expect "redeem first, then the close: the connection was ended by the stylist" "$(q -c "select ended_by from public.pro_connections where stylist_id = '$s'")" stylist
fi

if selected accepting; then
  echo "== accepting: a redeem racing set_stylist_accepting(false)"
  s="$(stylist rs4)"; a="$(client rc4a)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$s") select public.set_stylist_accepting(false);" \
       "$(as "$a") select 'second:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');"
  expect "accepting off first: the redeem is refused" "$(out2)" "second:false"
  expect "accepting off first: no connection started" "$(q -c "select count(*) from public.pro_connections where stylist_id = '$s'")" 0
  s="$(stylist rs4b)"; a="$(client rc4b)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$a") select 'first:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');" \
       "$(as "$s") select public.set_stylist_accepting(false);"
  expect "redeem first: the redeem worked" "$(out1)" "first:true"
  expect "redeem first: the switch still went off, with the connection kept" "$(q -c "select accepting_clients::text || ':' || (select count(*) from public.pro_connections where stylist_id = '$s' and status = 'active') from public.pro_stylists where user_id = '$s'")" "false:1"
fi

if selected confirm; then
  echo "== confirm: two sessions of one stylist that overlap"
  s="$(stylist rs5)"; a="$(client rc5a)"; b="$(client rc5b)"; ca="$(conn "$s" "$a")"; cb="$(conn "$s" "$b")"
  start="$(q -c "select (now() + interval '3 days')::text")"
  sa="$(q -c "insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes) values ('$ca', 'client', '$start', 60, 'virtual', 0) returning id")"
  sb="$(q -c "insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes) values ('$cb', 'client', '$start'::timestamptz + interval '30 minutes', 60, 'virtual', 0) returning id")"
  race "$(as "$s") select 'first:' || t.try(\$\$select public.respond_pro_appointment('$sa', 'confirm')\$\$);" \
       "$(as "$s") select 'second:' || t.try(\$\$select public.respond_pro_appointment('$sb', 'confirm')\$\$);"
  expect "confirm: the first" "$(out1)" "first:ok"; expect "confirm: the second" "$(out2)" "second:appointment_conflict"
  expect "confirm: exactly one confirmed" "$(q -c "select count(*) from public.pro_appointments where id in ('$sa', '$sb') and status = 'confirmed'")" 1
fi

# The actor: a client doing one of three things; the other session ends the connection. Nothing may land after the end.
if selected end; then
  for what in grant message respond; do
    for order in actor-first end-first; do
      echo "== end: $what, $order"
      s="$(stylist "re6$what${order:0:1}")"; a="$(client "rc6$what${order:0:1}")"; c="$(conn "$s" "$a")"
      appt="$(q -c "insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes) values ('$c', 'stylist', now() + interval '3 days', 60, 'virtual', 0) returning id")"
      case "$what" in
        grant)   act="select 'actor:' || t.try(\$\$select public.set_pro_grant('$c', 'closet', true, 'all', null, '2026-10')\$\$);" ;;
        message) act="select 'actor:' || t.try(\$\$select public.send_pro_message('$c', 'hello', gen_random_uuid())\$\$);" ;;
        respond) act="select 'actor:' || t.try(\$\$select public.respond_pro_appointment('$appt', 'confirm')\$\$);" ;;
      esac
      stop="select 'ender:' || t.try(\$\$select public.end_pro_connection('$c')\$\$);"
      if [ "$order" = actor-first ]; then
        race "$(as "$a") $act" "$(as "$s") $stop"
        expect "end: $what, actor first: the actor" "$(out1)" "actor:ok"; expect "end: $what, actor first: the end" "$(out2)" "ender:ok"
      else
        race "$(as "$s") $stop" "$(as "$a") $act"
        expect "end: $what, end first: the end" "$(out1)" "ender:ok"; expect "end: $what, end first: the actor is refused" "$(out2)" "actor:connection_ended"
      fi
      expect "end: $what: the connection ended" "$(q -c "select status from public.pro_connections where id = '$c'")" ended
      expect "end: $what: no grant" "$(q -c "select count(*) from public.pro_grants where connection_id = '$c'")" 0
      expect "end: $what: the last line of the thread is the end" "$(q -c "select code from public.pro_messages where connection_id = '$c' order by id desc limit 1")" ended
      expect "end: $what: no session is left open" "$(q -c "select count(*) from public.pro_appointments where connection_id = '$c' and status in ('proposed', 'confirmed')")" 0
      case "$what" in
        grant)   expect "end: grant: events" "$(q -c "select coalesce(string_agg(event, ',' order by id), '') from public.pro_grant_events where connection_id = '$c'")" "$([ "$order" = actor-first ] && echo granted,connection_ended || echo '')" ;;
        message) expect "end: message: texts" "$(q -c "select count(*) from public.pro_messages where connection_id = '$c' and kind = 'text'")" "$([ "$order" = actor-first ] && echo 1 || echo 0)" ;;
        respond) expect "end: respond: the session is cancelled either way" "$(q -c "select status from public.pro_appointments where id = '$appt'")" cancelled ;;
      esac
    done
  done
fi

if selected retry; then
  echo "== retry: a retried save racing the original"
  s="$(stylist rs7)"; a="$(client rc7a)"; c="$(conn "$s" "$a")"; ref="$(q -c "select gen_random_uuid()")"
  race "$(as "$s") select 'first:' || (public.save_pro_recommendation('$c', null, 'Look', 'Words', null, '$ref')->>'id');" \
       "$(as "$s") select 'second:' || (public.save_pro_recommendation('$c', null, 'Look', 'Words', null, '$ref')->>'id');"
  expect "retry: one look" "$(q -c "select count(*) from public.pro_recommendations where connection_id = '$c'")" 1
  expect "retry: the same id both times" "$(out1 | sed 's/^first://')" "$(out2 | sed 's/^second://')"
fi

if selected cap; then
  echo "== cap: two proposals for the last open place"
  s="$(stylist rs8)"; a="$(client rc8a)"; c="$(conn "$s" "$a")"
  q -c "insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes) select '$c', 'stylist', now() + make_interval(days => 10 + g), 30, 'virtual', 0 from generate_series(1, 4) g" > /dev/null
  race "$(as "$s") select 'first:' || t.try(\$\$select public.propose_pro_appointment('$c', now() + interval '30 days', 30, 'virtual', '', '', 0, gen_random_uuid())\$\$);" \
       "$(as "$s") select 'second:' || t.try(\$\$select public.propose_pro_appointment('$c', now() + interval '31 days', 30, 'virtual', '', '', 0, gen_random_uuid())\$\$);"
  expect "cap: the first" "$(out1)" "first:ok"; expect "cap: the second" "$(out2)" "second:appointment_open_limit"
  expect "cap: five open, not six" "$(q -c "select count(*) from public.pro_appointments where connection_id = '$c' and status = 'proposed'")" 5
fi

if selected refresh; then
  echo "== refresh: two reads sweeping one expired grant"
  s="$(stylist rs9)"; a="$(client rc9a)"; c="$(conn "$s" "$a")"
  q -c "insert into public.pro_grants (connection_id, scope, item_mode, granted_at, expires_at, text_version) values ('$c', 'closet', 'all', now() - interval '91 days', now() - interval '1 day', '2026-10')" > /dev/null
  race "$(as "$a") select 'first:' || (public.get_pro_grant('$c')->>'enabled');" \
       "$(as "$s") select 'second:' || (public.get_pro_grant('$c')->>'enabled');"
  expect "refresh: the first read" "$(out1)" "first:false"; expect "refresh: the second read" "$(out2)" "second:false"
  expect "refresh: one expired event between them" "$(q -c "select count(*) from public.pro_grant_events where connection_id = '$c' and event = 'expired'")" 1
  expect "refresh: the grant is gone" "$(q -c "select count(*) from public.pro_grants where connection_id = '$c'")" 0
fi

if selected block; then
  echo "== block: a Friends block racing a redeem"
  # the redeem is in flight (its connection is not committed yet) when the stylist's block arrives: the block must wait for
  # the pair lock, then see the connection and end it
  s="$(stylist rs10)"; a="$(client rc10a)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$a") select 'first:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');" \
       "$(as "$s") select 'second:' || t.try(\$\$select public.block_user('$a')\$\$);"
  expect "redeem first: the redeem worked" "$(out1)" "first:true"; expect "redeem first: the block worked" "$(out2)" "second:ok"
  expect "redeem first, then the block: no active connection between the pair" "$(q -c "select count(*) from public.pro_connections where stylist_id = '$s' and client_id = '$a' and status = 'active'")" 0
  expect "redeem first, then the block: it ended as the blocker's, a closed shell" "$(q -c "select ended_by || ':' || (shell_at is not null)::text from public.pro_connections where stylist_id = '$s' and client_id = '$a'")" "stylist:true"
  # the block is in flight when the redeem arrives: the redeem waits for the pair lock and then finds the block
  s="$(stylist rs10b)"; a="$(client rc10b)"; code="$(q -c "select t.mk_invite('$s')")"
  race "$(as "$s") select 'first:' || t.try(\$\$select public.block_user('$a')\$\$);" \
       "$(as "$a") select 'second:' || (public.redeem_pro_invite('$code', 'Alice')->>'ok');"
  expect "block first: the block worked" "$(out1)" "first:ok"; expect "block first: the redeem is refused" "$(out2)" "second:false"
  expect "block first: no connection between the pair" "$(q -c "select count(*) from public.pro_connections where stylist_id = '$s' and client_id = '$a'")" 0
  expect "block first: the code is still live (nothing consumed)" "$(q -c "select status from public.pro_invites where code = '$code'")" live
fi

if [ "$failures" -eq 0 ]; then echo "RACE OK"; else echo "RACE FAILED ($failures)" >&2; exit 1; fi
