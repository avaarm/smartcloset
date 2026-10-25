-- Professional accounts, part 7 of 8: work (looks, sessions, messages).
--
-- Group 6, 7 and 8 of pro-accounts.md 4.6: save/send/delete/list/get a look and the client's feedback on it; propose,
-- respond to, cancel and list sessions; send a message and read the thread.
--
-- Conventions every function here follows (4.1):
--   * The first statements are: uid := auth.uid(), the gate, the lookup of the caller's side of the connection, the
--     role's own gate, validation, the rate check, then the work. A raise rolls the whole call back, counter included, so
--     only successful actions are counted. The 'member' gate runs before the lookup (the switch, a suspension), the
--     role's gate (adult, terms, profile) after it, because the role is only known from the connection.
--   * Every write to a connection takes its locks in one order: the person's advisory lock (pro_lock_users), then the
--     connection row (select ... for update), then re-checks that the connection is still active, so a write that races
--     an end, a block or a suspension is refused with connection_ended and never lands after it. Nothing here takes the
--     connection row first and an advisory lock second.
--   * Creating calls take a client_ref and are idempotent on it. State changes are idempotent too: asking for the state
--     a row is already in returns success; recommendation_locked and appointment_closed are raised only for a
--     conflicting state.
--   * Reads of an ended connection's history use the safety gate for everyone (read-only until the janitor deletes it);
--     reads of an active connection use the caller's role gate. A connection with shell_at set (a block) is a closed
--     shell: no looks, sessions or messages, and every write answers connection_ended.
--   * A look keeps only the name and category of each piece (left(btrim(name), 120), left(category, 40)). What a
--     stylist reads back about a piece (color, brand, photo) comes only while pro_can_read_closet holds and the piece is
--     currently in the client's grant, from the same cleaners as get_client_closet. A storage path is returned only to
--     the client who owns the photo, never to a stylist.
--
-- Every UPDATE and DELETE has a WHERE (the API layer rejects a bare one). Safe to run twice.

-- ─── Group 6: looks ─────────────────────────────────────────────────────────

-- Creates a draft (p_id null, needs p_client_ref) or edits one (p_id given, drafts only). A save replaces the title and
-- the body; p_item_ids null leaves the pieces unchanged on an edit (and means none on a create), so a title-only edit
-- cannot wipe them, and an array, possibly empty, replaces them. Each piece must be the client's own and inside the
-- active grant right now (item_not_shared, DETAIL the position): for an 'all' grant there is no grant row to join, so
-- the ownership test is the guard, and a piece id seen elsewhere (a friend's closet, say) cannot be copied.
create or replace function public.save_pro_recommendation(
  p_connection uuid,
  p_id         uuid default null,
  p_title      text default null,
  p_body       text default '',
  p_item_ids   uuid[] default null,
  p_client_ref uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  c    public.pro_connections;
  r    public.pro_recommendations;
  ttl  text;
  ws   constant text := '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]';
  bdy  text := regexp_replace(coalesce(p_body, ''), '^' || ws || '+|' || ws || '+$', '', 'g');
  ids  uuid[];
  bad  integer;
  ctrl constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]';
begin
  perform public.pro_gate(uid, 'member');
  -- Text with nothing visible in it (spaces, new lines, zero-width characters) is no text at all.
  if public.swap_fold_text(bdy) ~ '^\s*$' then
    bdy := '';
  end if;
  select * into c from public.pro_connections x where x.id = p_connection and x.stylist_id = uid;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  perform public.pro_gate(uid, 'stylist');
  if p_id is null and p_client_ref is null then
    perform public.pro_raise('invalid_request', '22023', 'client_ref');
  end if;
  perform public.pro_lock_users(uid, uid);
  select * into c from public.pro_connections x where x.id = p_connection and x.stylist_id = uid for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null or c.client_id is null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  if public.is_blocked_between(c.stylist_id, c.client_id) then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;

  if p_id is null then
    -- A retry with the same ref returns the existing draft, before the cap and the counter, so it costs nothing.
    select * into r from public.pro_recommendations x where x.connection_id = p_connection and x.client_ref = p_client_ref;
    if found then
      return jsonb_build_object('id', r.id, 'status', r.status, 'updatedAt', r.updated_at);
    end if;
  else
    select * into r from public.pro_recommendations x where x.id = p_id and x.connection_id = p_connection for update;
    if not found then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
    if r.status <> 'draft' then
      perform public.pro_raise('recommendation_locked', '22023');
    end if;
  end if;

  ttl := public.pro_clean_name(p_title, 1, 80);
  if ttl is null then
    perform public.pro_raise('invalid_recommendation', '22023', 'title');
  end if;
  if char_length(bdy) > 1000 or bdy ~ ctrl then
    perform public.pro_raise('invalid_recommendation', '22023', 'body');
  end if;
  perform public.pro_require_text(ttl, 'title', 'chat');
  perform public.pro_require_text(bdy, 'body', 'chat');

  if p_item_ids is not null then
    if exists (select 1 from unnest(p_item_ids) e where e is null) then
      perform public.pro_raise('invalid_recommendation', '22023', 'items');
    end if;
    ids := array(select x.e from (select e, min(o) as o from unnest(p_item_ids) with ordinality as t(e, o) group by e) x
                  order by x.o);
    if cardinality(ids) > public.pro_limit('items_per_look') then
      perform public.pro_raise('invalid_recommendation', '22023', 'items');
    end if;
    if cardinality(ids) > 0 then
      select min(x.pos) into bad
        from unnest(ids) with ordinality as x(id, pos)
       where not exists (
         select 1 from public.clothing_items ci
           join public.pro_grants g on g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now()
          where ci.id = x.id and ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
            and (g.item_mode = 'all'
                 or exists (select 1 from public.pro_grant_items gi where gi.connection_id = c.id and gi.item_id = ci.id)));
      if bad is null and not public.pro_can_read_closet(c.stylist_id, c.client_id, c.id) then
        bad := 1;
      end if;
      if bad is not null then
        perform public.pro_raise('item_not_shared', '22023', bad::text);
      end if;
    end if;
  end if;

  if p_id is null then
    if (select count(*) from public.pro_recommendations x where x.connection_id = p_connection and x.status = 'draft')
         >= public.pro_limit('drafts_per_connection') then
      perform public.pro_raise('draft_limit', '54000');
    end if;
    perform public.pro_rate_check(uid, 'recommend_day');
    insert into public.pro_recommendations (connection_id, title, body, client_ref)
    values (p_connection, ttl, bdy, p_client_ref)
    on conflict (connection_id, client_ref) where client_ref is not null do nothing
    returning * into r;
    if not found then
      select * into r from public.pro_recommendations x where x.connection_id = p_connection and x.client_ref = p_client_ref;
      return jsonb_build_object('id', r.id, 'status', r.status, 'updatedAt', r.updated_at);
    end if;
  else
    perform public.pro_rate_check(uid, 'recommend_day');
    update public.pro_recommendations set title = ttl, body = bdy, updated_at = now()
     where id = p_id and connection_id = p_connection and status = 'draft'
    returning * into r;
    if not found then
      perform public.pro_raise('recommendation_locked', '22023');
    end if;
  end if;

  if p_item_ids is not null then
    delete from public.pro_recommendation_items where recommendation_id = r.id;
    insert into public.pro_recommendation_items (recommendation_id, position, item_id, name, category)
    select r.id, x.pos::smallint, ci.id, left(btrim(ci.name), 120), left(ci.category, 40)
      from unnest(ids) with ordinality as x(id, pos)
      join public.clothing_items ci on ci.id = x.id and ci.user_id = c.client_id
     order by x.pos;
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'updatedAt', r.updated_at);
end;
$$;

-- Makes a draft visible to the client. A look that is already sent, viewed or implemented returns success without
-- writing. A look needs a title (it always has one) and at least one piece or a non-empty body (recommendation_empty).
create or replace function public.send_pro_recommendation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   public.pro_connections;
  r   public.pro_recommendations;
begin
  perform public.pro_gate(uid, 'member');
  select x.* into r from public.pro_recommendations x
    join public.pro_connections k on k.id = x.connection_id
   where x.id = p_id and k.stylist_id = uid;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  perform public.pro_gate(uid, 'stylist');
  select * into c from public.pro_connections x where x.id = r.connection_id and x.stylist_id = uid for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null or c.client_id is null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  select * into r from public.pro_recommendations x where x.id = p_id for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if r.status <> 'draft' then
    return;
  end if;
  if r.body = '' and not exists (select 1 from public.pro_recommendation_items i where i.recommendation_id = r.id) then
    perform public.pro_raise('recommendation_empty', '22023');
  end if;
  perform public.pro_rate_check(uid, 'send_look_day');
  update public.pro_recommendations set status = 'sent', sent_at = now(), updated_at = now()
   where id = p_id and status = 'draft'
     and connection_id in (select k.id from public.pro_connections k where k.stylist_id = uid and k.status = 'active');
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  update public.pro_connections set last_activity_at = now(), updated_at = now()
   where id = c.id and stylist_id = uid;
end;
$$;

-- Drafts only. A sent look cannot be deleted (a typo means sending a new one).
create or replace function public.delete_pro_recommendation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   public.pro_connections;
  r   public.pro_recommendations;
begin
  perform public.pro_gate(uid, 'member');
  select x.* into r from public.pro_recommendations x
    join public.pro_connections k on k.id = x.connection_id
   where x.id = p_id and k.stylist_id = uid;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  perform public.pro_gate(uid, 'stylist');
  select * into c from public.pro_connections x where x.id = r.connection_id and x.stylist_id = uid for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  select * into r from public.pro_recommendations x where x.id = p_id for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if r.status <> 'draft' then
    perform public.pro_raise('recommendation_locked', '22023');
  end if;
  delete from public.pro_recommendations
   where id = p_id and status = 'draft'
     and connection_id in (select k.id from public.pro_connections k where k.stylist_id = uid);
end;
$$;

-- The looks of one connection, newest update first. The client sees only what was sent; the stylist sees all. For the
-- client the cover piece is their own first available piece and cover_photo_path is their own photo path; for the
-- stylist the cover piece comes only while pro_can_read_closet holds and the piece is currently in the grant, and
-- cover_photo_path is always null (a stylist is never given a path).
create or replace function public.list_pro_recommendations(p_connection uuid, p_before timestamptz default null, p_limit integer default 20)
returns table (rec_id uuid, status text, title text, item_count integer, cover_item_id uuid, cover_photo_path text,
               sent_at timestamptz, viewed_at timestamptz, updated_at timestamptz, client_rating smallint, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid      uuid := auth.uid();
  c        public.pro_connections;
  me       text;
  lim      integer := least(greatest(coalesce(p_limit, 20), 1), 40);
  can_read boolean := false;
begin
  perform public.pro_gate(uid, 'safety');
  perform public.pro_refresh(uid);
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  if c.shell_at is not null then
    return;
  end if;
  if c.status = 'active' then
    perform public.pro_gate(uid, me);
    can_read := me = 'stylist' and c.client_id is not null
                and public.pro_can_read_closet(c.stylist_id, c.client_id, c.id);
  end if;
  return query
  select r.id, r.status, r.title,
         (select count(*)::integer from public.pro_recommendation_items i where i.recommendation_id = r.id),
         cover.item_id,
         case when me = 'client' then cover.path end,
         r.sent_at, r.viewed_at, r.updated_at, r.client_rating,
         (me = 'client' and r.status = 'sent')
    from public.pro_recommendations r
    left join lateral (
      select i.item_id, public.pro_photo_path(ci.user_image, ci.user_id) as path
        from public.pro_recommendation_items i
        join public.clothing_items ci
          on ci.id = i.item_id and ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
       where i.recommendation_id = r.id
         and (me = 'client'
              or (can_read and exists (
                    select 1 from public.pro_grants g
                     where g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now()
                       and (g.item_mode = 'all'
                            or exists (select 1 from public.pro_grant_items gi
                                        where gi.connection_id = c.id and gi.item_id = ci.id)))))
       order by i.position
       limit 1) cover on true
   where r.connection_id = c.id
     and (me = 'stylist' or r.status <> 'draft')
     and (p_before is null or r.updated_at < p_before)
   order by r.updated_at desc, r.id
   limit lim;
end;
$$;

-- One look. For the client the first read of a sent look sets it viewed (an active connection only). A client never
-- sees a draft: for them it does not exist.
create or replace function public.get_pro_recommendation(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  c        public.pro_connections;
  r        public.pro_recommendations;
  me       text;
  live     boolean;
  can_read boolean := false;
  items    jsonb;
  has_item boolean;
begin
  perform public.pro_gate(uid, 'safety');
  select x.* into r from public.pro_recommendations x
    join public.pro_connections k on k.id = x.connection_id
   where x.id = p_id and (k.stylist_id = uid or k.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  select * into c from public.pro_connections x where x.id = r.connection_id;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  if c.shell_at is not null or (me = 'client' and r.status = 'draft') then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  live := c.status = 'active';
  if live then
    perform public.pro_gate(uid, me);
    can_read := me = 'stylist' and c.client_id is not null
                and public.pro_can_read_closet(c.stylist_id, c.client_id, c.id);
  end if;

  if me = 'client' and live and r.status = 'sent' then
    update public.pro_recommendations set status = 'viewed', viewed_at = now(), updated_at = now()
     where id = p_id and status = 'sent'
       and connection_id in (select k.id from public.pro_connections k where k.client_id = uid and k.status = 'active');
    select * into r from public.pro_recommendations x where x.id = p_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'position', i.position,
           'itemId', i.item_id,
           'name', case when me = 'client' then coalesce(ci.name, i.name) else i.name end,
           'category', case when me = 'client' then coalesce(ci.category, i.category) else i.category end,
           'color', case when f.shown then left(btrim(ci.color), 60) end,
           'brand', case when f.shown then left(btrim(ci.brand), 60) end,
           'hasPhoto', f.shown and public.pro_photo_path(ci.user_image, ci.user_id) is not null,
           'photoPath', case when me = 'client' and f.shown then public.pro_photo_path(ci.user_image, ci.user_id) end,
           'available', f.shown) order by i.position), '[]'::jsonb),
         exists (select 1 from public.pro_recommendation_items z where z.recommendation_id = r.id)
    into items, has_item
    from public.pro_recommendation_items i
    left join public.clothing_items ci
      on ci.id = i.item_id and ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
   cross join lateral (
     select ci.id is not null and (
              me = 'client'
              or (can_read and exists (
                    select 1 from public.pro_grants g
                     where g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now()
                       and (g.item_mode = 'all'
                            or exists (select 1 from public.pro_grant_items gi
                                        where gi.connection_id = c.id and gi.item_id = ci.id))))) as shown) f
   where i.recommendation_id = r.id;

  return jsonb_build_object(
    'id', r.id,
    'connectionId', r.connection_id,
    'status', r.status,
    'title', r.title,
    'body', r.body,
    'sentAt', r.sent_at,
    'viewedAt', r.viewed_at,
    'implementedAt', r.implemented_at,
    'items', items,
    'feedback', case when r.client_rating is not null or r.client_comment is not null
                     then jsonb_build_object('rating', r.client_rating, 'comment', r.client_comment, 'at', r.feedback_at) end,
    'actions', jsonb_build_object(
      'canEdit', me = 'stylist' and live and r.status = 'draft',
      'canSend', me = 'stylist' and live and r.status = 'draft' and (has_item or r.body <> ''),
      'canDelete', me = 'stylist' and live and r.status = 'draft',
      'canGiveFeedback', me = 'client' and live and r.status <> 'draft',
      'canMarkWorn', me = 'client' and live and r.status <> 'draft'));
end;
$$;

-- The client's rating (1 to 5), comment (up to 500 characters) and "I wore this". At least one argument must be given.
-- p_worn = true sets implemented; false returns an implemented look to viewed. A rating or a comment can be changed at
-- any time while the connection is active; a blank comment clears it.
create or replace function public.give_recommendation_feedback(
  p_id      uuid,
  p_rating  integer default null,
  p_comment text default null,
  p_worn    boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  c    public.pro_connections;
  r    public.pro_recommendations;
  ws   constant text := '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]';
  cmt  text := regexp_replace(p_comment, '^' || ws || '+|' || ws || '+$', '', 'g');
  ctrl constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]';
begin
  perform public.pro_gate(uid, 'member');
  if cmt is not null and public.swap_fold_text(cmt) ~ '^\s*$' then
    cmt := '';                                           -- nothing visible: it clears the comment
  end if;
  select x.* into r from public.pro_recommendations x
    join public.pro_connections k on k.id = x.connection_id
   where x.id = p_id and k.client_id = uid;
  if not found or r.status = 'draft' then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  perform public.pro_gate(uid, 'client');
  if p_rating is null and p_comment is null and p_worn is null then
    perform public.pro_raise('invalid_request', '22023', 'feedback');
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    perform public.pro_raise('invalid_request', '22023', 'rating');
  end if;
  if p_comment is not null then
    if char_length(cmt) > 500 or cmt ~ ctrl then
      perform public.pro_raise('invalid_request', '22023', 'comment');
    end if;
    perform public.pro_require_text(cmt, 'comment', 'chat');
  end if;
  select * into c from public.pro_connections x where x.id = r.connection_id and x.client_id = uid for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  perform public.pro_rate_check(uid, 'feedback_day');
  update public.pro_recommendations
     set client_rating = coalesce(p_rating::smallint, client_rating),
         client_comment = case when p_comment is null then client_comment else nullif(cmt, '') end,
         feedback_at = case when p_rating is not null or p_comment is not null then now() else feedback_at end,
         status = case when p_worn is true then 'implemented'
                       when p_worn is false and status = 'implemented' then 'viewed'
                       when status = 'sent' then 'viewed'
                       else status end,
         viewed_at = coalesce(viewed_at, case when status = 'sent' then now() end),
         implemented_at = case when p_worn is true then coalesce(implemented_at, now())
                               when p_worn is false then null
                               else implemented_at end,
         updated_at = now()
   where id = p_id and status in ('sent', 'viewed', 'implemented')
     and connection_id in (select k.id from public.pro_connections k where k.client_id = uid and k.status = 'active');
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
end;
$$;

-- ─── Group 7: sessions ──────────────────────────────────────────────────────

-- Either side proposes a time; the other confirms or declines. A session carries a start, a length (15 to 480 minutes in
-- steps of 15), a mode, a short place text and a short note, and the proposer's offset from UTC in minutes as a display
-- hint (never a zone name, which would tell the other person a city). No fee,
-- price, paid flag or link field exists. The place goes through the stranger-facing text filter (a phone number, link or
-- handle is refused; a street address is not detectable and is the people's own choice).
create or replace function public.propose_pro_appointment(
  p_connection       uuid,
  p_starts_at        timestamptz,
  p_duration_minutes integer,
  p_mode             text,
  p_place            text default '',
  p_note             text default '',
  p_utc_offset_minutes integer default 0,
  p_client_ref       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  c    public.pro_connections;
  a    public.pro_appointments;
  me   text;
  ws   constant text := '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]';
  pl   text := regexp_replace(coalesce(p_place, ''), '^' || ws || '+|' || ws || '+$', '', 'g');
  nt   text := regexp_replace(coalesce(p_note, ''), '^' || ws || '+|' || ws || '+$', '', 'g');
  ctrl constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]';
begin
  perform public.pro_gate(uid, 'member');
  if public.swap_fold_text(pl) ~ '^\s*$' then
    pl := '';
  end if;
  if public.swap_fold_text(nt) ~ '^\s*$' then
    nt := '';
  end if;
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  perform public.pro_gate(uid, me);
  if p_client_ref is null then
    perform public.pro_raise('invalid_request', '22023', 'client_ref');
  end if;
  perform public.pro_lock_users(uid, uid);
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid) for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null or c.stylist_id is null or c.client_id is null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  if public.is_blocked_between(c.stylist_id, c.client_id) then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;

  -- A retry with the same ref returns the existing session, before the cap and the counter.
  select * into a from public.pro_appointments x
   where x.connection_id = p_connection and x.proposed_by = me and x.client_ref = p_client_ref;
  if found then
    return jsonb_build_object('appointmentId', a.id, 'status', a.status);
  end if;

  if p_starts_at is null
     or p_starts_at < now() + make_interval(mins => public.pro_limit('appointment_lead_minutes'))
     or p_starts_at > now() + make_interval(days => public.pro_limit('appointment_max_days_ahead')) then
    perform public.pro_raise('invalid_appointment', '22023', 'starts_at');
  end if;
  if p_duration_minutes is null or p_duration_minutes < 15 or p_duration_minutes > 480 or p_duration_minutes % 15 <> 0 then
    perform public.pro_raise('invalid_appointment', '22023', 'duration');
  end if;
  if p_mode is null or p_mode not in ('virtual', 'in_person') then
    perform public.pro_raise('invalid_appointment', '22023', 'mode');
  end if;
  if p_utc_offset_minutes is null or p_utc_offset_minutes < -720 or p_utc_offset_minutes > 840
     or p_utc_offset_minutes % 15 <> 0 then
    perform public.pro_raise('invalid_appointment', '22023', 'utc_offset');
  end if;
  if char_length(pl) > 120 or pl ~ ctrl then
    perform public.pro_raise('invalid_appointment', '22023', 'place');
  end if;
  if char_length(nt) > 280 or nt ~ ctrl then
    perform public.pro_raise('invalid_appointment', '22023', 'note');
  end if;
  perform public.pro_require_text(pl, 'place', 'public');
  perform public.pro_require_text(nt, 'note', 'chat');
  if (select count(*) from public.pro_appointments x
       where x.connection_id = p_connection and x.status = 'proposed' and x.starts_at > now())
       >= public.pro_limit('appointments_open_per_connection') then
    perform public.pro_raise('appointment_open_limit', '54000');
  end if;
  perform public.pro_rate_check(uid, 'appointment_day');

  insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, place, note, utc_offset_minutes, client_ref)
  values (p_connection, me, p_starts_at, p_duration_minutes, p_mode, pl, nt, p_utc_offset_minutes, p_client_ref)
  on conflict (connection_id, proposed_by, client_ref) where client_ref is not null do nothing
  returning * into a;
  if not found then
    select * into a from public.pro_appointments x
     where x.connection_id = p_connection and x.proposed_by = me and x.client_ref = p_client_ref;
    return jsonb_build_object('appointmentId', a.id, 'status', a.status);
  end if;
  update public.pro_connections set last_activity_at = now(), updated_at = now() where id = p_connection;
  return jsonb_build_object('appointmentId', a.id, 'status', a.status);
end;
$$;

-- The side that did NOT propose a session answers it: confirm or decline. The session must be proposed and not yet
-- started (appointment_closed); asking for the state it is already in returns success. Confirming checks that the stylist
-- has no other confirmed session, in any of their connections, that overlaps it (appointment_conflict), under the lock
-- on the stylist and the client, so two clients confirming overlapping sessions cannot both succeed.
create or replace function public.respond_pro_appointment(p_appointment uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  c    public.pro_connections;
  a    public.pro_appointments;
  me   text;
  want text;
begin
  perform public.pro_gate(uid, 'member');
  if p_action is null or p_action not in ('confirm', 'decline') then
    perform public.pro_raise('invalid_request', '22023', 'action');
  end if;
  select x.* into a from public.pro_appointments x
    join public.pro_connections k on k.id = x.connection_id
   where x.id = p_appointment and (k.stylist_id = uid or k.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  select * into c from public.pro_connections x where x.id = a.connection_id;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  perform public.pro_gate(uid, me);
  perform public.pro_lock_users(c.stylist_id, c.client_id);
  select * into c from public.pro_connections x where x.id = a.connection_id for update;
  if c.status <> 'active' or c.shell_at is not null or c.stylist_id is null or c.client_id is null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  select * into a from public.pro_appointments x where x.id = p_appointment for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  want := case p_action when 'confirm' then 'confirmed' else 'declined' end;
  if a.status = want then
    return;
  end if;
  if a.status <> 'proposed' or a.starts_at <= now() or a.proposed_by = me then
    perform public.pro_raise('appointment_closed', '22023');
  end if;
  if p_action = 'confirm' and exists (
       select 1 from public.pro_appointments o
         join public.pro_connections oc on oc.id = o.connection_id
        where oc.stylist_id = c.stylist_id and o.status = 'confirmed' and o.id <> a.id
          and o.starts_at < a.starts_at + a.duration_minutes * interval '1 minute'
          and o.starts_at + o.duration_minutes * interval '1 minute' > a.starts_at) then
    perform public.pro_raise('appointment_conflict', '23505');
  end if;
  perform public.pro_rate_check(uid, 'respond_day');
  update public.pro_appointments set status = want, responded_at = now(), updated_at = now()
   where id = p_appointment and status = 'proposed' and starts_at > now() and proposed_by <> me
     and connection_id in (select k.id from public.pro_connections k
                            where k.status = 'active' and (k.stylist_id = uid or k.client_id = uid));
  if not found then
    perform public.pro_raise('appointment_closed', '22023');
  end if;
end;
$$;

-- Either side, before it starts, on an active connection. Cancelling a cancelled session returns success.
create or replace function public.cancel_pro_appointment(p_appointment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   public.pro_connections;
  a   public.pro_appointments;
  me  text;
begin
  perform public.pro_gate(uid, 'member');
  select x.* into a from public.pro_appointments x
    join public.pro_connections k on k.id = x.connection_id
   where x.id = p_appointment and (k.stylist_id = uid or k.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  select * into c from public.pro_connections x where x.id = a.connection_id;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  perform public.pro_gate(uid, me);
  select * into c from public.pro_connections x where x.id = a.connection_id for update;
  if c.status <> 'active' or c.shell_at is not null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  select * into a from public.pro_appointments x where x.id = p_appointment for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if a.status = 'cancelled' then
    return;
  end if;
  update public.pro_appointments set status = 'cancelled', updated_at = now()
   where id = p_appointment and status in ('proposed', 'confirmed') and starts_at > now()
     and connection_id in (select k.id from public.pro_connections k
                            where k.status = 'active' and (k.stylist_id = uid or k.client_id = uid));
  if not found then
    perform public.pro_raise('appointment_closed', '22023');
  end if;
end;
$$;

-- Sessions of one connection, or of all the caller's connections (a person who is both stylist and client sees both).
-- The status is the effective one: a proposal whose start has passed reads expired and a confirmed session past its end
-- reads completed, whether or not the upkeep has written that yet. upcoming: proposed or confirmed and not yet over,
-- soonest first. needs_me: proposed by the other side and not started. past: everything else, newest first, 30 rows.
-- The caller's role gate applies to active connections and the safety gate to ended ones; with no connection named, an
-- active connection whose role gate would refuse (a pause, a suspension, stale terms) contributes no rows, and a
-- connection that is a closed shell contributes none at all.
create or replace function public.list_pro_appointments(p_connection uuid default null, p_scope text default 'upcoming')
returns table (appointment_id uuid, connection_id uuid, other_label text, my_role text, status text, proposed_by text,
               starts_at timestamptz, duration_minutes smallint, mode text, place text, note text, utc_offset_minutes smallint,
               can_confirm boolean, can_decline boolean, can_cancel boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid         uuid := auth.uid();
  c           public.pro_connections;
  scope       text := coalesce(p_scope, 'upcoming');
  client_ok   boolean := true;
  stylist_ok  boolean := true;
begin
  perform public.pro_gate(uid, 'safety');
  if scope not in ('upcoming', 'needs_me', 'past') then
    perform public.pro_raise('invalid_request', '22023', 'scope');
  end if;
  perform public.pro_refresh(uid);
  if p_connection is not null then
    select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
    if not found then
      perform public.pro_raise('pro_unavailable', '22023');
    end if;
    if c.status = 'active' and c.shell_at is null then
      perform public.pro_gate(uid, case when c.stylist_id = uid then 'stylist' else 'client' end);
    end if;
  else
    begin
      perform public.pro_gate(uid, 'client');
    exception when others then
      client_ok := false;
    end;
    begin
      perform public.pro_gate(uid, 'stylist');
    exception when others then
      stylist_ok := false;
    end;
  end if;
  return query
  select s.id, s.connection_id, s.other_label, s.my_role, s.eff_status, s.proposed_by, s.starts_at, s.duration_minutes,
         s.mode, s.place, s.note, s.utc_offset_minutes,
         s.live and s.eff_status = 'proposed' and s.proposed_by <> s.my_role,
         s.live and s.eff_status = 'proposed' and s.proposed_by <> s.my_role,
         s.live and s.eff_status in ('proposed', 'confirmed') and s.starts_at > now(),
         s.created_at
    from (
      select a.id, a.connection_id, a.proposed_by, a.starts_at, a.duration_minutes, a.mode, a.place, a.note, a.utc_offset_minutes, a.created_at,
             k.my_role,
             case when k.my_role = 'client' then coalesce(k.stylist_label, 'Former stylist')
                  else coalesce(k.client_alias, 'Former client') end as other_label,
             (k.status = 'active') as live,
             a.starts_at + a.duration_minutes * interval '1 minute' as ends_at,
             case when a.status = 'confirmed' and a.starts_at + a.duration_minutes * interval '1 minute' < now() then 'completed'
                  when a.status = 'proposed' and a.starts_at <= now() then 'expired'
                  else a.status end as eff_status
        from public.pro_appointments a
        join (select x.id, x.status, x.shell_at, x.stylist_label, x.client_alias,
                     case when x.stylist_id = uid then 'stylist' else 'client' end as my_role
                from public.pro_connections x
               where (x.stylist_id = uid or x.client_id = uid)
                 and (p_connection is null or x.id = p_connection)
                 and x.shell_at is null
                 and (x.status = 'ended'
                      or (p_connection is not null)
                      or (x.stylist_id = uid and stylist_ok)
                      or (x.client_id = uid and client_ok))) k
          on k.id = a.connection_id) s
   where case scope
           when 'upcoming' then s.eff_status in ('proposed', 'confirmed') and s.ends_at > now()
           when 'needs_me' then s.live and s.eff_status = 'proposed' and s.proposed_by <> s.my_role
           else not (s.eff_status in ('proposed', 'confirmed') and s.ends_at > now())
         end
   order by case when scope = 'past' then null else s.starts_at end asc,
            case when scope = 'past' then s.starts_at end desc,
            s.id
   limit case when scope = 'past' then 30 else 200 end;
end;
$$;

-- ─── Group 8: messages ──────────────────────────────────────────────────────

-- Text only, 500 characters, 6 a minute, 60 an hour, 300 a day. Ordinary payment talk and contact details are allowed
-- between connected adults; scam and advance-fee phrases and blocked terms are refused. Idempotent on (sender, client_ref).
create or replace function public.send_pro_message(p_connection uuid, p_body text, p_client_ref uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  c    public.pro_connections;
  m    public.pro_messages;
  me   text;
  ws   constant text := '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]';
  bdy  text := regexp_replace(coalesce(p_body, ''), '^' || ws || '+|' || ws || '+$', '', 'g');
  ctrl constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]';
begin
  perform public.pro_gate(uid, 'member');
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  perform public.pro_gate(uid, me);
  if p_client_ref is null then
    perform public.pro_raise('invalid_request', '22023', 'client_ref');
  end if;
  if char_length(bdy) < 1 or char_length(bdy) > 500 or bdy ~ ctrl or public.swap_fold_text(bdy) ~ '^\s*$' then
    perform public.pro_raise('invalid_message', '22023', 'body');
  end if;
  perform public.pro_require_text(bdy, 'message', 'chat');
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid) for update;
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  if c.status <> 'active' or c.shell_at is not null or c.stylist_id is null or c.client_id is null then
    perform public.pro_raise('connection_ended', '22023');
  end if;
  if public.is_blocked_between(c.stylist_id, c.client_id) then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  -- A retry with the same ref returns the message that is already there, before the counters.
  select * into m from public.pro_messages x where x.sender_id = uid and x.client_ref = p_client_ref;
  if found then
    if m.connection_id <> p_connection then
      perform public.pro_raise('invalid_request', '22023', 'client_ref');
    end if;
    return jsonb_build_object('messageId', m.id, 'createdAt', m.created_at);
  end if;
  perform public.pro_rate_check(uid, 'message_min');
  perform public.pro_rate_check(uid, 'message_hour');
  perform public.pro_rate_check(uid, 'message_day');
  insert into public.pro_messages (connection_id, sender_id, kind, body, client_ref)
  values (p_connection, uid, 'text', bdy, p_client_ref)
  on conflict (sender_id, client_ref) where client_ref is not null do nothing
  returning * into m;
  if not found then
    select * into m from public.pro_messages x where x.sender_id = uid and x.client_ref = p_client_ref;
    return jsonb_build_object('messageId', m.id, 'createdAt', m.created_at);
  end if;
  update public.pro_connections set last_activity_at = now(), updated_at = now() where id = p_connection;
  return jsonb_build_object('messageId', m.id, 'createdAt', m.created_at);
end;
$$;

-- The thread of one connection, oldest first within a page.
--   no cursor    the latest p_limit messages; hasMore = older ones exist
--   p_after_id   the OLDEST p_limit messages newer than that id; hasMore = still newer ones exist (an app that was in the
--                background pages forward without a gap)
--   p_before_id  the newest p_limit messages older than that id; hasMore = still older ones exist ("Load earlier")
-- p_limit is clamped to 1..100; both cursors together is invalid_request. Messages are 'me', 'them' or 'system'; the
-- other side's account id is never returned and there are no read receipts. The caller's read pointer advances only when
-- the page contains something newer than it, so a poll that sees nothing new writes nothing. An active connection needs
-- the caller's role gate; an ended one only the safety gate (read-only until its messages are deleted); a closed shell
-- has no messages.
create or replace function public.get_pro_thread(
  p_connection uuid,
  p_after_id   bigint default null,
  p_before_id  bigint default null,
  p_limit      integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  c     public.pro_connections;
  me    text;
  lim   integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  ids   bigint[];
  more  boolean;
  msgs  jsonb;
  maxid bigint;
begin
  perform public.pro_gate(uid, 'safety');
  if p_after_id is not null and p_before_id is not null then
    perform public.pro_raise('invalid_request', '22023', 'cursor');
  end if;
  perform public.pro_refresh(uid);
  select * into c from public.pro_connections x where x.id = p_connection and (x.stylist_id = uid or x.client_id = uid);
  if not found then
    perform public.pro_raise('pro_unavailable', '22023');
  end if;
  me := case when c.stylist_id = uid then 'stylist' else 'client' end;
  if c.shell_at is not null then
    return jsonb_build_object('messages', '[]'::jsonb, 'hasMore', false, 'actions', jsonb_build_object('canSend', false));
  end if;
  if c.status = 'active' then
    perform public.pro_gate(uid, me);
  end if;

  if p_after_id is not null then
    ids := array(select m.id from public.pro_messages m
                  where m.connection_id = c.id and m.id > p_after_id order by m.id asc limit lim + 1);
    more := cardinality(ids) > lim;
    ids := ids[1:lim];
  else
    ids := array(select m.id from public.pro_messages m
                  where m.connection_id = c.id and (p_before_id is null or m.id < p_before_id) order by m.id desc limit lim + 1);
    more := cardinality(ids) > lim;
    ids := ids[1:lim];
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'from', case when m.kind = 'system' then 'system' when m.sender_id = uid then 'me' else 'them' end,
           'body', m.body,
           'code', m.code,
           'at', m.created_at) order by m.id), '[]'::jsonb),
         max(m.id)
    into msgs, maxid
    from public.pro_messages m where m.id = any(ids);

  if c.status = 'active' and maxid is not null then
    if me = 'client' then
      update public.pro_connections set client_seen_message_id = maxid
       where id = p_connection and client_id = uid and client_seen_message_id < maxid;
    else
      update public.pro_connections set stylist_seen_message_id = maxid
       where id = p_connection and stylist_id = uid and stylist_seen_message_id < maxid;
    end if;
  end if;
  return jsonb_build_object(
    'messages', msgs,
    'hasMore', coalesce(more, false),
    'actions', jsonb_build_object(
      'canSend', c.status = 'active' and c.stylist_id is not null and c.client_id is not null));
end;
$$;

-- ─── Function privileges ────────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.save_pro_recommendation(uuid, uuid, text, text, uuid[], uuid)',
    'public.send_pro_recommendation(uuid)',
    'public.delete_pro_recommendation(uuid)',
    'public.list_pro_recommendations(uuid, timestamptz, integer)',
    'public.get_pro_recommendation(uuid)',
    'public.give_recommendation_feedback(uuid, integer, text, boolean)',
    'public.propose_pro_appointment(uuid, timestamptz, integer, text, text, text, integer, uuid)',
    'public.respond_pro_appointment(uuid, text)',
    'public.cancel_pro_appointment(uuid)',
    'public.list_pro_appointments(uuid, text)',
    'public.send_pro_message(uuid, text, uuid)',
    'public.get_pro_thread(uuid, bigint, bigint, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
