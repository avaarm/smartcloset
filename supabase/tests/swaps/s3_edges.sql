create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create or replace function t.propose(p_who uuid, p_req uuid, p_off uuid, p_note text default null) returns uuid language plpgsql as $$
declare sid uuid;
begin
  perform t.as_user(p_who);
  sid := public.propose_swap(array[p_req], array[p_off], p_note, gen_random_uuid());
  return sid;
end $$;

-- ── Decline, cooldown, cancel ────────────────────────────────────────────────
insert into ids select 'dec', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('decline', public.respond_to_swap((select id from ids where k='dec'), 'decline') = 'declined');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('proposer sees declined as past', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='dec')) = 'past');
select t.throws('cooldown after a decline', format($q$ select public.propose_swap(%L, %L, 'please', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'swap_cooldown');
select t.as_admin();
update swaps set closed_at = now() - interval '8 days' where id = (select id from ids where k='dec');
insert into ids select 'can', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select public.cancel_swap((select id from ids where k='can'));
select t.check('proposer cancels', (select bucket || '/' || closed_reason from public.list_my_swaps() where swap_id = (select id from ids where k='can')) = 'past/cancelled_by_proposer');
select t.as_admin();
select t.check('cancelled by proposer', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='can')) = 'cancelled/cancelled_by_proposer');
select t.check('listing back on rack after cancel', (select status from swap_listings where id = (select id from pub where k='a1')) = 'active');

-- ── Competing proposals: the second accept loses ─────────────────────────────
-- D (friend of A) and B both want A's scarf. D needs a listing to offer.
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Denim jacket', 'outerwear', 'L', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000009.jpg');
select t.as_service();
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'friends', null, 'stripped');
  insert into pub values ('d1', lid);
end $$;
select t.as_admin();
insert into ids select 'race_b', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'));
insert into ids select 'race_d', t.propose('d0000000-0000-0000-0000-00000000000d', (select id from pub where k='a2'), (select id from pub where k='d1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('first accept wins', public.respond_to_swap((select id from ids where k='race_b'), 'accept') = 'accepted');
select t.check('second accept loses cleanly', public.respond_to_swap((select id from ids where k='race_d'), 'accept') = 'unavailable');
select t.as_admin();
select t.check('loser swap is closed unavailable', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='race_d')) = 'cancelled/unavailable');
select t.check('winner keeps the reservation', (select count(*) from swap_items where reserved and swap_id = (select id from ids where k='race_b')) = 2);
-- Backstop: a second reservation of the same listing is impossible even by force.
select t.throws('unique index blocks double reservation',
  format($q$ update swap_items set reserved = true where swap_id = %L and listing_id = %L $q$, (select id from ids where k='race_d'), (select id from pub where k='a2')), 'duplicate key');
-- Cancel the winner so the scarf is free again.
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.cancel_swap((select id from ids where k='race_b'));
select t.as_admin();
select t.check('cancel releases reservation', (select count(*) from swap_items where reserved) = 0 and (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');

-- ── Block closes swaps both ways, quietly ────────────────────────────────────
insert into ids select 'blk', t.propose('d0000000-0000-0000-0000-00000000000d', (select id from pub where k='a2'), (select id from pub where k='d1'), 'Hello');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='blk'), 'accept');
select public.block_user('d0000000-0000-0000-0000-00000000000d');
select t.as_admin();
select t.check('block closes the swap as unavailable', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='blk')) = 'cancelled/unavailable');
select t.check('block frees the listing', (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');
create temp table shapes (k text primary key, shape text);
grant all on shapes to public;
select t.as_user('d0000000-0000-0000-0000-00000000000d');
-- A block must not be visible as a block. The blocked member keeps the swap in their inbox, closed, and can
-- open it: they see the pieces' names and the quiet "no longer available" ending, nothing else.
-- (Captured before they open it, for the comparison below: opening a swap clears its dot.)
insert into shapes select 'blocked_row', concat_ws('|', status, closed_reason, bucket, (thumb_path is null)::text, i_done::text, they_done::text, attention::text)
  from public.list_my_swaps() where swap_id = (select id from ids where k='blk');
select t.check('blocked member still has the swap in the inbox', (select count(*) from public.list_my_swaps() where swap_id = (select id from ids where k='blk')) = 1);
select t.check('it is closed, in past, with a neutral label and no photo',
  (select status || '/' || closed_reason || '/' || bucket || '/' || other_label || '/' || (thumb_path is null)::text from public.list_my_swaps() where swap_id = (select id from ids where k='blk'))
  = 'cancelled/unavailable/past/Swap member/true');
select t.check('blocked member can open the closed swap',
  (public.get_swap((select id from ids where k='blk'))->>'status') = 'cancelled'
  and (public.get_swap((select id from ids where k='blk'))->>'closedReason') = 'unavailable'
  and (public.get_swap((select id from ids where k='blk'))->>'otherLabel') = 'Swap member');
select t.check('...with no member messages, no photo and no ids',
  not exists (select 1 from jsonb_array_elements(public.get_swap((select id from ids where k='blk'))->'messages') m where m->>'kind' <> 'system')
  and not exists (select 1 from jsonb_array_elements(public.get_swap((select id from ids where k='blk'))->'items') i where i->>'photoPath' is not null or i->>'claimedItemId' is not null or i->>'giverItemId' is not null)
  and public.get_swap((select id from ids where k='blk'))::text !~ 'a0000000');
select t.check('...and no actions at all', not exists (select 1 from jsonb_each(public.get_swap((select id from ids where k='blk'))->'actions') a where a.key <> 'messagesLeft' and a.value = 'true'::jsonb)
  and (public.get_swap((select id from ids where k='blk'))->'actions'->>'messagesLeft') = '0');
select t.check('blocked member cannot see blocker''s listings', (select count(*) from public.browse_swap_listings('friends')) = 0);
select t.throws('blocked member cannot message', format($q$ select public.send_swap_message(%L, 'hello?') $q$, (select id from ids where k='blk')), 'swap_unavailable');
select t.throws('blocked member cannot cancel or finish a swap that is already over', format($q$ select public.cancel_swap(%L) $q$, (select id from ids where k='blk')), 'swap_unavailable');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('the blocker keeps the swap in their inbox too', (select count(*) from public.list_my_swaps() where swap_id = (select id from ids where k='blk')) = 1);

-- ── Unfriend closes friends-kind swaps ───────────────────────────────────────
select t.as_admin();
insert into ids select 'unf', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='unf'), 'accept');
delete from friend_requests where requester_id = 'a0000000-0000-0000-0000-00000000000a' and recipient_id = 'b0000000-0000-0000-0000-00000000000b';
select t.as_admin();
select t.check('unfriend closes the swap', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='unf')) = 'cancelled/unavailable');
select t.check('unfriend frees listings', (select count(*) from swap_items where reserved) = 0);
insert into friend_requests (requester_id, recipient_id, status, responded_at) values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now());

-- ── Item deleted / wishlisted mid-swap ───────────────────────────────────────
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
insert into ids select 'del', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('accept before delete', public.respond_to_swap((select id from ids where k='del'), 'accept') = 'accepted');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
delete from clothing_items where id = 'b1000000-0000-0000-0000-000000000002';
select t.as_admin();
select t.check('deleting an item cancels the open swap', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='del')) = 'cancelled/unavailable');
select t.check('deleted item''s listing is withdrawn', (select status from swap_listings where id = (select id from pub where k='b2')) = 'withdrawn');
select t.check('other side''s listing returns to the rack', (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');
select t.check('listing kept its snapshot', (select name from swap_listings where id = (select id from pub where k='b2')) = 'Wool hat');

-- The blocked member's inbox after a block reads like a member's inbox after a piece was deleted.
select t.as_user('d0000000-0000-0000-0000-00000000000d');
insert into shapes select 'blocked_detail', concat_ws('|', d->>'status', d->>'closedReason', d->'actions'->>'canCancel', d->'actions'->>'canComplete',
  d->'actions'->>'canMessage', d->'actions'->>'canAccept', jsonb_array_length(d->'items')::text)
  from (select public.get_swap((select id from ids where k='blk')) d) x;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
insert into shapes select 'deleted_row', concat_ws('|', status, closed_reason, bucket, (thumb_path is null)::text, i_done::text, they_done::text, attention::text)
  from public.list_my_swaps() where swap_id = (select id from ids where k='del');
insert into shapes select 'deleted_detail', concat_ws('|', d->>'status', d->>'closedReason', d->'actions'->>'canCancel', d->'actions'->>'canComplete',
  d->'actions'->>'canMessage', d->'actions'->>'canAccept', jsonb_array_length(d->'items')::text)
  from (select public.get_swap((select id from ids where k='del')) d) x;
select t.as_admin();
select t.check('inbox row: block and piece deletion look the same to the member who did not do it',
  (select shape from shapes where k='blocked_row') = (select shape from shapes where k='deleted_row'),
  (select string_agg(k || '=' || shape, E'\n') from shapes));
select t.check('thread: block and piece deletion look the same to the member who did not do it',
  (select shape from shapes where k='blocked_detail') = (select shape from shapes where k='deleted_detail'),
  (select string_agg(k || '=' || shape, E'\n') from shapes));
-- wishlist move
update clothing_items set is_wishlist = true where id = 'a1000000-0000-0000-0000-000000000002';
select t.check('moving to the wishlist withdraws the listing', (select status from swap_listings where id = (select id from pub where k='a2')) = 'withdrawn');
update clothing_items set is_wishlist = false where id = 'a1000000-0000-0000-0000-000000000002';

-- ── Expiry, half-done swaps, limits ──────────────────────────────────────────
select t.as_service();
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('a0000000-0000-0000-0000-00000000000a', lid, 'a1000000-0000-0000-0000-000000000002', 'friends', null, 'stripped');
  update pub set id = lid where k = 'a2';
end $$;
select t.as_admin();
insert into ids select 'exp', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b1'));
select t.as_admin();
update swaps set expires_at = now() - interval '1 minute' where id = (select id from ids where k='exp');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('overdue proposal expires on the next read', (select status from public.list_my_swaps() where swap_id = (select id from ids where k='exp')) = 'expired');

insert into ids select 'half', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='half'), 'accept');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='half'), false);
select t.as_admin();
update swaps set proposer_done_at = now() - interval '15 days' where id = (select id from ids where k='half');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('half-done swap finishes after 14 days', (select status from public.list_my_swaps() where swap_id = (select id from ids where k='half')) = 'completed');
select t.check('A is told to collect their piece', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='half')) = 'needs_you');
select t.check('A can still claim after auto-complete', jsonb_array_length(public.swap_complete_my_side((select id from ids where k='half'), true)->'received') = 1);
select t.as_admin();
select t.check('auto-completed flag set', (select auto_completed from swaps where id = (select id from ids where k='half')));

-- ── One-sided "We swapped!": no lock-in, and the absolute expiry never beats the auto-finish ──
select t.as_admin();
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));
insert into ids select 'tap', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='tap'), 'accept');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='tap'), false);
select t.as_admin();
select t.check('the first tap pushes the absolute expiry out to about 15 days', (select expires_at > now() + interval '14 days 23 hours' from swaps where id = (select id from ids where k='tap')));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('B has tapped, so B has nothing left to cancel', not (public.get_swap((select id from ids where k='tap'))->'actions'->>'canCancel')::boolean);
select t.throws('and cannot cancel', format($q$ select public.cancel_swap(%L) $q$, (select id from ids where k='tap')), 'swap_not_open');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('A has not tapped, so A can still cancel even though B has', (public.get_swap((select id from ids where k='tap'))->'actions'->>'canCancel')::boolean);
select public.cancel_swap((select id from ids where k='tap'));
select t.as_admin();
select t.check('A cancelled after B tapped', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='tap')) = 'cancelled/cancelled_by_recipient');
select t.check('A''s piece is not locked any more', (select status from swap_listings where id = (select id from pub where k='b1')) = 'active' and (select count(*) from swap_items where reserved) = 0);

-- Tapped on day 25 of 30: the swap is finished 14 days later, never expired under the member who tapped.
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));
insert into ids select 'late', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='late'), 'accept');
select t.as_admin();
update swaps set expires_at = now() + interval '5 days' where id = (select id from ids where k='late');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='late'), false);
select t.as_admin();
select t.check('a tap on day 25 moves the expiry past the 14-day auto-finish', (select expires_at > now() + interval '14 days' from swaps where id = (select id from ids where k='late')));
-- 16 days later: the absolute date (done + 15 days) has also passed.
update swaps set proposer_done_at = now() - interval '16 days', expires_at = now() - interval '1 day' where id = (select id from ids where k='late');
select public.swap_janitor(true);
select t.check('the global job finishes it instead of expiring it',
  (select status || '/' || auto_completed::text from swaps where id = (select id from ids where k='late')) = 'completed/true');
select t.check('both listings are consumed, not put back on the rack',
  (select count(*) from swap_listings where id in ((select id from pub where k='a1'), (select id from pub where k='b1')) and status = 'completed') = 2);

-- The same on a member's own read (no job needed).
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));
insert into ids select 'late2', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='late2'), 'accept');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='late2'), false);
select t.as_admin();
update swaps set proposer_done_at = now() - interval '16 days', expires_at = now() - interval '1 day' where id = (select id from ids where k='late2');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('a read finishes it too', (select status from public.list_my_swaps() where swap_id = (select id from ids where k='late2')) = 'completed');
select t.as_admin();
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));

-- Message rate limit (6 a minute).
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
select t.as_admin();
update swap_listings set status = 'active' where id in ((select id from pub where k='b1'), (select id from pub where k='a1'));
insert into ids select 'chat', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
do $$ begin for i in 1..6 loop perform public.send_swap_message((select id from ids where k='chat'), 'hello ' || i); end loop; end $$;
select t.throws('7th message in a minute is rate limited', format($q$ select public.send_swap_message(%L, 'one more') $q$, (select id from ids where k='chat')), 'swap_rate_limited');

-- Open-proposal caps.
select t.as_admin();
insert into auth.users (id, email, raw_user_meta_data, created_at)
select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@example.test', '{}', now() - interval '9 days' from generate_series(1, 24) g;
insert into friend_requests (requester_id, recipient_id, status, responded_at)
select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'a0000000-0000-0000-0000-00000000000a', 'accepted', now() from generate_series(1, 24) g;
update swaps set closed_at = closed_at where false;
-- 9 fake open proposals for A's scarf (listing a2) -> listing_busy for the next asker.
insert into swaps (id, proposer_id, recipient_id, pair_kind, status) select gen_random_uuid(), ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'a0000000-0000-0000-0000-00000000000a', 'friends', 'proposed' from generate_series(1, 9) g;
insert into swap_items (swap_id, listing_id, side, name) select s.id, (select id from pub where k='a1'), 'request', 'Blue blazer' from swaps s where s.status = 'proposed' and s.proposer_id::text like 'e0000000%';
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('listing with 8 open proposals is busy', format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'listing_busy');
select t.as_admin();
-- 11 more -> A has 20 inbound open: recipient_busy.
insert into swaps (id, proposer_id, recipient_id, pair_kind, status) select gen_random_uuid(), ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'a0000000-0000-0000-0000-00000000000a', 'friends', 'proposed' from generate_series(10, 20) g;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('recipient with 20 open proposals is busy', format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'recipient_busy');
select t.as_admin();
delete from swaps where proposer_id::text like 'e0000000%';
-- 5 open outbound from D to other members -> swap_open_limit.
insert into swaps (id, proposer_id, recipient_id, pair_kind, status) select gen_random_uuid(), 'b0000000-0000-0000-0000-00000000000b', ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'friends', 'proposed' from generate_series(1, 4) g;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('5 open outbound proposals is the limit', format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'swap_open_limit');
select t.as_admin();
delete from swaps where proposer_id = 'b0000000-0000-0000-0000-00000000000b' and recipient_id::text like 'e0000000%';

-- ── My listings: stale flag, note, withdraw closes proposals ─────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('listing not stale at first', not (select stale from public.list_my_swap_listings() where listing_id = (select id from pub where k='a1')));
update clothing_items set name = 'Blue blazer (new)' where id = 'a1000000-0000-0000-0000-000000000001';
select t.check('editing the item marks the listing stale', (select stale from public.list_my_swap_listings() where listing_id = (select id from pub where k='a1')));
select public.update_swap_listing((select id from pub where k='a1'), '  Size M, prefers tops ');
select t.check('note updated and trimmed', (select note from public.list_my_swap_listings() where listing_id = (select id from pub where k='a1')) = 'Size M, prefers tops');
select t.throws('note with scam words refused', format($q$ select public.update_swap_listing(%L, 'gift card only') $q$, (select id from pub where k='a1')), 'text_not_allowed');
select t.throws('cannot update someone else''s listing', format($q$ select public.update_swap_listing(%L, 'x') $q$, (select id from pub where k='b1')), 'swap_unavailable');
-- chat swap is proposed on a1; withdrawing closes it.
select public.withdraw_swap_listing((select id from pub where k='a1'));
select t.as_admin();
select t.check('withdrawing a listing closes proposals for it', (select status from swaps where id = (select id from ids where k='chat')) = 'cancelled');
select t.check('listing withdrawn', (select status from swap_listings where id = (select id from pub where k='a1')) = 'withdrawn');

-- ── Retention (janitor) ──────────────────────────────────────────────────────
update swaps set closed_at = now() - interval '31 days' where id = (select id from ids where k='chat');
select public.swap_janitor(true);
select t.check('messages go 30 days after close', (select count(*) from swap_messages where swap_id = (select id from ids where k='chat')) = 0);
select t.check('the swap itself stays until 90 days', (select count(*) from swaps where id = (select id from ids where k='chat')) = 1);
update swaps set closed_at = now() - interval '91 days' where closed_at is not null;
update swap_listings set status_changed_at = now() - interval '31 days' where id = (select id from pub where k='a1');
select public.swap_janitor(true);
select t.check('swap purged after 90 days', (select count(*) from swaps where id = (select id from ids where k='chat')) = 0);
select t.check('ended listing purged (even if a swap once used it) and photo queued', (select count(*) from swap_listings where id = (select id from pub where k='a1')) = 0
  and exists (select 1 from swap_photo_gc where path = (select id from pub where k='a1')::text || '.jpg'));
