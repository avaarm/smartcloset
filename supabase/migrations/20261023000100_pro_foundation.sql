-- Professional accounts, part 2 of 8: foundation.
--
-- The fifteen tables, the helpers every later file calls, the functions that end a connection, the two triggers,
-- and one change to user_blocks. Nothing here is callable by an app user and nothing changes for old app builds:
-- every object is new except user_blocks, which gains one column (via_pro) and two recreated client policies
-- ("... and not via_swap and not via_pro"; no existing row has via_pro = true, so old builds see what they saw).
--
-- Rules every pro file follows (documentation/design/pro-accounts.md 3.3 and 4.1):
--   * Row level security is ON for every pro table and ALL privileges are revoked from public, anon and
--     authenticated. There are no policies. App users reach pro data only through SECURITY DEFINER functions that
--     check sign-in, the off-switch, terms, adult attestation, suspension and blocks and that list their output
--     columns by name. No function returns another person's account id, email or phone.
--   * Every function pins search_path. Client functions are granted to authenticated only; internal helpers and
--     triggers are revoked from everyone but the owner (Supabase grants EXECUTE on new functions to anon, so the
--     revokes are explicit).
--   * Every FK to auth.users is ON DELETE CASCADE, except pro_connections.stylist_id and client_id (ON DELETE SET NULL
--     on purpose: the other person keeps a labelled record for 90 days). delete_user_account() needs no edit.
--   * Every UPDATE and DELETE has a WHERE, including on one-row tables: the API layer rejects a bare one and direct
--     SQL does not (the swap upkeep job failed on phones for exactly this).
--   * Pro depends on two things of swap, both read-only: swap_fold_text(text) and the table swap_blocked_terms.
--
-- pro_enabled is seeded FALSE: a push of these files turns nothing on.
-- Safe to run twice.

-- ─── 1. Configuration and switches ──────────────────────────────────────────

create table if not exists public.pro_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- directory_enabled is reserved for a later phase and is not seeded.
insert into public.pro_config (key, value) values
  ('pro_enabled',           'false'::jsonb),     -- the kill switch, off until the owner turns it on (pro_set_enabled)
  ('stylist_terms_version', '"2026-10"'::jsonb),
  ('client_terms_version',  '"2026-10"'::jsonb),
  ('share_text_version',    '"2026-10"'::jsonb),
  ('min_account_age_hours', '48'::jsonb)
on conflict (key) do nothing;

-- One row; remembers when the throttled janitor last ran. Every update uses WHERE id.
create table if not exists public.pro_meta (
  id               boolean primary key default true check (id),
  last_janitor_at  timestamptz
);
insert into public.pro_meta (id) values (true) on conflict (id) do nothing;

-- ─── 2. Members and stylist profiles ────────────────────────────────────────

-- A person who has accepted something, and the sanctions that belong to the person. They live here and not on
-- pro_stylists because close_stylist_profile deletes the profile row: a sanction or an approval stored there could
-- be undone in two calls (close, then save). No date of birth is stored.
create table if not exists public.pro_members (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  adult_confirmed_at         timestamptz,
  stylist_terms_version      text,
  stylist_terms_accepted_at  timestamptz,
  client_terms_version       text,
  client_terms_accepted_at   timestamptz,
  suspended_at               timestamptz,
  suspended_reason           text check (suspended_reason is null or char_length(suspended_reason) <= 200),
  stylist_approved_at        timestamptz,     -- probation lifted
  -- A 'system' hold (reports, churn) releases itself after hold_release_days; an 'admin' hold never does.
  -- pro_invites_held() is the one place that decides.
  invites_held_at            timestamptz,
  invites_held_by            text check (invites_held_by is null or invites_held_by in ('system', 'admin')),
  stylist_removed_at         timestamptz,
  stylist_removed_reason     text check (stylist_removed_reason is null or char_length(stylist_removed_reason) <= 200),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint pro_members_hold_pair check ((invites_held_at is null) = (invites_held_by is null))
);

-- No email, phone, website, handle, address, location, photo, credential, rating, verified flag or count column
-- exists here, and none is added without its own migration, consent text and privacy review.
create table if not exists public.pro_stylists (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null
                     check (char_length(display_name) between 2 and 40 and display_name = btrim(display_name)),
  headline         text not null default '' check (char_length(headline) <= 80),
  bio              text not null default '' check (char_length(bio) <= 500),
  services         text[] not null
                     check (cardinality(services) between 1 and 7
                            and services <@ array['wardrobe_audit', 'personal_shopping', 'outfit_styling', 'color_analysis',
                                                  'event_styling', 'virtual_sessions', 'in_person_sessions']::text[]),
  languages        text[] not null default '{}' check (cardinality(languages) <= 5),
  rates_text       text not null default '' check (char_length(rates_text) <= 120),
  accepting_clients boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── 3. Invites and connections ─────────────────────────────────────────────

create table if not exists public.pro_invites (
  id          uuid primary key default gen_random_uuid(),
  stylist_id  uuid not null references auth.users(id) on delete cascade,
  code        text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),   -- Crockford base32
  label       text check (label is null or char_length(label) <= 40),            -- the stylist's private reference, never returned to a client
  status      text not null default 'live' check (status in ('live', 'used', 'revoked')),
  expires_at  timestamptz not null default now() + interval '7 days',
  client_ref  uuid not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  revoked_at  timestamptz,
  constraint pro_invites_client_ref unique (stylist_id, client_ref)
);
create index if not exists pro_invites_stylist_status on public.pro_invites (stylist_id, status);

create table if not exists public.pro_connections (
  id                       uuid primary key default gen_random_uuid(),
  stylist_id               uuid references auth.users(id) on delete set null,
  client_id                uuid references auth.users(id) on delete set null,
  stylist_label            text check (stylist_label is null or char_length(stylist_label) <= 40),
  client_alias             text check (client_alias is null or char_length(client_alias) <= 30),
  status                   text not null default 'active' check (status in ('active', 'ended')),
  ended_by                 text check (ended_by is null or ended_by in ('client', 'stylist', 'system')),
  started_at               timestamptz not null default now(),
  ended_at                 timestamptz,
  invite_id                uuid references public.pro_invites(id) on delete set null,
  shell_at                 timestamptz,       -- set when a block turns the connection into a closed shell; never cleared
  stylist_seen_message_id  bigint not null default 0,   -- read pointers; there are no read receipts
  client_seen_message_id   bigint not null default 0,
  last_activity_at         timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint pro_connections_ended_pair check ((status = 'ended') = (ended_at is not null)),
  constraint pro_connections_shell_ended check (shell_at is null or status = 'ended'),
  constraint pro_connections_not_self check (stylist_id is distinct from client_id or stylist_id is null)
);
create unique index if not exists pro_connections_one_active
  on public.pro_connections (stylist_id, client_id) where status = 'active';
create index if not exists pro_connections_client on public.pro_connections (client_id, status);
create index if not exists pro_connections_stylist on public.pro_connections (stylist_id, status);
create index if not exists pro_connections_ended on public.pro_connections (ended_at) where status = 'ended';
create index if not exists pro_connections_invite on public.pro_connections (invite_id) where invite_id is not null;

-- ─── 4. Sharing: what a client currently lets a stylist see ─────────────────

-- A row exists only while the grant is on; turning it off deletes the row (and writes an event).
create table if not exists public.pro_grants (
  connection_id  uuid not null references public.pro_connections(id) on delete cascade,
  scope          text not null check (scope in ('closet')),
  item_mode      text not null check (item_mode in ('all', 'selected')),
  granted_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  text_version   text not null,       -- the consent text the client saw
  primary key (connection_id, scope)
);

-- The chosen pieces when item_mode = 'selected'. A deleted piece leaves the grant. At most 500 per connection
-- (enforced by the function).
create table if not exists public.pro_grant_items (
  connection_id  uuid not null references public.pro_connections(id) on delete cascade,
  item_id        uuid not null references public.clothing_items(id) on delete cascade,
  primary key (connection_id, item_id)
);
create index if not exists pro_grant_items_item on public.pro_grant_items (item_id);

-- Append-only log the client can read. Never updated.
create table if not exists public.pro_grant_events (
  id             bigint generated always as identity primary key,
  connection_id  uuid not null references public.pro_connections(id) on delete cascade,
  scope          text not null,
  event          text not null check (event in ('granted', 'changed', 'renewed', 'revoked', 'expired', 'connection_ended')),
  item_mode      text check (item_mode is null or item_mode in ('all', 'selected')),
  item_count     integer,
  text_version   text,
  created_at     timestamptz not null default now()
);
create index if not exists pro_grant_events_connection on public.pro_grant_events (connection_id, id desc);

-- Counts only, shown to the client. Deleted 90 days after the day.
create table if not exists public.pro_closet_views (
  connection_id  uuid not null references public.pro_connections(id) on delete cascade,
  day            date not null,
  pages          integer not null default 0,
  last_at        timestamptz not null default now(),
  primary key (connection_id, day)
);

-- ─── 5. Work: looks, sessions, messages ─────────────────────────────────────

-- A look. There is no author column: the author is always the connection's stylist side.
create table if not exists public.pro_recommendations (
  id               uuid primary key default gen_random_uuid(),
  connection_id    uuid not null references public.pro_connections(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 80 and title = btrim(title)),
  body             text not null default '' check (char_length(body) <= 1000),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'implemented')),
  sent_at          timestamptz,
  viewed_at        timestamptz,
  implemented_at   timestamptz,
  client_rating    smallint check (client_rating is null or client_rating between 1 and 5),
  client_comment   text check (client_comment is null or char_length(client_comment) <= 500),
  feedback_at      timestamptz,
  client_ref       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pro_recommendations_sent_pair check ((status = 'draft') = (sent_at is null))
);
create unique index if not exists pro_recommendations_client_ref
  on public.pro_recommendations (connection_id, client_ref) where client_ref is not null;
create index if not exists pro_recommendations_connection
  on public.pro_recommendations (connection_id, status, updated_at desc);

-- Nothing else about a piece is copied: only its name and category at the time of writing.
create table if not exists public.pro_recommendation_items (
  recommendation_id  uuid not null references public.pro_recommendations(id) on delete cascade,
  position           smallint not null check (position between 1 and 12),
  item_id            uuid references public.clothing_items(id) on delete set null,
  name               text not null check (char_length(name) <= 120),
  category           text check (category is null or char_length(category) <= 40),
  primary key (recommendation_id, position)
);
create index if not exists pro_recommendation_items_item
  on public.pro_recommendation_items (item_id) where item_id is not null;

-- Sessions. No fee, price, paid flag or link field exists. The end of a session is computed, not stored.
create table if not exists public.pro_appointments (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.pro_connections(id) on delete cascade,
  proposed_by       text not null check (proposed_by in ('stylist', 'client')),
  status            text not null default 'proposed'
                      check (status in ('proposed', 'confirmed', 'declined', 'cancelled', 'expired', 'completed')),
  starts_at         timestamptz not null,
  duration_minutes  smallint not null check (duration_minutes between 15 and 480 and duration_minutes % 15 = 0),
  mode              text not null check (mode in ('virtual', 'in_person')),
  place             text not null default '' check (char_length(place) <= 120),
  note              text not null default '' check (char_length(note) <= 280),
  -- The proposer's offset from UTC at the start, in minutes (+60 for UTC+1): a display hint so the other person can
  -- read the time on the proposer's clock. Deliberately not a zone name: "Europe/London" is a city, an offset is not.
  utc_offset_minutes smallint not null default 0 check (utc_offset_minutes between -720 and 840 and utc_offset_minutes % 15 = 0),
  client_ref        uuid,
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists pro_appointments_client_ref
  on public.pro_appointments (connection_id, proposed_by, client_ref) where client_ref is not null;
create index if not exists pro_appointments_connection on public.pro_appointments (connection_id, starts_at);
create index if not exists pro_appointments_open on public.pro_appointments (starts_at)
  where status in ('proposed', 'confirmed');

-- sender_id cascades, so a deleted person's messages go. System lines (kind = 'system') have no sender and never
-- count as unread or toward the badge.
create table if not exists public.pro_messages (
  id             bigint generated always as identity primary key,
  connection_id  uuid not null references public.pro_connections(id) on delete cascade,
  sender_id      uuid references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('text', 'system')),
  body           text not null default '' check (char_length(body) <= 500),
  code           text,       -- system line: connected, ended, sharing_on
  client_ref     uuid,
  created_at     timestamptz not null default now(),
  constraint pro_messages_text_shape
    check (kind <> 'text' or (sender_id is not null and char_length(btrim(body)) between 1 and 500)),
  constraint pro_messages_system_shape check (kind <> 'system' or code is not null)
);
create unique index if not exists pro_messages_client_ref
  on public.pro_messages (sender_id, client_ref) where client_ref is not null;
create index if not exists pro_messages_connection on public.pro_messages (connection_id, id);
create index if not exists pro_messages_sender on public.pro_messages (sender_id) where sender_id is not null;

create table if not exists public.pro_rate_counters (
  user_id       uuid not null references auth.users(id) on delete cascade,
  bucket        text not null,
  window_start  timestamptz not null,
  n             integer not null default 0,
  primary key (user_id, bucket, window_start)
);

do $$
declare
  t text;
begin
  foreach t in array array['pro_config', 'pro_meta', 'pro_members', 'pro_stylists', 'pro_invites', 'pro_connections',
                           'pro_grants', 'pro_grant_items', 'pro_grant_events', 'pro_closet_views', 'pro_recommendations',
                           'pro_recommendation_items', 'pro_appointments', 'pro_messages', 'pro_rate_counters']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end
$$;
revoke all on sequence public.pro_messages_id_seq from public, anon, authenticated;
revoke all on sequence public.pro_grant_events_id_seq from public, anon, authenticated;

-- ─── 6. user_blocks: blocks made from Stylists are private to the Stylists screens ─

-- A block of someone the blocker only knows by a label must not hand the blocker that person's account id through
-- the existing "Blocked people" list. Such rows are marked via_pro and hidden from direct table reads; the pro screens
-- list them through list_pro_blocks() under an opaque ref (the ref column and its unique index exist from swaps).
alter table public.user_blocks add column if not exists via_pro boolean not null default false;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated
  using (auth.uid() = blocker_id and not via_swap and not via_pro);

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks" on public.user_blocks
  for delete to authenticated
  using (auth.uid() = blocker_id and not via_swap and not via_pro);

-- ─── 7. Internal helpers (not callable by app users) ────────────────────────

create or replace function public.pro_raise(p_msg text, p_state text, p_detail text default null, p_hint text default null)
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

create or replace function public.pro_cfg(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.pro_config where key = p_key;
$$;

-- Every number that limits behaviour, in one place. Mirrored in src/config/proRules.ts and compared by a Jest test
-- that reads the "when '<name>' then <number>" lines below, so keep that shape. Names ending _min, _hour or _day are
-- rolling counters (see pro_rate_check); the rest are plain caps. closet_pages_connection_day is a per-connection cap
-- that get_client_closet enforces against pro_closet_views (pro_rate_check counts per person and bucket only).
create or replace function public.pro_limit(p_name text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_name
    -- rolling counters (the suffix gives the window)
    when 'terms_day'                         then 20
    when 'profile_day'                       then 6
    when 'invite_day'                        then 5
    when 'invite_lookup_hour'                then 10
    when 'redeem_day'                        then 10
    when 'alias_day'                         then 10
    when 'end_day'                           then 30
    when 'block_day'                         then 30
    when 'grant_day'                         then 60
    when 'closet_page_day'                   then 600
    when 'recommend_day'                     then 60
    when 'send_look_day'                     then 30
    when 'feedback_day'                      then 60
    when 'appointment_day'                   then 20
    when 'respond_day'                       then 60
    when 'message_min'                       then 6
    when 'message_hour'                      then 60
    when 'message_day'                       then 300
    when 'photo_day'                         then 3000
    when 'reports_day'                       then 20
    -- plain caps and periods
    when 'stylist_clients'                   then 25
    when 'stylist_clients_probation'         then 3
    when 'invites_live'                      then 10
    when 'invites_live_probation'            then 1
    when 'invite_expiry_days'                then 7
    when 'client_connections'                then 5
    when 'items_per_look'                    then 12
    when 'grant_items_max'                   then 500
    when 'drafts_per_connection'             then 30
    when 'appointments_open_per_connection'  then 5
    when 'appointment_lead_minutes'          then 60
    when 'appointment_max_days_ahead'        then 180
    when 'grant_days'                        then 90
    when 'grant_warn_days'                   then 7
    when 'closet_page_size'                  then 60
    when 'closet_pages_connection_day'       then 200
    when 'message_retention_days'            then 180
    when 'ended_message_retention_days'      then 30
    when 'ended_connection_retention_days'   then 90
    when 'churn_connections'                 then 10
    when 'churn_hours'                       then 48
    when 'reports_to_hold_stylist'           then 2
    when 'report_window_days'                then 14
    when 'hold_release_days'                 then 7
    when 'qualified_reporter_hours'          then 48
    when 'qualified_connection_hours'        then 24
    when 'qualified_connection_messages'     then 3
    when 'evidence_bytes'                    then 18000
    when 'evidence_body_chars'               then 300
    else 0
  end;
$$;

-- Counts one action for p_uid in a fixed window and raises pro_rate_limited (54000, DETAIL = bucket) once the cap is
-- passed. The raise rolls the increment back, so only successful actions are counted; the two invite lookups return
-- their failures instead of raising, so their counter commits (4.1).
create or replace function public.pro_rate_check(p_uid uuid, p_bucket text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secs  integer := case when right(p_bucket, 4) = '_day' then 86400
                        when right(p_bucket, 5) = '_hour' then 3600
                        when right(p_bucket, 4) = '_min' then 60 end;
  cap   integer := public.pro_limit(p_bucket);
  win   timestamptz;
  cnt   integer;
begin
  if secs is null or cap <= 0 then
    raise exception 'invalid_rate_bucket' using errcode = '22023';
  end if;
  win := to_timestamp(floor(extract(epoch from now()) / secs) * secs);
  insert into public.pro_rate_counters (user_id, bucket, window_start, n)
  values (p_uid, p_bucket, win, 1)
  on conflict (user_id, bucket, window_start)
  do update set n = public.pro_rate_counters.n + 1
  returning n into cnt;
  if cnt > cap then
    perform public.pro_raise('pro_rate_limited', '54000', p_bucket);
  end if;
end;
$$;

-- Text rules. Returns null when fine, or a hint: 'payment' (scam and advance-fee phrases, and in public mode
-- payment words), 'contact' (public mode: links, emails, handles, phone numbers, messaging apps), 'content'
-- (objectionable terms from swap_blocked_terms; text that hides characters or reverses its own direction; in public
-- mode, a claim of approval by SmartCloset). The text is folded first (swap_fold_text), so zero-width characters,
-- wide letters and accents do not hide a phrase, and the typographic apostrophes of an iPhone keyboard become the
-- ASCII one. Folding also removes a bidirectional override, so text written backwards would pass every filter and
-- still read forwards on the phone: when nothing else matched, text that carries such invisible or direction-changing
-- characters is refused as 'content'. The zero-width joiner and non-joiner and the variation selectors stay allowed,
-- because emoji sequences and several scripts need them. Speed bumps, not a substitute for reports.
--   p_mode 'chat'   connected adults: scam phrases and blocked terms; ordinary payment talk and contact details are allowed
--   p_mode 'public' what a stranger can read (profile, alias, place): all of chat, plus payment words, links, emails,
--                   handles, phone numbers and messaging-app names; "signal" counts only as "on signal", "signal me"
--                   or "signal app", so a "Signal-inspired palette" passes
create or replace function public.pro_text_ok(p_text text, p_mode text default 'chat')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t      text := public.swap_fold_text(p_text);
  hidden boolean := coalesce(p_text ~ '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0]', false);
begin
  t := replace(replace(t, chr(8217), ''''), chr(8216), '''');        -- smart apostrophes from an iPhone keyboard
  if t = '' then
    return case when hidden then 'content' end;
  end if;
  if t ~ '(gift ?card|giftcard|western union|moneygram|wire transfer|bitcoin|\mcrypto\M|cashier''?s cheque|cashier''?s check|itunes card|overpayment|refund the difference)' then
    return 'payment';
  end if;
  if p_mode = 'public' then
    if t ~ '(\mvenmo\M|paypal|\mzelle\M|cash ?app|apple pay|send (me )?(the )?money|\mdeposit\M|bank transfer)' then
      return 'payment';
    end if;
    if t ~ '(https?://|www\.|\.com\M|\.net\M|\.org\M|\.io\M|\.me/)'
       or t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
       or t ~ '(^|\s)@[a-z0-9_.]{3,}'
       or t ~ '(\+?[0-9]{1,3}[ .-]?)?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}'
       or t ~ '\+[0-9][0-9 .-]{8,}[0-9]'
       or t ~ '(\mwhatsapp\M|\mtelegram\M|\msnapchat\M|\minstagram\M|\mon signal\M|\msignal (me|app)\M|\mwechat\M|\mdiscord\M|text me|call me|\mdm me\M)' then
      return 'contact';
    end if;
    -- Claims of approval by SmartCloset (the app vouches for nobody). A stylist's own outside credential, such as
    -- "certified image consultant", does not name the app and passes.
    if t ~ 'smart[ ._-]*closet.{0,40}\m(official|verified|approved|endorsed|certified|partner|authorized|authorised|affiliated|staff|employee)\M'
       or t ~ '\m(official|verified|approved|endorsed|certified|partner|authorized|authorised|affiliated|staff|employee)\M.{0,40}smart[ ._-]*closet' then
      return 'content';
    end if;
  end if;
  if exists (
    select 1 from public.swap_blocked_terms b
     where b.kind = 'content'
       and t ~ ('\m' || b.term || '\M')
  ) then
    return 'content';
  end if;
  if hidden then
    return 'content';
  end if;
  return null;
end;
$$;

create or replace function public.pro_require_text(p_text text, p_field text, p_mode text default 'chat')
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hint text := public.pro_text_ok(p_text, p_mode);
begin
  if hint is not null then
    perform public.pro_raise('text_not_allowed', '22023', p_field, hint);
  end if;
end;
$$;

-- Who may use which part of the feature. p_need is 'safety' (signed in and not anonymous; nothing else, so every way
-- out works under the switch, a suspension and stale terms), 'member', 'client', 'stylist_setup' or 'stylist'. An
-- anonymous token is not a signed-in person.
create or replace function public.pro_gate(p_uid uuid, p_need text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.pro_members;
begin
  if p_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    perform public.pro_raise('not_authenticated', '28000');
  end if;
  if p_need = 'safety' then
    return;
  end if;
  if not coalesce((public.pro_cfg('pro_enabled'))::boolean, false) then
    perform public.pro_raise('pro_disabled', '42501');
  end if;
  select * into m from public.pro_members where user_id = p_uid;
  if found and m.suspended_at is not null then
    perform public.pro_raise('pro_suspended', '42501');
  end if;
  if p_need = 'member' then
    return;
  end if;
  if not found or m.adult_confirmed_at is null then
    perform public.pro_raise('adult_required', '22023');
  end if;
  if p_need = 'client'
     and m.client_terms_version is distinct from (public.pro_cfg('client_terms_version') #>> '{}') then
    perform public.pro_raise('pro_terms_required', '42501', 'client');
  end if;
  if p_need in ('stylist_setup', 'stylist')
     and m.stylist_terms_version is distinct from (public.pro_cfg('stylist_terms_version') #>> '{}') then
    perform public.pro_raise('pro_terms_required', '42501', 'stylist');
  end if;
  if p_need = 'stylist' and not exists (select 1 from public.pro_stylists s where s.user_id = p_uid) then
    perform public.pro_raise('stylist_profile_required', '42501');
  end if;
end;
$$;

-- Ten Crockford base32 symbols from the random bytes of a v4 uuid, skipping byte 6 (version) and byte 8 (variant),
-- which are not fully random. byte % 32 is uniform because 256 is divisible by 32. 50 bits.
create or replace function public.pro_new_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b   bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  pos int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  i   int;
  res text := '';
begin
  foreach i in array pos loop
    res := res || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return res;
end;
$$;

-- Spaces and hyphens removed, upper-cased, and the look-alikes mapped the way Crockford's alphabet does (O to 0, I and L to 1).
create or replace function public.pro_norm_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')), 'OIL', '011');
$$;

-- A name as a person typed it: trimmed, inner whitespace collapsed to single spaces, length enforced. A control or
-- invisible character (the ones swap_fold_text removes) refuses the whole name. Returns null when it is not acceptable,
-- the cleaned text otherwise; with p_min = 0 an empty name returns ''. The caller picks the error to raise.
create or replace function public.pro_clean_name(p_name text, p_min integer, p_max integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  t text := coalesce(p_name, '');
begin
  if t ~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]'
     or t ~ '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]' then
    return null;
  end if;
  t := btrim(regexp_replace(t, '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g'));
  if char_length(t) < p_min or char_length(t) > p_max then
    return null;
  end if;
  return t;
end;
$$;

-- False when the folded name contains a whole word that suggests an official account, or has no letter in it.
create or replace function public.pro_name_ok(p_name text)
returns boolean
language sql
stable
set search_path = public
as $$
  select f.t ~ '[[:alpha:]]'
     and f.t !~ '\m(smart[ ._-]*closet|support|admin|administrator|official|verified|certified|moderator|staff)\M'
    from (select public.swap_fold_text(p_name) as t) f;
$$;

-- Distinct elements in their first-seen order, all inside p_allowed (any element when p_allowed is null: the caller
-- checks the shape), at most p_max of them; null when any rule fails or an element is null. A null list is empty.
create or replace function public.pro_clean_list(p_items text[], p_allowed text[], p_max integer)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  res text[];
begin
  if p_items is null then
    return '{}'::text[];
  end if;
  if exists (select 1 from unnest(p_items) as e where e is null) then
    return null;
  end if;
  res := array(select x.e from (select e, min(ord) as o from unnest(p_items) with ordinality as t(e, ord) group by e) x order by x.o);
  if cardinality(res) > p_max then
    return null;
  end if;
  if p_allowed is not null and not (res <@ p_allowed) then
    return null;
  end if;
  return res;
end;
$$;

-- Pro's own copies of swap's cleaners of the same names (same bodies), so that pro depends on no swap function but
-- swap_fold_text: a bounded materials list (12 entries, a name of 40 characters, a percentage of 0-100, a closed tier
-- list) and a bounded season list (6 words of 12 characters). Used by get_client_closet and by the look copy.
create or replace function public.pro_clean_materials(p jsonb)
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

create or replace function public.pro_clean_season(p jsonb)
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

-- The storage path inside wardrobe-images for an item photo URL owned by p_uid, else null.
create or replace function public.pro_photo_path(p_url text, p_uid uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select substring(p_url from
    '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/wardrobe-images/(' || p_uid::text || '/[A-Za-z0-9._-]+)(?:[?#].*)?$');
$$;

-- Serialises work that decides on one person's state. Always takes the two locks in the same (sorted) order so
-- concurrent calls cannot deadlock; pass the same id twice for one person. Every stylist-side function takes the
-- stylist's lock, and redeem_pro_invite takes (stylist, client), so a redeem can neither overtake nor interleave
-- with them.
create or replace function public.pro_lock_users(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_a is null or p_b is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pro:' || least(p_a, p_b)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('pro:' || greatest(p_a, p_b)::text, 0));
end;
$$;

-- True when a stylist's invites are held: a hold from reports or churn ('system') releases itself after
-- hold_release_days, a hold a person made or confirmed ('admin') does not. The one place a hold is decided.
create or replace function public.pro_invites_held(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.invites_held_at is not null
            and (m.invites_held_by = 'admin'
                 or m.invites_held_at > now() - make_interval(days => public.pro_limit('hold_release_days')))
       from public.pro_members m
      where m.user_id = p_uid),
    false);
$$;

-- Did this reporter really work with the reported person? The reporter's account is at least
-- qualified_reporter_hours old and some connection between the two (either direction, any status) lasted at least
-- qualified_connection_hours (an active one counts from started_at) or carries at least qualified_connection_messages
-- text messages sent BY THE REPORTED PERSON (the reporter's own messages prove nothing: a throwaway account can write
-- three to someone and would skip the dwell time). Decided at report time and stored in the report's evidence,
-- because a later block deletes the messages that proved it.
create or replace function public.pro_report_is_qualified(p_reporter uuid, p_reported uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users u
                  where u.id = p_reporter
                    and u.created_at <= now() - make_interval(hours => public.pro_limit('qualified_reporter_hours')))
     and exists (select 1 from public.pro_connections c
                  where ((c.stylist_id = p_reporter and c.client_id = p_reported)
                      or (c.stylist_id = p_reported and c.client_id = p_reporter))
                    and (coalesce(c.ended_at, now()) - c.started_at
                           >= make_interval(hours => public.pro_limit('qualified_connection_hours'))
                         or (select count(*) from public.pro_messages m
                              where m.connection_id = c.id and m.kind = 'text' and m.sender_id = p_reported)
                              >= public.pro_limit('qualified_connection_messages')));
$$;

-- The one place the closet-access rule is decided: pro_enabled, neither member suspended, the connection active with
-- exactly these two ids, not blocked, and an unexpired closet grant. get_client_closet, get_pro_recommendation,
-- list_pro_recommendations and pro_photo_source all call it.
create or replace function public.pro_can_read_closet(p_stylist uuid, p_client uuid, p_connection uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.pro_cfg('pro_enabled'))::boolean, false)
     and not exists (select 1 from public.pro_members m
                      where m.user_id in (p_stylist, p_client) and m.suspended_at is not null)
     and not public.is_blocked_between(p_stylist, p_client)
     and exists (select 1
                   from public.pro_connections c
                   join public.pro_grants g on g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now()
                  where c.id = p_connection and c.status = 'active'
                    and c.stylist_id = p_stylist and c.client_id = p_client);
$$;

-- ─── 8. Ending a connection (the one place ending logic lives) ──────────────

-- Ends an active connection: removes its grant, cancels open sessions, writes one neutral system line. p_by is the
-- role of whoever ended it ('client', 'stylist') or 'system' (a suspension, a deleted account). Returns false when
-- it was already ended.
create or replace function public.pro_end_connection(p_id uuid, p_by text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.pro_connections;
begin
  update public.pro_connections
     set status = 'ended', ended_at = now(), ended_by = p_by, updated_at = now()
   where id = p_id and status = 'active'
  returning * into c;
  if not found then
    return false;
  end if;

  insert into public.pro_grant_events (connection_id, scope, event)
    select g.connection_id, g.scope, 'connection_ended' from public.pro_grants g where g.connection_id = p_id;
  delete from public.pro_grant_items where connection_id = p_id;
  delete from public.pro_grants      where connection_id = p_id;
  update public.pro_appointments set status = 'cancelled', updated_at = now()
   where connection_id = p_id and status in ('proposed', 'confirmed') and starts_at > now();
  insert into public.pro_messages (connection_id, kind, code) values (p_id, 'system', 'ended');

  -- Many short connections that the CLIENT ended in a month: hold new invites until a person looks. Connections the
  -- stylist ended do not count (removing junk redemptions of a leaked code is the remedy). The hold lives on
  -- pro_members, which close_stylist_profile does not delete.
  if c.stylist_id is not null and (
       select count(*) from public.pro_connections x
        where x.stylist_id = c.stylist_id and x.status = 'ended'
          and x.ended_by = 'client' and x.client_id is not null
          and x.ended_at > now() - interval '30 days'
          and x.ended_at - x.started_at < make_interval(hours => public.pro_limit('churn_hours'))
     ) >= public.pro_limit('churn_connections') then
    update public.pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now()
     where user_id = c.stylist_id and (invites_held_at is null or invites_held_by = 'system');
  end if;
  return true;
end;
$$;

-- The closed shell: stored, with its content deleted. Called for every connection between a blocker and the
-- blocked, so nothing is recomputed from user_blocks later (unblocking changes nothing and never reveals the block).
create or replace function public.pro_shell_connection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pro_connections set shell_at = now(), updated_at = now() where id = p_id and shell_at is null;
  if not found then
    return;                                                          -- already a shell: nothing more to delete
  end if;
  delete from public.pro_messages        where connection_id = p_id;
  delete from public.pro_recommendations where connection_id = p_id; -- items cascade
  delete from public.pro_appointments    where connection_id = p_id;
  delete from public.pro_closet_views    where connection_id = p_id;
  delete from public.pro_grant_events    where connection_id = p_id;
end;
$$;

-- A block between two accounts: ends every active connection between them, in either direction, with the blocker's
-- role, then turns every connection between them, in any status, into a closed shell. Used by pro_on_block and by
-- block_pro_member.
create or replace function public.pro_end_between(p_blocker uuid, p_blocked uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select c.id, case when c.stylist_id = p_blocker then 'stylist' else 'client' end as role
      from public.pro_connections c
     where c.status = 'active'
       and ((c.stylist_id = p_blocker and c.client_id = p_blocked) or (c.stylist_id = p_blocked and c.client_id = p_blocker))
     order by c.id
  loop
    perform public.pro_end_connection(r.id, r.role);
  end loop;
  for r in
    select c.id
      from public.pro_connections c
     where (c.stylist_id = p_blocker and c.client_id = p_blocked) or (c.stylist_id = p_blocked and c.client_id = p_blocker)
     order by c.id
  loop
    perform public.pro_shell_connection(r.id);
  end loop;
end;
$$;

-- ─── 9. Triggers: block, member left ────────────────────────────────────────

-- Takes the pair lock that redeem_pro_invite and block_pro_member take, so a block made in Friends or Swaps cannot
-- commit between a redeem's block check and its insert and leave an active connection between a blocked pair:
-- whichever comes second sees the other. No deadlock: a redeem never holds a user_blocks row lock while it waits.
-- If this ever fails, pro_refresh ends the connection at the next read of either person.
create or replace function public.pro_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.pro_lock_users(new.blocker_id, new.blocked_id);
    perform public.pro_end_between(new.blocker_id, new.blocked_id);
  exception when others then
    raise warning 'pro_on_block: %', sqlerrm;      -- a block must never fail because of this feature
  end;
  return new;
end;
$$;
drop trigger if exists pro_on_block on public.user_blocks;
create trigger pro_on_block after insert on public.user_blocks
  for each row execute function public.pro_on_block();

-- A participant's account was deleted (the FK nulled their column). Ends the connection if active, nulls the leaver's
-- label, deletes the grant, and, when the client left, the looks, sessions, grant events and view counters (they hold
-- personal details); when the stylist left, only their unsent draft looks (the client keeps the looks already sent);
-- a connection with nobody left disappears. The WHEN clause means the updates below, which touch
-- other columns only, cannot fire it again. It never raises, so an account deletion cannot fail because of it; if it
-- swallows an error, pro_refresh repairs the connection at the next read of the other person.
create or replace function public.pro_on_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.status = 'active' then
      perform public.pro_end_connection(new.id, 'system');
    end if;
    if old.client_id is not null and new.client_id is null then
      update public.pro_connections set client_alias = null, updated_at = now() where id = new.id;
      delete from public.pro_recommendations where connection_id = new.id;
      delete from public.pro_appointments    where connection_id = new.id;
      delete from public.pro_grant_events    where connection_id = new.id;
      delete from public.pro_closet_views    where connection_id = new.id;
    end if;
    if old.stylist_id is not null and new.stylist_id is null then
      update public.pro_connections set stylist_label = null, updated_at = now() where id = new.id;
      delete from public.pro_recommendations where connection_id = new.id and status = 'draft';   -- items cascade; the client keeps only what was sent
    end if;
    delete from public.pro_grant_items where connection_id = new.id;
    delete from public.pro_grants      where connection_id = new.id;
    delete from public.pro_connections where id = new.id and stylist_id is null and client_id is null;
  exception when others then
    raise warning 'pro_on_member_left: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists pro_on_member_left on public.pro_connections;
create trigger pro_on_member_left after update of stylist_id, client_id on public.pro_connections
  for each row
  when ((old.client_id is not null and new.client_id is null) or (old.stylist_id is not null and new.stylist_id is null))
  execute function public.pro_on_member_left();

-- ─── 10. Function privileges ────────────────────────────────────────────────
-- Internal helpers and triggers: nobody but the owner. (The functions of the later files that app users call are
-- granted in those files.)

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pro_raise(text, text, text, text)',
    'public.pro_cfg(text)',
    'public.pro_limit(text)',
    'public.pro_rate_check(uuid, text)',
    'public.pro_text_ok(text, text)',
    'public.pro_require_text(text, text, text)',
    'public.pro_gate(uuid, text)',
    'public.pro_new_code()',
    'public.pro_norm_code(text)',
    'public.pro_clean_name(text, integer, integer)',
    'public.pro_name_ok(text)',
    'public.pro_clean_list(text[], text[], integer)',
    'public.pro_clean_materials(jsonb)',
    'public.pro_clean_season(jsonb)',
    'public.pro_photo_path(text, uuid)',
    'public.pro_lock_users(uuid, uuid)',
    'public.pro_invites_held(uuid)',
    'public.pro_report_is_qualified(uuid, uuid)',
    'public.pro_can_read_closet(uuid, uuid, uuid)',
    'public.pro_end_connection(uuid, text)',
    'public.pro_end_between(uuid, uuid)',
    'public.pro_shell_connection(uuid)',
    'public.pro_on_block()',
    'public.pro_on_member_left()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;
