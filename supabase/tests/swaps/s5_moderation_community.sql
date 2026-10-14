create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create or replace function t.propose(p_who uuid, p_req uuid, p_off uuid, p_note text default null) returns uuid language plpgsql as $$
begin
  perform t.as_user(p_who);
  return public.propose_swap(array[p_req], array[p_off], p_note, gen_random_uuid());
end $$;

-- ── Reports ──────────────────────────────────────────────────────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'scam', 'asks for money');
select t.as_admin();
select t.check('listing report stored with evidence and the right target',
  exists (select 1 from content_reports where reporter_id = 'a0000000-0000-0000-0000-00000000000a'
          and reported_user_id = 'b0000000-0000-0000-0000-00000000000b' and context = 'swap_listing'
          and reason = 'scam' and ref_type = 'listing' and evidence->>'name' = 'Linen shirt'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'spam');
select t.as_admin();
select t.check('repeat report within a week is folded', (select count(*) from content_reports where ref_id = (select id from pub where k='b1')) = 1);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('stranger cannot report what they cannot see', format($q$ select public.report_swap_content('listing', %L, 'spam') $q$, (select id from pub where k='b1')), 'swap_unavailable');
select t.throws('report: bad reason', format($q$ select public.report_swap_content('listing', %L, 'nonsense') $q$, (select id from pub where k='b1')), 'invalid_report');
select t.throws('report: bad ref type', format($q$ select public.report_swap_content('user', %L, 'spam') $q$, (select id from pub where k='b1')), 'invalid_report');

-- Hold at 3 different reporters: B gets two more friends who can see the listing.
select t.as_admin();
insert into auth.users (id, email, created_at) values
  ('e1000000-0000-0000-0000-000000000001', 'e1@example.test', now() - interval '9 days'),
  ('e1000000-0000-0000-0000-000000000002', 'e2@example.test', now() - interval '9 days');
insert into friend_requests (requester_id, recipient_id, status, responded_at) values
  ('e1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now()),
  ('e1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now());
insert into swap_members (user_id, terms_version, terms_accepted_at) values
  ('e1000000-0000-0000-0000-000000000001', '2026-10', now()), ('e1000000-0000-0000-0000-000000000002', '2026-10', now());
insert into ids select 'prop', t.propose('a0000000-0000-0000-0000-00000000000a', (select id from pub where k='b1'), (select id from pub where k='a1'), 'hello');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'not_as_described');
select t.as_admin();
select t.check('two reporters do not hold the listing', (select status from swap_listings where id = (select id from pub where k='b1')) = 'active');
select t.as_user('e1000000-0000-0000-0000-000000000002');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'inappropriate');
select t.as_admin();
select t.check('three reporters hold the listing', (select status from swap_listings where id = (select id from pub where k='b1')) = 'held');
select t.check('holding closes the open proposal', (select status from swaps where id = (select id from ids where k='prop')) = 'cancelled');
select t.check('held listing is off the rack', (select count(*) from swap_listings where status='held') = 1);
select public.swap_admin_release_listing((select id from pub where k='b1'));
select t.check('admin can release a held listing', (select status from swap_listings where id = (select id from pub where k='b1')) = 'active');
select t.check('releasing clears who held it', (select held_by from swap_listings where id = (select id from pub where k='b1')) is null);

-- ── Holds are sticky: expiry, renewing, withdrawing, listing again and lifting a suspension do not clear one ──
select t.as_admin();
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('b1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-00000000000b', 'Hold test shirt', 'tops', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000020.jpg'),
  ('b1000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-00000000000b', 'Remove test shirt', 'tops', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000021.jpg'),
  ('b1000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-00000000000b', 'Reserve test shirt', 'tops', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000022.jpg');
select t.as_service();
do $$ declare r jsonb; lid uuid; i integer; ids uuid[] := array['b1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000007'];
begin
  for i in 1..3 loop
    r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', ids[i], 'friends', null);
    lid := (r->>'listingId')::uuid;
    perform public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', lid, ids[i], 'friends', null, 'stripped');
    insert into pub values ('h' || i, lid);
  end loop;
end $$;
select t.as_admin();
select public.swap_admin_hold_listing((select id from pub where k='h1'));
select t.check('a hold records who made it', (select status || '/' || held_by from swap_listings where id = (select id from pub where k='h1')) = 'held/admin');
-- 1. the daily job does not turn a hold into an expiry
update swap_listings set expires_at = now() - interval '1 day' where id = (select id from pub where k='h1');
select public.swap_janitor(true);
select t.check('the janitor leaves a held listing held', (select status from swap_listings where id = (select id from pub where k='h1')) = 'held');
-- 2. renewing and 3. withdrawing are refused
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('renew refuses a held listing', format($q$ select public.renew_swap_listing(%L) $q$, (select id from pub where k='h1')), 'listing_held');
select t.throws('withdraw refuses a held listing', format($q$ select public.withdraw_swap_listing(%L) $q$, (select id from pub where k='h1')), 'listing_held');
select t.check('the owner still sees it, as held', (select status from public.list_my_swap_listings() where listing_id = (select id from pub where k='h1')) = 'held');
-- 4. listing the piece again is refused, before and after the photo copy
select t.as_service();
select t.throws('precheck refuses a piece whose listing is held', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000005', 'friends', null) $q$, 'listing_held');
select t.throws('commit refuses a piece whose listing is held', $q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', gen_random_uuid(), 'b1000000-0000-0000-0000-000000000005', 'friends', null, 'stripped') $q$, 'listing_held');
select t.as_admin();
select t.check('still exactly one listing for the held piece', (select count(*) from swap_listings where item_id = 'b1000000-0000-0000-0000-000000000005') = 1);
-- 4b. moving the piece to the wishlist and back does not clear the hold
update clothing_items set is_wishlist = true where id = 'b1000000-0000-0000-0000-000000000005';
select t.check('a hold survives the piece going to the wishlist', (select status from swap_listings where id = (select id from pub where k='h1')) = 'held');
update clothing_items set is_wishlist = false where id = 'b1000000-0000-0000-0000-000000000005';
select t.as_service();
select t.throws('...and back: the piece still cannot be listed again', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000005', 'friends', null) $q$, 'listing_held');
select t.as_admin();
-- 5. a suspension that ends releases only what it held
select public.swap_admin_suspend('b0000000-0000-0000-0000-00000000000b', 'test');
select t.check('a suspension holds the member''s other listings, marked as such',
  (select held_by from swap_listings where id = (select id from pub where k='h2')) = 'suspension');
select public.swap_admin_unsuspend('b0000000-0000-0000-0000-00000000000b');
select t.check('lifting the suspension releases its own holds', (select status from swap_listings where id = (select id from pub where k='h2')) = 'active');
select t.check('...but not a hold made by a person', (select status from swap_listings where id = (select id from pub where k='h1')) = 'held');
-- 6. releasing is a person's decision, listing by listing (the listing is long past its date, so it comes back expired)
select public.swap_admin_release_listing((select id from pub where k='h1'));
select t.check('a person can release it', (select status from swap_listings where id = (select id from pub where k='h1')) = 'expired');

-- 7. a person can remove a listing for good
select public.swap_admin_hold_listing((select id from pub where k='h2'));
insert into content_reports (reporter_id, reported_user_id, context, reason, ref_type, ref_id)
values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'swap_listing', 'scam', 'listing', (select id from pub where k='h2'));
select public.swap_admin_remove_listing((select id from pub where k='h2'), 'looks like a scam');
select t.check('removed', (select status from swap_listings where id = (select id from pub where k='h2')) = 'removed');
select t.check('its photo is queued for deletion', exists (select 1 from swap_photo_gc where path = (select id::text || '.jpg' from pub where k='h2')));
select t.check('its reports are marked handled', (select outcome from content_reports where ref_id = (select id from pub where k='h2')) = 'looks like a scam');
select t.check('it is off the rack for everyone', not exists (select 1 from swap_listings where id = (select id from pub where k='h2') and status = 'active'));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('a removed listing cannot be renewed', format($q$ select public.renew_swap_listing(%L) $q$, (select id from pub where k='h2')), 'listing_held');
select t.as_service();
select t.throws('the piece cannot be listed again', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000006', 'friends', null) $q$, 'listing_held');
select t.as_admin();
update swap_listings set status_changed_at = now() - interval '40 days' where id = (select id from pub where k='h2');
update content_reports set created_at = now() - interval '100 days' where ref_id = (select id from pub where k='h2');
select public.swap_janitor(true);
select t.check('the removed row stays while the piece exists (so it cannot be listed again)', exists (select 1 from swap_listings where id = (select id from pub where k='h2')));
delete from clothing_items where id = 'b1000000-0000-0000-0000-000000000006';
select public.swap_janitor(true);
select t.check('...and goes after the piece is deleted', not exists (select 1 from swap_listings where id = (select id from pub where k='h2')));

-- 8. reports made while a listing is reserved still count when it comes back
select t.as_admin();
insert into friend_requests (requester_id, recipient_id, status, responded_at) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'accepted', now()), ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'accepted', now());
select t.as_user('e1000000-0000-0000-0000-000000000001'); select public.report_swap_content('listing', (select id from pub where k='h3'), 'not_as_described');
select t.as_user('e1000000-0000-0000-0000-000000000002'); select public.report_swap_content('listing', (select id from pub where k='h3'), 'not_as_described');
select t.as_admin();
select t.check('two reports do not hold it', (select status from swap_listings where id = (select id from pub where k='h3')) = 'active');
insert into ids select 'rsv', t.propose('a0000000-0000-0000-0000-00000000000a', (select id from pub where k='h3'), (select id from pub where k='a1'), 'hello');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.respond_to_swap((select id from ids where k='rsv'), 'accept');
-- A reserved listing can only be reported by the two people in the swap; A's report is the third.
select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.report_swap_content('listing', (select id from pub where k='h3'), 'not_as_described');
select t.as_admin();
select t.check('three reports do not disturb a swap in progress', (select status from swap_listings where id = (select id from pub where k='h3')) = 'reserved');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.cancel_swap((select id from ids where k='rsv'));
select t.as_admin();
select t.check('when the swap ends the listing is held, not put back on the rack',
  (select status || '/' || held_by from swap_listings where id = (select id from pub where k='h3')) = 'held/reports');
select t.check('...and the other side''s listing is free again', (select status from swap_listings where id = (select id from pub where k='a1')) = 'active');
select public.swap_admin_release_listing((select id from pub where k='h3'));

-- Chat report with a flagged message and evidence.
select t.as_admin();
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
insert into ids select 'chat', t.propose('a0000000-0000-0000-0000-00000000000a', (select id from pub where k='b2'), (select id from pub where k='a1'), 'hello there');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.send_swap_message((select id from ids where k='chat'), 'you are annoying', gen_random_uuid());
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.report_swap_content('swap', (select id from ids where k='chat'), 'harassment', 'rude',
  (public.get_swap((select id from ids where k='chat'))->'messages'->-1->>'id')::bigint);
select t.throws('cannot flag my own message', format($q$ select public.report_swap_content('swap', %L, 'harassment', null, %s) $q$, (select id from ids where k='chat'),
  (select (public.get_swap((select id from ids where k='chat'))->'messages'->1->>'id')::bigint)), 'invalid_report');
select t.as_admin();
select t.check('chat report: evidence has the messages and the flag',
  exists (select 1 from content_reports where context = 'swap_chat' and reported_user_id = 'b0000000-0000-0000-0000-00000000000b'
          and jsonb_array_length(evidence->'messages') >= 3 and evidence->>'flaggedMessageId' is not null
          and evidence->'messages'->-1->>'from' = 'reported'));
select t.check('moderation queue lists swap reports', (select count(*) from swap_moderation_queue) >= 2);
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('outsider cannot report a swap', format($q$ select public.report_swap_content('swap', %L, 'spam') $q$, (select id from ids where k='chat')), 'swap_unavailable');

-- Report rate limit is shared and per day.
select t.as_admin();
insert into content_reports (reporter_id, reported_user_id, context, reason)
select 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c', 'friend_request', 'spam' from generate_series(1, 19) g;
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('21st report in a day is limited', format($q$ select public.report_swap_content('listing', %L, 'spam') $q$, (select id from pub where k='b2')), 'report_rate_limited');

-- ── Blocking from a swap ─────────────────────────────────────────────────────
select t.as_admin();
delete from content_reports where reporter_id = 'a0000000-0000-0000-0000-00000000000a' and reported_user_id = 'c0000000-0000-0000-0000-00000000000c';
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.block_swap_member('swap', (select id from ids where k='chat'));
select t.check('ordinary blocks stay visible to the blocker', (select count(*) from user_blocks) = 1);
select t.as_admin();
select t.check('blocking a friend from a swap blocks them, friend-style',
  exists (select 1 from user_blocks where blocker_id = 'a0000000-0000-0000-0000-00000000000a' and blocked_id = 'b0000000-0000-0000-0000-00000000000b' and not via_swap and blocked_name = 'Bea'));
select t.check('and ends the swap and the friendship',
  (select status from swaps where id = (select id from ids where k='chat')) = 'cancelled'
  and not exists (select 1 from friend_requests where status='accepted' and 'a0000000-0000-0000-0000-00000000000a' in (requester_id, recipient_id) and 'b0000000-0000-0000-0000-00000000000b' in (requester_id, recipient_id)));

-- ── Community tier ───────────────────────────────────────────────────────────
select t.as_service();
select t.throws('cannot enable community without a term list', $q$ select public.swap_set_community_enabled(true) $q$, 'content terms');
select t.as_admin();
-- The term list takes any script, folded; accents and invisible characters in the text do not get round it.
select t.throws('a term must already be folded (no capitals or accents)', $q$ insert into swap_blocked_terms (term, kind) values ('Zzcafé', 'content') $q$, 'violates check constraint');
select t.throws('a term cannot hold punctuation', $q$ insert into swap_blocked_terms (term, kind) values ('zz-term', 'content') $q$, 'violates check constraint');
select t.throws('a term cannot be one letter', $q$ insert into swap_blocked_terms (term, kind) values ('z', 'content') $q$, 'violates check constraint');
insert into swap_blocked_terms (term, kind) values ('zzcafe', 'content'), ('пример', 'content');
select t.check('an accented spelling matches a folded term', public.swap_text_ok('ZZCAFÉ for sale') = 'content');
select t.check('a zero-width character does not split a term', public.swap_text_ok('zz' || chr(8203) || 'cafe') = 'content');
select t.check('a term in another script matches', public.swap_text_ok('Это ПРИМЕР') = 'content');
select t.check('terms match whole words only', public.swap_text_ok('zzcafes and примеры') is null);
delete from swap_blocked_terms where term in ('zzcafe', 'пример');

-- Someone has to hear about reports: the backlog counts old unreviewed ones, and the alert never raises.
insert into content_reports (reporter_id, reported_user_id, context, reason, created_at)
values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'swap_listing', 'scam', now() - interval '6 hours');
select t.check('the backlog counts a report that has waited 4 hours', (select waiting >= 1 and oldest_hours >= 6 from public.swap_report_backlog()));
select t.check('...but not one that is brand new', (select waiting from public.swap_report_backlog(interval '1 day')) < (select waiting from public.swap_report_backlog()));
select t.check('without pg_net or Vault the digest quietly does nothing', public.swap_send_report_digest() = false);
delete from content_reports where created_at < now() - interval '5 hours' and context = 'swap_listing' and ref_id is null;
select t.as_admin();
insert into swap_blocked_terms (term, kind) select 'badword' || g, 'content' from generate_series(1, 50) g;
select t.as_service();
select public.swap_set_community_enabled(true);
select t.as_admin();
insert into auth.users (id, email, raw_user_meta_data, created_at) values ('f0000000-0000-0000-0000-00000000000f', 'new@example.test', '{}', now());
insert into swap_members (user_id, terms_version, terms_accepted_at) values ('f0000000-0000-0000-0000-00000000000f', '2026-10', now());

select t.as_user('f0000000-0000-0000-0000-00000000000f');
select t.throws('join: account too new', $q$ select public.join_swap_community('Fresh Face', true, true, '2026-10') $q$, 'account_too_new');
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('join: adult confirmation required', $q$ select public.join_swap_community('Velvet Otter', false, true, '2026-10') $q$, 'adult_required');
select t.throws('join: photo scan acknowledgement required', $q$ select public.join_swap_community('Velvet Otter', true, false, '2026-10') $q$, 'scan_ack_required');
select t.throws('join: reserved alias', $q$ select public.join_swap_community('Smartcloset Staff', true, true, '2026-10') $q$, 'alias_invalid');
select t.throws('join: alias with an email', $q$ select public.join_swap_community('cat@example.com', true, true, '2026-10') $q$, 'alias_invalid');
select t.throws('join: alias with a blocked term', $q$ select public.join_swap_community('badword7 fan', true, true, '2026-10') $q$, 'text_not_allowed');
select public.join_swap_community('Velvet Otter', true, true, '2026-10');
select t.check('C joined', (public.get_swap_settings()->>'communityJoined')::boolean and public.get_swap_settings()->>'alias' = 'Velvet Otter');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('join: alias taken (case-insensitive)', $q$ select public.join_swap_community('velvet otter', true, true, '2026-10') $q$, 'alias_taken');
select public.join_swap_community('Quiet Heron', true, true, '2026-10');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select public.join_swap_community('Brass Finch', true, true, '2026-10');

-- D lists a community item; the photo must be sanitised.
select t.as_service();
select t.throws('community listing needs size and condition', $q$ select public.swap_publish_precheck('e1000000-0000-0000-0000-000000000001', gen_random_uuid(), 'community', null) $q$, 'item_not_found');
select t.as_admin();
insert into clothing_items (id, user_id, name, category, size, condition, user_image, cost) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Denim jacket', 'outerwear', 'L', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000009.jpg', 55),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000d', 'No size top', 'tops', null, null,
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000010.jpg', 55),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'Green coat', 'outerwear', 'S', 'like_new',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/c0000000-0000-0000-0000-00000000000c/1700000000011.jpg', 90);
select t.as_service();
select t.throws('community listing without size/condition is incomplete', $q$ select public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000002', 'community', null) $q$, 'listing_incomplete');
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'community', 'Roomy fit');
  lid := (r->>'listingId')::uuid;
  begin
    perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'community', 'Roomy fit', 'stripped');
    perform t.check('community listing must be checked', false, 'accepted a copied photo');
  exception when check_violation then
    perform t.check('community listing must be checked', true);
  end;
  perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'community', 'Roomy fit', 'checked');
  insert into pub values ('dc', lid);
  r := public.swap_publish_precheck('c0000000-0000-0000-0000-00000000000c', 'c1000000-0000-0000-0000-000000000001', 'community', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('c0000000-0000-0000-0000-00000000000c', lid, 'c1000000-0000-0000-0000-000000000001', 'community', null, 'checked');
  insert into pub values ('cc', lid);
end $$;
select t.as_admin();

-- The community rules run again at commit: size cleared after the precheck is refused.
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-00000000000d', 'Wool cap', 'hats', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000030.jpg');
select t.as_service();
do $$ declare r jsonb; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000003', 'community', null);
  insert into pub values ('toc2', (r->>'listingId')::uuid);
end $$;
select t.as_admin();
update clothing_items set size = null where id = 'd1000000-0000-0000-0000-000000000003';
select t.as_service();
select t.throws('community commit: size cleared after the precheck is refused', format($q$ select public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', %L, 'd1000000-0000-0000-0000-000000000003', 'community', null, 'checked') $q$, (select id from pub where k='toc2')), 'listing_incomplete');
select t.as_admin();
update clothing_items set size = 'M', name = 'Wool cap +1 555 123 4567' where id = 'd1000000-0000-0000-0000-000000000003';
select t.as_service();
select t.throws('community commit: contact details added after the precheck are refused', format($q$ select public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', %L, 'd1000000-0000-0000-0000-000000000003', 'community', null, 'checked') $q$, (select id from pub where k='toc2')), 'text_not_allowed');
select t.as_admin();
select t.check('...and no listing was made', not exists (select 1 from swap_listings where item_id = 'd1000000-0000-0000-0000-000000000003'));

select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('C sees D''s community listing, labelled by alias only',
  (select count(*) from public.browse_swap_listings('community') where owner_label = 'Quiet Heron' and owner_kind = 'member') = 1);
select t.check('community scope shows nothing from friends-only listings', (select count(*) from public.browse_swap_listings('community') where owner_label in ('Ann','Bea')) = 0);
select t.check('C (not D''s friend) sees nothing of D on the friends rack', (select count(*) from public.browse_swap_listings('friends')) = 0);
select t.check('browse labels never contain an email', not exists (select 1 from public.browse_swap_listings('community') where owner_label like '%@%'));
select t.check('more from this member', (select count(*) from public.browse_swap_listings('community', null, null, null, null, null, (select id from pub where k='dc'))) = 1);
select t.check('photo visible to a community viewer', public.can_view_swap_photo((select id::text || '.jpg' from pub where k='dc')));
select t.as_user('e1000000-0000-0000-0000-000000000002');
select t.check('non-member cannot see community photos', not public.can_view_swap_photo((select id::text || '.jpg' from pub where k='dc')));
select t.throws('non-member cannot browse community', $q$ select * from public.browse_swap_listings('community') $q$, 'community_not_joined');

-- Proposal between strangers.
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('stranger proposal: phone number in the note refused', format($q$ select public.propose_swap(%L, %L, 'call 555 123 4567', gen_random_uuid()) $q$, array[(select id from pub where k='dc')], array[(select id from pub where k='cc')]), 'text_not_allowed');
select t.throws('stranger proposal: venmo refused', format($q$ select public.propose_swap(%L, %L, 'I can venmo you', gen_random_uuid()) $q$, array[(select id from pub where k='dc')], array[(select id from pub where k='cc')]), 'text_not_allowed');
insert into ids select 'stranger', public.propose_swap(array[(select id from pub where k='dc')], array[(select id from pub where k='cc')], 'Love the jacket', gen_random_uuid());
select t.check('stranger swap is pair_kind community', (public.get_swap((select id from ids where k='stranger'))->>'pairKind') = 'community');
select t.check('stranger swap shows the alias', (public.get_swap((select id from ids where k='stranger'))->>'otherLabel') = 'Quiet Heron');
select t.check('stranger swap exposes no account ids', public.get_swap((select id from ids where k='stranger'))::text !~ 'd0000000');
select public.send_swap_message((select id from ids where k='stranger'), 'What is the length?');
select public.send_swap_message((select id from ids where k='stranger'), 'And the fabric?');
select public.send_swap_message((select id from ids where k='stranger'), 'Any flaws?');
select t.throws('stranger pre-accept message cap', format($q$ select public.send_swap_message(%L, 'Still there?') $q$, (select id from ids where k='stranger')), 'swap_message_limit');
select t.throws('stranger pre-accept: email refused', format($q$ select public.send_swap_message(%L, 'mail me at a@b.com') $q$, (select id from ids where k='stranger')), 'swap_message_limit');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('recipient sees the proposal', (select count(*) from public.list_my_swaps() where bucket = 'needs_you') = 1);
select t.check('accept (stranger)', public.respond_to_swap((select id from ids where k='stranger'), 'accept') = 'accepted');
select t.check('after acceptance contact details are allowed', public.send_swap_message((select id from ids where k='stranger'), 'Meet at the cafe, my number is 555 123 4567') > 0);
select t.throws('gift cards are never allowed', format($q$ select public.send_swap_message(%L, 'send a gift card first') $q$, (select id from ids where k='stranger')), 'text_not_allowed');

-- Blocking a stranger by alias: no account id for the blocker.
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select public.block_swap_member('swap', (select id from ids where k='stranger'));
select t.check('direct block table read hides swap-origin blocks', (select count(*) from user_blocks) = 0);
select t.check('list_swap_blocks shows alias and an opaque ref', (select count(*) from public.list_swap_blocks() where label = 'Quiet Heron') = 1);
select t.check('list_swap_blocks has no account id', not exists (select 1 from pg_proc p, unnest(p.proargnames) n where p.proname = 'list_swap_blocks' and n in ('blocked_id','user_id')));
select t.as_admin();
select t.check('blocking a stranger ended the swap and freed the listings',
  (select status from swaps where id = (select id from ids where k='stranger')) = 'cancelled'
  and (select status from swap_listings where id = (select id from pub where k='dc')) = 'active');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('blocked stranger no longer sees C''s listings', (select count(*) from public.browse_swap_listings('community') where owner_label = 'Velvet Otter') = 0);
select t.check('blocked stranger sees a closed, neutral swap (no alias, no photo, no actions)',
  (public.get_swap((select id from ids where k='stranger'))->>'status') = 'cancelled'
  and (public.get_swap((select id from ids where k='stranger'))->>'otherLabel') = 'Swap member'
  and public.get_swap((select id from ids where k='stranger'))::text !~ 'Velvet Otter'
  and not (public.get_swap((select id from ids where k='stranger'))->'actions'->>'canMessage')::boolean);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select public.unblock_swap_member((select ref from public.list_swap_blocks() limit 1));
select t.check('unblock removes it', (select count(*) from public.list_swap_blocks()) = 0);

-- Narrowing and leaving.
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select public.narrow_swap_listing((select id from pub where k='dc'));
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('narrowed listing leaves the community rack', (select count(*) from public.browse_swap_listings('community')) = 0);
select public.leave_swap_community();
select t.check('leaving releases the alias', (public.get_swap_settings()->>'alias') is null and not (public.get_swap_settings()->>'communityJoined')::boolean);

-- Kill switches.
select t.as_service();
select public.swap_set_enabled(false);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('kill switch: browse paused', $q$ select * from public.browse_swap_listings('friends') $q$, 'swaps_disabled');
select t.throws('kill switch: inbox paused', $q$ select * from public.list_my_swaps() $q$, 'swaps_disabled');
select t.check('kill switch: badge is 0 and does not throw', public.get_swap_badge() = 0);
select t.as_service();
select public.swap_set_enabled(true);

-- Suspension.
select public.swap_admin_suspend('e1000000-0000-0000-0000-000000000001', 'test');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select t.throws('suspended member cannot browse', $q$ select * from public.browse_swap_listings('friends') $q$, 'swap_suspended');
select t.as_service();
select public.swap_admin_unsuspend('e1000000-0000-0000-0000-000000000001');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select t.check('unsuspended member can browse again', (select count(*) from public.browse_swap_listings('friends')) >= 0);

-- Export contains only my own words and no counterpart identity.
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('export: settings, listings, swaps, my messages only',
  (public.export_my_swap_data()->'settings'->>'alias') = 'Quiet Heron'
  and jsonb_array_length(public.export_my_swap_data()->'listings') >= 1
  and jsonb_array_length(public.export_my_swap_data()->'swaps') >= 1
  and public.export_my_swap_data()::text !~ 'Velvet Otter'
  and public.export_my_swap_data()::text !~ 'cat@example');
select t.check('export: nothing the other member wrote', public.export_my_swap_data()::text !~ 'What is the length|And the fabric|Any flaws|Love the jacket');
select t.check('export: my own words are there', public.export_my_swap_data()::text ~ 'Meet at the cafe');
-- The storage cleanup in swap-media deletes whatever this returns, so it must name real paths whatever the listing status is.
select t.as_service();
select t.check('known photo paths: any status, only real paths',
  public.swap_known_photo_paths(array[(select id::text || '.jpg' from pub where k='h1'), 'nope.jpg']) = array[(select id::text || '.jpg' from pub where k='h1')]);
