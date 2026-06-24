-- RLS / security audit — run this against your Supabase project before launch.
-- Returns one row per problem. Empty result set = ready to ship.
--
-- Usage:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/audit.sql
--   OR paste into Supabase SQL editor.

with
  user_owned_tables as (
    select unnest(array[
      'clothing_items',
      'outfits',
      'outfit_history',
      'appointments',
      'stylist_clients',
      'stylist_profiles',
      'recommendations'
    ]) as tablename
  ),
  rls_off as (
    select t.tablename, 'RLS disabled' as issue
    from user_owned_tables t
    join pg_tables p on p.schemaname = 'public' and p.tablename = t.tablename
    where p.rowsecurity = false
  ),
  no_policies as (
    select t.tablename, 'No policies (table is locked or unprotected)' as issue
    from user_owned_tables t
    where not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t.tablename
    )
  ),
  permissive_policies as (
    select tablename, format('Policy "%s" allows USING (true) — likely too permissive', policyname) as issue
    from pg_policies
    where schemaname = 'public'
      and tablename in (select tablename from user_owned_tables)
      and qual = 'true'
  ),
  missing_user_filter as (
    -- Heuristic: a SELECT policy on user-owned data should reference auth.uid()
    select p.tablename, format('Policy "%s" does not reference auth.uid()', p.policyname) as issue
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (select tablename from user_owned_tables)
      and p.cmd = 'SELECT'
      and p.qual not like '%auth.uid%'
  )
select * from rls_off
union all select * from no_policies
union all select * from permissive_policies
union all select * from missing_user_filter
order by tablename, issue;
