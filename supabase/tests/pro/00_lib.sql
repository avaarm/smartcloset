-- Test helpers for the professional-accounts scenarios (scratch DB or a rolled-back transaction only).
-- scripts/run-pro-sql-tests.sh puts "begin;" in front of this file, then 10_fixture_users.sql, 20_fixture_closets.sql,
-- one scenario and 99_tail.sql, which rolls back, so the schema t and everything below disappears with the run.
create schema if not exists t;
grant usage on schema t to public;
create table if not exists t.log (n serial, ok boolean, label text, detail text);
grant all on t.log to public; grant all on sequence t.log_n_seq to public;

-- The fixture people, by name. Their account ids are fixed so a scenario can say t.u('ann').
--   ann  a stylist, approved (caps lifted)          dee  a stylist on probation (3 clients, 1 live invite)
--   bea  a client, with a closet of eight pieces     cat  a client, with a closet of eight pieces
--   eve  a stranger with no pro rows                 gus  accepted nothing
--   hal  an account created one hour ago             ivy  only ever uses an anonymous token
create or replace function t.u(p_name text) returns uuid language sql immutable as $$
  select case p_name
    when 'ann' then 'a0000000-0000-0000-0000-00000000000a'
    when 'bea' then 'b0000000-0000-0000-0000-00000000000b'
    when 'cat' then 'c0000000-0000-0000-0000-00000000000c'
    when 'dee' then 'd0000000-0000-0000-0000-00000000000d'
    when 'eve' then 'e0000000-0000-0000-0000-00000000000e'
    when 'gus' then 'f0000000-0000-0000-0000-00000000000f'
    when 'hal' then '81000000-0000-0000-0000-000000000081'
    when 'ivy' then '19000000-0000-0000-0000-000000000019'
  end::uuid
$$;

-- A closet piece of bea or cat by number (1 to 8): see 20_fixture_closets.sql.
create or replace function t.item(p_owner text, p_n integer) returns uuid language sql immutable as $$
  select (case p_owner when 'bea' then 'b1000000-0000-0000-0000-' when 'cat' then 'c1000000-0000-0000-0000-' end
          || lpad(p_n::text, 12, '0'))::uuid
$$;

-- Who the next statements run as. As a signed-in person (the real authenticated role plus the token claims the API
-- layer sets), as a person whose token is an anonymous sign-in, as a token with no subject, as the service role, as a
-- guest (anon), and back to the owner.
create or replace function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function t.as_anonymous_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function t.as_no_subject() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function t.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;
create or replace function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;
create or replace function t.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function t.check(p_label text, p_ok boolean, p_detail text default null) returns void language plpgsql as $$
begin insert into t.log(ok, label, detail) values (coalesce(p_ok, false), p_label, p_detail); end $$;

-- Two values are equal (null equals null); the detail of a failure shows both.
create or replace function t.eq(p_label text, p_actual anyelement, p_expected anyelement) returns void language plpgsql as $$
declare ok boolean := p_actual is not distinct from p_expected;
begin
  insert into t.log(ok, label, detail)
  values (ok, p_label, case when ok then null
                            else 'got ' || coalesce(p_actual::text, 'null') || ', expected ' || coalesce(p_expected::text, 'null') end);
end $$;

-- Runs p_sql and expects an error whose message contains p_msg; optionally also the DETAIL, the HINT and the SQLSTATE.
create or replace function t.throws(p_label text, p_sql text, p_msg text,
                                    p_detail text default null, p_hint text default null, p_state text default null)
returns void language plpgsql as $$
declare m text; d text; h text; s text;
begin
  execute p_sql;
  insert into t.log(ok, label, detail) values (false, p_label, 'no error');
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail, h = pg_exception_hint, s = returned_sqlstate;
  insert into t.log(ok, label, detail) values (
    m like '%' || p_msg || '%'
      and (p_detail is null or d is not distinct from p_detail)
      and (p_hint is null or h is not distinct from p_hint)
      and (p_state is null or s = p_state),
    p_label, 'message=' || coalesce(m, '') || ' detail=' || coalesce(d, '') || ' hint=' || coalesce(h, '') || ' state=' || s);
end $$;

-- A person for a scenario, made directly (as the owner): an account (created p_age ago) with its pro_members row. A
-- client has accepted the client terms and confirmed 18+; a stylist, in addition, the stylist terms.
create or replace function t.mk_user(p_tag text, p_client boolean default true, p_stylist boolean default false,
                                     p_age interval default interval '10 days') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (v_id, p_tag || '@example.test', json_build_object('name', p_tag)::jsonb, now() - p_age);
  if p_client or p_stylist then
    insert into public.pro_members (user_id, adult_confirmed_at, client_terms_version, client_terms_accepted_at,
                                    stylist_terms_version, stylist_terms_accepted_at)
    values (v_id, now(),
            case when p_client then '2026-10' end, case when p_client then now() end,
            case when p_stylist then '2026-10' end, case when p_stylist then now() end);
  end if;
  return v_id;
end $$;

-- A stylist with a profile, made directly (as the owner); p_approved lifts probation.
create or replace function t.mk_stylist(p_tag text, p_approved boolean default false) returns uuid language plpgsql as $$
declare v_id uuid := t.mk_user(p_tag, false, true);
begin
  insert into public.pro_stylists (user_id, display_name, headline, bio, services, languages, rates_text)
  values (v_id, initcap(p_tag) || ' Stylist', 'Headline of ' || p_tag, 'Bio of ' || p_tag,
          array['outfit_styling'], array['en'], 'From $50 per session');
  if p_approved then
    update public.pro_members set stylist_approved_at = now() where user_id = v_id;
  end if;
  return v_id;
end $$;

-- An active connection between a stylist and a client, made directly (as the owner); returns its id.
create or replace function t.mk_conn(p_stylist uuid, p_client uuid, p_alias text default 'A client') returns uuid language plpgsql as $$
declare cid uuid;
begin
  insert into public.pro_connections (stylist_id, client_id, stylist_label, client_alias)
  values (p_stylist, p_client, (select display_name from public.pro_stylists where user_id = p_stylist), p_alias)
  returning id into cid;
  return cid;
end $$;

-- A live invite for a stylist, made directly (as the owner), so a scenario is not held back by the daily creation limit;
-- returns the code. p_status 'used' or 'revoked' sets the matching time too.
create or replace function t.mk_invite(p_stylist uuid, p_status text default 'live', p_expires interval default interval '7 days',
                                       p_code text default null) returns text language plpgsql as $$
declare v_code text := coalesce(p_code, public.pro_new_code());
begin
  insert into public.pro_invites (stylist_id, code, status, expires_at, client_ref, used_at, revoked_at)
  values (p_stylist, v_code, p_status, now() + p_expires, gen_random_uuid(),
          case when p_status = 'used' then now() end, case when p_status = 'revoked' then now() end);
  return v_code;
end $$;

-- Values carried from one statement of a scenario to the next (put, get), and the keys of a json object in a stable
-- order (comma separated) for checking a returned shape exactly.
create table if not exists t.vars (k text primary key, v text);
grant all on t.vars to public;
create or replace function t.put(p_k text, p_v text) returns void language sql as $$
  insert into t.vars (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.get(p_k text) returns text language sql stable as $$ select v from t.vars where k = p_k $$;
create or replace function t.keys(p_j jsonb) returns text language sql immutable as $$
  select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(p_j) k $$;

-- Fifty content terms for swap_blocked_terms, the number pro_set_enabled(true) needs. Scenarios that need the list
-- call this as the owner; the run rolls it back.
create or replace function t.load_terms() returns void language plpgsql as $$
begin
  insert into public.swap_blocked_terms (term, kind)
  select 'blockedterm' || lpad(n::text, 2, '0'), 'content' from generate_series(1, 50) n
  on conflict (term) do nothing;
end $$;

grant execute on all functions in schema t to public;

-- The feature is switched on for this transaction by a direct update, because pro_set_enabled(true) refuses without
-- 50 content terms (p6 tests that refusal, and the success after the terms are loaded).
update public.pro_config set value = 'true' where key = 'pro_enabled';
