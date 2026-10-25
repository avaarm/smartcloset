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
      'recommendations',
      -- Ratings and consents: the owner reads their own rows through a policy; writes go through functions.
      -- Tables with row-level security and no policy by design (the swap tables) do not belong in this list.
      'item_ratings',
      'brand_ratings',
      'user_consents'
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
  ),
  -- The nine legacy stylist tables were closed to app users by 20261023000000_pro_lockdown_legacy_tables.sql and are
  -- reached by nothing but the service role. This is not an owner-table check (they are deliberately not in the list
  -- above): it reports any privilege that anon, authenticated or PUBLIC holds on one that exists.
  legacy_pro_grants as (
    select c.relname::text as tablename,
           format('%s holds privilege %s on a legacy stylist table (it must be closed)',
                  case when a.grantee = 0 then 'PUBLIC' else (select r.rolname from pg_roles r where r.oid = a.grantee) end,
                  a.privilege_type) as issue
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname in ('stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations',
                        'message_threads', 'messages', 'booking_requests', 'stylist_reviews')
      and (a.grantee = 0 or a.grantee in (select o.oid from pg_roles o where o.rolname in ('anon', 'authenticated')))
  )
select * from rls_off
union all select * from no_policies
union all select * from permissive_policies
union all select * from missing_user_filter
union all select * from legacy_pro_grants
order by tablename, issue;
