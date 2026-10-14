-- Test only. Run on a scratch or branch database, never on the live project.
-- Commits six real-looking members who each contributed a rating of the real brand "Zara" (so
-- "Zara" has an agreement, ratings, an aged account and a published-looking history), then run
-- quality_ratings_scenarios.sql again: every check must still pass, because the script uses
-- brands no real member has and counts only its own fixture ids. Remove them with
-- populated_cleanup.sql afterwards. If the insert into auth.users fails on a NOT NULL column,
-- add that column here, never in a migration.
insert into auth.users (id, email, created_at, email_confirmed_at)
select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'member' || n || '@populated.test',
       now() - interval '90 days', now() - interval '89 days'
  from generate_series(1, 6) n;

insert into public.clothing_items (id, user_id, name, category, brand, materials, wear_count, is_wishlist, tag_text)
select ('d0000000-0000-0000-' || lpad(n::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid,
       ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'piece ' || n || '-' || k, 'tops',
       case k when 1 then 'Zara' else 'Brand ' || k end,
       case k when 1 then '[{"name":"cotton","percentage":100,"tier":"primary"}]'::jsonb end,
       4, false, case k when 1 then 'COTTON 100%' end
  from generate_series(1, 6) n, generate_series(1, 6) k;

insert into public.user_consents (user_id, purpose, granted, policy_version, adult_confirmed_at)
select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'share_ratings', true,
       (select current_version from public.consent_purposes where purpose = 'share_ratings'), now()
  from generate_series(1, 6) n;

insert into public.item_ratings (item_id, user_id, overall, touch, comfort, fit, would_buy_again, contributed, contributed_at, brand_key, wears_at_rating)
select ('d0000000-0000-0000-' || lpad(n::text, 4, '0') || '-' || lpad('1', 12, '0'))::uuid,
       ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       3 + (n % 3), 4, 4, 'true_to_size', 'yes', true, now() - interval '5 days', 'zara', 4
  from generate_series(1, 6) n;

insert into public.brand_ratings (user_id, brand_key, brand_label, overall, quality, contributed, contributed_at)
select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'zara', 'Zara', 4, 4, true, now() - interval '5 days'
  from generate_series(1, 6) n;
