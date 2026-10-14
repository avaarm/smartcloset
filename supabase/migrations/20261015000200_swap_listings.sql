-- Clothing swaps, part 2 of 5: settings, listings and the rack.
--
-- Client functions (granted to authenticated):
--   get_swap_settings, accept_swap_terms, list_my_swap_listings, update_swap_listing,
--   withdraw_swap_listing, renew_swap_listing, browse_swap_listings, get_swap_listing
-- Service-only functions (called by the swap-media edge function with the service role):
--   swap_publish_precheck, swap_publish_commit
-- Internal: swap_validate_item, the one place that decides whether a piece may be listed. Both the
-- precheck and the commit call it, so editing the piece while its photo is being copied cannot get
-- past a rule.
--
-- Safe to run twice. Depends on the foundation migration.

-- ─── 1. Helpers used by several functions ───────────────────────────────────

-- Does this swap need p_uid's attention (a dot in the inbox)?
create or replace function public.swap_attention(p_swap public.swaps, p_uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_swap.status = 'proposed' and p_swap.recipient_id = p_uid then true
    when p_swap.last_event_by is distinct from p_uid
         and p_swap.last_event_at > coalesce(case when p_swap.proposer_id = p_uid then p_swap.proposer_seen_at
                                                  else p_swap.recipient_seen_at end, '-infinity'::timestamptz)
         and (p_swap.status in ('proposed', 'accepted') or p_swap.last_event_at > now() - interval '7 days') then true
    else false
  end;
$$;

-- ─── 2. Settings and terms ──────────────────────────────────────────────────

create or replace function public.get_swap_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.swap_members;
  cur text := public.swap_cfg('terms_version') #>> '{}';
  on_ boolean := coalesce((public.swap_cfg('swaps_enabled'))::boolean, false);
  comm boolean := coalesce((public.swap_cfg('community_enabled'))::boolean, false);
  needs integer := 0;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if on_ then
    perform public.swap_janitor();
    perform public.swap_refresh(uid);
    -- Blocked pairs are counted like any other: a block ends open swaps the same quiet way a deleted
    -- piece does, and the blocked member must not be able to tell the two apart by the count.
    select count(*) into needs from public.swaps s
     where (s.proposer_id = uid or s.recipient_id = uid) and public.swap_attention(s, uid);
  end if;
  select * into m from public.swap_members where user_id = uid;
  return jsonb_build_object(
    'swapsEnabled', on_,
    'termsAccepted', m.terms_accepted_at is not null,
    'termsCurrent', m.terms_accepted_at is not null and m.terms_version is not distinct from cur,
    'currentTermsVersion', cur,
    'communityAvailable', on_ and comm,
    'communityJoined', m.community_joined_at is not null,
    'alias', m.alias,
    'adultConfirmed', m.adult_confirmed_at is not null,
    'suspended', m.suspended_at is not null,
    'needsYou', needs
  );
end;
$$;

create or replace function public.get_swap_badge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    return 0;
  end if;
  select count(*) into n from public.swaps s
   where (s.proposer_id = uid or s.recipient_id = uid) and public.swap_attention(s, uid)
     and s.status in ('proposed', 'accepted', 'completed');
  return n;
end;
$$;

create or replace function public.accept_swap_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur text := public.swap_cfg('terms_version') #>> '{}';
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  if p_version is distinct from cur then
    perform public.swap_raise('terms_version_mismatch', '22023');
  end if;
  insert into public.swap_members (user_id, terms_version, terms_accepted_at)
  values (uid, cur, now())
  on conflict (user_id) do update
    set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at, updated_at = now();
end;
$$;

-- ─── 3. My listings ─────────────────────────────────────────────────────────

create or replace function public.list_my_swap_listings()
returns table (
  listing_id uuid, item_id uuid, audience text, status text, name text, size text, condition text,
  note text, photo_path text, listed_at timestamptz, expires_at timestamptz,
  open_offers integer, in_accepted_swap boolean, stale boolean
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
    select l.id, l.item_id, l.audience, l.status, l.name, l.size, l.condition,
           l.note, l.photo_path, l.created_at, l.expires_at,
           (select count(*)::integer from public.swap_items si
              join public.swaps s on s.id = si.swap_id
             where si.listing_id = l.id and s.status = 'proposed' and si.side = 'request'),
           exists (select 1 from public.swap_items si
                     join public.swaps s on s.id = si.swap_id
                    where si.listing_id = l.id and s.status = 'accepted'),
           (ci.id is not null and (
              ci.name is distinct from l.name
              or ci.category is distinct from l.category
              or coalesce(ci.brand, '') is distinct from coalesce(l.brand, '')
              or coalesce(ci.color, '') is distinct from coalesce(l.color, '')
              or coalesce(ci.size, '') is distinct from coalesce(l.size, '')
              or coalesce(ci.condition, '') is distinct from coalesce(l.condition, '')
              or public.swap_item_photo_path(ci.user_image, uid) is distinct from l.source_photo_path))
      from public.swap_listings l
      left join public.clothing_items ci on ci.id = l.item_id and ci.user_id = uid
     where l.owner_id = uid and l.status in ('active', 'reserved', 'held', 'removed', 'expired')
     order by l.created_at desc
     limit 200;
end;
$$;

create or replace function public.update_swap_listing(p_listing_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.swap_gate(uid, 'friends');
  if clean is not null and char_length(clean) > 140 then
    perform public.swap_raise('invalid_note', '22023');
  end if;
  perform public.swap_require_text(clean, 'note', 'strict');
  update public.swap_listings set note = clean
   where id = p_listing_id and owner_id = uid and status in ('active', 'reserved', 'held');
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
end;
$$;

create or replace function public.withdraw_swap_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  select * into l from public.swap_listings where id = p_listing_id and owner_id = uid for update;
  if not found or l.status not in ('active', 'reserved', 'held', 'expired') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if l.status = 'held' then
    perform public.swap_raise('listing_held', '42501');     -- a hold is not something the owner can clear
  end if;
  if l.status = 'reserved' then
    perform public.swap_raise('item_reserved', '23505');
  end if;
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = l.id and s.status = 'proposed' order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
  update public.swap_listings set status = 'withdrawn', status_changed_at = now() where id = l.id;
end;
$$;

create or replace function public.renew_swap_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
begin
  perform public.swap_gate(uid, 'friends');
  select * into l from public.swap_listings where id = p_listing_id and owner_id = uid for update;
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  -- A hold (or a removal) stands: renewing must not turn it back into a live listing.
  if l.status in ('held', 'removed') or (l.item_id is not null and public.swap_item_has_hold(l.item_id)) then
    perform public.swap_raise('listing_held', '42501');
  end if;
  if l.item_id is null or l.status not in ('active', 'expired')
     or exists (select 1 from public.swap_listings o
                 where o.item_id = l.item_id and o.id <> l.id and o.status in ('active', 'reserved')) then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  update public.swap_listings
     set expires_at = now() + interval '60 days', status = 'active', status_changed_at = now()
   where id = l.id;
end;
$$;

-- ─── 4. The rack: browsing ──────────────────────────────────────────────────

-- p_scope 'friends': listings by accepted friends (either audience).
-- p_scope 'community': community listings by members who are not your friends.
-- Never returns an owner id; owner_label is a friend's usual name, else the alias.
create or replace function public.browse_swap_listings(
  p_scope text,
  p_category text default null,
  p_size text default null,
  p_conditions text[] default null,
  p_q text default null,
  p_friend_id uuid default null,
  p_same_owner_as uuid default null,
  p_before_ts timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  listing_id uuid, owner_label text, owner_kind text, audience text, name text, category text,
  subcategory text, brand text, color text, size text, condition text, pattern text,
  materials jsonb, care_instructions text[], origin_country text, season jsonb, note text,
  photo_path text, listed_at timestamptz, mine boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 40);
  only_owner uuid := null;
  q text := nullif(lower(left(btrim(coalesce(p_q, '')), 40)), '');
begin
  if p_scope is null or p_scope not in ('friends', 'community') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_gate(uid, case when p_scope = 'community' then 'community' else 'friends' end);
  perform public.swap_rate_check(uid, 'browse_day');

  if p_same_owner_as is not null then
    select l.owner_id into only_owner from public.swap_listings l
     where l.id = p_same_owner_as and public.swap_can_see_listing(l.id, uid);
    if only_owner is null then
      perform public.swap_raise('swap_unavailable', '22023');
    end if;
  elsif p_friend_id is not null then
    if p_scope <> 'friends' or not public.are_friends(uid, p_friend_id) then
      return;                                   -- nothing to show, and nothing revealed
    end if;
    only_owner := p_friend_id;
  end if;

  return query
    select l.id,
           public.swap_label(uid, l.owner_id),
           case when public.are_friends(uid, l.owner_id) then 'friend' else 'member' end,
           l.audience, l.name, l.category, l.subcategory, l.brand, l.color, l.size, l.condition,
           l.pattern, l.materials, l.care_instructions, l.origin_country, l.season, l.note,
           l.photo_path, l.created_at, false
      from public.swap_listings l
     where l.status = 'active' and l.expires_at > now()
       and l.owner_id <> uid
       and (only_owner is null or l.owner_id = only_owner)
       and not exists (select 1 from public.user_blocks b
                        where (b.blocker_id = uid and b.blocked_id = l.owner_id)
                           or (b.blocker_id = l.owner_id and b.blocked_id = uid))
       and (case when p_scope = 'friends'
                 then exists (select 1 from public.friend_requests fr
                               where fr.status = 'accepted'
                                 and ((fr.requester_id = uid and fr.recipient_id = l.owner_id)
                                   or (fr.recipient_id = uid and fr.requester_id = l.owner_id)))
                 else l.audience = 'community' and not public.are_friends(uid, l.owner_id) end)
       and (p_category is null or l.category = p_category)
       and (p_size is null or lower(l.size) = lower(left(btrim(p_size), 20)))
       and (p_conditions is null or l.condition = any (p_conditions))
       and (q is null or strpos(lower(l.name), q) > 0 or strpos(lower(coalesce(l.brand, '')), q) > 0)
       and (p_before_ts is null or (l.created_at, l.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
       and public.swap_can_see_listing(l.id, uid)
     order by l.created_at desc, l.id desc
     limit lim;
end;
$$;

-- One listing: on the rack for me, mine, or part of a swap I am in.
create or replace function public.get_swap_listing(p_listing_id uuid)
returns table (
  listing_id uuid, owner_label text, owner_kind text, audience text, name text, category text,
  subcategory text, brand text, color text, size text, condition text, pattern text,
  materials jsonb, care_instructions text[], origin_country text, season jsonb, note text,
  photo_path text, listed_at timestamptz, mine boolean
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
  return query
    select l.id,
           public.swap_label(uid, l.owner_id),
           case when public.are_friends(uid, l.owner_id) then 'friend' else 'member' end,
           l.audience, l.name, l.category, l.subcategory, l.brand, l.color, l.size, l.condition,
           l.pattern, l.materials, l.care_instructions, l.origin_country, l.season, l.note,
           l.photo_path, l.created_at, (l.owner_id = uid)
      from public.swap_listings l
     where l.id = p_listing_id
       and (l.owner_id = uid
            or (not public.is_blocked_between(uid, l.owner_id)
                and (public.swap_can_see_listing(l.id, uid)
                     or exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
                                 where si.listing_id = l.id and s.status in ('proposed', 'accepted', 'completed')
                                   and uid in (s.proposer_id, s.recipient_id)))));
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
end;
$$;

-- ─── 5. Publishing (service role only; called by the swap-media function) ───

-- The one place that decides whether a piece may be listed to an audience, so the precheck (before the
-- photo is copied) and the commit (after it) cannot disagree. A piece edited while its photo is being
-- copied is judged on what it says now. Checks, in order: it is the member's own, non-wishlist piece; no
-- hold or removal stands against it; it has a photo in the member's own wardrobe-images folder (the path is
-- derived from the row and matched against a strict pattern, never taken from a request); the community
-- needs size and condition; the note is short; every text a viewer will read passes the text filter; the
-- live-listing caps. Returns the photo's path in wardrobe-images. Writes nothing.
create or replace function public.swap_validate_item(p_user uuid, p_item uuid, p_audience text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.clothing_items;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  src text;
  mode text := case when p_audience = 'community' then 'strict' else 'open' end;
  missing text[] := '{}';
  live_total integer;
  live_comm integer;
begin
  select * into it from public.clothing_items
   where id = p_item and user_id = p_user and coalesce(is_wishlist, false) = false;
  if not found then
    perform public.swap_raise('item_not_found', '22023');
  end if;
  if public.swap_item_has_hold(p_item) then
    perform public.swap_raise('listing_held', '42501');
  end if;

  src := public.swap_item_photo_path(it.user_image, p_user);
  if src is null then missing := array_append(missing, 'photo'); end if;
  if p_audience = 'community' then
    if nullif(btrim(coalesce(it.size, '')), '') is null then missing := array_append(missing, 'size'); end if;
    if it.condition is null then missing := array_append(missing, 'condition'); end if;
  end if;
  if cardinality(missing) > 0 then
    perform public.swap_raise('listing_incomplete', '22023', array_to_string(missing, ','));
  end if;

  if clean_note is not null and char_length(clean_note) > 140 then
    perform public.swap_raise('invalid_note', '22023');
  end if;
  perform public.swap_require_text(clean_note, 'note', mode);
  perform public.swap_require_text(it.name, 'name', mode);
  perform public.swap_require_text(it.brand, 'brand', mode);
  perform public.swap_require_text(it.color, 'color', mode);
  perform public.swap_require_text(it.size, 'size', mode);
  -- The rest of what a viewer reads on the card (free text the member typed or scanned).
  perform public.swap_require_text(
    concat_ws(' ', it.subcategory, it.pattern, it.material, it.origin_country,
              array_to_string(it.care_instructions, ' '),
              (select string_agg(m ->> 'name', ' ')
                 from jsonb_array_elements(case when jsonb_typeof(it.materials) = 'array' then it.materials else '[]'::jsonb end) m
                where jsonb_typeof(m) = 'object')),
    'details', mode);

  select count(*) filter (where status in ('active', 'reserved', 'held')),
         count(*) filter (where status in ('active', 'reserved', 'held') and audience = 'community')
    into live_total, live_comm
    from public.swap_listings where owner_id = p_user and item_id is distinct from p_item;
  if live_total >= public.swap_limit('listings_live')
     or (p_audience = 'community' and live_comm >= public.swap_limit('listings_community')) then
    perform public.swap_raise('swap_listing_limit', '54000');
  end if;
  return src;
end;
$$;

-- Validates a publish request and reserves a listing id. Nothing is written except the
-- publish counter. p_user is passed explicitly because the service role has no auth.uid().
create or replace function public.swap_publish_precheck(p_user uuid, p_item uuid, p_audience text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
begin
  if p_audience is null or p_audience not in ('friends', 'community') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_gate(p_user, case when p_audience = 'community' then 'community' else 'friends' end);
  src := public.swap_validate_item(p_user, p_item, p_audience, p_note);
  perform public.swap_rate_check(p_user, 'publish_day');
  return jsonb_build_object('listingId', gen_random_uuid(), 'sourcePath', src);
end;
$$;

-- Inserts the listing once the photo copy exists in swap-photos. Locks the piece, runs every check
-- again on what the piece says now (swap_validate_item), rebuilds the snapshot from the item row
-- (whitelisted columns only, cleaned), and retires the item's previous listing. The photo copy that was
-- stored is the one that passed the safety check, whatever the piece's photo says now: if the member
-- changed the photo meanwhile, source_photo_path records the new one and the listing shows as stale.
create or replace function public.swap_publish_commit(
  p_user uuid, p_listing uuid, p_item uuid, p_audience text, p_note text, p_photo_state text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.clothing_items;
  prev public.swap_listings;
  r record;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  src text;
begin
  if p_audience is null or p_audience not in ('friends', 'community')
     or p_photo_state is null or p_photo_state not in ('stripped', 'checked') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_gate(p_user, case when p_audience = 'community' then 'community' else 'friends' end);

  -- Hold the piece still while it is checked and copied into the snapshot.
  select * into it from public.clothing_items
   where id = p_item and user_id = p_user and coalesce(is_wishlist, false) = false for share;
  if not found then
    perform public.swap_raise('item_not_found', '22023');
  end if;
  src := public.swap_validate_item(p_user, p_item, p_audience, p_note);

  select * into prev from public.swap_listings
   where item_id = p_item and status in ('active', 'reserved', 'held') for update;
  if found then
    if prev.status = 'held' then
      perform public.swap_raise('listing_held', '42501');
    end if;
    if prev.status = 'reserved' then
      perform public.swap_raise('item_reserved', '23505');
    end if;
    for r in
      select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
       where si.listing_id = prev.id and s.status = 'proposed' order by s.id
    loop
      perform public.swap_close(r.id, 'cancelled', 'unavailable');
    end loop;
    update public.swap_listings set status = 'withdrawn', status_changed_at = now() where id = prev.id;
  end if;

  insert into public.swap_listings (
    id, owner_id, item_id, audience, status, note, name, category, subcategory, brand, color, size,
    condition, pattern, material, season, materials, care_instructions, origin_country,
    photo_path, photo_state, source_photo_path)
  values (
    p_listing, p_user, p_item, p_audience, 'active', clean_note,
    left(btrim(it.name), 80), it.category,
    left(nullif(btrim(coalesce(it.subcategory, '')), ''), 60),
    left(nullif(btrim(coalesce(it.brand, '')), ''), 60),
    left(nullif(btrim(coalesce(it.color, '')), ''), 40),
    left(nullif(btrim(coalesce(it.size, '')), ''), 20),
    it.condition,
    left(nullif(btrim(coalesce(it.pattern, '')), ''), 40),
    left(nullif(btrim(coalesce(it.material, '')), ''), 40),
    public.swap_clean_season(it.season),
    public.swap_clean_materials(it.materials),
    public.swap_clean_care(it.care_instructions),
    left(nullif(btrim(coalesce(it.origin_country, '')), ''), 60),
    p_listing::text || '.jpg', p_photo_state, src);
  return p_listing;
end;
$$;

-- Which of these photo paths still belong to a listing (the sweeper deletes the rest).
create or replace function public.swap_known_photo_paths(p_paths text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(photo_path), '{}'::text[]) from public.swap_listings where photo_path = any (p_paths);
$$;

-- ─── 6. Function privileges ─────────────────────────────────────────────────

revoke all on function public.swap_attention(public.swaps, uuid) from public, anon, authenticated;
revoke all on function public.swap_validate_item(uuid, uuid, text, text) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_swap_settings()',
    'public.get_swap_badge()',
    'public.accept_swap_terms(text)',
    'public.list_my_swap_listings()',
    'public.update_swap_listing(uuid, text)',
    'public.withdraw_swap_listing(uuid)',
    'public.renew_swap_listing(uuid)',
    'public.browse_swap_listings(text, text, text, text[], text, uuid, uuid, timestamptz, uuid, integer)',
    'public.get_swap_listing(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

revoke all on function public.swap_publish_precheck(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.swap_publish_commit(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.swap_publish_precheck(uuid, uuid, text, text) to service_role;
grant execute on function public.swap_publish_commit(uuid, uuid, uuid, text, text, text) to service_role;
revoke all on function public.swap_known_photo_paths(text[]) from public, anon, authenticated;
grant execute on function public.swap_known_photo_paths(text[]) to service_role;
