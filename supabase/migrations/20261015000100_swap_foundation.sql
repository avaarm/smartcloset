-- Clothing swaps, part 1 of 5: foundation.
--
-- Tables, helpers, triggers, the private swap-photos bucket and its single read
-- policy. Nothing here changes behaviour for old app builds. Every object is new except:
--   * user_blocks gains two columns (via_swap, ref) and its two client policies gain
--     "and not via_swap" (no existing row has via_swap = true, so old builds see exactly
--     what they saw before);
--   * content_reports gains five nullable columns (the report lists are widened later,
--     in the moderation migration);
--   * three triggers are added to user_blocks, friend_requests and clothing_items. They
--     never raise, so they cannot make a block, an unfriend or a deletion fail.
--
-- Rules every later swap migration follows:
--   * Every swap table has row level security ON and ALL privileges revoked from
--     public, anon and authenticated. There are no policies. App users reach swap data
--     only through SECURITY DEFINER functions that check sign-in, blocks, suspension and
--     audience, and that list their output columns by name. (RLS policy expressions run
--     with the caller's rights and cannot call is_blocked_between, which is revoked from
--     clients, so block-awareness cannot live in policies.)
--   * Every function pins search_path. Client functions are granted to authenticated only;
--     internal helpers and service-only functions are revoked from everyone but the owner
--     (Supabase grants EXECUTE on new functions to anon, so the revokes are explicit).
--   * Every FK to auth.users is ON DELETE CASCADE, except swaps.proposer_id/recipient_id
--     (ON DELETE SET NULL on purpose: the other member keeps an anonymous record of the
--     swap instead of it silently vanishing). delete_user_account() needs no edit.
--
-- Safe to run twice.

-- ─── 1. Configuration and switches ──────────────────────────────────────────

create table if not exists public.swap_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.swap_config (key, value) values
  ('swaps_enabled',         'true'::jsonb),     -- global kill switch
  ('community_enabled',     'false'::jsonb),    -- stranger tier; stays false until the report queue is staffed
  ('terms_version',         '"2026-10"'::jsonb),
  ('min_account_age_hours', '48'::jsonb)
on conflict (key) do nothing;

-- One row; remembers when the throttled janitor last ran.
create table if not exists public.swap_meta (
  id               boolean primary key default true check (id),
  last_janitor_at  timestamptz
);
insert into public.swap_meta (id) values (true) on conflict (id) do nothing;

-- ─── 2. Members ─────────────────────────────────────────────────────────────

create table if not exists public.swap_members (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  terms_version         text,
  terms_accepted_at     timestamptz,
  -- Community tier only (stays null until the community migration is live).
  adult_confirmed_at    timestamptz,     -- "I am 18 or older"; no date of birth is stored
  photo_scan_ack_at     timestamptz,     -- agreed that community photos are checked by Google Cloud Vision
  community_joined_at   timestamptz,
  community_terms_version text,
  alias                 text,
  suspended_at          timestamptz,
  suspended_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint swap_members_alias_check
    check (alias is null or alias ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$')
);
create unique index if not exists swap_members_alias_unique
  on public.swap_members (lower(alias)) where alias is not null;

-- ─── 3. Listings (immutable snapshots of an item) ───────────────────────────

create table if not exists public.swap_listings (
  id                 uuid primary key,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  item_id            uuid references public.clothing_items(id) on delete set null,
  audience           text not null check (audience in ('friends', 'community')),
  status             text not null default 'active'
                       check (status in ('active', 'reserved', 'completed', 'withdrawn', 'held', 'removed', 'expired')),
  note               text check (note is null or char_length(note) <= 140),
  -- Snapshot. Only these fields are ever shown to anyone else; nothing private is copied.
  name               text not null check (char_length(name) between 1 and 80),
  category           text not null,
  subcategory        text check (subcategory is null or char_length(subcategory) <= 60),
  brand              text check (brand is null or char_length(brand) <= 60),
  color              text check (color is null or char_length(color) <= 40),
  size               text check (size is null or char_length(size) <= 20),
  condition          text check (condition is null or condition in ('new_with_tags', 'like_new', 'good', 'well_loved')),
  pattern            text check (pattern is null or char_length(pattern) <= 40),
  material           text check (material is null or char_length(material) <= 40),
  season             jsonb,
  materials          jsonb,
  care_instructions  text[] check (care_instructions is null or cardinality(care_instructions) <= 20),
  origin_country     text check (origin_country is null or char_length(origin_country) <= 60),
  -- Photo: a copy in the private swap-photos bucket, named by the listing id (no user id).
  photo_path         text not null unique,
  photo_state        text not null check (photo_state in ('stripped', 'checked')),   -- stripped: metadata removed; checked: also passed the safety check
  source_photo_path  text not null,          -- wardrobe-images path it was copied from (stale detection)
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '60 days',
  status_changed_at  timestamptz not null default now(),
  -- Who put a 'held' listing on hold. Only meaningful while status = 'held'. A hold is sticky: it ends
  -- only when a person releases or removes the listing (or the piece is deleted), never by expiry,
  -- renewal, withdrawal or listing the piece again. 'suspension' holds end when the suspension does.
  held_by            text check (held_by is null or held_by in ('reports', 'admin', 'suspension')),
  held_at            timestamptz,
  constraint swap_listings_photo_is_id check (photo_path = id::text || '.jpg'),
  constraint swap_listings_community_checked check (audience <> 'community' or photo_state = 'checked')
);
create unique index if not exists swap_listings_one_live_per_item
  on public.swap_listings (item_id)
  where item_id is not null and status in ('active', 'reserved', 'held');
create index if not exists swap_listings_owner on public.swap_listings (owner_id, status);
create index if not exists swap_listings_item on public.swap_listings (item_id) where item_id is not null;
create index if not exists swap_listings_browse
  on public.swap_listings (audience, created_at desc, id desc) where status = 'active';

-- ─── 4. Swaps, their items and messages ─────────────────────────────────────

create table if not exists public.swaps (
  id                 uuid primary key default gen_random_uuid(),
  proposer_id        uuid references auth.users(id) on delete set null,
  recipient_id       uuid references auth.users(id) on delete set null,
  pair_kind          text not null check (pair_kind in ('friends', 'community')),
  status             text not null default 'proposed'
                       check (status in ('proposed', 'accepted', 'declined', 'cancelled', 'expired', 'completed')),
  closed_reason      text check (closed_reason in
                       ('declined', 'cancelled_by_proposer', 'cancelled_by_recipient', 'unavailable', 'expired', 'completed')),
  client_ref         uuid,
  proposer_done_at   timestamptz,
  recipient_done_at  timestamptz,
  auto_completed     boolean not null default false,
  proposer_seen_at   timestamptz,
  recipient_seen_at  timestamptz,
  last_event_at      timestamptz not null default now(),
  last_event_by      uuid,                    -- null = the system; deliberately no FK
  created_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  expires_at         timestamptz not null default now() + interval '14 days',
  closed_at          timestamptz,
  updated_at         timestamptz not null default now(),
  constraint swaps_not_self check (proposer_id <> recipient_id)
);
create unique index if not exists swaps_one_open_proposal_per_pair
  on public.swaps (proposer_id, recipient_id) where status = 'proposed';
create unique index if not exists swaps_client_ref
  on public.swaps (proposer_id, client_ref) where client_ref is not null;
create index if not exists swaps_proposer on public.swaps (proposer_id, status);
create index if not exists swaps_recipient on public.swaps (recipient_id, status);
create index if not exists swaps_open_expiry on public.swaps (expires_at) where status in ('proposed', 'accepted');
create index if not exists swaps_closed on public.swaps (closed_at) where closed_at is not null;

create table if not exists public.swap_items (
  id                 uuid primary key default gen_random_uuid(),
  swap_id            uuid not null references public.swaps(id) on delete cascade,
  listing_id         uuid references public.swap_listings(id) on delete set null,
  side               text not null check (side in ('offer', 'request')),   -- offer: the proposer gives it; request: the recipient gives it
  reserved           boolean not null default false,
  -- Minimal history that outlives the listing.
  name               text not null,
  category           text,
  brand              text,
  size               text,
  condition          text,
  giver_item_id      uuid,                    -- the giver's own closet row; no FK on purpose
  claimed_item_id    uuid references public.clothing_items(id) on delete set null,   -- the receiver's new closet row
  claimed_at         timestamptz,
  photo_imported_at  timestamptz,
  removal_skipped_at timestamptz              -- the giver chose "keep mine"
);
create unique index if not exists swap_items_one_reservation on public.swap_items (listing_id) where reserved;
create unique index if not exists swap_items_listing_once on public.swap_items (swap_id, listing_id) where listing_id is not null;
create index if not exists swap_items_swap on public.swap_items (swap_id);
create index if not exists swap_items_listing on public.swap_items (listing_id) where listing_id is not null;
create index if not exists swap_items_giver on public.swap_items (giver_item_id) where giver_item_id is not null;

create table if not exists public.swap_messages (
  id          bigint generated always as identity primary key,
  swap_id     uuid not null references public.swaps(id) on delete cascade,
  sender_id   uuid references auth.users(id) on delete cascade,   -- null for system lines
  kind        text not null default 'text' check (kind in ('text', 'system')),
  code        text,
  body        text,
  client_ref  uuid,
  created_at  timestamptz not null default now(),
  constraint swap_messages_shape check (
    (kind = 'text' and sender_id is not null and body is not null and char_length(body) between 1 and 500)
    or (kind = 'system' and code is not null and body is null)
  )
);
create index if not exists swap_messages_swap on public.swap_messages (swap_id, id);
create index if not exists swap_messages_sender on public.swap_messages (sender_id, created_at desc) where sender_id is not null;
create unique index if not exists swap_messages_client_ref on public.swap_messages (sender_id, client_ref) where client_ref is not null;

-- ─── 5. Counters, filter terms, photo clean-up queue ────────────────────────

create table if not exists public.swap_rate_counters (
  user_id      uuid not null references auth.users(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  n            integer not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Every text rule looks at folded text, so the usual ways round a word filter do not work: wide and
-- compatibility forms become plain ones and accents are dropped (NFKD, so "ｇｉｆｔ" and "café" become
-- "gift" and "cafe"), zero-width and other invisible format characters are removed, and the result is
-- lower-case. Terms in swap_blocked_terms are stored in this folded form (the check below enforces it) in
-- any script. Requires a UTF-8 database (Supabase is). Look-alike letters from another alphabet (a
-- Cyrillic "a" for a Latin one) are NOT folded; that is a known limit of a word filter, and reports are the
-- answer to it.
create or replace function public.swap_fold_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
           regexp_replace(lower(normalize(coalesce(p_text, ''), nfkd)), '[\u0300-\u036f]', '', 'g'),
           '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]',
           '', 'g');
$$;

create table if not exists public.swap_blocked_terms (
  -- Letters, digits and single spaces in any script, already folded (swap_fold_text); matched as whole words.
  term text primary key check (
    char_length(term) between 2 and 60
    and term = public.swap_fold_text(term)
    and term = btrim(term)
    and term !~ '[^[:alnum:] ]'
    and term !~ '  '),
  kind text not null check (kind in ('content'))
);

-- Storage paths waiting to be deleted from swap-photos. No FK to users, so account
-- deletion cannot lose the work; the swap-media function drains it.
create table if not exists public.swap_photo_gc (
  path      text primary key,
  queued_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['swap_config', 'swap_meta', 'swap_members', 'swap_listings', 'swaps', 'swap_items',
                           'swap_messages', 'swap_rate_counters', 'swap_blocked_terms', 'swap_photo_gc']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end
$$;
revoke all on sequence public.swap_messages_id_seq from public, anon, authenticated;

-- ─── 6. Internal helpers (not callable by app users) ────────────────────────

create or replace function public.swap_raise(p_msg text, p_state text, p_detail text default null, p_hint text default null)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- RAISE ... USING does not accept NULL option values, so only pass what is set.
  if p_detail is null and p_hint is null then
    raise exception '%', p_msg using errcode = p_state;
  elsif p_hint is null then
    raise exception '%', p_msg using errcode = p_state, detail = p_detail;
  else
    raise exception '%', p_msg using errcode = p_state, detail = coalesce(p_detail, ''), hint = p_hint;
  end if;
end;
$$;

create or replace function public.swap_cfg(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.swap_config where key = p_key;
$$;

-- Every number that limits behaviour, in one place. Mirrored in src/config/swapRules.ts
-- and compared by a Jest test.
create or replace function public.swap_limit(p_name text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_name
    -- rolling counters (suffix gives the window): see swap_rate_check
    when 'publish_day'          then 20
    when 'browse_day'           then 400
    when 'propose_day'          then 15
    when 'propose_stranger_day' then 5
    when 'respond_day'          then 60
    when 'cancel_day'           then 30
    when 'complete_day'         then 30
    when 'message_min'          then 6
    when 'message_hour'         then 60
    when 'message_day'          then 300
    when 'block_day'            then 30
    -- plain caps
    when 'listings_live'        then 30
    when 'listings_community'   then 15
    when 'items_per_side'       then 3
    when 'open_outbound'        then 5
    when 'open_inbound'         then 20
    when 'open_per_requested_listing' then 8
    when 'open_per_offered_listing'   then 3
    when 'messages_per_swap'    then 200
    when 'preaccept_messages_stranger' then 3
    when 'decline_cooldown_days' then 7
    when 'reports_to_hold_listing' then 3
    when 'reports_day'          then 20
    else 0
  end;
$$;

-- Counts one action for p_uid in a fixed window and raises swap_rate_limited (54000,
-- DETAIL = bucket) once the cap is passed. The raise rolls the increment back, so only
-- successful actions are counted.
create or replace function public.swap_rate_check(p_uid uuid, p_bucket text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secs  integer := case when right(p_bucket, 4) = '_day' then 86400
                        when right(p_bucket, 5) = '_hour' then 3600
                        when right(p_bucket, 4) = '_min' then 60 end;
  cap   integer := public.swap_limit(p_bucket);
  win   timestamptz;
  cnt   integer;
begin
  if secs is null or cap <= 0 then
    raise exception 'invalid_rate_bucket' using errcode = '22023';
  end if;
  win := to_timestamp(floor(extract(epoch from now()) / secs) * secs);
  insert into public.swap_rate_counters (user_id, bucket, window_start, n)
  values (p_uid, p_bucket, win, 1)
  on conflict (user_id, bucket, window_start)
  do update set n = public.swap_rate_counters.n + 1
  returning n into cnt;
  if cnt > cap then
    perform public.swap_raise('swap_rate_limited', '54000', p_bucket);
  end if;
end;
$$;

-- Friends = an accepted friend_requests row in either direction (tolerates the A->B plus
-- B->A duplicate-row race on the ordered unique constraint).
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests fr
     where fr.status = 'accepted'
       and ((fr.requester_id = p_a and fr.recipient_id = p_b)
         or (fr.requester_id = p_b and fr.recipient_id = p_a))
  );
$$;

-- Text rules for swap text (item names, notes, messages). Returns null when fine, or a
-- hint: 'payment' (scam phrases, always refused), 'contact' (strangers, before acceptance),
-- 'content' (objectionable terms from swap_blocked_terms). The scam, payment and contact
-- rules are built in so they hold even when the term table is empty. The text is folded first
-- (swap_fold_text), so zero-width characters, wide letters and accents do not hide a phrase.
-- Speed bumps, not a substitute for reports.
--   p_mode 'open'   friends, or anyone after acceptance: scam + content
--   p_mode 'strict' strangers before acceptance: scam + payment words + contact details + content
create or replace function public.swap_text_ok(p_text text, p_mode text default 'open')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := public.swap_fold_text(p_text);
begin
  if t = '' then
    return null;
  end if;
  if t ~ '(gift ?card|giftcard|western union|moneygram|wire transfer|bitcoin|\mcrypto\M|cashier''?s cheque|cashier''?s check|itunes card)' then
    return 'payment';
  end if;
  if p_mode = 'strict' then
    if t ~ '(\mvenmo\M|paypal|\mzelle\M|cash ?app|apple pay|send (me )?(the )?money|\mdeposit\M|bank transfer)' then
      return 'payment';
    end if;
    if t ~ '(https?://|www\.|\.com\M|\.net\M|\.org\M|\.io\M|\.me/)'
       or t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
       or t ~ '(^|\s)@[a-z0-9_.]{3,}'
       or t ~ '(\+?[0-9]{1,3}[ .-]?)?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}'
       or t ~ '\+[0-9][0-9 .-]{8,}[0-9]'
       or t ~ '(\mwhatsapp\M|\mtelegram\M|\msnapchat\M|\minstagram\M|\msignal\M|\mwechat\M|\mdiscord\M|text me|call me|\mdm me\M)' then
      return 'contact';
    end if;
  end if;
  if exists (
    select 1 from public.swap_blocked_terms b
     where b.kind = 'content'
       and t ~ ('\m' || b.term || '\M')
  ) then
    return 'content';
  end if;
  return null;
end;
$$;

create or replace function public.swap_require_text(p_text text, p_field text, p_mode text default 'open')
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hint text := public.swap_text_ok(p_text, p_mode);
begin
  if hint is not null then
    perform public.swap_raise('text_not_allowed', '22023', p_field, hint);
  end if;
end;
$$;

-- Who may use swaps at all. p_need is 'friends' or 'community'.
create or replace function public.swap_gate(p_uid uuid, p_need text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.swap_members;
  cur text := public.swap_cfg('terms_version') #>> '{}';
begin
  if p_uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  select * into m from public.swap_members where user_id = p_uid;
  if not found or m.terms_accepted_at is null or m.terms_version is distinct from cur then
    perform public.swap_raise('swap_terms_required', '42501');
  end if;
  if m.suspended_at is not null then
    perform public.swap_raise('swap_suspended', '42501');
  end if;
  if p_need = 'community' then
    if not coalesce((public.swap_cfg('community_enabled'))::boolean, false) then
      perform public.swap_raise('community_unavailable', '42501');
    end if;
    if m.community_joined_at is null or m.adult_confirmed_at is null or m.alias is null then
      perform public.swap_raise('community_not_joined', '42501');
    end if;
    if (select u.created_at from auth.users u where u.id = p_uid)
         > now() - make_interval(hours => coalesce((public.swap_cfg('min_account_age_hours'))::integer, 48)) then
      perform public.swap_raise('account_too_new', '42501');
    end if;
  end if;
end;
$$;

-- How two members relate for swapping: 'blocked' | 'friends' | 'community' | 'none'.
create or replace function public.swap_pair_state(p_a uuid, p_b uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ma public.swap_members;
  mb public.swap_members;
begin
  if p_a is null or p_b is null or p_a = p_b then
    return 'none';
  end if;
  if public.is_blocked_between(p_a, p_b) then
    return 'blocked';
  end if;
  select * into ma from public.swap_members where user_id = p_a;
  select * into mb from public.swap_members where user_id = p_b;
  if (ma.suspended_at is not null) or (mb.suspended_at is not null) then
    return 'none';
  end if;
  if public.are_friends(p_a, p_b) then
    return 'friends';
  end if;
  if coalesce((public.swap_cfg('community_enabled'))::boolean, false)
     and ma.community_joined_at is not null and ma.alias is not null and ma.adult_confirmed_at is not null
     and mb.community_joined_at is not null and mb.alias is not null and mb.adult_confirmed_at is not null then
    return 'community';
  end if;
  return 'none';
end;
$$;

-- May p_viewer see this listing on the rack? (Participants of a swap that includes it
-- get their own, separate rule inside get_swap and can_view_swap_photo.)
create or replace function public.swap_can_see_listing(p_listing uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.swap_listings;
  st text;
begin
  select * into l from public.swap_listings where id = p_listing;
  if not found or l.status <> 'active' or l.expires_at <= now() then
    return false;
  end if;
  if l.owner_id = p_viewer then
    return true;
  end if;
  st := public.swap_pair_state(p_viewer, l.owner_id);
  return st = 'friends' or (st = 'community' and l.audience = 'community');
end;
$$;

-- The name a member is shown under: a friend's usual name, otherwise their alias, never
-- the email-derived fallback of friend_display_name().
create or replace function public.swap_label(p_viewer uuid, p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_other is null then 'Former member'
    when public.are_friends(p_viewer, p_other) then public.friend_display_name(p_other)
    else coalesce((select m.alias from public.swap_members m where m.user_id = p_other), 'Swap member')
  end;
$$;

-- Serialises work that reserves or releases listings between two members. Always takes
-- the two locks in the same (sorted) order so concurrent accepts cannot deadlock.
create or replace function public.swap_lock_users(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_a is null or p_b is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('swap:' || least(p_a, p_b)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('swap:' || greatest(p_a, p_b)::text, 0));
end;
$$;

-- The storage path inside wardrobe-images for an item photo URL owned by p_uid, else null.
create or replace function public.swap_item_photo_path(p_url text, p_uid uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select substring(p_url from
    '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/wardrobe-images/(' || p_uid::text || '/[A-Za-z0-9._-]+)(?:[?#].*)?$');
$$;

-- Cleaners for the snapshot (the item row is user-written, so nothing is trusted).
create or replace function public.swap_clean_materials(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then null else
    (select coalesce(jsonb_agg(x.el order by x.ord), '[]'::jsonb) from (
       select t.ord,
              jsonb_strip_nulls(jsonb_build_object(
                'name', left(lower(btrim(t.e ->> 'name')), 40),
                'percentage', case when (t.e ->> 'percentage') ~ '^[0-9]{1,3}(\.[0-9]+)?$'
                                   then case when (t.e ->> 'percentage')::numeric <= 100 then (t.e ->> 'percentage')::numeric end end,
                'tier', case when t.e ->> 'tier' in ('primary', 'secondary', 'lining', 'fill', 'trim', 'upper', 'sole', 'hardware')
                             then t.e ->> 'tier' end)) as el
         from jsonb_array_elements(p) with ordinality as t(e, ord)
        where jsonb_typeof(t.e) = 'object' and btrim(coalesce(t.e ->> 'name', '')) <> ''
        order by t.ord
        limit 12) x)
  end;
$$;

create or replace function public.swap_clean_season(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then null else
    (select coalesce(jsonb_agg(x.v order by x.ord), '[]'::jsonb) from (
       select t.ord, to_jsonb(left(btrim(t.e #>> '{}'), 12)) as v
         from jsonb_array_elements(p) with ordinality as t(e, ord)
        where jsonb_typeof(t.e) = 'string' and btrim(t.e #>> '{}') <> ''
        order by t.ord
        limit 6) x)
  end;
$$;

create or replace function public.swap_clean_care(p text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select case when p is null then null else
    array(select left(btrim(c), 80) from unnest(p) with ordinality as t(c, ord)
           where btrim(coalesce(c, '')) <> '' order by ord limit 20)
  end;
$$;

-- ─── 7. Closing swaps (the one place closing logic lives) ───────────────────

-- Have enough different members reported this listing, recently enough, for it to be held?
create or replace function public.swap_reports_reach_hold(p_listing uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- plpgsql, not sql: content_reports.ref_type and ref_id are added further down this file.
  return (select count(distinct cr.reporter_id) from public.content_reports cr
           where cr.ref_type = 'listing' and cr.ref_id = p_listing and cr.created_at > now() - interval '7 days')
         >= public.swap_limit('reports_to_hold_listing');
end;
$$;

-- Is this piece barred from being listed because a person's decision stands against one of its
-- listings? A held listing stays held, and a removed one is kept (without its photo) for as long as the
-- piece exists, so the owner cannot clear either by withdrawing, renewing, waiting or listing again.
create or replace function public.swap_item_has_hold(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.swap_listings l where l.item_id = p_item and l.status in ('held', 'removed'));
$$;

-- Closes a proposed or accepted swap, releases its reservations and records a system
-- line. Returns false when the swap was already closed. p_by is the member who acted
-- (null = the system), used for the inbox dot.
create or replace function public.swap_close(p_swap uuid, p_status text, p_reason text, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.swaps
     set status = p_status, closed_reason = p_reason, closed_at = now(), updated_at = now(),
         last_event_at = now(), last_event_by = p_by
   where id = p_swap and status in ('proposed', 'accepted');
  if not found then
    return false;
  end if;

  update public.swap_items set reserved = false where swap_id = p_swap and reserved;

  if p_status = 'completed' then
    update public.swap_listings l
       set status = 'completed', status_changed_at = now()
      from public.swap_items si
     where si.swap_id = p_swap and si.listing_id = l.id and l.status in ('reserved', 'active');
  else
    -- Listings go back on the rack, unless the piece is gone or the listing ran out.
    update public.swap_listings l
       set status = case when l.item_id is null then 'withdrawn'
                         when l.expires_at <= now() then 'expired'
                         else 'active' end,
           status_changed_at = now()
      from public.swap_items si
     where si.swap_id = p_swap and si.listing_id = l.id and l.status = 'reserved';
    -- A reserved listing is never held while a swap is in progress, but reports made meanwhile still
    -- count: when it comes back to the rack with enough of them, it goes on hold instead.
    update public.swap_listings l
       set status = 'held', held_by = 'reports', held_at = now(), status_changed_at = now()
      from public.swap_items si
     where si.swap_id = p_swap and si.listing_id = l.id and l.status = 'active'
       and public.swap_reports_reach_hold(l.id);
  end if;

  insert into public.swap_messages (swap_id, kind, code) values (p_swap, 'system', p_reason);
  return true;
end;
$$;

-- Closes every open swap between two members (block: all; unfriend: friends-only ones).
create or replace function public.swap_close_between(p_a uuid, p_b uuid, p_all boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.swaps
     where status in ('proposed', 'accepted')
       and ((proposer_id = p_a and recipient_id = p_b) or (proposer_id = p_b and recipient_id = p_a))
       and (p_all or pair_kind = 'friends')
     order by id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable', null);
  end loop;
end;
$$;

-- Completes a swap in which both sides (or, after a timeout, one side) have tapped done.
create or replace function public.swap_finish(p_swap uuid, p_auto boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.swap_close(p_swap, 'completed', 'completed', null) then
    update public.swaps set auto_completed = p_auto where id = p_swap;
  end if;
end;
$$;

-- Lazy upkeep for one member, run at the start of their reads: expires overdue swaps,
-- closes ones that are no longer allowed (block, unfriend, suspension, listing gone),
-- and finishes ones left half-done for 14 days. Correctness never depends on a cron job.
create or replace function public.swap_refresh(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.swaps;
  st text;
begin
  if p_uid is null then
    return;
  end if;
  for s in
    select * from public.swaps
     where status in ('proposed', 'accepted') and (proposer_id = p_uid or recipient_id = p_uid)
     order by id
  loop
    st := public.swap_pair_state(s.proposer_id, s.recipient_id);
    -- Left half-done for 14 days: finish it (the silent member can still collect their piece). This
    -- comes before the absolute expiry so a swap one side already completed is never "expired".
    if s.status = 'accepted'
       and (s.proposer_done_at is null) <> (s.recipient_done_at is null)
       and greatest(coalesce(s.proposer_done_at, '-infinity'), coalesce(s.recipient_done_at, '-infinity')) < now() - interval '14 days' then
      perform public.swap_finish(s.id, true);
    elsif s.expires_at <= now() then
      perform public.swap_close(s.id, 'expired', 'expired');
    elsif st in ('blocked', 'none')
       or (s.pair_kind = 'friends' and st <> 'friends')
       or (s.pair_kind = 'community' and st not in ('community', 'friends')) then
      perform public.swap_close(s.id, 'cancelled', 'unavailable');
    elsif s.status = 'proposed' and exists (
            select 1 from public.swap_items si
              left join public.swap_listings l on l.id = si.listing_id
             where si.swap_id = s.id
               and (l.id is null or l.status <> 'active' or l.expires_at <= now()
                    or exists (select 1 from public.swap_items o where o.listing_id = si.listing_id and o.reserved))) then
      perform public.swap_close(s.id, 'cancelled', 'unavailable');
    end if;
  end loop;
end;
$$;

-- Global upkeep, at most once every 15 minutes, started opportunistically by member
-- reads. Retention lives here: messages go 30 days after a swap closes, the rest of the
-- swap after 90 days, listing photos 30 days after a listing ends.
create or replace function public.swap_janitor(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('swap_janitor', 0)) then
    return;
  end if;
  if not p_force and exists (
       select 1 from public.swap_meta where last_janitor_at > now() - interval '15 minutes') then
    return;
  end if;
  update public.swap_meta set last_janitor_at = now();

  -- Half-done swaps (one side tapped "We swapped!" more than 14 days ago) finish before anything expires.
  for r in
    select id from public.swaps
     where status = 'accepted' and (proposer_done_at is null) <> (recipient_done_at is null)
       and greatest(coalesce(proposer_done_at, '-infinity'), coalesce(recipient_done_at, '-infinity')) < now() - interval '14 days'
     order by id limit 200
  loop
    perform public.swap_finish(r.id, true);
  end loop;

  for r in
    select id, status from public.swaps
     where status in ('proposed', 'accepted') and expires_at <= now()
     order by expires_at limit 200
  loop
    perform public.swap_close(r.id, 'expired', 'expired');
  end loop;

  -- Only listings on the rack expire. A held listing stays held until a person decides, however old it is.
  update public.swap_listings
     set status = 'expired', status_changed_at = now()
   where status = 'active' and expires_at <= now();

  delete from public.swap_messages m
   using public.swaps s
   where s.id = m.swap_id and s.closed_at is not null and s.closed_at < now() - interval '30 days';

  delete from public.swaps
   where closed_at is not null and closed_at < now() - interval '90 days';

  -- Ended listings go 30 days after they ended (their photo is queued for deletion by the
  -- delete trigger). A swap keeps only the piece's name, size and condition from then on.
  -- A listing someone reported in the last 90 days is kept as evidence. A removed listing is kept while
  -- its piece still exists, so the piece cannot simply be listed again; it goes 30 days after the piece
  -- does. A held listing is never deleted here.
  delete from public.swap_listings l
   where (l.status in ('completed', 'withdrawn', 'expired') or (l.status = 'removed' and l.item_id is null))
     and l.status_changed_at < now() - interval '30 days'
     and not exists (select 1 from public.content_reports cr
                      where cr.ref_id = l.id and cr.created_at > now() - interval '90 days');

  delete from public.swap_rate_counters where window_start < now() - interval '2 days';
end;
$$;

-- ─── 8. Triggers: block, unfriend, item removed, member left ────────────────

create or replace function public.swap_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.swap_close_between(new.blocker_id, new.blocked_id, true);
  exception when others then
    raise warning 'swap_on_block: %', sqlerrm;   -- a block must never fail because of swaps
  end;
  return new;
end;
$$;
drop trigger if exists swap_on_block on public.user_blocks;
create trigger swap_on_block after insert on public.user_blocks
  for each row execute function public.swap_on_block();

create or replace function public.swap_on_unfriend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if not public.are_friends(old.requester_id, old.recipient_id) then
      perform public.swap_close_between(old.requester_id, old.recipient_id, false);
    end if;
  exception when others then
    raise warning 'swap_on_unfriend: %', sqlerrm;
  end;
  return old;
end;
$$;
drop trigger if exists swap_on_unfriend on public.friend_requests;
create trigger swap_on_unfriend after delete on public.friend_requests
  for each row when (old.status = 'accepted') execute function public.swap_on_unfriend();

-- An item that is deleted, or moved to the wishlist, leaves the rack and ends open swaps
-- it is part of, unless its owner already handed it over (tapped "We swapped"). BEFORE,
-- not AFTER: the ON DELETE SET NULL action on swap_listings.item_id is itself an AFTER
-- trigger and would otherwise clear item_id before this runs. Never raises, so deleting
-- an item or an account cannot be blocked by it.
create or replace function public.swap_on_item_gone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  begin
    for r in
      select si.swap_id
        from public.swap_items si
        join public.swaps s on s.id = si.swap_id
       where si.giver_item_id = old.id
         and s.status in ('proposed', 'accepted')
         and case when si.side = 'offer' then s.proposer_done_at else s.recipient_done_at end is null
       order by si.swap_id
    loop
      perform public.swap_close(r.swap_id, 'cancelled', 'unavailable');
    end loop;
    -- A held listing is withdrawn only when its piece is deleted. Moving the piece to the wishlist and back
    -- must not clear a hold, so a held listing stays held through that.
    update public.swap_listings
       set status = 'withdrawn', status_changed_at = now()
     where item_id = old.id and (status = 'active' or (status = 'held' and tg_op = 'DELETE'));
  exception when others then
    raise warning 'swap_on_item_gone: %', sqlerrm;
  end;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists swap_on_item_delete on public.clothing_items;
create trigger swap_on_item_delete before delete on public.clothing_items
  for each row execute function public.swap_on_item_gone();
drop trigger if exists swap_on_item_wishlisted on public.clothing_items;
create trigger swap_on_item_wishlisted before update of is_wishlist on public.clothing_items
  for each row when (new.is_wishlist is true and old.is_wishlist is distinct from true)
  execute function public.swap_on_item_gone();

-- A participant's account was deleted (the FK nulled their column): open swaps close
-- quietly, and a swap with nobody left disappears.
create or replace function public.swap_on_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proposer_id is null and new.recipient_id is null then
    delete from public.swaps where id = new.id;
    return null;
  end if;
  if new.status in ('proposed', 'accepted') then
    perform public.swap_close(new.id, 'cancelled', 'unavailable');
  end if;
  return null;
end;
$$;
drop trigger if exists swap_on_member_left on public.swaps;
create trigger swap_on_member_left after update of proposer_id, recipient_id on public.swaps
  for each row when (new.proposer_id is null or new.recipient_id is null)
  execute function public.swap_on_member_left();

-- Photos of deleted listings (including those removed by account deletion) are queued.
create or replace function public.swap_queue_photo_gc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.swap_photo_gc (path) values (old.photo_path) on conflict (path) do nothing;
  return old;
end;
$$;
drop trigger if exists swap_queue_photo_gc on public.swap_listings;
create trigger swap_queue_photo_gc after delete on public.swap_listings
  for each row execute function public.swap_queue_photo_gc();

-- ─── 8b. Reports can point at the thing reported ────────────────────────────

-- Columns only (the context/reason lists are widened in the moderation migration).
-- A report used to carry just a user id and <=500 characters, which is not enough for a
-- reviewer to act on a swap or a message.
alter table public.content_reports
  add column if not exists ref_type    text,
  add column if not exists ref_id      uuid,
  add column if not exists evidence    jsonb,
  add column if not exists reviewed_at timestamptz,
  add column if not exists outcome     text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_ref_type_check') then
    alter table public.content_reports add constraint content_reports_ref_type_check
      check (ref_type is null or ref_type in ('listing', 'swap', 'message'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_evidence_check') then
    alter table public.content_reports add constraint content_reports_evidence_check
      check (evidence is null or pg_column_size(evidence) <= 20000);
  end if;
end
$$;
create index if not exists content_reports_by_ref
  on public.content_reports (reporter_id, ref_type, ref_id) where ref_id is not null;
create index if not exists content_reports_ref on public.content_reports (ref_id) where ref_id is not null;

-- ─── 9. user_blocks: blocks made from a swap are private to the swap screens ─

-- A block of someone the blocker only knows by alias must not hand the blocker that
-- person's account id through the existing "Blocked people" list. Such rows are marked
-- via_swap and hidden from direct table reads; the swap screens list them through
-- list_swap_blocks() under an opaque ref. Rows made by block_user() are unchanged.
alter table public.user_blocks
  add column if not exists via_swap boolean not null default false,
  add column if not exists ref uuid not null default gen_random_uuid();
create unique index if not exists user_blocks_ref on public.user_blocks (ref);

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated
  using (auth.uid() = blocker_id and not via_swap);

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks" on public.user_blocks
  for delete to authenticated
  using (auth.uid() = blocker_id and not via_swap);

-- ─── 10. Photos: private bucket, one read policy ────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swap-photos', 'swap-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Who may read a listing photo. False in exactly the same way for "no such photo",
-- "not listed", "blocked" and "not allowed", so it reveals nothing. The owner always can;
-- a viewer can while the listing is on the rack for them; a participant can while the
-- swap is open or completed and nobody is blocked.
create or replace function public.can_view_swap_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
begin
  if uid is null then
    return false;
  end if;
  select * into l from public.swap_listings where photo_path = p_name;
  if not found then
    return false;
  end if;
  if l.owner_id = uid then
    return true;
  end if;
  if public.is_blocked_between(uid, l.owner_id) then
    return false;
  end if;
  if public.swap_can_see_listing(l.id, uid) then
    return true;
  end if;
  return exists (
    select 1
      from public.swap_items si
      join public.swaps s on s.id = si.swap_id
     where si.listing_id = l.id
       and s.status in ('proposed', 'accepted', 'completed')
       and uid in (s.proposer_id, s.recipient_id)
  );
end;
$$;

drop policy if exists "swap photos: viewers" on storage.objects;
create policy "swap photos: viewers" on storage.objects
  for select to authenticated
  using (bucket_id = 'swap-photos' and public.can_view_swap_photo(name));
-- No INSERT, UPDATE or DELETE policy: only the swap-media function (service role) writes or deletes.

-- ─── 11. Function privileges ────────────────────────────────────────────────

revoke all on function public.swap_raise(text, text, text, text) from public, anon, authenticated;
revoke all on function public.swap_cfg(text) from public, anon, authenticated;
revoke all on function public.swap_limit(text) from public, anon, authenticated;
revoke all on function public.swap_rate_check(uuid, text) from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_text_ok(text, text) from public, anon, authenticated;
revoke all on function public.swap_require_text(text, text, text) from public, anon, authenticated;
revoke all on function public.swap_gate(uuid, text) from public, anon, authenticated;
revoke all on function public.swap_pair_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_can_see_listing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_label(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_lock_users(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_item_photo_path(text, uuid) from public, anon, authenticated;
revoke all on function public.swap_clean_materials(jsonb) from public, anon, authenticated;
revoke all on function public.swap_clean_season(jsonb) from public, anon, authenticated;
revoke all on function public.swap_clean_care(text[]) from public, anon, authenticated;
revoke all on function public.swap_fold_text(text) from public, anon, authenticated;
revoke all on function public.swap_reports_reach_hold(uuid) from public, anon, authenticated;
revoke all on function public.swap_item_has_hold(uuid) from public, anon, authenticated;
revoke all on function public.swap_close(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.swap_close_between(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.swap_finish(uuid, boolean) from public, anon, authenticated;
revoke all on function public.swap_refresh(uuid) from public, anon, authenticated;
revoke all on function public.swap_janitor(boolean) from public, anon, authenticated;
grant execute on function public.swap_janitor(boolean) to service_role;   -- the swap-media sweep calls it
revoke all on function public.swap_on_block() from public, anon, authenticated;
revoke all on function public.swap_on_unfriend() from public, anon, authenticated;
revoke all on function public.swap_on_item_gone() from public, anon, authenticated;
revoke all on function public.swap_on_member_left() from public, anon, authenticated;
revoke all on function public.swap_queue_photo_gc() from public, anon, authenticated;

-- The storage policy runs with the viewer's EXECUTE right, so this one is granted.
revoke all on function public.can_view_swap_photo(text) from public, anon;
grant execute on function public.can_view_swap_photo(text) to authenticated;
