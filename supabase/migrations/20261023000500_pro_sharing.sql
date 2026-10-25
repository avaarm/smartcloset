-- Professional accounts, part 6 of 8: sharing.
--
-- get_pro_grant, set_pro_grant, get_client_closet and pro_photo_source (pro-accounts.md 4.6, group 5, and B.6).
--
-- Connecting shares nothing. A stylist sees a client's closet only while the client has switched it on for that
-- connection: all pieces or chosen pieces, never the wishlist, for 90 days, revocable at any moment. The grant is read
-- in one place, pro_can_read_closet (file 2); get_client_closet and pro_photo_source both ask it on every call, so
-- turning sharing off, ending, a block, a suspension and the global switch each stop the next read at once.
--
--   * Turning sharing OFF is a way out: the safety gate (signed in, nothing else), no text version, no rate limit. It
--     works under the kill switch, a suspension, stale terms and any build, writes no message and does not move the
--     connection in the stylist's list.
--   * Turning it ON needs the client gate, an explicit choice of pieces (no default), and the build's share text
--     version. Editing the pieces keeps the original expiry; only p_renew sets a new 90 days.
--   * No function an app user can call returns a storage path, a link or an account id. The photo of a shared piece
--     reaches a stylist through the pro-photo edge function, which asks pro_photo_source (service role only) on every
--     request. No storage policy is added here or anywhere in the pro files.
--   * get_client_closet selects a fixed list of columns and never select *. Text the client typed is cleaned and capped
--     before a stylist sees it. Never returned: price, cost, estimated value, notes, tags, tag text, wear data,
--     favourite, retailer, date added, the gallery, the wishlist, any photo address.
--
-- Every UPDATE and DELETE has a WHERE (the API layer rejects a bare one). Safe to run twice.

-- ─── What a client has switched on ─────────────────────────────────────────

-- Participant; the safety gate, so a client can always see what is shared (and switch it off) from any build. The client
-- sees the whole record and the log of changes; the stylist sees only whether the closet is readable now, how many
-- pieces and when it ends, and never why it is off (revoked, expired and ended all read "not shared").
create or replace function public.get_pro_grant(p_connection uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  c           public.pro_connections;
  me          text;
  g           public.pro_grants;
  have_grant  boolean := false;
  readable    boolean := false;
  n_items     integer;
  last_viewed timestamptz;
  views30     integer := 0;
  item_ids    jsonb := null;
  events      jsonb := '[]'::jsonb;
begin
  perform public.pro_gate(uid, 'safety');
  perform public.pro_refresh(uid);
  select * into c from public.pro_connections x
   where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;

  if c.status = 'active' and c.shell_at is null then
    select * into g from public.pro_grants pg
     where pg.connection_id = c.id and pg.scope = 'closet' and pg.expires_at > now();
    have_grant := found;
  end if;
  if have_grant then
    if g.item_mode = 'selected' then
      select count(*)::integer, coalesce(jsonb_agg(gi.item_id order by gi.item_id), '[]'::jsonb)
        into n_items, item_ids
        from public.pro_grant_items gi where gi.connection_id = c.id;
    else
      select count(*)::integer into n_items from public.clothing_items ci
       where ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false;
    end if;
  end if;

  if me = 'stylist' then
    -- Whether the closet can be read right now is the one rule of file 2; every reason it cannot is the same answer.
    readable := have_grant and c.client_id is not null and c.stylist_id is not null
                and public.pro_can_read_closet(c.stylist_id, c.client_id, c.id);
    return jsonb_build_object(
      'scope', 'closet',
      'enabled', readable,
      'itemMode', case when readable then g.item_mode end,
      'itemCount', case when readable then n_items end,
      'expiresAt', case when readable then g.expires_at end);
  end if;

  if c.shell_at is null then
    select max(v.last_at) into last_viewed from public.pro_closet_views v where v.connection_id = c.id;
    select coalesce(sum(v.pages), 0)::integer into views30
      from public.pro_closet_views v where v.connection_id = c.id and v.day > current_date - 30;
    select coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'itemMode', e.item_mode,
                                                 'itemCount', e.item_count, 'at', e.created_at) order by e.id desc),
                    '[]'::jsonb)
      into events
      from (select ge.* from public.pro_grant_events ge
             where ge.connection_id = c.id order by ge.id desc limit 20) e;
  end if;
  return jsonb_build_object(
    'scope', 'closet',
    'enabled', have_grant,
    'itemMode', case when have_grant then g.item_mode end,
    'itemIds', case when have_grant and g.item_mode = 'selected' then item_ids end,
    'itemCount', case when have_grant then n_items end,
    'grantedAt', case when have_grant then g.granted_at end,
    'expiresAt', case when have_grant then g.expires_at end,
    'expiresSoon', have_grant and g.expires_at <= now() + make_interval(days => public.pro_limit('grant_warn_days')),
    'textVersion', case when have_grant then g.text_version end,
    'lastViewedAt', last_viewed,
    'views30d', views30,
    'events', events);
end;
$$;

-- Turns closet sharing on, changes it, renews it, or turns it off. The client of the connection only.
--   Disabling (p_enabled = false): gate safety; needs no text version; not rate limited; deletes the grant and its
--     pieces and appends a 'revoked' event (only if a grant existed); writes no system line and leaves last_activity_at
--     alone, so the stylist is not told; on an ended connection it is a no-op.
--   Enabling: gate client; p_item_mode is required and has no default, so the app must ask ('all' includes pieces
--     added while sharing is on, 'selected' needs 1 to grant_items_max distinct pieces of the caller's closet, none of
--     them wishlist); p_text_version must be the server's share text version. A new grant lasts grant_days. Changing
--     the mode or the pieces of a live grant KEEPS its expiry; only p_renew = true sets a new one, so editing pieces can
--     never silently renew consent. Events: granted the first time, renewed after a renewal, changed after a change.
--     One neutral system line 'sharing_on' is written only when sharing goes from off to on, at most once per
--     connection per 24 hours; changes, renewals, revocation and expiry write none, so a stylist cannot tell a
--     revocation from an expiry. Returns the client shape of get_pro_grant.
-- Locks: the person's advisory lock, then the connection row (the order every pro write uses), then re-checks 'active', so
-- a call that races an end, block or suspension is refused and never lands after it.
create or replace function public.set_pro_grant(
  p_connection   uuid,
  p_scope        text,
  p_enabled      boolean,
  p_item_mode    text default null,
  p_item_ids     uuid[] default null,
  p_text_version text default null,
  p_renew        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  c        public.pro_connections;
  g        public.pro_grants;
  ids      uuid[];
  n_found  integer;
  was_live boolean;
  changed  boolean;
  ev       text;
begin
  perform public.pro_gate(uid, 'safety');
  if p_enabled is null then
    perform public.pro_raise('invalid_request', '22023', 'enabled');
  end if;
  if p_scope is distinct from 'closet' then
    perform public.pro_raise('invalid_request', '22023', 'scope');
  end if;
  if p_enabled then
    perform public.pro_gate(uid, 'client');
  end if;
  select * into c from public.pro_connections x where x.id = p_connection and x.client_id = uid;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;

  if not p_enabled then
    select * into c from public.pro_connections x where x.id = p_connection and x.client_id = uid for update;
    if found and c.status = 'active' and c.shell_at is null then
      -- A grant that had already run out is cleared with its own event; only a live one is "revoked".
      with gone as (
        delete from public.pro_grants
         where connection_id = c.id and scope = 'closet' and expires_at <= now()
        returning connection_id, scope)
      insert into public.pro_grant_events (connection_id, scope, event)
        select x.connection_id, x.scope, 'expired' from gone x;
      delete from public.pro_grant_items where connection_id = c.id;
      delete from public.pro_grants where connection_id = c.id and scope = 'closet';
      if found then
        insert into public.pro_grant_events (connection_id, scope, event) values (c.id, 'closet', 'revoked');
      end if;
    end if;
    return public.get_pro_grant(p_connection);
  end if;

  -- Enabling. The caller must choose; there is no default.
  if p_item_mode is null or p_item_mode not in ('all', 'selected') then
    perform public.pro_raise('invalid_request', '22023', 'item_mode');
  end if;
  if p_item_mode = 'selected' then
    if p_item_ids is null or exists (select 1 from unnest(p_item_ids) e where e is null) then
      perform public.pro_raise('invalid_request', '22023', 'item_ids');
    end if;
    ids := array(select x.e from (select e, min(o) as o from unnest(p_item_ids) with ordinality as t(e, o) group by e) x
                  order by x.o);
    if cardinality(ids) < 1 or cardinality(ids) > public.pro_limit('grant_items_max') then
      perform public.pro_raise('invalid_request', '22023', 'item_ids');
    end if;
  end if;
  -- The version the app sends is its own build's, never the server's value: a client can only agree to text shown to them.
  if p_text_version is distinct from (public.pro_cfg('share_text_version') #>> '{}') then
    perform public.pro_raise('stale_consent_text', '22023');
  end if;
  perform public.pro_rate_check(uid, 'grant_day');
  perform public.pro_lock_users(uid, uid);
  select * into c from public.pro_connections x where x.id = p_connection and x.client_id = uid for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null or c.stylist_id is null then
    perform public.pro_raise('connection_ended', '22023');
  end if;

  if p_item_mode = 'selected' then
    -- Every piece is the caller's own and not a wishlist piece. A key-share lock keeps a piece from being deleted
    -- between this check and the insert below.
    select count(*)::integer into n_found from (
      select 1 from public.clothing_items ci
       where ci.id = any(ids) and ci.user_id = uid and coalesce(ci.is_wishlist, false) = false
         for key share) s;
    if n_found <> cardinality(ids) then
      perform public.pro_raise('item_not_found', '22023', (cardinality(ids) - n_found)::text);
    end if;
  end if;

  -- A grant row that ran out but was not swept yet is cleared with its event first: enabling then starts a new grant.
  with gone as (
    delete from public.pro_grants
     where connection_id = c.id and scope = 'closet' and expires_at <= now()
    returning connection_id, scope)
  insert into public.pro_grant_events (connection_id, scope, event)
    select x.connection_id, x.scope, 'expired' from gone x;
  select * into g from public.pro_grants pg where pg.connection_id = c.id and pg.scope = 'closet';
  was_live := found;
  changed := was_live and (
    g.item_mode is distinct from p_item_mode
    or (p_item_mode = 'selected'
        and array(select gi.item_id from public.pro_grant_items gi where gi.connection_id = c.id order by gi.item_id)
            is distinct from array(select e from unnest(ids) e order by e)));

  insert into public.pro_grants (connection_id, scope, item_mode, granted_at, expires_at, text_version)
  values (c.id, 'closet', p_item_mode, now(), now() + make_interval(days => public.pro_limit('grant_days')), p_text_version)
  on conflict (connection_id, scope) do update
     set item_mode = excluded.item_mode,
         text_version = excluded.text_version,
         expires_at = case when coalesce(p_renew, false) then excluded.expires_at else pro_grants.expires_at end;
  delete from public.pro_grant_items where connection_id = c.id;
  if p_item_mode = 'selected' then
    insert into public.pro_grant_items (connection_id, item_id) select c.id, e from unnest(ids) e;
  end if;

  ev := case when not was_live then 'granted'
             when coalesce(p_renew, false) then 'renewed'
             when changed then 'changed' end;
  if ev is not null then
    insert into public.pro_grant_events (connection_id, scope, event, item_mode, item_count, text_version)
    values (c.id, 'closet', ev, p_item_mode, case when p_item_mode = 'selected' then cardinality(ids) end, p_text_version);
  end if;
  if not was_live and not exists (
       select 1 from public.pro_messages m
        where m.connection_id = c.id and m.kind = 'system' and m.code = 'sharing_on'
          and m.created_at > now() - interval '24 hours') then
    insert into public.pro_messages (connection_id, kind, code) values (c.id, 'system', 'sharing_on');
  end if;
  return public.get_pro_grant(p_connection);
end;
$$;

-- ─── What a stylist can see ─────────────────────────────────────────────────

-- A page of the pieces a client has shared with the caller. The stylist of an active connection only; gate stylist.
-- Allowed only while pro_can_read_closet holds: closet_not_shared when the connection is active and unblocked but
-- there is no live grant, pro_unavailable for everything else (not found, not yours, ended, a shell, blocked).
-- p_limit is clamped to 1..closet_page_size; p_offset is at least 0 and, when it points past the end, is moved to the
-- last page (the app merges pages by item_id), so total_count is present whenever the grant has pieces. The rows are
-- the client's pieces that are not wishlist pieces, restricted to the chosen ones when item_mode is 'selected', newest
-- first. Text the client typed is unfiltered, so it is cleaned and capped here; pro_text_ok is not applied to it (it is
-- the client's own description of their own things). has_photo says whether the piece has a cover photo in the
-- client's own folder; the photo itself comes from the pro-photo function by connection and piece, never as a path.
-- Limits: closet_page_day per person, and closet_pages_connection_day per connection (closet_page_limit), the second
-- read from today's pro_closet_views row, because pro_rate_check has no connection argument.
create or replace function public.get_client_closet(p_connection uuid, p_offset integer default 0, p_limit integer default 60)
returns table (item_id uuid, name text, category text, subcategory text, color text, brand text, season jsonb,
               pattern text, material text, materials jsonb, size text, condition text, has_photo boolean,
               total_count integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid   uuid := auth.uid();
  c     public.pro_connections;
  g     public.pro_grants;
  lim   integer := least(greatest(coalesce(p_limit, public.pro_limit('closet_page_size')), 1),
                         public.pro_limit('closet_page_size'));
  skip  integer := greatest(coalesce(p_offset, 0), 0);
  total integer;
  today integer;
begin
  perform public.pro_gate(uid, 'stylist');
  select * into c from public.pro_connections x where x.id = p_connection and x.stylist_id = uid;
  if not found or c.status <> 'active' or c.shell_at is not null or c.client_id is null
     or public.is_blocked_between(uid, c.client_id) then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if not public.pro_can_read_closet(uid, c.client_id, c.id) then
    if not exists (select 1 from public.pro_grants pg
                    where pg.connection_id = c.id and pg.scope = 'closet' and pg.expires_at > now()) then
      perform public.pro_raise('closet_not_shared', '42501');
    end if;
    perform public.pro_raise('pro_unavailable', '22023');
  end if;

  select v.pages into today from public.pro_closet_views v where v.connection_id = c.id and v.day = current_date;
  if coalesce(today, 0) >= public.pro_limit('closet_pages_connection_day') then
    perform public.pro_raise('closet_page_limit', '54000');
  end if;
  perform public.pro_rate_check(uid, 'closet_page_day');

  select * into g from public.pro_grants pg where pg.connection_id = c.id and pg.scope = 'closet';
  select count(*)::integer into total
    from public.clothing_items ci
   where ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
     and (g.item_mode = 'all'
          or exists (select 1 from public.pro_grant_items gi where gi.connection_id = c.id and gi.item_id = ci.id));
  if total > 0 and skip >= total then
    skip := ((total - 1) / lim) * lim;
  end if;

  insert into public.pro_closet_views (connection_id, day, pages, last_at)
  values (c.id, current_date, 1, now())
  on conflict (connection_id, day) do update
     set pages = pro_closet_views.pages + 1, last_at = now();

  return query
  select ci.id,
         left(btrim(ci.name), 120),
         left(btrim(ci.category), 60),
         left(btrim(ci.subcategory), 60),
         left(btrim(ci.color), 60),
         left(btrim(ci.brand), 60),
         public.pro_clean_season(ci.season),
         left(btrim(ci.pattern), 60),
         left(btrim(ci.material), 60),
         public.pro_clean_materials(ci.materials),
         left(btrim(ci.size), 60),
         left(btrim(ci.condition), 60),
         public.pro_photo_path(ci.user_image, ci.user_id) is not null,
         total
    from public.clothing_items ci
   where ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
     and (g.item_mode = 'all'
          or exists (select 1 from public.pro_grant_items gi where gi.connection_id = c.id and gi.item_id = ci.id))
   order by ci.date_added desc nulls last, ci.id
   limit lim offset skip;
end;
$$;

-- Called only by the pro-photo edge function, with the user id it read from the verified token and the service key.
-- Returns the storage path <client account id>/<file> inside wardrobe-images, or null. A path comes back only when
-- p_uid is the stylist of the active, non-shell connection, the stylist's own gate still lets them in, the closet can
-- be read right now (pro_can_read_closet), and the piece is that client's, not a wishlist piece, inside the grant
-- (item_mode 'all', or listed in pro_grant_items) and has a cover photo in the client's own folder. EVERY refusal is the
-- same null, so nothing is learned from the difference. Counts photo_day for p_uid on success only; the function maps
-- pro_rate_limited to HTTP 429. An app user who could call this would read a storage path, which carries the client's
-- account id, so it is granted to the service role only.
create or replace function public.pro_photo_source(p_uid uuid, p_connection uuid, p_item uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c    public.pro_connections;
  path text;
begin
  if p_uid is null or p_connection is null or p_item is null then
    return null;
  end if;
  begin
    perform public.pro_gate(p_uid, 'stylist');
  exception when others then
    return null;
  end;
  select * into c from public.pro_connections x
   where x.id = p_connection and x.stylist_id = p_uid and x.status = 'active' and x.shell_at is null;
  if not found or c.client_id is null or not public.pro_can_read_closet(c.stylist_id, c.client_id, c.id) then
    return null;
  end if;
  select public.pro_photo_path(ci.user_image, ci.user_id) into path
    from public.clothing_items ci
   where ci.id = p_item and ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
     and (exists (select 1 from public.pro_grants g
                   where g.connection_id = c.id and g.scope = 'closet' and g.item_mode = 'all')
          or exists (select 1 from public.pro_grant_items gi where gi.connection_id = c.id and gi.item_id = ci.id));
  if path is null then
    return null;                                                     -- every refusal looks the same
  end if;
  perform public.pro_rate_check(p_uid, 'photo_day');                 -- counted on success only
  return path;
end;
$$;

-- ─── Function privileges ────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_pro_grant(uuid)',
    'public.set_pro_grant(uuid, text, boolean, text, uuid[], text, boolean)',
    'public.get_client_closet(uuid, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- Service role only: an app user could otherwise read a storage path.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pro_photo_source(uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
