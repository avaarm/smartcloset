-- Test helpers (scratch DB only; the real scripts inline the same helpers inside a transaction).
create schema if not exists t;
grant usage on schema t to public;
create table if not exists t.log (n serial, ok boolean, label text, detail text);
grant all on t.log to public; grant all on sequence t.log_n_seq to public;
create or replace function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
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
-- Runs p_sql and expects an error whose message contains p_msg.
create or replace function t.throws(p_label text, p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t.log(ok, label, detail) values (false, p_label, 'no error');
exception when others then
  insert into t.log(ok, label, detail) values (sqlerrm like '%' || p_msg || '%', p_label, sqlerrm);
end $$;
grant execute on all functions in schema t to public;
