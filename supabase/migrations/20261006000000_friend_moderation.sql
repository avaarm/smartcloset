-- Friends moderation (App Review guideline 1.2: user-generated content / social).
--
-- 1. user_blocks + block_user(): a user can block another. Blocking deletes any
--    friend request / friendship between the two, and while the block exists
--    neither side can send a request, find the other by email, or open the
--    other's closet. The blocked person is never told: they cannot read the
--    table, and every path that reaches the blocker looks like "no such account".
-- 2. content_reports + report_user(): reports go to a table only the developer
--    can read (dashboard / service role), capped at 20 per user per day.
-- 3. friend_requests names were free text chosen by the sender. A BEFORE INSERT
--    trigger now fills requester_name / recipient_name from the accounts
--    themselves and ignores whatever the client sends.
--
-- Storage and table access for friends needs no extra change for blocks: the
-- "friends can read wardrobe images" storage policy and the older "Friends can
-- view each other's wardrobe" clothing_items policy both require an *accepted*
-- friend_requests row, and block_user() deletes that row (and the insert trigger
-- below stops a new one from being created while the block exists).
--
-- Safe on top of existing data: only new objects, plus CREATE OR REPLACE of two
-- functions whose existing behaviour, columns and grants are kept.

-- ─── 1. Blocking ────────────────────────────────────────────────────────────

create table if not exists public.user_blocks (
  blocker_id   uuid not null references auth.users(id) on delete cascade,
  blocked_id   uuid not null references auth.users(id) on delete cascade,
  -- Snapshot so the "Blocked users" list can show a name without reading auth.users.
  blocked_name text,
  created_at   timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- Clients may read and remove (unblock) only their own rows. There is no INSERT
-- policy on purpose: rows are created by block_user(), which also removes the
-- friend request / friendship. A direct insert would leave the friendship (and
-- the access it grants) in place.
revoke all on public.user_blocks from public, anon, authenticated;
grant select, delete on public.user_blocks to authenticated;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks" on public.user_blocks
  for delete to authenticated
  using (auth.uid() = blocker_id);

-- Internal helpers (not callable by clients).

-- True when either user has blocked the other. Clients must not be able to call
-- this: asking about (me, X) would reveal whether X blocked me.
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- The name other people see for an account: its display name, else the part of
-- the email before the @. Trimmed and capped so a sender can't push a huge or
-- blank name onto someone else's screen. Also not callable by clients.
create or replace function public.friend_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(left(btrim(coalesce(
              nullif(btrim(u.raw_user_meta_data->>'name'), ''),
              split_part(u.email, '@', 1))), 60)), '')
       from auth.users u
      where u.id = p_user_id),
    'Someone');
$$;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = uid then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, blocked_name)
  values (uid, p_user_id, public.friend_display_name(p_user_id))
  on conflict (blocker_id, blocked_id) do nothing;

  -- Ends any pending request or friendship in either direction, which also ends
  -- the closet / photo access it granted.
  delete from public.friend_requests
   where (requester_id = uid and recipient_id = p_user_id)
      or (requester_id = p_user_id and recipient_id = uid);
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- ─── 2. Reporting ───────────────────────────────────────────────────────────

create table if not exists public.content_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  context          text not null check (context in ('friend_request', 'friend_closet', 'profile')),
  reason           text not null check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  details          text check (details is null or char_length(details) <= 500),
  created_at       timestamptz not null default now(),
  constraint no_self_report check (reporter_id <> reported_user_id)
);

create index if not exists idx_content_reports_reporter on public.content_reports(reporter_id, created_at desc);
create index if not exists idx_content_reports_reported on public.content_reports(reported_user_id);

-- Write-only through report_user() (which enforces the daily limit); nothing is
-- readable or writable by app users. The developer reviews rows in the dashboard.
alter table public.content_reports enable row level security;
revoke all on public.content_reports from public, anon, authenticated;

create or replace function public.report_user(
  p_user_id uuid,
  p_context text,
  p_reason  text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = uid then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  if p_context is null or p_context not in ('friend_request', 'friend_closet', 'profile')
     or p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other') then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;

  if (select count(*) from public.content_reports
       where reporter_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = '54000';
  end if;

  insert into public.content_reports (reporter_id, reported_user_id, context, reason, details)
  values (uid, p_user_id, p_context, p_reason, left(clean_details, 500));
end;
$$;

revoke all on function public.report_user(uuid, text, text, text) from public, anon;
grant execute on function public.report_user(uuid, text, text, text) to authenticated;

-- ─── 3. friend_requests: server-owned names + no requests across a block ────

create or replace function public.friend_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_blocked_between(new.requester_id, new.recipient_id) then
    raise exception 'friend_request_not_allowed' using errcode = '42501';
  end if;

  -- Names shown to the other person come from the accounts, never from the client.
  new.requester_name := public.friend_display_name(new.requester_id);
  new.recipient_name := public.friend_display_name(new.recipient_id);
  return new;
end;
$$;

drop trigger if exists friend_requests_before_insert on public.friend_requests;
create trigger friend_requests_before_insert
  before insert on public.friend_requests
  for each row execute function public.friend_requests_before_insert();

-- ─── 4. Lookups and the closet respect blocks ───────────────────────────────

-- Same as before, plus: someone who has blocked you can't be found by you. You can
-- still find someone YOU blocked, so the app can say "you blocked this person"
-- instead of the misleading "no account uses that email"; a request to them is
-- refused by the friend_requests trigger above either way.
create or replace function public.find_user_by_email(target_email text)
returns table(id uuid, name text)
language sql
security definer
set search_path = public, auth
as $$
  select u.id, coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as name
  from auth.users u
  where lower(u.email) = lower(target_email)
    and not exists (
      select 1 from public.user_blocks b
       where b.blocker_id = u.id and b.blocked_id = auth.uid()
    )
  limit 1;
$$;

-- Same as before, plus: no closet across a block, even if a friendship row exists.
create or replace function public.get_friend_closet(p_friend_id uuid)
returns table (
  id uuid, name text, category text, color text, brand text, season jsonb,
  tags jsonb, favorite boolean, retailer text, user_image text, retailer_image text,
  pattern text, material text, materials jsonb, date_added timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ci.id, ci.name, ci.category, ci.color, ci.brand, ci.season,
         ci.tags, ci.favorite, ci.retailer, ci.user_image, ci.retailer_image,
         ci.pattern, ci.material, ci.materials, ci.date_added, ci.created_at
    from public.clothing_items ci
   where ci.user_id = p_friend_id
     and ci.is_wishlist = false
     and not public.is_blocked_between(auth.uid(), p_friend_id)
     and exists (
       select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and ((fr.requester_id = auth.uid() and fr.recipient_id = p_friend_id)
            or (fr.recipient_id = auth.uid() and fr.requester_id = p_friend_id))
     )
   order by ci.date_added desc nulls last
   limit 500;
$$;

-- ─── 5. Function privileges ─────────────────────────────────────────────────
-- Supabase also grants EXECUTE to anon on new functions, so revoke explicitly.

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.friend_display_name(uuid) from public, anon, authenticated;
revoke all on function public.friend_requests_before_insert() from public, anon, authenticated;

revoke execute on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;
revoke all on function public.get_friend_closet(uuid) from public, anon;
grant execute on function public.get_friend_closet(uuid) to authenticated;
