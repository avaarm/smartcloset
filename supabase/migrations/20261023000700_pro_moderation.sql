-- Professional accounts, part 8 of 8: moderation.
--
-- 1. content_reports accepts the pro contexts, reasons and reference types. Every value the lists held stays allowed,
--    so report_user() and report_swap_content() keep working (report_user keeps its narrow lists on purpose).
-- 2. report_swap_content() is re-created with the same signature, grants and behaviour. The one change: the evidence
--    of a swap chat is built under a byte budget. The table refuses evidence over 20,000 bytes and 30 long messages in
--    a non-Latin script exceed it, so the report failed for exactly the cases that matter. This is the one existing
--    function this release replaces. A re-run of the earlier swap files after this one would restore the old body (the
--    swap files are applied once, in order, by db push and db reset).
-- 3. pro_chat_evidence(): the same budget for a pro chat report (internal).
-- 4. Client functions (pro-accounts.md 4.6, group 9): report_pro_content, block_pro_member, list_pro_blocks,
--    unblock_pro_member, export_my_pro_data. Every one of them is a way out and uses the safety gate: signed in, nothing
--    else, so the switch, a suspension, stale terms and an old build never stop a person from reporting, blocking or
--    taking their data.
-- 5. Admin functions and views (4.7), service role only, run from the dashboard SQL editor: the switch, approval, holds,
--    suspension, removal, the report backlog and its hourly digest, the moderation queue and the review queue.
--
-- The reported person is always resolved on the server from a connection, look, session or invite reference, so the app
-- never holds the other person's account id and cannot probe ids. No function here returns an account id, an email or a
-- phone number to an app user.
--
-- Every UPDATE and DELETE has a WHERE (the API layer rejects a bare one). Safe to run twice. Depends on files 1 to 7 and
-- on the swap migrations (content_reports.ref_type, ref_id, evidence, reviewed_at and outcome; user_blocks.via_swap and
-- ref; are_friends; swap_blocked_terms).

-- ─── 1. Report contexts, reasons and reference types ────────────────────────

alter table public.content_reports drop constraint if exists content_reports_context_check;
alter table public.content_reports add constraint content_reports_context_check
  check (context in ('friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat',
                     'pro_profile', 'pro_chat', 'pro_content'));

alter table public.content_reports drop constraint if exists content_reports_reason_check;
alter table public.content_reports add constraint content_reports_reason_check
  check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'scam', 'not_as_described', 'unsafe', 'other',
                    'underage', 'false_credentials', 'data_misuse', 'unsafe_meeting'));

alter table public.content_reports drop constraint if exists content_reports_ref_type_check;
alter table public.content_reports add constraint content_reports_ref_type_check
  check (ref_type is null or ref_type in ('listing', 'swap', 'message', 'connection', 'recommendation', 'appointment', 'invite'));

-- ─── 2. report_swap_content: evidence under a byte budget ───────────────────

-- Same arguments, results, errors, limits and folding as before. The messages of a swap chat are the last 30 plus the
-- flagged one, each body cut to 300 characters, and the oldest are dropped (never the flagged one) until the whole
-- evidence is within 18,000 bytes, below the table's 20,000-byte check. The two numbers are literals here because swap
-- must not depend on a pro function. The message objects keep their keys (id, from, body, code, at) and every other
-- key of the listing and swap evidence is unchanged.
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
  msgs jsonb;
  n integer := 30;
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
             'flaggedMessageId', p_message_id)
      into ev from public.swaps s where s.id = p_ref_id;
    loop
      select coalesce(jsonb_agg(x.j order by x.id), '[]'::jsonb) into msgs from (
        select m.id, jsonb_build_object(
                 'id', m.id,
                 'from', case when m.kind = 'system' then 'system'
                              when m.sender_id = uid then 'reporter' else 'reported' end,
                 'body', left(m.body, 300), 'code', m.code, 'at', m.created_at) as j
          from public.swap_messages m
         where m.swap_id = p_ref_id
           and (m.id = p_message_id
                or m.id in (select m2.id from public.swap_messages m2 where m2.swap_id = p_ref_id order by m2.id desc limit n))) x;
      exit when pg_column_size(ev || jsonb_build_object('messages', msgs)) <= 18000 or n <= 1;
      n := greatest(1, n - 3);
    end loop;
    ev := ev || jsonb_build_object('messages', msgs);
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

-- ─── 3. The evidence of a pro chat report ───────────────────────────────────

-- The last 30 messages with each body cut to evidence_body_chars, the flagged message always kept, shrunk (oldest first)
-- until the whole value is within evidence_bytes. Each message is marked reporter, reported or system. A system line
-- carries its code (connected, ended, sharing_on) and an empty body.
create or replace function public.pro_chat_evidence(p_connection uuid, p_reporter uuid, p_flagged bigint, p_qualified boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n  integer := 30;
  ev jsonb;
begin
  loop
    select jsonb_build_object(
             'messages', coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id,
                'who', case when t.kind = 'system' then 'system' when t.sender_id = p_reporter then 'reporter' else 'reported' end,
                'body', left(t.body, public.pro_limit('evidence_body_chars')),
                'code', t.code,
                'at', t.created_at) order by t.id), '[]'::jsonb),
             'flaggedMessageId', p_flagged,
             'qualified', coalesce(p_qualified, false))
      into ev
      from (select m.* from public.pro_messages m
             where m.connection_id = p_connection
               and (m.id = p_flagged
                    or m.id in (select m2.id from public.pro_messages m2 where m2.connection_id = p_connection order by m2.id desc limit n))
             order by m.id) t;
    exit when pg_column_size(ev) <= public.pro_limit('evidence_bytes') or n <= 1;
    n := greatest(1, n - 3);
  end loop;
  return ev;
end;
$$;

-- ─── 4. Client functions (group 9): reports, blocks, data ───────────────────

-- Reports a person through something they did with the caller: a connection (their profile, or one message of theirs),
-- a look, a session, or an invite (a stylist seen in a preview, before connecting; the invite id is the one
-- preview_pro_invite returned). The reported person is resolved here from the reference; if the caller may not see it the
-- answer is pro_unavailable. A closed shell or an ended connection can still be reported (profile evidence only where the
-- messages are gone); a client never sees a draft look, so for them it does not exist.
--
-- Evidence is built under the table's byte budget and carries `qualified`, decided now (pro_report_is_qualified) because a
-- later block deletes the messages that proved it; it is always false for an invite report, which anyone holding the id can
-- file and which therefore never counts toward an automatic hold. Shares the 20-a-day limit with report_user().
--
-- A repeat is folded only when it is the same report (same reporter, reference, message and reason, within 7 days);
-- underage, unsafe_meeting, unsafe and harassment are never folded, so an escalation always reaches the evidence.
--
-- Effects: the report is stored; when the reporter is the client of the connection and the reason is harassment,
-- data_misuse, unsafe_meeting or underage, that client's own grant for the connection is deleted in the same call (the
-- connection stays open until they block or end it, and nothing tells the stylist); and when two different reporters whose
-- reports are qualified have reported the same person within report_window_days, that person's invites are held (a
-- system hold that releases itself after hold_release_days; an admin hold is never replaced).
create or replace function public.report_pro_content(
  p_ref_type   text,
  p_ref_id     uuid,
  p_reason     text,
  p_details    text default null,
  p_message_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  clean     text := left(nullif(regexp_replace(regexp_replace(coalesce(p_details, ''),
                                 '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]', '', 'g'),
                               '^\s+|\s+$', '', 'g'), ''), 500);
  c         public.pro_connections;
  inv       public.pro_invites;
  rec       public.pro_recommendations;
  appt      public.pro_appointments;
  have_c    boolean := false;
  me        text;
  other     uuid;
  rep_role  text;
  ctx       text;
  ev        jsonb;
  prof      jsonb;
  qualified boolean := false;
  folded    boolean := false;
begin
  perform public.pro_gate(uid, 'safety');
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation', 'scam', 'unsafe',
                                          'underage', 'false_credentials', 'data_misuse', 'unsafe_meeting', 'other') then
    perform public.pro_raise('invalid_report', '22023', 'reason');
  end if;
  if p_ref_type is null or p_ref_type not in ('connection', 'recommendation', 'appointment', 'invite') then
    perform public.pro_raise('invalid_report', '22023', 'ref_type');
  end if;
  if p_ref_id is null then
    perform public.pro_raise('invalid_report', '22023', 'ref_id');
  end if;
  if p_message_id is not null and p_ref_type <> 'connection' then
    perform public.pro_raise('invalid_report', '22023', 'message_id');
  end if;

  -- Who is reported, from the point of view of a caller who may see the reference.
  if p_ref_type = 'invite' then
    select * into inv from public.pro_invites i where i.id = p_ref_id;
    if not found or inv.stylist_id = uid then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
    other := inv.stylist_id;
    rep_role := 'stylist';
  else
    if p_ref_type = 'connection' then
      select * into c from public.pro_connections x
       where x.id = p_ref_id and (x.stylist_id = uid or x.client_id = uid);
    elsif p_ref_type = 'recommendation' then
      select k.* into c from public.pro_recommendations r join public.pro_connections k on k.id = r.connection_id
       where r.id = p_ref_id and (k.stylist_id = uid or (k.client_id = uid and r.status <> 'draft'));
    else
      select k.* into c from public.pro_appointments a join public.pro_connections k on k.id = a.connection_id
       where a.id = p_ref_id and (k.stylist_id = uid or k.client_id = uid);
    end if;
    have_c := found;
    if not have_c then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
    me := case when c.stylist_id = uid then 'stylist' else 'client' end;
    other := case when me = 'stylist' then c.client_id else c.stylist_id end;
    rep_role := case when me = 'stylist' then 'client' else 'stylist' end;
    if other is null then
      perform public.pro_raise('pro_unavailable', '22023');          -- the other account is gone
    end if;
    -- A flagged message must be one the other person sent in this connection.
    if p_message_id is not null and not exists (
         select 1 from public.pro_messages m
          where m.id = p_message_id and m.connection_id = c.id and m.kind = 'text' and m.sender_id = other) then
      perform public.pro_raise('invalid_report', '22023', 'message_id');
    end if;
  end if;

  ctx := case when p_ref_type = 'connection' and p_message_id is not null then 'pro_chat'
              when p_ref_type in ('connection', 'invite') then 'pro_profile'
              else 'pro_content' end;
  -- The details are NOT run through the text filters: a person reporting a scam must be able to quote it ("he told me
  -- to pay with a gift card"), and only moderators read them. They are cut to 500 characters and stripped of control
  -- characters, and nothing here can refuse a report.

  -- One person's reports, and the hold on the reported person, are decided one at a time.
  perform public.pro_lock_users(uid, other);

  -- Same shared daily limit as report_user() and report_swap_content().
  if (select count(*) from public.content_reports
       where reporter_id = uid and created_at > now() - interval '1 day') >= public.pro_limit('reports_day') then
    perform public.pro_raise('report_rate_limited', '54000');
  end if;
  if p_reason not in ('underage', 'unsafe_meeting', 'unsafe', 'harassment')
     and exists (select 1 from public.content_reports cr
                  where cr.reporter_id = uid and cr.ref_type = p_ref_type and cr.ref_id = p_ref_id
                    and cr.reason = p_reason
                    and coalesce(cr.evidence ->> 'flaggedMessageId', '0') = coalesce(p_message_id::text, '0')
                    and cr.created_at > now() - interval '7 days') then
    folded := true;
  end if;

  if not folded then
    if p_ref_type <> 'invite' then
      qualified := public.pro_report_is_qualified(uid, other);
    end if;

    if ctx = 'pro_chat' then
      ev := public.pro_chat_evidence(c.id, uid, p_message_id, qualified)
            || jsonb_build_object('kind', 'chat', 'reportedRole', rep_role, 'connectionStatus', c.status);
    elsif p_ref_type in ('connection', 'invite') then
      if rep_role = 'stylist' then
        select jsonb_build_object('displayName', s.display_name, 'headline', s.headline, 'bio', s.bio,
                                  'services', to_jsonb(s.services), 'languages', to_jsonb(s.languages),
                                  'ratesText', s.rates_text, 'accepting', s.accepting_clients, 'createdAt', s.created_at)
          into prof from public.pro_stylists s where s.user_id = other;
      else
        prof := jsonb_build_object('alias', c.client_alias);
      end if;
      ev := jsonb_build_object('kind', 'profile', 'reportedRole', rep_role, 'profile', prof,
                               'qualified', qualified, 'flaggedMessageId', null)
            || case when p_ref_type = 'invite' then jsonb_build_object('inviteStatus', inv.status)
                    else jsonb_build_object('connectionStatus', c.status) end;
    elsif p_ref_type = 'recommendation' then
      select * into rec from public.pro_recommendations r where r.id = p_ref_id;
      ev := jsonb_build_object(
              'kind', 'recommendation', 'reportedRole', rep_role, 'title', rec.title, 'body', rec.body,
              'status', rec.status, 'sentAt', rec.sent_at,
              'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'category', i.category) order by i.position), '[]'::jsonb)
                          from public.pro_recommendation_items i where i.recommendation_id = rec.id),
              'feedback', case when rec.client_rating is not null or rec.client_comment is not null
                               then jsonb_build_object('rating', rec.client_rating, 'comment', rec.client_comment) end,
              'qualified', qualified, 'flaggedMessageId', null, 'connectionStatus', c.status);
    else
      select * into appt from public.pro_appointments a where a.id = p_ref_id;
      ev := jsonb_build_object(
              'kind', 'appointment', 'reportedRole', rep_role, 'proposedBy', appt.proposed_by, 'status', appt.status,
              'startsAt', appt.starts_at, 'durationMinutes', appt.duration_minutes, 'mode', appt.mode,
              'place', appt.place, 'note', appt.note, 'utcOffsetMinutes', appt.utc_offset_minutes,
              'qualified', qualified, 'flaggedMessageId', null, 'connectionStatus', c.status);
    end if;
    -- The insert can never reach the table's size check.
    if pg_column_size(ev) > public.pro_limit('evidence_bytes') then
      ev := jsonb_build_object('kind', ev ->> 'kind', 'reportedRole', rep_role, 'truncated', true,
                               'qualified', qualified, 'flaggedMessageId', p_message_id);
    end if;

    insert into public.content_reports (reporter_id, reported_user_id, context, reason, details, ref_type, ref_id, evidence)
    values (uid, other, ctx, p_reason, clean, p_ref_type, p_ref_id, ev);

    -- Two different people who really worked with the stylist hold their new invites for a while. A hold that a person
    -- made is never replaced; invite reports and reports from strangers never count (qualified is false for them).
    if (select count(distinct cr.reporter_id) from public.content_reports cr
         where cr.reported_user_id = other
           and cr.context in ('pro_profile', 'pro_chat', 'pro_content')
           and cr.created_at > now() - make_interval(days => public.pro_limit('report_window_days'))
           and cr.evidence ->> 'qualified' = 'true') >= public.pro_limit('reports_to_hold_stylist') then
      update public.pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now()
       where user_id = other and (invites_held_at is null or invites_held_by = 'system');
    end if;
  end if;

  -- A serious report from the client also stops that client's own sharing, folded or not. The connection stays open and
  -- the stylist is told nothing.
  if have_c and me = 'client' and p_reason in ('harassment', 'data_misuse', 'unsafe_meeting', 'underage') then
    perform 1 from public.pro_connections x where x.id = c.id and x.client_id = uid for update;
    delete from public.pro_grant_items
     where connection_id = c.id and connection_id in (select k.id from public.pro_connections k where k.client_id = uid);
    delete from public.pro_grants
     where connection_id = c.id and scope = 'closet'
       and connection_id in (select k.id from public.pro_connections k where k.client_id = uid);
    if found then
      insert into public.pro_grant_events (connection_id, scope, event) values (c.id, 'closet', 'revoked');
    end if;
  end if;
end;
$$;

-- Blocks the other person of a connection, or the stylist of an invite the caller previewed and does not want (their
-- later codes then answer invite_invalid for this caller). Exactly one of the two arguments. The row is marked via_pro and
-- carries the label the caller knows the person by, never an email, so the account id never reaches the caller's own block
-- list; list_pro_blocks shows it under an opaque ref. The pro row is inserted first so the block stays out of the old
-- Friends list; an accepted friend is unfriended as block_swap_member does (without that, the folder-wide friends read of
-- photos has no block check). Every connection between the pair then ends and becomes a closed shell.
create or replace function public.block_pro_member(p_connection uuid default null, p_invite uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  c     public.pro_connections;
  other uuid;
  who   text;
begin
  perform public.pro_gate(uid, 'safety');
  if (p_connection is null) = (p_invite is null) then
    perform public.pro_raise('invalid_request', '22023', 'connection_or_invite');
  end if;
  -- Who is blocked, read without a lock: the pair's lock has to be taken before any connection row is, in the order every
  -- other function takes them (4.1), and it needs the other person's id.
  if p_connection is not null then
    select * into c from public.pro_connections x
     where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
    if not found then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
    other := case when c.stylist_id = uid then c.client_id else c.stylist_id end;
  else
    select i.stylist_id into other from public.pro_invites i where i.id = p_invite;
    if not found then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
  end if;
  if other is null or other = uid then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  -- A redeem holds the same lock while it checks for a block, so a block and a redeem cannot interleave: whichever comes
  -- second sees the other (a code of a blocked stylist is invalid; a connection made just before is ended by the block).
  perform public.pro_lock_users(uid, other);
  if p_connection is not null then
    select * into c from public.pro_connections x
     where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid) for update;
    if not found then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
    who := case when c.stylist_id = uid then coalesce(c.client_alias, 'Client') else coalesce(c.stylist_label, 'Stylist') end;
  else
    select coalesce(s.display_name, 'Stylist') into who from public.pro_stylists s where s.user_id = other;
    who := coalesce(who, 'Stylist');
  end if;
  perform public.pro_rate_check(uid, 'block_day');

  insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_pro)
  values (uid, other, left(who, 40), true)
  on conflict (blocker_id, blocked_id) do nothing;
  if public.are_friends(uid, other) then
    perform public.block_user(other);
  end if;
  -- The trigger on user_blocks does this for a fresh row; here it also covers a block that already existed.
  perform public.pro_end_between(uid, other);
end;
$$;

-- The caller's own pro blocks under an opaque ref. A way out: the safety gate.
create or replace function public.list_pro_blocks()
returns table (ref uuid, label text, blocked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  perform public.pro_gate(uid, 'safety');
  return query
  select b.ref, coalesce(nullif(b.blocked_name, ''), 'Stylist or client'), b.created_at
    from public.user_blocks b
   where b.blocker_id = uid and b.via_pro
   order by b.created_at desc, b.ref;
end;
$$;

-- Removes a pro block. It does not reconnect anyone and does not change a closed shell, which is stored.
create or replace function public.unblock_pro_member(p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  perform public.pro_gate(uid, 'safety');
  if p_ref is null then
    perform public.pro_raise('invalid_request', '22023', 'ref');
  end if;
  delete from public.user_blocks where ref = p_ref and blocker_id = uid and via_pro;
end;
$$;

-- The caller's own data (8.2): settings, profile, invites (never the code), and per connection the other person's label,
-- the grant history (client side only), the looks, the sessions, and the caller's own messages. Never the other person's
-- messages, account, email or closet. A way out: the safety gate, so a paused or suspended person can still take their data.
create or replace function public.export_my_pro_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  m    public.pro_members;
  s    public.pro_stylists;
  prof jsonb := null;
begin
  perform public.pro_gate(uid, 'safety');
  perform public.pro_refresh(uid);
  select * into m from public.pro_members where user_id = uid;
  select * into s from public.pro_stylists where user_id = uid;
  if found then
    prof := jsonb_build_object(
      'displayName', s.display_name, 'headline', s.headline, 'bio', s.bio,
      'services', to_jsonb(s.services), 'languages', to_jsonb(s.languages), 'ratesText', s.rates_text,
      'accepting', s.accepting_clients, 'approved', m.stylist_approved_at is not null,
      'invitesHeld', public.pro_invites_held(uid), 'createdAt', s.created_at);
  end if;
  return jsonb_build_object(
    'settings', jsonb_build_object(
      'adultConfirmedAt', m.adult_confirmed_at,
      'stylistTerms', jsonb_build_object('version', m.stylist_terms_version, 'acceptedAt', m.stylist_terms_accepted_at),
      'clientTerms', jsonb_build_object('version', m.client_terms_version, 'acceptedAt', m.client_terms_accepted_at),
      'suspended', m.suspended_at is not null),
    'stylistProfile', prof,
    'invites', (select coalesce(jsonb_agg(jsonb_build_object(
                          'createdAt', i.created_at, 'expiresAt', i.expires_at,
                          'status', case when i.status = 'live' and i.expires_at <= now() then 'expired' else i.status end)
                        order by i.created_at, i.id), '[]'::jsonb)
                  from public.pro_invites i where i.stylist_id = uid),
    'connections', (select coalesce(jsonb_agg(x.j order by x.started_at desc, x.id), '[]'::jsonb) from (
      select c.id, c.started_at,
             jsonb_build_object(
               'role', case when c.stylist_id = uid then 'stylist' else 'client' end,
               'otherLabel', case when c.shell_at is not null then case when c.stylist_id = uid then 'Former client' else 'Former stylist' end
                                  when c.stylist_id = uid then coalesce(c.client_alias, 'Former client')
                                  else coalesce(c.stylist_label, 'Former stylist') end,
               'status', c.status, 'startedAt', c.started_at, 'endedAt', c.ended_at,
               'looks', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'title', r.title, 'body', r.body, 'status', r.status,
                                  'items', (select coalesce(jsonb_agg(i.name order by i.position), '[]'::jsonb)
                                              from public.pro_recommendation_items i where i.recommendation_id = r.id),
                                  'sentAt', r.sent_at,
                                  'feedback', case when r.client_rating is not null or r.client_comment is not null
                                                   then jsonb_build_object('rating', r.client_rating, 'comment', r.client_comment) end)
                                order by r.created_at, r.id), '[]'::jsonb)
                           from public.pro_recommendations r
                          where r.connection_id = c.id and (c.stylist_id = uid or r.status <> 'draft')),
               'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes, 'mode', a.mode,
                                    'place', a.place, 'note', a.note, 'status', a.status, 'utcOffsetMinutes', a.utc_offset_minutes)
                                  order by a.starts_at, a.id), '[]'::jsonb)
                             from public.pro_appointments a where a.connection_id = c.id),
               'myMessages', (select coalesce(jsonb_agg(jsonb_build_object('body', g.body, 'sentAt', g.created_at) order by g.id), '[]'::jsonb)
                                from public.pro_messages g
                               where g.connection_id = c.id and g.kind = 'text' and g.sender_id = uid))
             || case when c.client_id = uid
                     then jsonb_build_object('grantHistory',
                            (select coalesce(jsonb_agg(jsonb_build_object(
                                      'event', e.event, 'itemMode', e.item_mode, 'itemCount', e.item_count,
                                      'textVersion', e.text_version, 'at', e.created_at) order by e.id), '[]'::jsonb)
                               from public.pro_grant_events e where e.connection_id = c.id))
                     else '{}'::jsonb end as j
        from public.pro_connections c
       where c.stylist_id = uid or c.client_id = uid) x));
end;
$$;

-- ─── 5. Admin functions (service role only; run from the dashboard SQL editor) ─

-- The switch. Turning it on is refused until at least 50 content terms are loaded (the rule of swap_set_community_enabled),
-- because a stylist and a client meet through a code and are effectively strangers.
create or replace function public.pro_set_enabled(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_on is null then
    perform public.pro_raise('invalid_request', '22023', 'on');
  end if;
  if p_on and (select count(*) from public.swap_blocked_terms where kind = 'content') < 50 then
    raise exception 'load at least 50 content terms into swap_blocked_terms first' using errcode = '55000';
  end if;
  update public.pro_config set value = to_jsonb(p_on), updated_at = now() where key = 'pro_enabled';
end;
$$;

-- Lifts probation (3 clients and 1 live invite become 25 and 10). A person does this after reading the profile text.
create or replace function public.pro_admin_approve_stylist(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pro_lock_users(p_user, p_user);
  update public.pro_members set stylist_approved_at = now(), updated_at = now() where user_id = p_user;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
end;
$$;

-- A hold a person makes never releases itself (it also turns a system hold into one a person confirmed).
create or replace function public.pro_admin_hold_stylist(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pro_lock_users(p_user, p_user);
  insert into public.pro_members (user_id, invites_held_at, invites_held_by)
  values (p_user, now(), 'admin')
  on conflict (user_id) do update
     set invites_held_at = now(), invites_held_by = 'admin', updated_at = now();
end;
$$;

create or replace function public.pro_admin_release_stylist(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pro_lock_users(p_user, p_user);
  update public.pro_members set invites_held_at = null, invites_held_by = null, updated_at = now() where user_id = p_user;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
end;
$$;

-- Pauses the person's professional membership, not their account: every pro function except the safety ones refuses, and
-- every active connection of theirs, on either side, ends as 'system'.
create or replace function public.pro_admin_suspend(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform public.pro_lock_users(p_user, p_user);
  insert into public.pro_members (user_id, suspended_at, suspended_reason)
  values (p_user, now(), left(btrim(p_reason), 200))
  on conflict (user_id) do update
     set suspended_at = now(), suspended_reason = excluded.suspended_reason, updated_at = now();
  for r in
    select c.id from public.pro_connections c
     where c.status = 'active' and (c.stylist_id = p_user or c.client_id = p_user)
     order by c.id
  loop
    perform public.pro_end_connection(r.id, 'system');
  end loop;
end;
$$;

-- Ends a suspension. Nothing is reconnected.
create or replace function public.pro_admin_unsuspend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pro_lock_users(p_user, p_user);
  update public.pro_members set suspended_at = null, suspended_reason = null, updated_at = now() where user_id = p_user;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
end;
$$;

-- Takes the person off as a stylist for good: their connections as a stylist end ('system'), their invites and profile are
-- deleted, and save_stylist_profile answers stylist_profile_removed until pro_admin_restore_stylist (a removal cannot be
-- undone by closing and re-creating the profile). The person remains an ordinary member. The open pro reports about them
-- are marked handled with the reason.
create or replace function public.pro_admin_remove_stylist(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform public.pro_lock_users(p_user, p_user);
  insert into public.pro_members (user_id, stylist_removed_at, stylist_removed_reason)
  values (p_user, now(), left(btrim(p_reason), 200))
  on conflict (user_id) do update
     set stylist_removed_at = now(), stylist_removed_reason = excluded.stylist_removed_reason, updated_at = now();
  for r in
    select c.id from public.pro_connections c where c.status = 'active' and c.stylist_id = p_user order by c.id
  loop
    perform public.pro_end_connection(r.id, 'system');
  end loop;
  delete from public.pro_invites where stylist_id = p_user;
  delete from public.pro_stylists where user_id = p_user;
  update public.content_reports
     set reviewed_at = now(), outcome = coalesce(left(nullif(btrim(p_reason), ''), 200), 'removed stylist')
   where reported_user_id = p_user and context in ('pro_profile', 'pro_chat', 'pro_content') and reviewed_at is null;
end;
$$;

-- Clears a removal. No profile and no connection is recreated.
create or replace function public.pro_admin_restore_stylist(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pro_lock_users(p_user, p_user);
  update public.pro_members set stylist_removed_at = null, stylist_removed_reason = null, updated_at = now()
   where user_id = p_user;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
end;
$$;

-- Reports nobody has looked at yet that are older than p_older_than.
create or replace function public.pro_report_backlog(p_older_than interval default interval '4 hours')
returns table (waiting integer, oldest_hours integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         coalesce(floor(extract(epoch from (now() - min(cr.created_at))) / 3600)::integer, 0)
    from public.content_reports cr
   where cr.context in ('pro_profile', 'pro_chat', 'pro_content') and cr.reviewed_at is null
     and cr.created_at < now() - p_older_than;
$$;

-- Tells whoever reviews reports that some are waiting. The queue is only a view, so without this nobody would know. It
-- posts numbers only (how many, how old), never a person, text or id, to the address kept in Vault under the name
-- swap_report_webhook (the owner's one alert channel, so one webhook serves swaps and stylists), and is scheduled hourly
-- (docs/MODERATION.md). Returns true when a message was sent. Where pg_net, Vault or the secret is missing it does nothing
-- and returns false: a scheduled job must never raise.
create or replace function public.pro_send_report_digest(p_older_than interval default interval '4 hours')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  url text;
begin
  select * into b from public.pro_report_backlog(p_older_than);
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
        format('SmartCloset professional accounts: %s report(s) waiting, the oldest %s hour(s). Open the pro_moderation_queue view.',
               b.waiting, b.oldest_hours)));
    return true;
  exception when others then
    return false;
  end;
end;
$$;

-- Unreviewed pro reports, the safety reasons first, then the oldest. Mark one handled with
--   update public.content_reports set reviewed_at = now(), outcome = '...' where id = '<report id>';
create or replace view public.pro_moderation_queue as
select cr.id, cr.created_at, cr.context, cr.reason, cr.details, cr.ref_type, cr.ref_id,
       cr.reporter_id, cr.reported_user_id, cr.evidence,
       coalesce(cr.evidence @> '{"qualified": true}'::jsonb, false) as qualified,
       cr.reviewed_at, cr.outcome
  from public.content_reports cr
 where cr.context in ('pro_profile', 'pro_chat', 'pro_content') and cr.reviewed_at is null
 order by (cr.reason in ('underage', 'unsafe_meeting', 'unsafe', 'harassment')) desc, cr.created_at;

-- New stylists a person has not looked at yet: read the profile text, then pro_admin_approve_stylist or
-- pro_admin_remove_stylist.
create or replace view public.pro_review_queue as
select s.user_id, s.display_name, s.headline, s.bio, s.services, s.rates_text, s.created_at,
       (select count(*) from public.pro_connections c where c.stylist_id = s.user_id and c.status = 'active')::integer as active_clients
  from public.pro_stylists s
  join public.pro_members m on m.user_id = s.user_id
 where m.stylist_approved_at is null and m.stylist_removed_at is null
 order by s.created_at;

-- ─── 6. Function privileges ─────────────────────────────────────────────────

-- The evidence builder is internal.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pro_chat_evidence(uuid, uuid, bigint, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

-- The functions the app calls.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.report_pro_content(text, uuid, text, text, bigint)',
    'public.block_pro_member(uuid, uuid)',
    'public.list_pro_blocks()',
    'public.unblock_pro_member(uuid)',
    'public.export_my_pro_data()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- Swap's own report function, re-created above: same grants as before.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.report_swap_content(text, uuid, text, text, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- Service role only: the owner's tools. An app user could otherwise switch the feature, or hold or suspend someone.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pro_set_enabled(boolean)',
    'public.pro_admin_approve_stylist(uuid)',
    'public.pro_admin_hold_stylist(uuid)',
    'public.pro_admin_release_stylist(uuid)',
    'public.pro_admin_suspend(uuid, text)',
    'public.pro_admin_unsuspend(uuid)',
    'public.pro_admin_remove_stylist(uuid, text)',
    'public.pro_admin_restore_stylist(uuid)',
    'public.pro_report_backlog(interval)',
    'public.pro_send_report_digest(interval)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

revoke all on public.pro_moderation_queue from public, anon, authenticated;
grant select on public.pro_moderation_queue to service_role;
revoke all on public.pro_review_queue from public, anon, authenticated;
grant select on public.pro_review_queue to service_role;
