-- p8_legacy_lockdown: the nine legacy stylist tables are closed to app users and nothing else about them changed.
--   * as anon and as a signed-in person, select, insert, update and delete on each existing legacy table are refused
--     with "permission denied"; service_role still reads and writes
--   * the tables, their rows, their policies and their row level security flag are untouched
--   * applying the lockdown again changes nothing, and delete_user_account() (which deletes from eight of them by name)
--     still works for a signed-in person
-- The nine tables are the literal list of 20261023000000_pro_lockdown_legacy_tables.sql; a table that does not exist on
-- the database under test (styling_recommendations was made by hand on the live project) is skipped.

-- Rows and a policy count to compare afterwards (made as the owner).
select t.as_admin();
create table t.legacy_before as
  select c.relname::text as tbl,
         c.relrowsecurity as rls,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations',
                       'message_threads', 'messages', 'booking_requests', 'stylist_reviews');
grant select on t.legacy_before to public;
select t.check('all nine legacy tables exist on a database built from the migrations', (select count(*) from t.legacy_before) = 9);
select t.check('row level security is on for all nine', (select bool_and(rls) from t.legacy_before));
select t.eq('the policies of 001_initial_schema.sql and the guide are in place (21)', (select sum(policies)::integer from t.legacy_before), 21);

-- A row in the tables a fixture can fill without much ceremony, as the owner (a profile for Ann, a client record, a booking).
insert into public.stylist_profiles (id, user_id, name, email, phone)
  values ('99000000-0000-0000-0000-000000000001', t.u('ann'), 'Legacy Ann', 'legacy@example.test', '555-000-0000');
insert into public.stylist_clients (id, stylist_id, client_user_id, name, email)
  values ('99000000-0000-0000-0000-000000000002', '99000000-0000-0000-0000-000000000001', t.u('bea'), 'Legacy Bea', 'bea-legacy@example.test');
insert into public.booking_requests (stylist_id, client_user_id, client_name)
  values ('99000000-0000-0000-0000-000000000001', t.u('bea'), 'Legacy Bea');
create table t.rows_before as
  select (select count(*) from public.stylist_profiles) as profiles,
         (select count(*) from public.stylist_clients) as clients,
         (select count(*) from public.booking_requests) as bookings;
grant select on t.rows_before to public;

-- The state the migration itself left, before anything below touches it: the access of every role to every legacy table.
create table t.acl_before as
  select c.relname::text as tbl, coalesce(c.relacl::text, '') as acl
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in (select tbl from t.legacy_before);
grant select on t.acl_before to public;


-- Every privilege of anon, authenticated and public is gone, found by catalogue: not only the four tables the app once used.
select t.eq('anon, authenticated and public hold no privilege on any legacy table',
            (select count(*)::integer from pg_class c cross join lateral aclexplode(c.relacl) a
              where c.relnamespace = 'public'::regnamespace and c.relname in (select tbl from t.legacy_before)
                and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))), 0);
select t.check('service_role keeps its privileges on every legacy table',
               (select count(distinct c.relname) from pg_class c cross join lateral aclexplode(c.relacl) a
                 where c.relnamespace = 'public'::regnamespace and c.relname in (select tbl from t.legacy_before)
                   and a.grantee = (select oid from pg_roles where rolname = 'service_role')) = 9);

-- The four statements, as each role, on each table.
create or replace function t.refused_on_all_legacy(p_who text) returns void language plpgsql as $$
declare
  r record;
begin
  for r in select tbl from t.legacy_before order by tbl loop
    perform t.throws(p_who || ' cannot select from ' || r.tbl, format('select 1 from public.%I limit 1', r.tbl), 'permission denied');
    perform t.throws(p_who || ' cannot insert into ' || r.tbl, format('insert into public.%I default values', r.tbl), 'permission denied');
    perform t.throws(p_who || ' cannot update ' || r.tbl, format('update public.%I set id = id where id is not null', r.tbl), 'permission denied');
    perform t.throws(p_who || ' cannot delete from ' || r.tbl, format('delete from public.%I where id is not null', r.tbl), 'permission denied');
  end loop;
end $$;
grant execute on function t.refused_on_all_legacy(text) to public;

select t.as_anon();
select t.refused_on_all_legacy('anon');
select t.as_user(t.u('eve'));
select t.refused_on_all_legacy('a signed-in person');
select t.as_user(t.u('ann'));
select t.throws('even the stylist whose profile it is cannot read it', 'select email, phone from public.stylist_profiles', 'permission denied');
select t.throws('a client cannot read their own record', 'select * from public.stylist_clients', 'permission denied');
select t.throws('a person cannot post a booking request', $q$insert into public.booking_requests (stylist_id, client_user_id, client_name) values ('99000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'x')$q$, 'permission denied');

select t.as_service();
select t.check('service_role still reads the legacy rows',
               (select count(*) from public.stylist_profiles) = (select profiles from t.rows_before)
               and (select count(*) from public.stylist_clients) = (select clients from t.rows_before)
               and (select count(*) from public.booking_requests) = (select bookings from t.rows_before));
insert into public.stylist_reviews (stylist_id, client_user_id, rating) values ('99000000-0000-0000-0000-000000000001', t.u('eve'), 5);
select t.check('service_role still writes to the legacy tables', (select count(*) from public.stylist_reviews where client_user_id = t.u('eve')) = 1);
delete from public.stylist_reviews where client_user_id = t.u('eve');

select t.as_admin();
select t.check('the rows are untouched', (select count(*) from public.stylist_profiles) = (select profiles from t.rows_before)
               and (select count(*) from public.stylist_clients) = (select clients from t.rows_before)
               and (select count(*) from public.booking_requests) = (select bookings from t.rows_before));
select t.check('the legacy row of Ann still holds her email (nothing was altered, only closed)',
               (select email from public.stylist_profiles where id = '99000000-0000-0000-0000-000000000001') = 'legacy@example.test');
select t.check('the row level security flag and the policy count of every table are as before',
               (select count(*) from t.legacy_before b join pg_class c on c.relname = b.tbl and c.relnamespace = 'public'::regnamespace
                 where c.relrowsecurity = b.rls
                   and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = b.tbl) = b.policies) = 9);

-- The statements of the lockdown file once more, as the owner: a second application must change nothing at all.
do $$
declare
  t text;
begin
  foreach t in array array['stylist_profiles', 'stylist_clients', 'appointments', 'recommendations',
                           'styling_recommendations', 'message_threads', 'messages', 'booking_requests',
                           'stylist_reviews']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from public, anon, authenticated', t);
    end if;
  end loop;
end
$$;
select t.check('applying the lockdown a second time changed no privilege on any legacy table',
  not exists (select 1 from t.acl_before b join pg_class c on c.relname = b.tbl and c.relnamespace = 'public'::regnamespace
               where coalesce(c.relacl::text, '') <> b.acl));

-- Account deletion goes through delete_user_account(), which is owned by the migration role and deletes from eight of
-- these tables by name: closing them to app users must not break it (nor, later, the cascade from auth.users).
select t.as_user(t.u('gus'));
select public.delete_user_account();
select t.as_admin();
select t.check('delete_user_account() still works for a signed-in person after the lockdown',
               not exists (select 1 from auth.users where id = t.u('gus')));
select t.as_user(t.u('bea'));
select public.delete_user_account();
select t.as_admin();
select t.check('delete_user_account() still removes a person who has legacy rows',
               not exists (select 1 from auth.users where id = t.u('bea'))
               and not exists (select 1 from public.stylist_clients where client_user_id = t.u('bea'))
               and (select count(*) from public.stylist_profiles) = (select profiles from t.rows_before));
