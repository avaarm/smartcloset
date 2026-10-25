-- Professional accounts, part 4 of 8: access, terms, the stylist profile, and invites.
--
-- The first client-callable functions (pro-accounts.md 4.6, groups 1 to 3). Every one is SECURITY DEFINER, pins
-- search_path, and starts with: uid := auth.uid(), the gate (pro_gate), validation, the rate check, then the work.
-- Arguments are p_-prefixed and named: PostgREST matches them by name, so renaming one breaks every installed build.
-- Lists return "returns table" with snake_case columns; single objects return jsonb with camelCase keys.
--
-- Failures of the two invite lookups (preview_pro_invite, redeem_pro_invite) are RESULTS, not errors:
-- {valid:false,error:'invite_invalid'} / {ok:false,error:'invite_invalid'} are returned after the rate counter has been
-- incremented, so failed lookups are counted. A raise would roll the increment back and the brute-force limit would
-- only ever count valid codes. Every other failure raises.
--
-- Locking: functions that count a cap before inserting, and the ones that change what a redeem decides on, take
-- pro_lock_users first (the stylist's advisory lock; redeem takes the stylist's and the client's), so two parallel
-- calls see each other's rows and none can interleave with a redeem (B.10).
--
-- Safe to run twice.

-- ─── Group 1: access and terms ──────────────────────────────────────────────

-- Signed-in only, so it answers when the switch is off or the person is suspended.
create or replace function public.get_pro_badge()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n   integer;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return 0;
  end if;
  if not coalesce((public.pro_cfg('pro_enabled'))::boolean, false) then
    return 0;
  end if;
  if exists (select 1 from public.pro_members m where m.user_id = uid and m.suspended_at is not null) then
    return 0;
  end if;
  -- connections with an unread text message from the other side (system lines never count)
  select (select count(*) from public.pro_connections c
           where c.status = 'active' and c.shell_at is null and (c.stylist_id = uid or c.client_id = uid)
             and exists (select 1 from public.pro_messages m
                          where m.connection_id = c.id and m.kind = 'text' and m.sender_id is distinct from uid
                            and m.id > case when c.client_id = uid then c.client_seen_message_id
                                            else c.stylist_seen_message_id end))
       -- sessions proposed to the caller that have not started
       + (select count(*) from public.pro_appointments a join public.pro_connections c on c.id = a.connection_id
           where c.status = 'active' and a.status = 'proposed' and a.starts_at > now()
             and ((c.stylist_id = uid and a.proposed_by = 'client') or (c.client_id = uid and a.proposed_by = 'stylist')))
       -- as a client, sent looks not yet viewed
       + (select count(*) from public.pro_recommendations r join public.pro_connections c on c.id = r.connection_id
           where c.status = 'active' and c.client_id = uid and r.status = 'sent')
    into n;
  return coalesce(n, 0);
exception when others then
  return 0;                                      -- a badge never fails a screen
end;
$$;

create or replace function public.get_pro_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  m            public.pro_members;
  s            public.pro_stylists;
  have_profile boolean;
  approved     boolean;
  stylist      jsonb := null;
begin
  perform public.pro_gate(uid, 'safety');
  perform public.pro_refresh(uid);
  select * into m from public.pro_members where user_id = uid;
  select * into s from public.pro_stylists where user_id = uid;
  have_profile := found;
  approved := m.stylist_approved_at is not null;
  if have_profile then
    stylist := jsonb_build_object(
      'termsCurrent', m.stylist_terms_version is not distinct from (public.pro_cfg('stylist_terms_version') #>> '{}'),
      'accepting', s.accepting_clients,
      'approved', approved,
      'invitesHeld', public.pro_invites_held(uid),
      'activeClients', (select count(*) from public.pro_connections c where c.stylist_id = uid and c.status = 'active'),
      'clientLimit', public.pro_limit(case when approved then 'stylist_clients' else 'stylist_clients_probation' end),
      'liveInvites', (select count(*) from public.pro_invites i
                       where i.stylist_id = uid and i.status = 'live' and i.expires_at > now()),
      'inviteLimit', public.pro_limit(case when approved then 'invites_live' else 'invites_live_probation' end));
  end if;
  return jsonb_build_object(
    'proEnabled', coalesce((public.pro_cfg('pro_enabled'))::boolean, false),
    'suspended', m.suspended_at is not null,
    'adultConfirmed', m.adult_confirmed_at is not null,
    'stylistRemoved', m.stylist_removed_at is not null,
    'versions', jsonb_build_object(
      'stylistTerms', public.pro_cfg('stylist_terms_version') #>> '{}',
      'clientTerms', public.pro_cfg('client_terms_version') #>> '{}',
      'shareText', public.pro_cfg('share_text_version') #>> '{}'),
    'stylist', stylist,
    'client', jsonb_build_object(
      'termsCurrent', m.client_terms_version is not distinct from (public.pro_cfg('client_terms_version') #>> '{}'),
      'connections', (select count(*) from public.pro_connections c where c.client_id = uid and c.status = 'active'),
      'connectionLimit', public.pro_limit('client_connections')),
    'badge', public.get_pro_badge());
end;
$$;

-- The version must be the one the server holds; the app sends the version in its own build, never the server's value,
-- so a person can only agree to text they were shown. The first call for a person creates their pro_members row.
create or replace function public.accept_pro_terms(p_role text, p_version text, p_adult boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  adult timestamptz;
begin
  perform public.pro_gate(uid, 'member');
  if p_role is null or p_role not in ('stylist', 'client') then
    perform public.pro_raise('invalid_request', '22023', 'role');
  end if;
  if p_version is distinct from (public.pro_cfg(p_role || '_terms_version') #>> '{}') then
    perform public.pro_raise('terms_version_mismatch', '22023');
  end if;
  select m.adult_confirmed_at into adult from public.pro_members m where m.user_id = uid;
  if adult is null and not coalesce(p_adult, false) then
    perform public.pro_raise('adult_required', '22023');
  end if;
  perform public.pro_rate_check(uid, 'terms_day');
  if p_role = 'stylist' then
    insert into public.pro_members (user_id, stylist_terms_version, stylist_terms_accepted_at, adult_confirmed_at)
    values (uid, p_version, now(), case when coalesce(p_adult, false) then now() end)
    on conflict (user_id) do update
       set stylist_terms_version = excluded.stylist_terms_version,
           stylist_terms_accepted_at = now(),
           adult_confirmed_at = coalesce(public.pro_members.adult_confirmed_at, excluded.adult_confirmed_at),
           updated_at = now();
  else
    insert into public.pro_members (user_id, client_terms_version, client_terms_accepted_at, adult_confirmed_at)
    values (uid, p_version, now(), case when coalesce(p_adult, false) then now() end)
    on conflict (user_id) do update
       set client_terms_version = excluded.client_terms_version,
           client_terms_accepted_at = now(),
           adult_confirmed_at = coalesce(public.pro_members.adult_confirmed_at, excluded.adult_confirmed_at),
           updated_at = now();
  end if;
end;
$$;

-- ─── Group 2: the stylist profile ───────────────────────────────────────────

create or replace function public.get_my_stylist_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s   public.pro_stylists;
  m   public.pro_members;
begin
  perform public.pro_gate(uid, 'member');
  select * into s from public.pro_stylists where user_id = uid;
  if not found then
    return null;
  end if;
  select * into m from public.pro_members where user_id = uid;
  return jsonb_build_object(
    'displayName', s.display_name, 'headline', s.headline, 'bio', s.bio,
    'services', to_jsonb(s.services), 'languages', to_jsonb(s.languages), 'ratesText', s.rates_text,
    'accepting', s.accepting_clients,
    'approved', m.stylist_approved_at is not null,
    'invitesHeld', public.pro_invites_held(uid),
    'createdAt', s.created_at);
end;
$$;

create or replace function public.save_stylist_profile(
  p_display_name text,
  p_headline     text default '',
  p_bio          text default '',
  p_services     text[] default '{}',
  p_languages    text[] default '{}',
  p_rates_text   text default '',
  p_accepting    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  m        public.pro_members;
  nm       text;
  hl       text := btrim(coalesce(p_headline, ''));
  bi       text := btrim(coalesce(p_bio, ''));
  rt       text := btrim(coalesce(p_rates_text, ''));
  svc      text[];
  lang     text[];
  creating boolean;
  ctrl     constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]';
begin
  perform public.pro_gate(uid, 'stylist_setup');
  perform public.pro_lock_users(uid, uid);
  select * into m from public.pro_members where user_id = uid;
  if m.stylist_removed_at is not null then
    perform public.pro_raise('stylist_profile_removed', '42501', null, 'email support');
  end if;

  nm := public.pro_clean_name(p_display_name, 2, 40);
  if nm is null then
    perform public.pro_raise('invalid_profile', '22023', 'display_name');
  end if;
  if not public.pro_name_ok(nm) then
    perform public.pro_raise('text_not_allowed', '22023', 'display_name', 'name');
  end if;
  if char_length(hl) > 80 or hl ~ ctrl then
    perform public.pro_raise('invalid_profile', '22023', 'headline');
  end if;
  if char_length(bi) > 500 or bi ~ ctrl then
    perform public.pro_raise('invalid_profile', '22023', 'bio');
  end if;
  if char_length(rt) > 120 or rt ~ ctrl then
    perform public.pro_raise('invalid_profile', '22023', 'rates');
  end if;
  svc := public.pro_clean_list(p_services,
           array['wardrobe_audit', 'personal_shopping', 'outfit_styling', 'color_analysis', 'event_styling',
                 'virtual_sessions', 'in_person_sessions'], 7);
  if svc is null or cardinality(svc) = 0 then
    perform public.pro_raise('invalid_profile', '22023', 'services');
  end if;
  lang := public.pro_clean_list(p_languages, null, 5);
  if lang is null or exists (select 1 from unnest(lang) as l where l !~ '^[a-z]{2}$') then
    perform public.pro_raise('invalid_profile', '22023', 'languages');
  end if;
  perform public.pro_require_text(nm, 'display_name', 'public');
  perform public.pro_require_text(hl, 'headline', 'public');
  perform public.pro_require_text(bi, 'bio', 'public');
  perform public.pro_require_text(rt, 'rates', 'public');
  perform public.pro_rate_check(uid, 'profile_day');

  -- Creating a profile (not updating one) first looks at the reports of the last report_window_days: closing and
  -- re-creating the profile cannot shed a pending hold. An existing hold, and the approval, are never touched.
  creating := not exists (select 1 from public.pro_stylists s where s.user_id = uid);
  if creating and (select count(distinct cr.reporter_id) from public.content_reports cr
                    where cr.reported_user_id = uid
                      and cr.context in ('pro_profile', 'pro_chat', 'pro_content')
                      and cr.created_at > now() - make_interval(days => public.pro_limit('report_window_days'))
                      and cr.evidence ->> 'qualified' = 'true') >= public.pro_limit('reports_to_hold_stylist') then
    update public.pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now()
     where user_id = uid and invites_held_at is null;
  end if;

  insert into public.pro_stylists (user_id, display_name, headline, bio, services, languages, rates_text, accepting_clients)
  values (uid, nm, hl, bi, svc, lang, rt, coalesce(p_accepting, true))
  on conflict (user_id) do update
     set display_name = excluded.display_name, headline = excluded.headline, bio = excluded.bio,
         services = excluded.services, languages = excluded.languages, rates_text = excluded.rates_text,
         accepting_clients = excluded.accepting_clients, updated_at = now();
  update public.pro_connections set stylist_label = nm, updated_at = now()
   where stylist_id = uid and status = 'active';
  return public.get_my_stylist_profile();
end;
$$;

create or replace function public.set_stylist_accepting(p_accepting boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  perform public.pro_gate(uid, 'stylist');
  if p_accepting is null then
    perform public.pro_raise('invalid_request', '22023', 'accepting');
  end if;
  perform public.pro_lock_users(uid, uid);
  update public.pro_stylists set accepting_clients = p_accepting, updated_at = now() where user_id = uid;
end;
$$;

-- A way out: the safety gate, so a person who is paused, suspended or out of date on terms can still close. The
-- stylist's terms acceptance, approval, any hold and any removal stay on pro_members: closing never resets probation
-- and never clears a sanction, so close-then-save cannot undo a hold.
create or replace function public.close_stylist_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r   record;
begin
  perform public.pro_gate(uid, 'safety');
  perform public.pro_lock_users(uid, uid);
  if not exists (select 1 from public.pro_stylists s where s.user_id = uid) then
    return;
  end if;
  for r in
    select c.id from public.pro_connections c where c.stylist_id = uid and c.status = 'active' order by c.id
  loop
    perform public.pro_end_connection(r.id, 'stylist');
  end loop;
  delete from public.pro_invites where stylist_id = uid;
  delete from public.pro_stylists where user_id = uid;
end;
$$;

-- ─── Group 3: invites ───────────────────────────────────────────────────────

create or replace function public.create_pro_invite(p_client_ref uuid, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  inv      public.pro_invites;
  approved boolean;
  lbl      text;
  tries    integer := 0;
begin
  perform public.pro_gate(uid, 'stylist');
  if p_client_ref is null then
    perform public.pro_raise('invalid_request', '22023', 'client_ref');
  end if;
  perform public.pro_lock_users(uid, uid);
  -- A stylist reaches other people, so the account must be old enough (clients may be brand new).
  if (select u.created_at from auth.users u where u.id = uid)
       > now() - make_interval(hours => coalesce((public.pro_cfg('min_account_age_hours'))::integer, 48)) then
    perform public.pro_raise('account_too_new', '42501');
  end if;
  if public.pro_invites_held(uid) then
    perform public.pro_raise('invites_held', '42501');
  end if;
  -- A retry with the same ref returns the existing row (before the cap and the counter, so it costs nothing).
  select * into inv from public.pro_invites i where i.stylist_id = uid and i.client_ref = p_client_ref;
  if found then
    return jsonb_build_object(
      'inviteId', inv.id, 'code', inv.code, 'expiresAt', inv.expires_at, 'createdAt', inv.created_at,
      'status', case when inv.status = 'live' and inv.expires_at <= now() then 'expired' else inv.status end,
      'connected', exists (select 1 from public.pro_connections c where c.invite_id = inv.id and c.status = 'active'));
  end if;
  select (m.stylist_approved_at is not null) into approved from public.pro_members m where m.user_id = uid;
  if (select count(*) from public.pro_invites i where i.stylist_id = uid and i.status = 'live' and i.expires_at > now())
       >= public.pro_limit(case when coalesce(approved, false) then 'invites_live' else 'invites_live_probation' end) then
    perform public.pro_raise('invite_limit', '54000');
  end if;
  perform public.pro_rate_check(uid, 'invite_day');
  lbl := public.pro_clean_name(p_label, 0, 40);
  if lbl is null then
    perform public.pro_raise('invalid_request', '22023', 'label');
  end if;
  perform public.pro_require_text(lbl, 'label', 'chat');

  -- A conflict on the code (a collision) inserts nothing and is retried with a fresh code. The conflict on
  -- (stylist_id, client_ref) cannot occur here (checked above under the stylist's lock), but is told apart anyway,
  -- so a code collision is never mistaken for a retry.
  loop
    tries := tries + 1;
    insert into public.pro_invites (stylist_id, code, label, expires_at, client_ref)
    values (uid, public.pro_new_code(), nullif(lbl, ''),
            now() + make_interval(days => public.pro_limit('invite_expiry_days')), p_client_ref)
    on conflict do nothing
    returning * into inv;
    exit when found;
    select * into inv from public.pro_invites i where i.stylist_id = uid and i.client_ref = p_client_ref;
    exit when found;
    if tries >= 5 then
      perform public.pro_raise('invite_limit', '54000');
    end if;
  end loop;
  return jsonb_build_object(
    'inviteId', inv.id, 'code', inv.code, 'expiresAt', inv.expires_at, 'createdAt', inv.created_at,
    'status', 'live', 'connected', false);
end;
$$;

create or replace function public.list_my_pro_invites()
returns table (invite_id uuid, code text, label text, status text, created_at timestamptz, expires_at timestamptz,
               used_at timestamptz, connected boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  perform public.pro_gate(uid, 'stylist');
  perform public.pro_refresh(uid);
  -- Live codes, and those that ended (used, revoked or expired) in the last 30 days, which is how long they are kept.
  return query
  select i.id, i.code, i.label,
         case when i.status = 'live' and i.expires_at <= now() then 'expired' else i.status end,
         i.created_at, i.expires_at, i.used_at,
         exists (select 1 from public.pro_connections c where c.invite_id = i.id and c.status = 'active')
    from public.pro_invites i
   where i.stylist_id = uid
     and ((i.status = 'live' and i.expires_at > now())
          or coalesce(i.used_at, i.revoked_at, i.expires_at) > now() - interval '30 days')
   order by i.created_at desc, i.id;
end;
$$;

-- The lock means a redeem that already holds the stylist's lock finishes first, and one that starts after sees
-- 'revoked'. Already revoked, or used, is a no-op; an invite that is not the caller's is pro_unavailable.
create or replace function public.revoke_pro_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  perform public.pro_gate(uid, 'stylist');
  perform public.pro_lock_users(uid, uid);
  update public.pro_invites set status = 'revoked', revoked_at = now()
   where id = p_invite and stylist_id = uid and status = 'live';
  if not found and not exists (select 1 from public.pro_invites i where i.id = p_invite and i.stylist_id = uid) then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
end;
$$;

-- Counts every lookup, valid or not: the counter is incremented first and a failed code returns the invalid result,
-- so the increment commits and the 11th lookup in an hour is refused whatever the code was. Every failure of the code
-- is the same result (unknown, expired, used, revoked, own, held, removed or suspended, blocked pair);
-- stylist_not_accepting is raised only when the code is valid and everything else is fine. A used code that created
-- this caller's own ACTIVE connection previews with alreadyConnected (an ended or closed connection does not count: a
-- spent code then answers like any other). The preview records nothing about who looked, and reveals no email, phone
-- or account id.
create or replace function public.preview_pro_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  norm      text;
  inv       public.pro_invites;
  s         public.pro_stylists;
  m         public.pro_members;
  connected boolean;
  invalid   constant jsonb := jsonb_build_object('valid', false, 'error', 'invite_invalid');
begin
  perform public.pro_gate(uid, 'member');
  perform public.pro_rate_check(uid, 'invite_lookup_hour');
  norm := public.pro_norm_code(p_code);
  select * into inv from public.pro_invites i where i.code = norm;
  if not found then
    return invalid;
  end if;
  select * into s from public.pro_stylists sp where sp.user_id = inv.stylist_id;
  if not found then
    return invalid;
  end if;
  select * into m from public.pro_members mm where mm.user_id = inv.stylist_id;
  if m.suspended_at is not null or m.stylist_removed_at is not null or public.is_blocked_between(inv.stylist_id, uid) then
    return invalid;
  end if;
  connected := exists (select 1 from public.pro_connections c
                        where c.invite_id = inv.id and c.client_id = uid and c.status = 'active');
  if not connected then
    if inv.status <> 'live' or inv.expires_at <= now() or inv.stylist_id = uid or public.pro_invites_held(inv.stylist_id) then
      return invalid;
    end if;
    if not s.accepting_clients
       or (select count(*) from public.pro_connections c where c.stylist_id = inv.stylist_id and c.status = 'active')
            >= public.pro_limit(case when m.stylist_approved_at is not null then 'stylist_clients'
                                     else 'stylist_clients_probation' end) then
      perform public.pro_raise('stylist_not_accepting', '22023');
    end if;
  end if;
  return jsonb_build_object(
    'valid', true,
    'inviteId', inv.id,
    'stylist', jsonb_build_object(
      'name', s.display_name, 'headline', s.headline, 'bio', s.bio,
      'services', to_jsonb(s.services), 'languages', to_jsonb(s.languages), 'ratesText', s.rates_text),
    'alreadyConnected', connected,
    'clientTermsCurrent', exists (select 1 from public.pro_members cm
                                   where cm.user_id = uid
                                     and cm.client_terms_version is not distinct from
                                         (public.pro_cfg('client_terms_version') #>> '{}')));
end;
$$;

-- The order is fixed (B.10): the stylist whose lock is needed can only be found by reading the invite first, and
-- the locked row decides. Failures of the code RETURN the invalid result (the counter commits); alias, caps and
-- filters RAISE. Two clients redeeming one single-use code, or a redeem racing a revoke, a close, an accepting switch
-- or an admin hold, cannot both succeed, because every stylist-side function takes the same stylist lock.
create or replace function public.redeem_pro_invite(p_code text, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  norm     text;
  sid      uuid;
  inv      public.pro_invites;
  s        public.pro_stylists;
  m        public.pro_members;
  existing uuid;
  cid      uuid;
  alias    text;
  invalid  constant jsonb := jsonb_build_object('ok', false, 'error', 'invite_invalid');
begin
  perform public.pro_gate(uid, 'client');
  perform public.pro_rate_check(uid, 'redeem_day');                    -- every call counts; the returns below commit it
  norm := public.pro_norm_code(p_code);
  select i.stylist_id into sid from public.pro_invites i where i.code = norm;   -- 1. read only: decide nothing here
  if sid is null then
    return invalid;
  end if;
  perform public.pro_lock_users(sid, uid);                             -- 2. the lock every stylist-side function takes
  select * into inv from public.pro_invites i where i.code = norm for update;   -- 3. the locked row decides
  if not found then
    return invalid;                                                    --    deleted since step 1
  end if;
  -- A used code that created this caller's connection, while it is still active: the same connection again (a retry
  -- after a lost response). This comes before the live test, because a used code would otherwise fail it. An ended or
  -- closed connection does not count: the spent code falls through to the checks below and answers invite_invalid,
  -- as the preview does, so the app is never told it is connected to a connection that has ended.
  select c.id into existing from public.pro_connections c
   where c.invite_id = inv.id and c.client_id = uid and c.status = 'active';
  if found then
    return jsonb_build_object('ok', true, 'connectionId', existing, 'alreadyConnected', true);
  end if;
  select * into s from public.pro_stylists sp where sp.user_id = sid;
  if not found then
    return invalid;
  end if;
  select * into m from public.pro_members mm where mm.user_id = sid;
  if inv.status <> 'live' or inv.expires_at <= now() or sid = uid
     or m.suspended_at is not null or m.stylist_removed_at is not null
     or public.pro_invites_held(sid) or public.is_blocked_between(sid, uid)
     or not s.accepting_clients then
    return invalid;
  end if;
  alias := public.pro_clean_name(p_alias, 2, 30);
  if alias is null then
    perform public.pro_raise('invalid_alias', '22023');
  end if;
  if not public.pro_name_ok(alias) then
    perform public.pro_raise('text_not_allowed', '22023', 'alias', 'name');   -- a stylist reads this as the client's name
  end if;
  perform public.pro_require_text(alias, 'alias', 'public');
  if (select count(*) from public.pro_connections c where c.client_id = uid and c.status = 'active')
       >= public.pro_limit('client_connections') then
    perform public.pro_raise('client_connection_limit', '54000');
  end if;
  if (select count(*) from public.pro_connections c where c.stylist_id = sid and c.status = 'active')
       >= public.pro_limit(case when m.stylist_approved_at is not null then 'stylist_clients'
                                else 'stylist_clients_probation' end) then
    perform public.pro_raise('stylist_not_accepting', '22023');
  end if;
  -- Already connected to this stylist (through another code): that connection, and nothing is consumed.
  select c.id into existing from public.pro_connections c
   where c.stylist_id = sid and c.client_id = uid and c.status = 'active';
  if found then
    return jsonb_build_object('ok', true, 'connectionId', existing, 'alreadyConnected', true);
  end if;
  update public.pro_invites set status = 'used', used_at = now() where id = inv.id and status = 'live';   -- 4.
  if not found then
    return invalid;                                                    --    nothing inserted yet
  end if;
  insert into public.pro_connections (stylist_id, client_id, stylist_label, client_alias, invite_id)
  values (sid, uid, s.display_name, alias, inv.id)
  returning id into cid;
  insert into public.pro_messages (connection_id, kind, code) values (cid, 'system', 'connected');
  return jsonb_build_object('ok', true, 'connectionId', cid, 'alreadyConnected', false);
end;
$$;

-- ─── Function privileges ────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_pro_status()',
    'public.get_pro_badge()',
    'public.accept_pro_terms(text, text, boolean)',
    'public.get_my_stylist_profile()',
    'public.save_stylist_profile(text, text, text, text[], text[], text, boolean)',
    'public.set_stylist_accepting(boolean)',
    'public.close_stylist_profile()',
    'public.create_pro_invite(uuid, text)',
    'public.list_my_pro_invites()',
    'public.revoke_pro_invite(uuid)',
    'public.preview_pro_invite(text)',
    'public.redeem_pro_invite(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
