-- Grants audit for the quality-ratings objects. Expected: every "public" function is granted to
-- authenticated only; every "internal" one to nobody but the owner; no table is writable by a client;
-- and (third query) the legacy friends policy on clothing_items is gone, which Phase 1 requires.
-- If your client shows only the last result set, run the three queries one at a time.
select p.proname as name,
       has_function_privilege('anon', p.oid, 'execute') as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('hit_quota','consent_in_force','get_my_consents','set_consent','brand_key_raw','resolve_brand_key',
     'rebuild_brand_keys','canonical_fibre','on_rating_row_deleted',
     'primary_material_key','invalidate_brand_stats','count_bucket','round_shares_5','save_item_rating','get_my_item_rating',
     'delete_item_rating','save_brand_rating','delete_brand_rating','withdraw_contributions','delete_all_my_ratings',
     'on_consent_changed_share_ratings','get_my_brand_summary','rating_voters','rating_item_rows','rating_brand_rows',
     'compute_brand_stats','get_brand_insight','report_brand_insight')
 order by authenticated_can desc, name;

select c.relname as table_name,
       has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_any,
       has_table_privilege('authenticated', c.oid, 'insert') as auth_insert,
       has_table_privilege('authenticated', c.oid, 'update') as auth_update,
       has_table_privilege('authenticated', c.oid, 'delete') as auth_delete,
       has_table_privilege('authenticated', c.oid, 'select') as auth_select,
       c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and c.relname in ('consent_purposes','user_consents','usage_counters','rating_settings','rating_suppressions','brand_aliases',
                     'material_aliases','item_ratings','brand_ratings','brand_stats','insight_reports')
 order by 1;

-- Must be 0 once the held migration has been released (a friend could otherwise read tag_text).
select count(*) as legacy_friend_policy_present
  from pg_policies
 where schemaname = 'public' and tablename = 'clothing_items'
   and policyname = 'Friends can view each other''s wardrobe';
