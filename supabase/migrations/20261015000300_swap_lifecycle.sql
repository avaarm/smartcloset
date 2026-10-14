-- Clothing swaps, part 3 of 5: proposals, threads and the hand-off.
--
-- Client functions: propose_swap, list_my_swaps, get_swap, respond_to_swap, cancel_swap,
-- send_swap_message, swap_complete_my_side, swap_ack_photo.
--
-- Errors (message text; the app maps them):
--   not_authenticated 28000 | swaps_disabled, swap_terms_required, swap_suspended,
--   community_unavailable, community_not_joined, account_too_new 42501 |
--   swap_unavailable (not found / not visible / blocked / expired / gone, all the same) 22023 |
--   swap_not_open 22023 | invalid_swap, invalid_note, invalid_message, offer_not_allowed 22023 |
--   text_not_allowed 22023 (DETAIL = field, HINT = payment|contact|content) |
--   already_proposed 23505 | swap_rate_limited 54000 (DETAIL = bucket) |
--   swap_open_limit, recipient_busy, listing_busy, swap_cooldown, swap_message_limit 54000
--
-- Safe to run twice. Depends on the foundation and listings migrations.

-- ─── 1. Proposing ───────────────────────────────────────────────────────────

create or replace function public.propose_swap(
  p_request_listing_ids uuid[],
  p_offer_listing_ids uuid[],
  p_note text,
  p_client_ref uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cap integer := public.swap_limit('items_per_side');
  clean text := nullif(btrim(coalesce(p_note, '')), '');
  n_found integer;
  n_owners integer;
  owner_uid uuid;
  st text;
  kind text;
  sid uuid;
  l record;
begin
  perform public.swap_gate(uid, 'friends');

  if p_request_listing_ids is null or p_offer_listing_ids is null
     or cardinality(p_request_listing_ids) not between 1 and cap
     or cardinality(p_offer_listing_ids) not between 1 and cap
     or array_position(p_request_listing_ids, null) is not null
     or array_position(p_offer_listing_ids, null) is not null
     or (select count(distinct x) from unnest(p_request_listing_ids) x) <> cardinality(p_request_listing_ids)
     or (select count(distinct x) from unnest(p_offer_listing_ids) x) <> cardinality(p_offer_listing_ids) then
    perform public.swap_raise('invalid_swap', '22023');
  end if;

  -- A retry of the same request returns the same swap.
  if p_client_ref is not null then
    select id into sid from public.swaps where proposer_id = uid and client_ref = p_client_ref;
    if found then
      return sid;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('swap_propose:' || uid::text, 0));

  -- What they asked for: visible to me, all from one other member.
  select count(*), count(distinct owner_id), min(owner_id::text)::uuid
    into n_found, n_owners, owner_uid
    from public.swap_listings where id = any (p_request_listing_ids);
  if n_found <> cardinality(p_request_listing_ids) or n_owners <> 1 or owner_uid = uid then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;

  st := public.swap_pair_state(uid, owner_uid);
  if st not in ('friends', 'community') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  kind := st;
  if kind = 'community' then
    perform public.swap_gate(uid, 'community');
  end if;

  for l in select id from public.swap_listings where id = any (p_request_listing_ids) order by id loop
    if not public.swap_can_see_listing(l.id, uid) then
      perform public.swap_raise('swap_unavailable', '22023');
    end if;
  end loop;

  -- What I give: my own, on the rack now; for a stranger, community listings only (so
  -- every photo a stranger can see went through the safety check).
  select count(*) into n_found from public.swap_listings
   where id = any (p_offer_listing_ids) and owner_id = uid and status = 'active' and expires_at > now()
     and (kind = 'friends' or audience = 'community');
  if n_found <> cardinality(p_offer_listing_ids) then
    perform public.swap_raise('offer_not_allowed', '22023');
  end if;

  if clean is not null and char_length(clean) > 280 then
    perform public.swap_raise('invalid_note', '22023');
  end if;
  perform public.swap_require_text(clean, 'note', case when kind = 'community' then 'strict' else 'open' end);

  perform public.swap_rate_check(uid, 'propose_day');
  if kind = 'community' then
    perform public.swap_rate_check(uid, 'propose_stranger_day');
  end if;

  if (select count(*) from public.swaps where proposer_id = uid and status = 'proposed') >= public.swap_limit('open_outbound') then
    perform public.swap_raise('swap_open_limit', '54000');
  end if;
  if (select count(*) from public.swaps where recipient_id = owner_uid and status = 'proposed') >= public.swap_limit('open_inbound') then
    perform public.swap_raise('recipient_busy', '54000');
  end if;
  if exists (select 1 from public.swaps
              where proposer_id = uid and recipient_id = owner_uid and closed_reason = 'declined'
                and closed_at > now() - make_interval(days => public.swap_limit('decline_cooldown_days'))) then
    perform public.swap_raise('swap_cooldown', '54000');
  end if;
  if exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
              where si.listing_id = any (p_request_listing_ids) and si.side = 'request' and s.status = 'proposed'
              group by si.listing_id having count(*) >= public.swap_limit('open_per_requested_listing')) then
    perform public.swap_raise('listing_busy', '54000');
  end if;
  if exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
              where si.listing_id = any (p_offer_listing_ids) and si.side = 'offer' and s.status = 'proposed'
              group by si.listing_id having count(*) >= public.swap_limit('open_per_offered_listing')) then
    perform public.swap_raise('listing_busy', '54000');
  end if;

  begin
    insert into public.swaps (proposer_id, recipient_id, pair_kind, client_ref, last_event_by)
    values (uid, owner_uid, kind, p_client_ref, uid)
    returning id into sid;
  exception when unique_violation then
    perform public.swap_raise('already_proposed', '23505');
  end;

  insert into public.swap_items (swap_id, listing_id, side, name, category, brand, size, condition, giver_item_id)
  select sid, l2.id, case when l2.owner_id = uid then 'offer' else 'request' end,
         l2.name, l2.category, l2.brand, l2.size, l2.condition, l2.item_id
    from public.swap_listings l2
   where l2.id = any (p_request_listing_ids) or l2.id = any (p_offer_listing_ids);

  insert into public.swap_messages (swap_id, kind, code) values (sid, 'system', 'proposed');
  if clean is not null then
    insert into public.swap_messages (swap_id, sender_id, kind, body) values (sid, uid, 'text', clean);
  end if;
  return sid;
end;
$$;

-- ─── 2. Inbox ───────────────────────────────────────────────────────────────

-- p_limit rows, grouped by the app into: needs_you, finishing, in_progress, waiting, past.
-- A swap with someone who is blocked (either way) stays in the list, like a swap that ended because a
-- piece was deleted: closed, in "past", with the neutral label "Swap member", no photo, and no actions
-- (get_swap). Hiding it would tell the blocked member that they were blocked.
create or replace function public.list_my_swaps(p_limit integer default 100)
returns table (
  swap_id uuid, status text, closed_reason text, role text, pair_kind text, other_label text,
  bucket text, attention boolean, give_names text[], get_names text[], thumb_path text,
  i_done boolean, they_done boolean, created_at timestamptz, last_event_at timestamptz, expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  perform public.swap_refresh(uid);
  return query
    with mine as (
      select s as sw, s.id, s.status, s.closed_reason, s.pair_kind, s.created_at, s.last_event_at, s.expires_at,
             (s.proposer_id = uid) as is_proposer,
             case when s.proposer_id = uid then s.recipient_id else s.proposer_id end as other_id,
             (case when s.proposer_id = uid then s.proposer_done_at else s.recipient_done_at end is not null) as me_done,
             (case when s.proposer_id = uid then s.recipient_done_at else s.proposer_done_at end is not null) as them_done,
             (public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked') as blocked
        from public.swaps s
       where (s.proposer_id = uid or s.recipient_id = uid)
    ), enriched as (
      select m.*,
             exists (select 1 from public.swap_items si
                      where si.swap_id = m.id and si.claimed_item_id is not null and si.photo_imported_at is null
                        and si.listing_id is not null and not m.blocked
                        and ((si.side = 'offer' and not m.is_proposer) or (si.side = 'request' and m.is_proposer))
                     ) as photo_open,
             exists (select 1 from public.swap_items si
                       join public.clothing_items ci on ci.id = si.giver_item_id and ci.user_id = uid
                      where si.swap_id = m.id and si.removal_skipped_at is null and m.me_done and not m.blocked
                        and ((si.side = 'offer' and m.is_proposer) or (si.side = 'request' and not m.is_proposer))
                     ) as removal_open
        from mine m
    )
    select e.id, e.status, e.closed_reason,
           case when e.is_proposer then 'proposer' else 'recipient' end,
           e.pair_kind,
           case when e.blocked then 'Swap member' else public.swap_label(uid, e.other_id) end,
           case
             when e.blocked then 'past'
             when e.status = 'proposed' and not e.is_proposer then 'needs_you'
             when e.status = 'proposed' then 'waiting'
             when e.status = 'accepted' and e.them_done and not e.me_done then 'needs_you'
             when e.status = 'accepted' then 'in_progress'
             when e.status = 'completed' and not e.me_done then 'needs_you'
             when (e.photo_open or e.removal_open) then 'finishing'
             else 'past' end,
           public.swap_attention(e.sw, uid),
           array(select si.name from public.swap_items si
                  where si.swap_id = e.id and ((si.side = 'offer') = e.is_proposer) order by si.id),
           array(select si.name from public.swap_items si
                  where si.swap_id = e.id and ((si.side = 'offer') <> e.is_proposer) order by si.id),
           case when e.status in ('proposed', 'accepted', 'completed') and not e.blocked then
             (select l.photo_path from public.swap_items si join public.swap_listings l on l.id = si.listing_id
               where si.swap_id = e.id and ((si.side = 'offer') <> e.is_proposer) order by si.id limit 1) end,
           e.me_done, e.them_done, e.created_at, e.last_event_at, e.expires_at
      from enriched e
     order by case
                when e.blocked then 4
                when (e.status = 'proposed' and not e.is_proposer)
                  or (e.status = 'accepted' and e.them_done and not e.me_done)
                  or (e.status = 'completed' and not e.me_done) then 0
                when e.status = 'completed' and (e.photo_open or e.removal_open) then 1
                when e.status = 'accepted' then 2
                when e.status = 'proposed' then 3
                else 4 end,
              e.last_event_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

-- ─── 3. One swap ────────────────────────────────────────────────────────────

-- Everything the thread screen needs, including what the viewer may do (the app never
-- decides that). p_after: only messages with a larger id (for polling). Never returns the
-- other member's id. When the other member is blocked (either way) the swap is still returned, as a
-- closed shell: names of the pieces, the system lines, the neutral label "Swap member", no photos, no
-- member messages and no actions. Refusing to open it would tell the blocked member they were blocked.
create or replace function public.get_swap(p_swap_id uuid, p_after bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s public.swaps;
  is_proposer boolean;
  other uuid;
  me_done boolean;
  them_done boolean;
  items jsonb;
  msgs jsonb;
  total_text integer;
  mine_text integer;
  their_text integer;
  can_msg boolean;
  left_ integer;
  my_suspended boolean;
  blocked boolean;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  perform public.swap_refresh(uid);

  select * into s from public.swaps where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  blocked := (public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked');
  is_proposer := (s.proposer_id = uid);
  other := case when is_proposer then s.recipient_id else s.proposer_id end;
  me_done := (case when is_proposer then s.proposer_done_at else s.recipient_done_at end) is not null;
  them_done := (case when is_proposer then s.recipient_done_at else s.proposer_done_at end) is not null;

  update public.swaps
     set proposer_seen_at = case when is_proposer then now() else proposer_seen_at end,
         recipient_seen_at = case when is_proposer then recipient_seen_at else now() end
   where id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'listingId', si.listing_id,
           'side', si.side,
           'mine', ((si.side = 'offer') = is_proposer),
           'name', coalesce(l.name, si.name),
           'category', coalesce(l.category, si.category),
           'subcategory', case when not blocked then l.subcategory end,
           'brand', coalesce(l.brand, si.brand),
           'color', case when not blocked then l.color end,
           'size', coalesce(l.size, si.size),
           'condition', coalesce(l.condition, si.condition),
           'pattern', case when not blocked then l.pattern end,
           'materials', case when not blocked then l.materials end,
           'careInstructions', case when not blocked then l.care_instructions end,
           'originCountry', case when not blocked then l.origin_country end,
           'season', case when not blocked then l.season end,
           'note', case when not blocked then l.note end,
           'photoPath', case when not blocked and l.id is not null and s.status in ('proposed', 'accepted', 'completed') then l.photo_path end,
           'claimedItemId', case when not blocked and (si.side = 'offer') <> is_proposer then si.claimed_item_id end,
           'photoPending', not blocked and ((si.side = 'offer') <> is_proposer) and si.claimed_item_id is not null
                           and si.photo_imported_at is null and l.id is not null,
           'giverItemId', case when not blocked and (si.side = 'offer') = is_proposer then si.giver_item_id end,
           'removalPending', not blocked and ((si.side = 'offer') = is_proposer) and me_done and si.removal_skipped_at is null
                             and exists (select 1 from public.clothing_items ci where ci.id = si.giver_item_id and ci.user_id = uid)
         ) order by si.id), '[]'::jsonb)
    into items
    from public.swap_items si
    left join public.swap_listings l on l.id = si.listing_id
   where si.swap_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'kind', x.kind, 'code', x.code, 'body', x.body,
           'mine', (x.sender_id = uid), 'createdAt', x.created_at) order by x.id), '[]'::jsonb)
    into msgs
    from (select * from public.swap_messages m
           where m.swap_id = s.id and m.id > coalesce(p_after, 0) and (not blocked or m.kind = 'system')
           order by m.id desc limit 100) x;

  select count(*) filter (where kind = 'text'),
         count(*) filter (where kind = 'text' and sender_id = uid),
         count(*) filter (where kind = 'text' and sender_id is distinct from uid)
    into total_text, mine_text, their_text
    from public.swap_messages where swap_id = s.id;
  select (m.suspended_at is not null) into my_suspended from public.swap_members m where m.user_id = uid;

  can_msg := other is not null and not coalesce(my_suspended, false) and not blocked
             and public.swap_pair_state(uid, other) in ('friends', 'community')
             and (s.status in ('proposed', 'accepted')
                  or (s.status = 'completed' and s.closed_at > now() - interval '7 days'));
  left_ := public.swap_limit('messages_per_swap') - total_text;
  if s.pair_kind = 'community' and s.status = 'proposed' and their_text = 0 then
    left_ := least(left_, public.swap_limit('preaccept_messages_stranger') + 1 - mine_text);
  end if;
  left_ := greatest(left_, 0);

  return jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'closedReason', s.closed_reason,
    'role', case when is_proposer then 'proposer' else 'recipient' end,
    'pairKind', s.pair_kind,
    'otherLabel', case when blocked then 'Swap member' else public.swap_label(uid, other) end,
    'createdAt', s.created_at,
    'expiresAt', s.expires_at,
    'closedAt', s.closed_at,
    'iDone', me_done,
    'theyDone', them_done,
    'autoCompleted', s.auto_completed,
    'items', items,
    'messages', msgs,
    -- canCancel: the proposer until it is answered; and, once accepted, whoever has not tapped "We swapped!"
    -- yet, even if the other member has (so a member cannot be left with their pieces locked by the other
    -- member's tap). After your own tap there is nothing to cancel: only a report remains.
    'actions', jsonb_build_object(
      'canAccept', not blocked and s.status = 'proposed' and not is_proposer,
      'canDecline', not blocked and s.status = 'proposed' and not is_proposer,
      'canCancel', not blocked and ((s.status = 'proposed' and is_proposer)
                                    or (s.status = 'accepted' and not me_done)),
      'canComplete', not blocked and ((s.status = 'accepted' and not me_done)
                                      or (s.status = 'completed' and s.auto_completed and not me_done)),
      'canMessage', can_msg and left_ > 0,
      'messagesLeft', case when can_msg then left_ else 0 end
    )
  );
end;
$$;

-- ─── 4. Answering, cancelling, talking ──────────────────────────────────────

-- p_action 'accept' | 'decline'. Returns 'accepted' | 'declined' | 'unavailable'.
-- Accepting is the only moment items are reserved.
create or replace function public.respond_to_swap(p_swap_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop uuid;
  s public.swaps;
  st text;
  ids uuid[];
  bad boolean;
begin
  perform public.swap_gate(uid, 'friends');
  if p_action is null or p_action not in ('accept', 'decline') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_rate_check(uid, 'respond_day');

  select proposer_id into prop from public.swaps where id = p_swap_id and recipient_id = uid;
  if prop is null then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  perform public.swap_lock_users(prop, uid);

  select * into s from public.swaps where id = p_swap_id and recipient_id = uid for update;
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  st := public.swap_pair_state(s.proposer_id, s.recipient_id);
  if st = 'blocked' then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if s.status <> 'proposed' then
    perform public.swap_raise('swap_not_open', '22023');
  end if;

  if p_action = 'decline' then
    perform public.swap_close(s.id, 'declined', 'declined', uid);
    return 'declined';
  end if;

  if s.expires_at <= now()
     or st = 'none' or (s.pair_kind = 'friends' and st <> 'friends') then
    perform public.swap_close(s.id, 'cancelled', 'unavailable');
    return 'unavailable';
  end if;

  select array_agg(listing_id order by listing_id) into ids
    from public.swap_items where swap_id = s.id and listing_id is not null;
  perform 1 from public.swap_listings where id = any (ids) order by id for update;
  select exists (
           select 1 from public.swap_items si
             left join public.swap_listings l on l.id = si.listing_id
            where si.swap_id = s.id
              and (l.id is null or l.status <> 'active' or l.expires_at <= now()
                   or l.owner_id is distinct from (case when si.side = 'offer' then s.proposer_id else s.recipient_id end)))
    into bad;
  if bad then
    perform public.swap_close(s.id, 'cancelled', 'unavailable');
    return 'unavailable';
  end if;

  begin
    update public.swap_items set reserved = true where swap_id = s.id;
  exception when unique_violation then
    perform public.swap_close(s.id, 'cancelled', 'unavailable');
    return 'unavailable';
  end;
  update public.swap_listings set status = 'reserved', status_changed_at = now() where id = any (ids);
  update public.swaps
     set status = 'accepted', accepted_at = now(), expires_at = now() + interval '30 days',
         updated_at = now(), last_event_at = now(), last_event_by = uid
   where id = s.id;
  insert into public.swap_messages (swap_id, kind, code) values (s.id, 'system', 'accepted');
  return 'accepted';
end;
$$;

create or replace function public.cancel_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop uuid;
  rec uuid;
  s public.swaps;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  perform public.swap_rate_check(uid, 'cancel_day');
  select proposer_id, recipient_id into prop, rec from public.swaps
   where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  perform public.swap_lock_users(prop, rec);
  select * into s from public.swaps where id = p_swap_id for update;
  if public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked' then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if (s.status = 'proposed' and s.proposer_id = uid)
     or (s.status = 'accepted'
         and (case when s.proposer_id = uid then s.proposer_done_at else s.recipient_done_at end) is null) then
    perform public.swap_close(
      s.id, 'cancelled',
      case when s.proposer_id = uid then 'cancelled_by_proposer' else 'cancelled_by_recipient' end, uid);
  else
    perform public.swap_raise('swap_not_open', '22023');
  end if;
end;
$$;

create or replace function public.send_swap_message(p_swap_id uuid, p_body text, p_client_ref uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  body text := btrim(coalesce(p_body, ''));
  s public.swaps;
  other uuid;
  mid bigint;
  total_text integer;
  mine_text integer;
  their_text integer;
begin
  perform public.swap_gate(uid, 'friends');
  if char_length(body) < 1 or char_length(body) > 500 then
    perform public.swap_raise('invalid_message', '22023');
  end if;

  select * into s from public.swaps where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  other := case when s.proposer_id = uid then s.recipient_id else s.proposer_id end;
  if other is null or public.swap_pair_state(uid, other) not in ('friends', 'community') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if not (s.status in ('proposed', 'accepted')
          or (s.status = 'completed' and s.closed_at > now() - interval '7 days')) then
    perform public.swap_raise('swap_not_open', '22023');
  end if;

  if p_client_ref is not null then
    select id into mid from public.swap_messages where sender_id = uid and client_ref = p_client_ref;
    if found then
      return mid;
    end if;
  end if;

  select count(*) filter (where kind = 'text'),
         count(*) filter (where kind = 'text' and sender_id = uid),
         count(*) filter (where kind = 'text' and sender_id is distinct from uid)
    into total_text, mine_text, their_text
    from public.swap_messages where swap_id = s.id;
  if total_text >= public.swap_limit('messages_per_swap') then
    perform public.swap_raise('swap_message_limit', '54000');
  end if;
  -- A stranger gets the proposal note plus a few questions until the other side answers.
  if s.pair_kind = 'community' and s.status = 'proposed' and their_text = 0
     and mine_text >= public.swap_limit('preaccept_messages_stranger') + 1 then
    perform public.swap_raise('swap_message_limit', '54000');
  end if;

  perform public.swap_require_text(
    body, 'message',
    case when s.pair_kind = 'community' and s.status = 'proposed' then 'strict' else 'open' end);

  perform public.swap_rate_check(uid, 'message_min');
  perform public.swap_rate_check(uid, 'message_hour');
  perform public.swap_rate_check(uid, 'message_day');

  insert into public.swap_messages (swap_id, sender_id, kind, body, client_ref)
  values (s.id, uid, 'text', body, p_client_ref)
  returning id into mid;
  update public.swaps
     set last_event_at = now(), last_event_by = uid, updated_at = now(),
         proposer_seen_at = case when s.proposer_id = uid then now() else proposer_seen_at end,
         recipient_seen_at = case when s.recipient_id = uid then now() else recipient_seen_at end
   where id = s.id;
  return mid;
end;
$$;

-- ─── 5. The hand-off ────────────────────────────────────────────────────────

-- "We swapped!" for the calling member only. Adds the pieces they receive to their own
-- closet from the listing snapshot (private fields reset: no prices, notes, wear history,
-- tag text), marks their side done, and tells them which of their own pieces to remove.
-- Nothing in the other member's closet is touched. Safe to call again: it returns whatever
-- is still unfinished (photos not imported, pieces not yet removed).
create or replace function public.swap_complete_my_side(p_swap_id uuid, p_keep_given boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop uuid;
  rec uuid;
  s public.swaps;
  is_proposer boolean;
  my_done timestamptz;
  fresh boolean := false;
  si record;
  new_id uuid;
  recd jsonb;
  rem jsonb;
  both_done boolean;
  finished boolean := false;
begin
  perform public.swap_gate(uid, 'friends');
  perform public.swap_rate_check(uid, 'complete_day');

  select proposer_id, recipient_id into prop, rec from public.swaps
   where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  perform public.swap_lock_users(prop, rec);
  select * into s from public.swaps where id = p_swap_id for update;
  if public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked' then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  is_proposer := (s.proposer_id = uid);
  my_done := case when is_proposer then s.proposer_done_at else s.recipient_done_at end;

  if my_done is null and (s.status = 'accepted' or (s.status = 'completed' and s.auto_completed)) then
    fresh := true;
  elsif my_done is null then
    perform public.swap_raise('swap_not_open', '22023');
  end if;

  if fresh then
    -- The first tap also pushes the absolute expiry out to 15 days from now, so the 14-day auto-finish
    -- always comes first: a swap one member has completed is finished, never "expired" under them.
    update public.swaps
       set proposer_done_at = case when is_proposer then now() else proposer_done_at end,
           recipient_done_at = case when is_proposer then recipient_done_at else now() end,
           expires_at = greatest(expires_at, now() + interval '15 days'),
           updated_at = now(), last_event_at = now(), last_event_by = uid
     where id = s.id
     returning (proposer_done_at is not null and recipient_done_at is not null) into both_done;

    for si in
      select * from public.swap_items
       where swap_id = s.id and claimed_item_id is null and ((side = 'offer') <> is_proposer)
       order by id
    loop
      insert into public.clothing_items (
        user_id, name, category, subcategory, brand, color, season, size, condition, care_instructions,
        origin_country, materials, pattern, material, tags, notes, is_wishlist, favorite, wear_count, date_added)
      select uid,
             coalesce(l.name, si.name), coalesce(l.category, si.category, 'accessories'), l.subcategory,
             coalesce(l.brand, si.brand), l.color, coalesce(l.season, '[]'::jsonb),
             coalesce(l.size, si.size), coalesce(l.condition, si.condition), l.care_instructions,
             l.origin_country, l.materials, l.pattern, l.material,
             '["swapped"]'::jsonb, 'Swapped in on ' || to_char(now(), 'Mon DD, YYYY'),
             false, false, 0, now()
        from (select 1) one
        left join public.swap_listings l on l.id = si.listing_id
      returning id into new_id;
      update public.swap_items set claimed_item_id = new_id, claimed_at = now() where id = si.id;
    end loop;

    if p_keep_given then
      update public.swap_items set removal_skipped_at = now()
       where swap_id = s.id and ((side = 'offer') = is_proposer);
    end if;

    if both_done and s.status = 'accepted' then
      perform public.swap_finish(s.id, false);
      finished := true;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'claimedItemId', x.claimed_item_id, 'listingId', x.listing_id,
           'photoPath', l.photo_path, 'name', x.name) order by x.id), '[]'::jsonb)
    into recd
    from public.swap_items x
    left join public.swap_listings l on l.id = x.listing_id
   where x.swap_id = s.id and x.claimed_item_id is not null and x.photo_imported_at is null
     and x.listing_id is not null and ((x.side = 'offer') <> is_proposer);

  select coalesce(jsonb_agg(jsonb_build_object('itemId', x.giver_item_id, 'name', x.name) order by x.id), '[]'::jsonb)
    into rem
    from public.swap_items x
    join public.clothing_items ci on ci.id = x.giver_item_id and ci.user_id = uid
   where x.swap_id = s.id and x.removal_skipped_at is null and ((x.side = 'offer') = is_proposer);

  return jsonb_build_object(
    'status', (select status from public.swaps where id = s.id),
    'completed', finished or s.status = 'completed',
    'received', recd,
    'toRemove', rem
  );
end;
$$;

-- The app copied (or gave up copying) the photo of a piece it received.
create or replace function public.swap_ack_photo(p_swap_id uuid, p_claimed_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  update public.swap_items si
     set photo_imported_at = now()
   where si.swap_id = p_swap_id
     and si.claimed_item_id = any (coalesce(p_claimed_item_ids, '{}'))
     and exists (select 1 from public.clothing_items ci where ci.id = si.claimed_item_id and ci.user_id = uid)
     and exists (select 1 from public.swaps s where s.id = si.swap_id and uid in (s.proposer_id, s.recipient_id));
end;
$$;

-- ─── 6. Function privileges ─────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.propose_swap(uuid[], uuid[], text, uuid)',
    'public.list_my_swaps(integer)',
    'public.get_swap(uuid, bigint)',
    'public.respond_to_swap(uuid, text)',
    'public.cancel_swap(uuid)',
    'public.send_swap_message(uuid, text, uuid)',
    'public.swap_complete_my_side(uuid, boolean)',
    'public.swap_ack_photo(uuid, uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
