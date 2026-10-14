-- Test only. Removes what populated_seed.sql added (deleting the members cascades to their items,
-- ratings and agreements) and the cached numbers for "Zara".
delete from public.brand_stats where brand_key = 'zara';
delete from auth.users where email like '%@populated.test';
