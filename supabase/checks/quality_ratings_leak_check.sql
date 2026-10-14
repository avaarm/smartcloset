-- Run after quality_ratings_scenarios.sql (and after populated_cleanup.sql if the populated run was done).
-- Every count must be 0: the scenario script rolls back and leaves nothing behind.
select
  (select count(*) from auth.users where email like '%@example.test' or email like '%@populated.test') as fixture_users,
  (select count(*) from public.item_ratings where user_id::text like 'a0000000-%') as fixture_ratings,
  (select count(*) from public.user_consents where user_id::text like 'a0000000-%') as fixture_consents,
  (select count(*) from public.brand_stats where brand_key like 'zz%') as fixture_stats,
  (select count(*) from public.usage_counters where user_id::text like 'a0000000-%') as fixture_counters;
