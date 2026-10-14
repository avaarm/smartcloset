-- ── Proposing ────────────────────────────────────────────────────────────────
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('propose: stranger cannot request a friend''s listing',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'swap_unavailable');

select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('propose: cannot offer what is not mine',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='a2')]), 'offer_not_allowed');
select t.throws('propose: nothing on one side',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[]::uuid[]), 'invalid_swap');
select t.throws('propose: scam words refused',
  format($q$ select public.propose_swap(%L, %L, 'send a gift card', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'text_not_allowed');
insert into ids select 'ref1', gen_random_uuid();
insert into ids select 'swap1', public.propose_swap(array[(select id from pub where k='a1')], array[(select id from pub where k='b1')], 'Love the blazer', (select id from ids where k='ref1'));
select t.check('propose is idempotent on client_ref',
  public.propose_swap(array[(select id from pub where k='a1')], array[(select id from pub where k='b1')], 'Love the blazer', (select id from ids where k='ref1')) = (select id from ids where k='swap1'));
select t.throws('propose: second open proposal to the same member',
  format($q$ select public.propose_swap(%L, %L, 'again', gen_random_uuid()) $q$,
         array[(select id from pub where k='a2')], array[(select id from pub where k='b2')]), 'already_proposed');
select t.check('proposer sees it as waiting', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='swap1')) = 'waiting');
select t.check('proposer''s badge is 0', public.get_swap_badge() = 0);

select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('recipient sees it as needs_you', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='swap1')) = 'needs_you');
select t.check('recipient badge is 1', public.get_swap_badge() = 1);
select t.check('settings needsYou is 1', (public.get_swap_settings()->>'needsYou')::int = 1);
select t.check('other_label is the proposer''s name', (select other_label from public.list_my_swaps() limit 1) = 'Bea');
select t.check('thumb is the offered item''s photo', (select thumb_path from public.list_my_swaps() limit 1) = (select id::text || '.jpg' from pub where k='b1'));
select t.check('get_swap: recipient may accept, not cancel',
  (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canAccept')::boolean
  and not (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canCancel')::boolean);
select t.check('get_swap: two items and two messages',
  jsonb_array_length(public.get_swap((select id from ids where k='swap1'))->'items') = 2
  and jsonb_array_length(public.get_swap((select id from ids where k='swap1'))->'messages') = 2);
select t.check('get_swap hides other member ids',
  (public.get_swap((select id from ids where k='swap1'))::text) !~ 'b0000000-0000-0000-0000-00000000000b');
select t.check('after viewing, the dot clears for messages but needs_you stays until answered',
  (select bucket from public.list_my_swaps() limit 1) = 'needs_you');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('non-participant cannot open the swap', format($q$ select public.get_swap(%L) $q$, (select id from ids where k='swap1')), 'swap_unavailable');
select t.throws('non-participant cannot message', format($q$ select public.send_swap_message(%L, 'hello') $q$, (select id from ids where k='swap1')), 'swap_unavailable');
select t.throws('non-recipient cannot respond', format($q$ select public.respond_to_swap(%L, 'accept') $q$, (select id from ids where k='swap1')), 'swap_unavailable');

-- ── Messages ─────────────────────────────────────────────────────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('message ok', public.send_swap_message((select id from ids where k='swap1'), 'Is it dry cleaned?', gen_random_uuid()) > 0);
select t.throws('message: gift card refused', format($q$ select public.send_swap_message(%L, 'pay by gift card') $q$, (select id from ids where k='swap1')), 'text_not_allowed');
select t.check('friends may share a phone number', public.send_swap_message((select id from ids where k='swap1'), 'text me on 555 123 4567') > 0);
select t.throws('message: empty', format($q$ select public.send_swap_message(%L, '   ') $q$, (select id from ids where k='swap1')), 'invalid_message');

-- ── Accepting: reservation ───────────────────────────────────────────────────
select t.check('accept returns accepted', public.respond_to_swap((select id from ids where k='swap1'), 'accept') = 'accepted');
select t.as_admin();
select t.check('listings are reserved', (select count(*) from swap_listings where status = 'reserved') = 2);
select t.check('items are reserved', (select count(*) from swap_items where reserved) = 2);
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('reserved listing leaves the rack', (select count(*) from public.browse_swap_listings('friends') where listing_id = (select id from pub where k='a1')) = 0);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('cannot withdraw a reserved listing', format($q$ select public.withdraw_swap_listing(%L) $q$, (select id from pub where k='a1')), 'item_reserved');
select t.throws('accept again is not open', format($q$ select public.respond_to_swap(%L, 'accept') $q$, (select id from ids where k='swap1')), 'swap_not_open');
select t.check('accepted swap: either may cancel before done',
  (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canCancel')::boolean);
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('a friend cannot request a listing that is reserved',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='a2')]), 'swap_unavailable');

-- ── Hand-off ─────────────────────────────────────────────────────────────────
select t.as_user('b0000000-0000-0000-0000-00000000000b');
create temp table hand (k text primary key, j jsonb);
grant all on hand to public;
insert into hand select 'b_done', public.swap_complete_my_side((select id from ids where k='swap1'), false);
select t.check('B: swap not completed yet', (select (j->>'completed')::boolean from hand where k='b_done') = false);
select t.check('B receives one piece', (select jsonb_array_length(j->'received') from hand where k='b_done') = 1);
select t.check('B is told to remove their own piece', (select j->'toRemove'->0->>'itemId' from hand where k='b_done') = 'b1000000-0000-0000-0000-000000000001');
select t.check('B: new closet row has the snapshot fields',
  exists (select 1 from clothing_items ci where ci.user_id = 'b0000000-0000-0000-0000-00000000000b' and ci.name = 'Blue blazer'
          and ci.brand = 'Zara' and ci.size = 'M' and ci.condition = 'good' and ci.origin_country = 'Italy'
          and ci.care_instructions = '{"Dry clean only"}' and ci.user_image is null));
select t.check('B: private fields were not copied',
  (select count(*) from clothing_items ci where ci.user_id = 'b0000000-0000-0000-0000-00000000000b' and ci.name = 'Blue blazer'
          and ci.cost is null and ci.retail_cost is null and ci.notes like 'Swapped in on %' and ci.tag_text is null
          and ci.estimated_value is null and ci.wear_count = 0 and ci.retailer is null and ci.is_wishlist = false
          and ci.tags = '["swapped"]'::jsonb) = 1);
-- Read as the owner of the database, not as B: B can see A's row only while the legacy friends policy exists,
-- and this check must hold both before and after that policy is dropped.
select t.as_admin();
select t.check('B: nothing of A''s was touched', (select cost from clothing_items where id = 'a1000000-0000-0000-0000-000000000001') = 120);
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('B: complete is idempotent (same pending list)',
  jsonb_array_length(public.swap_complete_my_side((select id from ids where k='swap1'), false)->'received') = 1
  and (select count(*) from clothing_items where user_id = 'b0000000-0000-0000-0000-00000000000b' and name = 'Blue blazer') = 1);
select t.check('B: list shows I have finished, they have not', (select i_done and not they_done from public.list_my_swaps() limit 1));
select public.swap_ack_photo((select id from ids where k='swap1'), array[(select id from clothing_items where user_id = 'b0000000-0000-0000-0000-00000000000b' and name = 'Blue blazer')]);
select t.check('B: photo ack leaves nothing pending', jsonb_array_length(public.swap_complete_my_side((select id from ids where k='swap1'), false)->'received') = 0);
-- B removes the shirt they gave: allowed, does not cancel because B already handed it over.
delete from clothing_items where id = 'b1000000-0000-0000-0000-000000000001';
select t.as_admin();
select t.check('deleting a handed-over item does not cancel the swap', (select status from swaps where id = (select id from ids where k='swap1')) = 'accepted');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('B cannot cancel after tapping done', format($q$ select public.cancel_swap(%L) $q$, (select id from ids where k='swap1')), 'swap_not_open');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('A is prompted: partner done', (select bucket from public.list_my_swaps() limit 1) = 'needs_you');
insert into hand select 'a_done', public.swap_complete_my_side((select id from ids where k='swap1'), true);
select t.check('A: swap completed', (select (j->>'completed')::boolean from hand where k='a_done'));
select t.check('A receives the shirt', exists (select 1 from clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a' and name = 'Linen shirt' and cost is null and notes like 'Swapped in on %'));
select t.check('A keeps their blazer when asked: nothing to remove', (select jsonb_array_length(j->'toRemove') from hand where k='a_done') = 0);
select t.as_admin();
select t.check('swap is completed, listings completed',
  (select status from swaps where id = (select id from ids where k='swap1')) = 'completed'
  and (select count(*) from swap_listings where id in ((select id from pub where k='a1'), (select id from pub where k='b1')) and status = 'completed') = 2);
select t.check('no reservations remain', (select count(*) from swap_items where reserved) = 0);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('completed swap: chat still open for a week', (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canMessage')::boolean);
select t.check('completed swap is in past or finishing', (select bucket from public.list_my_swaps() limit 1) in ('past', 'finishing'));
select t.check('A can still see the swap''s photos via predicate', public.can_view_swap_photo((select id::text || '.jpg' from pub where k='b1')));
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger still cannot see them', not public.can_view_swap_photo((select id::text || '.jpg' from pub where k='b1')));
