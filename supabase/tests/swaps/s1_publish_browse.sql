-- ── Terms, gates ─────────────────────────────────────────────────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('terms: wrong version refused', $q$ select public.accept_swap_terms('1999') $q$, 'terms_version_mismatch');
select t.as_anon();
select t.throws('anon cannot call get_swap_settings', $q$ select public.get_swap_settings() $q$, 'permission denied');
select t.throws('anon cannot read swaps', $q$ select * from public.swaps $q$, 'permission denied');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('authenticated cannot read swaps directly', $q$ select * from public.swaps $q$, 'permission denied');
select t.throws('authenticated cannot read swap_listings directly', $q$ select * from public.swap_listings $q$, 'permission denied');
select t.throws('authenticated cannot read swap_messages directly', $q$ select * from public.swap_messages $q$, 'permission denied');
select t.throws('authenticated cannot call internal helper', $q$ select public.swap_pair_state(gen_random_uuid(), gen_random_uuid()) $q$, 'permission denied');
select t.throws('authenticated cannot call service publish', $q$ select public.swap_publish_precheck(gen_random_uuid(), gen_random_uuid(), 'friends', null) $q$, 'permission denied');
select t.check('settings reports community unavailable', (public.get_swap_settings()->>'communityAvailable')::boolean = false);


select t.as_service();
select t.throws('publish: item without a cloud photo', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000003', 'friends', null) $q$, 'listing_incomplete');
select t.throws('publish: not my item', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-000000000001', 'friends', null) $q$, 'item_not_found');
select t.throws('publish: community closed', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'community', null) $q$, 'community_unavailable');
select t.throws('publish: scam words refused', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'friends', 'pay me by gift card') $q$, 'text_not_allowed');
select t.throws('publish: note too long', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'friends', repeat('x', 141)) $q$, 'invalid_note');


-- The text filter folds first: invisible characters and wide letters do not hide a phrase.
select t.as_admin();
select t.check('zero-width characters do not hide a scam phrase', public.swap_text_ok('gift' || chr(8203) || ' card') = 'payment');
select t.check('a byte-order mark inside a word does not hide it', public.swap_text_ok('western' || chr(65279) || ' union') = 'payment');
select t.check('wide letters are folded', public.swap_text_ok('ｗｅｓｔｅｒｎ　ｕｎｉｏｎ') = 'payment');
select t.check('ordinary text still passes', public.swap_text_ok('Café-style linen shirt, size 38') is null);
select t.check('strangers: a phone number in wide digits is still contact', public.swap_text_ok('call ５５５ １２３ ４５６７', 'strict') = 'contact');

-- The checks run again at commit: an edit made while the photo was being copied cannot get past them.
select t.as_admin();
insert into clothing_items (id, user_id, name, category, brand, color, size, condition, user_image) values
  ('b1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'Silk scarf', 'accessories', 'Hermes', 'blue', 'One size', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000009.jpg');
select t.as_service();
do $$ declare r jsonb; begin
  r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000004', 'friends', null);
  insert into pub values ('toc', (r->>'listingId')::uuid);
end $$;
select t.as_admin();
update clothing_items set name = 'Pay by western union gift card' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: a scam name added after the precheck is refused', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'text_not_allowed');
select t.as_admin();
update clothing_items set name = 'Silk scarf', brand = 'Hermes gift card' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: a scam brand is refused too', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'text_not_allowed');
select t.as_admin();
update clothing_items set brand = 'Hermes', origin_country = 'western union' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: free text elsewhere on the card is checked (details)', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'text_not_allowed');
select t.as_admin();
update clothing_items set origin_country = 'France', user_image = 'file:///var/mobile/x.jpg' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: a photo removed after the precheck is refused', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'listing_incomplete');
select t.as_admin();
select t.check('none of those commits left a listing behind', not exists (select 1 from swap_listings where item_id = 'b1000000-0000-0000-0000-000000000004'));
update clothing_items set user_image = 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000009.jpg' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.check('an unedited piece still commits', public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='toc'), 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') = (select id from pub where k='toc'));
select t.as_admin();
select t.check('the listing was built from the piece as it is now', (select name || '/' || origin_country from swap_listings where id = (select id from pub where k='toc')) = 'Silk scarf/France');

select t.as_admin();
-- The snapshot carries only whitelisted fields and cleaned materials.
select t.as_admin();
select t.check('snapshot materials cleaned',
  (select materials from swap_listings where id = (select id from pub where k='a1')) = '[{"name":"wool","tier":"primary","percentage":80},{"name":"nylon","tier":"primary","percentage":20}]'::jsonb,
  (select materials::text from swap_listings where id = (select id from pub where k='a1')));
select t.check('listing photo path is id.jpg', (select photo_path = id::text || '.jpg' from swap_listings where id = (select id from pub where k='a1')));
select t.check('snapshot has no private fields',
  not exists (select 1 from information_schema.columns where table_schema='public' and table_name='swap_listings'
              and column_name in ('cost','retail_cost','notes','tag_text','estimated_value','wear_count','last_worn','purchase_date','tags','retailer','user_id','is_wishlist')));


-- ── Browsing ─────────────────────────────────────────────────────────────────
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('friend B sees A''s two listings', (select count(*) from public.browse_swap_listings('friends')) = 2);
select t.check('client RPC output columns are whitelisted',
  not exists (select 1 from pg_proc p, unnest(p.proargnames) n
               where p.pronamespace = 'public'::regnamespace
                 and p.proname in ('browse_swap_listings','get_swap_listing','list_my_swaps','list_my_swap_listings')
                 and n in ('owner_id','user_id','proposer_id','recipient_id','cost','retail_cost','notes','tag_text','estimated_value','wear_count','email','retailer','purchase_date','tags')));
select t.check('browse owner label is the friend name', (select owner_label from public.browse_swap_listings('friends') limit 1) = 'Ann');
select t.check('browse filters by category', (select count(*) from public.browse_swap_listings('friends', 'tops')) = 0);
select t.check('browse search by name', (select count(*) from public.browse_swap_listings('friends', null, null, null, 'blaz')) = 1);
select t.check('browse filter by size', (select count(*) from public.browse_swap_listings('friends', null, 'm')) = 1);
select t.check('browse filter by condition', (select count(*) from public.browse_swap_listings('friends', null, null, array['good'])) = 1);
select t.check('browse by friend id', (select count(*) from public.browse_swap_listings('friends', null, null, null, null, 'a0000000-0000-0000-0000-00000000000a')) = 2);
select t.check('browse by non-friend id is empty, not an error', (select count(*) from public.browse_swap_listings('friends', null, null, null, null, 'c0000000-0000-0000-0000-00000000000c')) = 0);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger C sees nothing on the friends rack', (select count(*) from public.browse_swap_listings('friends')) = 0);
select t.throws('stranger C: community scope closed', $q$ select * from public.browse_swap_listings('community') $q$, 'community_unavailable');
select t.throws('stranger C cannot open the listing', format($q$ select * from public.get_swap_listing(%L) $q$, (select id from pub where k='a1')), 'swap_unavailable');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('friend D (of A only) sees only A''s listings', (select count(*) from public.browse_swap_listings('friends')) = 2);

-- ── Photo policy predicate ───────────────────────────────────────────────────
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('friend can view listing photo', public.can_view_swap_photo((select id::text || '.jpg' from pub where k='a1')));
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger cannot view listing photo', not public.can_view_swap_photo((select id::text || '.jpg' from pub where k='a1')));
select t.check('unknown photo name is false', not public.can_view_swap_photo('nope.jpg'));
select t.as_anon();
select t.throws('anon cannot call can_view_swap_photo', $q$ select public.can_view_swap_photo('x.jpg') $q$, 'permission denied');


-- ── Storage policy wiring (what createSignedUrls / list see) ─────────────────
select t.as_admin();
insert into storage.objects (bucket_id, name) select 'swap-photos', id::text || '.jpg' from pub where k in ('a1', 'b1');
insert into storage.buckets (id, name) values ('wardrobe-images', 'wardrobe-images') on conflict do nothing;
insert into storage.objects (bucket_id, name) values ('wardrobe-images', 'a0000000-0000-0000-0000-00000000000a/1700000000001.jpg');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('friend sees A''s photo object and their own',
  (select count(*) from storage.objects where bucket_id = 'swap-photos') = 2);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger sees no swap photo objects', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 0);
select t.as_anon();
select t.check('anon sees no swap photo objects', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 0);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('owner sees their photo; friend''s listed photo too', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 2);
select t.throws('clients cannot write swap photos', $q$ insert into storage.objects (bucket_id, name) values ('swap-photos', 'x.jpg') $q$, 'row-level security');
-- Withdrawn listing stops being readable by others.
select public.withdraw_swap_listing((select id from pub where k='a1'));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('withdrawn listing photo is no longer readable', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 1);
-- Old-build compatibility: report_user keeps working with its four arguments.
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.report_user('a0000000-0000-0000-0000-00000000000a', 'friend_closet', 'spam', 'test');
select t.check('report_user (old signature) still works', true);
select t.throws('report_user still refuses swap contexts', $q$ select public.report_user('a0000000-0000-0000-0000-00000000000a', 'swap_chat', 'spam') $q$, 'invalid_report');

-- ── The stranger tier is dark until the switch is turned on ──────────────────
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('join before the switch is on is refused', $q$ select public.join_swap_community('Velvet Otter', true, true, '2026-10') $q$, 'community_unavailable');
select t.check('settings say community is not available', not (public.get_swap_settings()->>'communityAvailable')::boolean);

-- ── Changing the terms asks everyone again ───────────────────────────────────
select t.as_admin();
update swap_config set value = '"2026-11"'::jsonb where key = 'terms_version';
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('settings: terms no longer current', not (public.get_swap_settings()->>'termsCurrent')::boolean and (public.get_swap_settings()->>'termsAccepted')::boolean);
select t.throws('browsing needs the new terms', $q$ select * from public.browse_swap_listings('friends') $q$, 'swap_terms_required');
select t.throws('old version is refused', $q$ select public.accept_swap_terms('2026-10') $q$, 'terms_version_mismatch');
select public.accept_swap_terms('2026-11');
select t.check('accepted again', (select count(*) from public.browse_swap_listings('friends')) >= 0);
