-- Clothing swaps, part 4 of 5: reports, blocks and moderation tools.
--
-- 1. content_reports accepts swap contexts and reasons. report_user() keeps its narrower
--    lists on purpose, so old app builds are unaffected and no copy of its body can drift.
-- 2. report_swap_content(): a report that carries evidence (the listing snapshot, or the
--    last 30 messages of a swap) and is resolved on the server, so the app never needs the
--    other member's account id. Shares the 20-a-day limit with report_user().
-- 3. block_swap_member(): blocks the owner of a listing or the other member of a swap.
-- 4. list_swap_blocks() / unblock_swap_member(): blocks made on a stranger known only by an
--    alias, listed under an opaque ref instead of their account id.
-- 5. Service-role-only moderation functions and a queue view. Nothing here is callable by
--    app users. A hold is sticky (it records who made it, and only a person or the end of a
--    suspension lifts it), a listing can be removed for good, and a digest function tells the person
--    who reviews reports when some are waiting.
--
-- Safe to run twice. Depends on the foundation migration.

-- ─── 1. Report contexts and reasons ─────────────────────────────────────────

alter table public.content_reports drop constraint if exists content_reports_context_check;
alter table public.content_reports add constraint content_reports_context_check
  check (context in ('friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat'));

alter table public.content_reports drop constraint if exists content_reports_reason_check;
alter table public.content_reports add constraint content_reports_reason_check
  check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation',
                    'scam', 'not_as_described', 'unsafe', 'other'));

-- ─── 2. Reporting from a swap surface ───────────────────────────────────────

-- Who a listing or swap belongs to, from the point of view of a member who may see it.
-- Raises swap_unavailable when they may not (so ids cannot be probed).
create or replace function public.swap_resolve_ref(p_uid uuid, p_ref_type text, p_ref_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  if p_ref_type = 'listing' then
    select l.owner_id into other from public.swap_listings l
     where l.id = p_ref_id and l.owner_id <> p_uid
       and not public.is_blocked_between(p_uid, l.owner_id)
       and (public.swap_can_see_listing(l.id, p_uid)
            or exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
                        where si.listing_id = l.id and p_uid in (s.proposer_id, s.recipient_id)));
  elsif p_ref_type = 'swap' then
    select case when s.proposer_id = p_uid then s.recipient_id else s.proposer_id end into other
      from public.swaps s where s.id = p_ref_id and p_uid in (s.proposer_id, s.recipient_id);
  else
    perform public.swap_raise('invalid_report', '22023');
  end if;
  if other is null then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  return other;
end;
$$;

create or replace function public.report_swap_content(
  p_ref_type text,
  p_ref_id uuid,
  p_reason text,
  p_details text default null,
  p_message_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
  clean text := nullif(btrim(coalesce(p_details, '')), '');
  ctx text;
  ev jsonb;
  hold_at integer := public.swap_limit('reports_to_hold_listing');
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation',
                                          'scam', 'not_as_described', 'unsafe', 'other')
     or p_ref_type is null or p_ref_type not in ('listing', 'swap') or p_ref_id is null then
    perform public.swap_raise('invalid_report', '22023');
  end if;
  other := public.swap_resolve_ref(uid, p_ref_type, p_ref_id);
  -- A flagged message must be one the other member sent in this swap.
  if p_message_id is not null and (p_ref_type <> 'swap' or not exists (
       select 1 from public.swap_messages m
        where m.id = p_message_id and m.swap_id = p_ref_id and m.sender_id = other)) then
    perform public.swap_raise('invalid_report', '22023');
  end if;

  -- Same shared daily limit as report_user().
  if (select count(*) from public.content_reports
       where reporter_id = uid and created_at > now() - interval '1 day') >= public.swap_limit('reports_day') then
    perform public.swap_raise('report_rate_limited', '54000');
  end if;
  -- A repeat report about the same thing within a week is folded into the first.
  if exists (select 1 from public.content_reports
              where reporter_id = uid and ref_type = p_ref_type and ref_id = p_ref_id
                and created_at > now() - interval '7 days') then
    return;
  end if;

  if p_ref_type = 'listing' then
    ctx := 'swap_listing';
    select jsonb_build_object(
             'audience', l.audience, 'status', l.status, 'name', l.name, 'category', l.category,
             'brand', l.brand, 'size', l.size, 'condition', l.condition, 'note', l.note,
             'photoPath', l.photo_path, 'listedAt', l.created_at)
      into ev from public.swap_listings l where l.id = p_ref_id;
  else
    ctx := 'swap_chat';
    select jsonb_build_object(
             'status', s.status, 'closedReason', s.closed_reason, 'pairKind', s.pair_kind,
             'createdAt', s.created_at,
             'items', (select coalesce(jsonb_agg(jsonb_build_object('side', si.side, 'name', si.name, 'size', si.size) order by si.id), '[]'::jsonb)
                         from public.swap_items si where si.swap_id = s.id),
             'flaggedMessageId', p_message_id,
             'messages', (select coalesce(jsonb_agg(x.j order by x.id), '[]'::jsonb) from (
                            select m.id, jsonb_build_object(
                                     'id', m.id,
                                     'from', case when m.kind = 'system' then 'system'
                                                  when m.sender_id = uid then 'reporter' else 'reported' end,
                                     'body', m.body, 'code', m.code, 'at', m.created_at) as j
                              from public.swap_messages m where m.swap_id = s.id
                             order by m.id desc limit 30) x))
      into ev from public.swaps s where s.id = p_ref_id;
  end if;

  insert into public.content_reports (reporter_id, reported_user_id, context, reason, details, ref_type, ref_id, evidence)
  values (uid, other, ctx, p_reason, left(clean, 500), p_ref_type, p_ref_id, ev);

  -- Enough different people reporting one listing hides it (reversible; a person decides what happens next).
  if p_ref_type = 'listing' and (select count(distinct reporter_id) from public.content_reports
                                  where ref_type = 'listing' and ref_id = p_ref_id
                                    and created_at > now() - interval '7 days') >= hold_at then
    update public.swap_listings set status = 'held', held_by = 'reports', held_at = now(), status_changed_at = now()
     where id = p_ref_id and status = 'active';
    if found then
      for r in
        select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
         where si.listing_id = p_ref_id and s.status = 'proposed' order by s.id
      loop
        perform public.swap_close(r.id, 'cancelled', 'unavailable');
      end loop;
    end if;
  end if;
end;
$$;

-- ─── 3. Blocking from a swap surface ────────────────────────────────────────

-- Friends are blocked exactly as block_user() does (their usual name is kept). Someone known
-- only by an alias is blocked under the alias, marked via_swap so their account id never
-- appears in the blocker's own block list.
create or replace function public.block_swap_member(p_ref_type text, p_ref_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
  who text;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if p_ref_type is null or p_ref_type not in ('listing', 'swap') or p_ref_id is null then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  other := public.swap_resolve_ref(uid, p_ref_type, p_ref_id);
  perform public.swap_rate_check(uid, 'block_day');

  if public.are_friends(uid, other) then
    perform public.block_user(other);
  else
    select coalesce(m.alias, 'Swap member') into who from public.swap_members m where m.user_id = other;
    insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_swap)
    values (uid, other, coalesce(who, 'Swap member'), true)
    on conflict (blocker_id, blocked_id) do nothing;
  end if;
end;
$$;

create or replace function public.list_swap_blocks()
returns table (ref uuid, label text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.ref, coalesce(b.blocked_name, 'Swap member'), b.created_at
    from public.user_blocks b
   where b.blocker_id = auth.uid() and b.via_swap
   order by b.created_at desc;
$$;

create or replace function public.unblock_swap_member(p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  delete from public.user_blocks where ref = p_ref and blocker_id = auth.uid() and via_swap;
end;
$$;

-- ─── 3b. Export ─────────────────────────────────────────────────────────────

-- Everything the member created or agreed to in swaps, for Export Data. The other member's
-- words, name and account are not included; only this member's own messages are.
create or replace function public.export_my_swap_data()
returns jsonb
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
  return jsonb_build_object(
    'settings', (select jsonb_build_object(
                   'termsVersion', m.terms_version, 'termsAcceptedAt', m.terms_accepted_at,
                   'adultConfirmedAt', m.adult_confirmed_at, 'photoScanAckAt', m.photo_scan_ack_at,
                   'communityJoinedAt', m.community_joined_at, 'alias', m.alias)
                  from public.swap_members m where m.user_id = uid),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', l.id, 'audience', l.audience, 'status', l.status, 'name', l.name,
                   'category', l.category, 'brand', l.brand, 'size', l.size, 'condition', l.condition,
                   'note', l.note, 'listedAt', l.created_at) order by l.created_at), '[]'::jsonb)
                  from public.swap_listings l where l.owner_id = uid),
    'swaps', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id, 'status', s.status, 'closedReason', s.closed_reason, 'pairKind', s.pair_kind,
                   'role', case when s.proposer_id = uid then 'proposer' else 'recipient' end,
                   'createdAt', s.created_at, 'closedAt', s.closed_at,
                   'items', (select coalesce(jsonb_agg(jsonb_build_object(
                               'side', si.side, 'name', si.name, 'size', si.size, 'condition', si.condition) order by si.id), '[]'::jsonb)
                               from public.swap_items si where si.swap_id = s.id),
                   'myMessages', (select coalesce(jsonb_agg(jsonb_build_object('body', m.body, 'sentAt', m.created_at) order by m.id), '[]'::jsonb)
                                    from public.swap_messages m where m.swap_id = s.id and m.sender_id = uid and m.kind = 'text')
                 ) order by s.created_at), '[]'::jsonb)
                from public.swaps s where uid in (s.proposer_id, s.recipient_id))
  );
end;
$$;

-- ─── 4. Moderation tools (service role only; run from the dashboard SQL editor) ─

create or replace function public.swap_admin_hold_listing(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update public.swap_listings set status = 'held', held_by = 'admin', held_at = now(), status_changed_at = now()
   where id = p_listing and status = 'active';
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = p_listing and s.status = 'proposed' order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
end;
$$;

-- Lifts one hold, whoever made it. A person decides this, listing by listing.
create or replace function public.swap_admin_release_listing(p_listing uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.swap_listings
     set status = case when expires_at <= now() then 'expired' else 'active' end,
         held_by = null, held_at = null, status_changed_at = now()
   where id = p_listing and status = 'held' and item_id is not null;
$$;

-- Takes a listing down for good. Open swaps that include it end (proposed or accepted: a person has
-- decided), its photo is queued for deletion at the next sweep, the reports about it are marked handled,
-- and the piece cannot be listed again while it exists (the removed row is kept for that; swap_janitor
-- deletes it 30 days after the piece is gone).
create or replace function public.swap_admin_remove_listing(p_listing uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.swap_listings;
  r record;
begin
  select * into l from public.swap_listings where id = p_listing for update;
  if not found or l.status = 'removed' then
    return;
  end if;
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = p_listing and s.status in ('proposed', 'accepted') order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
  update public.swap_listings
     set status = 'removed', held_by = null, held_at = null, status_changed_at = now()
   where id = p_listing;
  insert into public.swap_photo_gc (path) values (l.photo_path) on conflict (path) do nothing;
  update public.content_reports
     set reviewed_at = now(), outcome = coalesce(left(nullif(btrim(p_reason), ''), 200), 'removed listing')
   where ref_type = 'listing' and ref_id = p_listing and reviewed_at is null;
end;
$$;

create or replace function public.swap_admin_suspend(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  insert into public.swap_members (user_id, suspended_at, suspended_reason)
  values (p_user, now(), left(p_reason, 200))
  on conflict (user_id) do update
    set suspended_at = now(), suspended_reason = left(p_reason, 200), updated_at = now();
  for r in
    select id from public.swaps where status in ('proposed', 'accepted')
       and p_user in (proposer_id, recipient_id) order by id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
  -- Only listings that are on the rack are held (and marked as held by the suspension). A listing that
  -- is already held for another reason keeps that reason, so lifting the suspension does not release it.
  update public.swap_listings
     set status = 'held', held_by = 'suspension', held_at = now(), status_changed_at = now()
   where owner_id = p_user and status = 'active';
end;
$$;

-- Ends a suspension and releases only the listings it held. Listings held by reports or by a person
-- stay held until a person releases or removes them.
create or replace function public.swap_admin_unsuspend(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.swap_members set suspended_at = null, suspended_reason = null, updated_at = now()
   where user_id = p_user;
  update public.swap_listings
     set status = case when expires_at <= now() then 'expired' else 'active' end,
         held_by = null, held_at = null, status_changed_at = now()
   where owner_id = p_user and status = 'held' and held_by = 'suspension' and item_id is not null;
$$;

create or replace function public.swap_set_enabled(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.swap_config set value = to_jsonb(p_on), updated_at = now() where key = 'swaps_enabled';
$$;

-- The stranger tier may only be switched on once the objectionable-terms list is loaded.
create or replace function public.swap_set_community_enabled(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_on and (select count(*) from public.swap_blocked_terms where kind = 'content') < 50 then
    raise exception 'load at least 50 content terms into swap_blocked_terms first' using errcode = '55000';
  end if;
  update public.swap_config set value = to_jsonb(p_on), updated_at = now() where key = 'community_enabled';
end;
$$;

-- Reports nobody has looked at yet that are older than p_older_than.
create or replace function public.swap_report_backlog(p_older_than interval default interval '4 hours')
returns table (waiting integer, oldest_hours integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         coalesce(floor(extract(epoch from (now() - min(cr.created_at))) / 3600)::integer, 0)
    from public.content_reports cr
   where cr.context in ('swap_listing', 'swap_chat') and cr.reviewed_at is null
     and cr.created_at < now() - p_older_than;
$$;

-- Tells whoever reviews reports that some are waiting. The queue is only a view, so without this nobody
-- would know. It posts numbers only (how many, how old), never a member, text or id, to the address kept
-- in Vault under the name swap_report_webhook (a chat or email-gateway webhook the owner chooses), and is
-- scheduled hourly (docs/MODERATION.md). Returns true when a message was sent. Where pg_net, Vault or the
-- secret is missing it does nothing and returns false: a scheduled job must never raise.
create or replace function public.swap_send_report_digest(p_older_than interval default interval '4 hours')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  url text;
begin
  select * into b from public.swap_report_backlog(p_older_than);
  if coalesce(b.waiting, 0) = 0 then
    return false;
  end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'swap_report_webhook';
    if url is null or url !~ '^https://' then
      return false;
    end if;
    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('text',
        format('SmartCloset swaps: %s report(s) waiting for review, the oldest %s hour(s). Open the swap_moderation_queue view.',
               b.waiting, b.oldest_hours)));
    return true;
  exception when others then
    return false;
  end;
end;
$$;

create or replace view public.swap_moderation_queue as
select cr.id, cr.created_at, cr.context, cr.reason, cr.details, cr.ref_type, cr.ref_id,
       cr.reporter_id, cr.reported_user_id, cr.evidence, cr.reviewed_at, cr.outcome
  from public.content_reports cr
 where cr.context in ('swap_listing', 'swap_chat') and cr.reviewed_at is null
 order by cr.created_at;

-- ─── 5. Function privileges ─────────────────────────────────────────────────

revoke all on function public.swap_resolve_ref(uuid, text, uuid) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.report_swap_content(text, uuid, text, text, bigint)',
    'public.block_swap_member(text, uuid)',
    'public.list_swap_blocks()',
    'public.unblock_swap_member(uuid)',
    'public.export_my_swap_data()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  foreach f in array array[
    'public.swap_admin_hold_listing(uuid)',
    'public.swap_admin_release_listing(uuid)',
    'public.swap_admin_remove_listing(uuid, text)',
    'public.swap_admin_suspend(uuid, text)',
    'public.swap_admin_unsuspend(uuid)',
    'public.swap_report_backlog(interval)',
    'public.swap_send_report_digest(interval)',
    'public.swap_set_enabled(boolean)',
    'public.swap_set_community_enabled(boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

revoke all on public.swap_moderation_queue from public, anon, authenticated;
grant select on public.swap_moderation_queue to service_role;
