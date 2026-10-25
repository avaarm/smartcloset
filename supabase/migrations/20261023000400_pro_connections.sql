-- Professional accounts, part 5 of 8: connections.
--
-- list_pro_connections, get_pro_connection, end_pro_connection, set_pro_alias (pro-accounts.md 4.6, group 4).
--
-- Who the other person is, is a label the server computes: the stylist's display name (copied into stylist_label) or
-- the client's chosen alias. No function here returns an account id, an email or a phone number.
--
-- The reads that describe a connection, and ending one, use the safety gate: signed in, nothing else. A paused
-- feature, a suspension, stale terms or an old build can never trap a person who wants to see what is shared, end the
-- connection, or read how it ended. When the role's own gate would refuse, get_pro_connection still answers with
-- safetyOnly = true, no profile text and reduced actions, and list_pro_connections returns no message previews.
--
-- A connection with shell_at set (a block) reads as a closed shell: status ended, the label "Former stylist" or
-- "Former client", no profile, no counts, every action false. The decision is read from the stored column on every
-- path and never recomputed from user_blocks, so unblocking changes nothing.
--
-- Safe to run twice.

create or replace function public.list_pro_connections(p_as text default 'client')
returns table (connection_id uuid, my_role text, other_label text, other_headline text, status text, ended_by text,
               started_at timestamptz, ended_at timestamptz, last_activity_at timestamptz, unread integer,
               attention boolean, next_appointment_at timestamptz, pending_appointments integer, closet_shared boolean,
               closet_expires_at timestamptz, last_message_preview text, last_message_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid     uuid := auth.uid();
  gate_ok boolean := true;
begin
  perform public.pro_gate(uid, 'safety');
  if p_as is null or p_as not in ('client', 'stylist') then
    perform public.pro_raise('invalid_request', '22023', 'as');
  end if;
  perform public.pro_refresh(uid);
  -- What the role's own gate would say: previews and profile text are shown only when it would let this person in.
  begin
    perform public.pro_gate(uid, p_as);
  exception when others then
    gate_ok := false;
  end;
  return query
  select c.id,
         p_as,
         case when c.shell_at is not null then case when p_as = 'client' then 'Former stylist' else 'Former client' end
              when p_as = 'client' then coalesce(c.stylist_label, 'Former stylist')
              else coalesce(c.client_alias, 'Former client') end,
         case when p_as = 'client' and gate_ok and c.shell_at is null and c.status = 'active'
              then (select sp.headline from public.pro_stylists sp where sp.user_id = c.stylist_id) end,
         c.status,
         -- Never 'system': a suspension or a removal is a moderation decision and nobody on the other side learns it. A
         -- system ending reads as the other person's, exactly as get_pro_connection says it.
         case when c.ended_by = 'system' then (case when p_as = 'client' then 'stylist' else 'client' end)
              else c.ended_by end,
         c.started_at, c.ended_at, c.last_activity_at,
         x.unread_n,
         (x.unread_n > 0 or x.pending_n > 0 or x.looks_new),
         x.next_at,
         x.pending_n,
         x.shared,
         x.shared_until,
         case when gate_ok and c.shell_at is null then left(x.last_body, 80) end,
         case when gate_ok and c.shell_at is null then x.last_at end
    from public.pro_connections c
   cross join lateral (
     select
       case when c.status = 'active' and c.shell_at is null then
         (select count(*)::integer from public.pro_messages m
           where m.connection_id = c.id and m.kind = 'text' and m.sender_id is distinct from uid
             and m.id > case when p_as = 'client' then c.client_seen_message_id else c.stylist_seen_message_id end)
       else 0 end as unread_n,
       case when c.status = 'active' and c.shell_at is null then
         (select count(*)::integer from public.pro_appointments a
           where a.connection_id = c.id and a.status = 'proposed' and a.starts_at > now()
             and a.proposed_by <> p_as)
       else 0 end as pending_n,
       (p_as = 'client' and c.status = 'active' and c.shell_at is null
          and exists (select 1 from public.pro_recommendations r where r.connection_id = c.id and r.status = 'sent')) as looks_new,
       case when c.shell_at is null then
         (select min(a.starts_at) from public.pro_appointments a
           where a.connection_id = c.id and a.status = 'confirmed'
             and a.starts_at + a.duration_minutes * interval '1 minute' > now())
       end as next_at,
       (c.status = 'active' and c.shell_at is null
          and exists (select 1 from public.pro_grants g
                       where g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now())) as shared,
       case when c.status = 'active' and c.shell_at is null then
         (select g.expires_at from public.pro_grants g
           where g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now())
       end as shared_until,
       (select m.body from public.pro_messages m
         where m.connection_id = c.id and m.kind = 'text' order by m.id desc limit 1) as last_body,
       (select m.created_at from public.pro_messages m
         where m.connection_id = c.id and m.kind = 'text' order by m.id desc limit 1) as last_at
   ) x
   where (p_as = 'client' and c.client_id = uid) or (p_as = 'stylist' and c.stylist_id = uid)
   order by (c.status = 'ended'), c.last_activity_at desc, c.id;
end;
$$;

create or replace function public.get_pro_connection(p_connection uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  c            public.pro_connections;
  me           text;
  gate_ok      boolean := true;
  shell        boolean;
  live         boolean;
  g            public.pro_grants;
  have_grant   boolean := false;
  s            public.pro_stylists;
  have_profile boolean := false;
  n_items      integer;
  last_viewed  timestamptz;
  views30      integer := 0;
  looks        integer := 0;
  upcoming     integer := 0;
  stylist_obj  jsonb := null;
begin
  perform public.pro_gate(uid, 'safety');
  perform public.pro_refresh(uid);
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  begin
    perform public.pro_gate(uid, me);
  exception when others then
    gate_ok := false;
  end;
  shell := c.shell_at is not null;
  live := c.status = 'active' and not shell;

  if live then
    select * into g from public.pro_grants pg
     where pg.connection_id = c.id and pg.scope = 'closet' and pg.expires_at > now();
    have_grant := found;
    if have_grant then
      n_items := case when g.item_mode = 'selected'
                      then (select count(*)::integer from public.pro_grant_items gi where gi.connection_id = c.id)
                      else (select count(*)::integer from public.clothing_items ci
                             where ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false) end;
    end if;
  end if;
  if me = 'client' and not shell then
    select max(v.last_at) into last_viewed from public.pro_closet_views v where v.connection_id = c.id;
    select coalesce(sum(v.pages), 0)::integer into views30
      from public.pro_closet_views v where v.connection_id = c.id and v.day > current_date - 30;
  end if;
  if not shell then
    select count(*)::integer into looks from public.pro_recommendations r
     where r.connection_id = c.id and (me = 'stylist' or r.status <> 'draft');
    select count(*)::integer into upcoming from public.pro_appointments a
     where a.connection_id = c.id and a.status in ('proposed', 'confirmed')
       and a.starts_at + a.duration_minutes * interval '1 minute' > now();
  end if;
  -- The stylist's profile text, to the client, while the connection is live and the client's own gate would let them in.
  if me = 'client' and live and gate_ok then
    select * into s from public.pro_stylists sp where sp.user_id = c.stylist_id;
    have_profile := found;
    if have_profile then
      stylist_obj := jsonb_build_object(
        'name', s.display_name, 'headline', s.headline, 'bio', s.bio,
        'services', to_jsonb(s.services), 'languages', to_jsonb(s.languages), 'ratesText', s.rates_text);
    end if;
  end if;

  return jsonb_build_object(
    'connectionId', c.id,
    'myRole', me,
    'status', c.status,
    'endedBy', case when c.status <> 'ended' then null
                    when c.ended_by = me then 'me'
                    else 'them' end,
    'startedAt', c.started_at,
    'endedAt', c.ended_at,
    'otherLabel', case when shell then case when me = 'client' then 'Former stylist' else 'Former client' end
                       when me = 'client' then coalesce(c.stylist_label, 'Former stylist')
                       else coalesce(c.client_alias, 'Former client') end,
    'myAlias', case when me = 'client' and not shell then c.client_alias end,
    'safetyOnly', not gate_ok,
    'stylist', stylist_obj,
    'closet', jsonb_build_object(
      'shared', have_grant,
      'itemMode', case when have_grant then g.item_mode end,
      'itemCount', case when have_grant then n_items end,
      'expiresAt', case when have_grant then g.expires_at end,
      'expiresSoon', have_grant and g.expires_at <= now() + make_interval(days => public.pro_limit('grant_warn_days')),
      'lastViewedAt', case when me = 'client' and not shell then last_viewed end,
      'views30d', views30),
    'counts', jsonb_build_object('looks', looks, 'upcoming', upcoming),
    'actions', jsonb_build_object(
      'canMessage', live and gate_ok,
      'canPropose', live and gate_ok,
      'canRecommend', live and gate_ok and me = 'stylist',
      'canEnd', live,
      'canViewCloset', live and gate_ok and me = 'stylist' and have_grant,
      'canShare', live and gate_ok and me = 'client',
      'canStopSharing', live and me = 'client' and have_grant,
      'canRename', live and gate_ok and me = 'client'));
end;
$$;

-- Ending is a way out: the safety gate (it works under a pause, a suspension, stale terms and any build). Already
-- ended is a no-op and is not counted against the limit.
create or replace function public.end_pro_connection(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   public.pro_connections;
begin
  perform public.pro_gate(uid, 'safety');
  select * into c from public.pro_connections x
   where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid) for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status = 'ended' then
    return;
  end if;
  perform public.pro_rate_check(uid, 'end_day');
  perform public.pro_end_connection(c.id, case when c.stylist_id = uid then 'stylist' else 'client' end);
end;
$$;

-- The name the client chose to show the stylist. The client of an active connection only.
create or replace function public.set_pro_alias(p_connection uuid, p_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  c     public.pro_connections;
  alias text;
begin
  perform public.pro_gate(uid, 'client');
  select * into c from public.pro_connections x
   where x.id = p_connection and x.client_id = uid for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  alias := public.pro_clean_name(p_alias, 2, 30);
  if alias is null then
    perform public.pro_raise('invalid_alias', '22023');
  end if;
  if not public.pro_name_ok(alias) then
    perform public.pro_raise('text_not_allowed', '22023', 'alias', 'name');   -- a stylist reads this as the client's name
  end if;
  perform public.pro_require_text(alias, 'alias', 'public');
  perform public.pro_rate_check(uid, 'alias_day');
  update public.pro_connections set client_alias = alias, updated_at = now()
   where id = p_connection and client_id = uid and status = 'active';
end;
$$;

-- ─── Function privileges ────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.list_pro_connections(text)',
    'public.get_pro_connection(uuid)',
    'public.end_pro_connection(uuid)',
    'public.set_pro_alias(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
