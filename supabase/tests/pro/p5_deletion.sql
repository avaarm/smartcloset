-- p5_deletion (files 1 to 8)
--   A  a client deletes the account (the real delete_user_account()), then the stylist
--   B  the stylist of another pair deletes, then that pair's client
--   C  nothing is left when everyone is gone
--   D  a failure inside pro_on_member_left (the trigger swallows its errors, so a deletion never fails because of it)
--      leaves an active connection with a null side, which the next read of the other person repairs

select t.as_admin();
create function t.c(p_name text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_name $$;

-- The number of rows in all pro tables that name a person, found by the catalogue (every foreign key from a pro table to
-- auth.users), not by a list written by hand.
create function t.rows_for(p_uid uuid) returns bigint language plpgsql as $$
declare r record; n bigint; total bigint := 0;
begin
  for r in
    select k.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.conrelid::regclass::text like 'pro\_%'
  loop
    execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into n using p_uid;
    total := total + n;
  end loop;
  return total;
end $$;
create function t.person_columns() returns bigint language sql stable as $$
  select count(*) from pg_constraint k
   where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.conrelid::regclass::text like 'pro\_%' $$;
-- Rows of content under a connection (messages/looks/sessions/counters/events/grants/pieces).
create function t.content(p_conn uuid) returns text language sql stable as $$
  select (select count(*) from public.pro_messages where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_recommendations where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_appointments where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_closet_views where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_grant_events where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_grants where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_grant_items where connection_id = p_conn) $$;

-- Content for a connection, made directly: a message from each side, a sent look with a piece, a draft, a confirmed
-- session, a view counter, and a grant with one piece and its event.
create function t.fill(p_conn uuid) returns void language plpgsql as $$
declare c public.pro_connections; rid uuid; iid uuid;
begin
  select * into c from public.pro_connections where id = p_conn;
  insert into public.clothing_items (user_id, name, category) values (c.client_id, 'Fixture piece', 'tops') returning id into iid;
  insert into public.pro_messages (connection_id, sender_id, kind, body) values
    (p_conn, c.stylist_id, 'text', 'words from the stylist'),
    (p_conn, c.client_id, 'text', 'words from the client');
  insert into public.pro_recommendations (connection_id, title, body, status, sent_at)
  values (p_conn, 'A sent look', 'Delivered to the client', 'sent', now() - interval '1 day') returning id into rid;
  insert into public.pro_recommendation_items (recommendation_id, position, item_id, name, category) values (rid, 1, null, 'Red scarf', 'accessories');
  insert into public.pro_recommendations (connection_id, title, body) values (p_conn, 'A draft', 'Only the stylist sees this');
  insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes)
  values (p_conn, 'stylist', 'confirmed', now() + interval '5 days', 60, 'virtual', 0);
  insert into public.pro_closet_views (connection_id, day, pages) values (p_conn, current_date, 2);
  insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (p_conn, 'closet', 'selected', now() + interval '30 days', '2026-10');
  insert into public.pro_grant_items (connection_id, item_id) values (p_conn, iid);
  insert into public.pro_grant_events (connection_id, scope, event, item_mode, item_count, text_version) values (p_conn, 'closet', 'granted', 'selected', 1, '2026-10');
end $$;

select t.check('the catalogue finds the seven columns that name a person in the pro tables', t.person_columns() = 7,
               'got ' || t.person_columns());

-- ─── Pair one: Ann (stylist) works with Bea and with Cat ────────────────────

select t.put('ab', t.mk_conn(t.u('ann'), t.u('bea'), 'Bea B')::text);
select t.put('ac', t.mk_conn(t.u('ann'), t.u('cat'), 'Cat C')::text);
select t.fill(t.c('ab')); select t.fill(t.c('ac'));
select t.mk_invite(t.u('ann'));
insert into public.content_reports (reporter_id, reported_user_id, context, reason, ref_type, ref_id, evidence)
values (t.u('bea'), t.u('ann'), 'pro_profile', 'spam', 'connection', t.c('ab'), '{"qualified": false}'),
       (t.u('ann'), t.u('bea'), 'pro_profile', 'spam', 'connection', t.c('ab'), '{"qualified": false}'),
       (t.u('cat'), t.u('ann'), 'pro_profile', 'spam', 'connection', t.c('ac'), '{"qualified": false}');
insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_pro) values (t.u('bea'), t.u('eve'), 'Someone', true);
select t.check('before: Bea, Ann and Cat all have pro rows', t.rows_for(t.u('bea')) > 3 and t.rows_for(t.u('ann')) > 5 and t.rows_for(t.u('cat')) > 3);

-- ─── A. The client leaves first ─────────────────────────────────────────────

select t.as_user(t.u('bea'));
select public.delete_user_account();
select t.as_admin();
select t.check('A Bea''s account is gone', not exists (select 1 from auth.users where id = t.u('bea')));
select t.eq('A zero rows for Bea in every pro table (found by the catalogue)', t.rows_for(t.u('bea')), 0::bigint);
select t.eq('A no report or block of hers is left', (select count(*) from public.content_reports where reporter_id = t.u('bea') or reported_user_id = t.u('bea'))
  + (select count(*) from public.user_blocks where blocker_id = t.u('bea') or blocked_id = t.u('bea')), 0::bigint);
select t.check('A the connection ended as the system, the client side is null, the alias is gone, the stylist is still there',
  (select status = 'ended' and ended_by = 'system' and client_id is null and client_alias is null and stylist_id = t.u('ann') and stylist_label is not null
     from public.pro_connections where id = t.c('ab')));
select t.eq('A her looks, sessions, counters, grant events and grant are deleted', t.content(t.c('ab')) ~ '^[0-9]+/0/0/0/0/0/0$', true);
select t.eq('A the messages she sent are gone and the stylist''s stay (with the system lines)',
  (select string_agg(coalesce(nullif(body, ''), code), ',' order by id) from public.pro_messages where connection_id = t.c('ab')), 'words from the stylist,ended');
select t.check('A Cat''s connection is untouched', (select status = 'active' from public.pro_connections where id = t.c('ac')) and t.content(t.c('ac')) = '2/2/1/1/1/1/1');
select t.as_user(t.u('ann'));
select t.check('A Ann keeps a stub: "Former client", ended by the other side (never "system"), with its dates',
  (select other_label = 'Former client' and status = 'ended' and ended_by = 'client' and started_at is not null and ended_at is not null
          and other_headline is null and not closet_shared
     from public.list_pro_connections('stylist') where connection_id = t.c('ab')));
select t.check('A and can open it: nothing about the client but the label', (public.get_pro_connection(t.c('ab')) ->> 'otherLabel') = 'Former client'
  and (public.get_pro_connection(t.c('ab')))::text !~ 'bea@|b0000000');
select t.check('A the thread shows only her own words and the system line', (select string_agg(m ->> 'body', ',' order by (m ->> 'id')::bigint) from jsonb_array_elements(public.get_pro_thread(t.c('ab')) -> 'messages') m where m ->> 'from' = 'them') is null);
select t.eq('A no looks are left to read for the leaver''s side', (select count(*) from public.list_pro_recommendations(t.c('ab'))), 0::bigint);
select t.throws('A the closet of a leaver is closed', format($$select * from public.get_client_closet(%L)$$, t.c('ab')), 'pro_unavailable');
select t.throws('A nothing can be sent to a leaver', format($$select public.send_pro_message(%L, 'hello', gen_random_uuid())$$, t.c('ab')), 'connection_ended');

-- ─── B. The stylist leaves (the client of the other pair stays) ─────────────

select t.as_user(t.u('ann'));
select public.delete_user_account();
select t.as_admin();
select t.check('B Ann''s account is gone', not exists (select 1 from auth.users where id = t.u('ann')));
select t.eq('B zero rows for Ann in every pro table', t.rows_for(t.u('ann')), 0::bigint);
select t.eq('B her profile, member row and invites are gone', (select count(*) from public.pro_stylists where user_id = t.u('ann'))
  + (select count(*) from public.pro_members where user_id = t.u('ann')) + (select count(*) from public.pro_invites where stylist_id = t.u('ann')), 0::bigint);
select t.eq('B the connection with nobody left is deleted, with everything under it', (select count(*) from public.pro_connections where id = t.c('ab'))
  + (select count(*) from public.pro_messages where connection_id = t.c('ab')), 0::bigint);
select t.check('B Cat''s connection ended as the system, the stylist side is null, the label is gone',
  (select status = 'ended' and ended_by = 'system' and stylist_id is null and stylist_label is null and client_id = t.u('cat') and client_alias = 'Cat C'
     from public.pro_connections where id = t.c('ac')));
select t.eq('B the stylist''s messages are gone, the client''s stay', (select string_agg(coalesce(nullif(body, ''), code), ',' order by id) from public.pro_messages where connection_id = t.c('ac')), 'words from the client,ended');
select t.check('B the delivered look and the session record stay for the client, the stylist''s unsent draft is gone; the grant is gone',
  (select count(*) = 1 from public.pro_recommendations where connection_id = t.c('ac'))
  and (select count(*) = 0 from public.pro_recommendations where connection_id = t.c('ac') and status = 'draft')
  and (select count(*) = 1 from public.pro_appointments where connection_id = t.c('ac'))
  and (select count(*) = 0 from public.pro_grants where connection_id = t.c('ac')));
select t.as_user(t.u('cat'));
select t.check('B Cat sees "Former stylist", ended by the other side (never "system")', (select other_label = 'Former stylist' and status = 'ended' and ended_by = 'stylist'
  from public.list_pro_connections('client') where connection_id = t.c('ac')));
select t.check('B Cat can still read the look that was delivered, and not the draft',
  (select count(*) = 1 from public.list_pro_recommendations(t.c('ac')))
  and (select title from public.list_pro_recommendations(t.c('ac'))) = 'A sent look');
select t.check('B and open it by id', (public.get_pro_recommendation((select rec_id from public.list_pro_recommendations(t.c('ac')))) ->> 'body') = 'Delivered to the client');
select t.check('B nothing in what she reads names the stylist''s account', (public.get_pro_connection(t.c('ac')))::text !~ 'a0000000|ann@');

-- ─── C. Everyone is gone ────────────────────────────────────────────────────

select public.delete_user_account();
select t.as_admin();
select t.eq('C zero rows for Cat in every pro table', t.rows_for(t.u('cat')), 0::bigint);
select t.eq('C nothing is left of the connections', (select count(*) from public.pro_connections) + (select count(*) from public.pro_messages)
  + (select count(*) from public.pro_recommendations) + (select count(*) from public.pro_recommendation_items) + (select count(*) from public.pro_appointments)
  + (select count(*) from public.pro_grants) + (select count(*) from public.pro_grant_items) + (select count(*) from public.pro_grant_events)
  + (select count(*) from public.pro_closet_views), 0::bigint);
select t.eq('C nor of the reports and the blocks that named them', (select count(*) from public.content_reports where context like 'pro\_%')
  + (select count(*) from public.user_blocks where blocker_id in (t.u('ann'), t.u('bea'), t.u('cat'))), 0::bigint);

-- ─── D. A failure inside pro_on_member_left ─────────────────────────────────

-- The real function swallows its errors, so an account deletion never fails because of it. This copy fails inside
-- the same kind of guard, so the deletion succeeds and the connection is left active with a null side.
create or replace function public.pro_on_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform 1 / 0;
  exception when others then
    raise warning 'pro_on_member_left: %', sqlerrm;
  end;
  return new;
end $$;

select t.put('d_s', t.mk_stylist('ds', true)::text); select t.put('d_c', t.mk_user('dc')::text);
select t.put('d', t.mk_conn(t.c('d_s'), t.c('d_c'), 'Client D')::text);
select t.fill(t.c('d'));
select t.as_user(t.c('d_c'));
select public.delete_user_account();
select t.as_admin();
select t.check('D the deletion succeeded', not exists (select 1 from auth.users where id = t.c('d_c')));
select t.check('D and left an active connection with no client, still holding the client''s looks and grant',
  (select status = 'active' and client_id is null and client_alias = 'Client D' from public.pro_connections where id = t.c('d'))
  and (select count(*) = 2 from public.pro_recommendations where connection_id = t.c('d'))
  and (select count(*) = 1 from public.pro_grants where connection_id = t.c('d')));
select t.as_user(t.c('d_s'));
select t.check('D the stylist''s next read ends it as the system and shows the stub',
  (select other_label = 'Former client' and status = 'ended' and ended_by = 'client' from public.list_pro_connections('stylist') where connection_id = t.c('d')));
select t.as_admin();
select t.check('D and clears the client''s looks, sessions, events, counters and grant',
  (select client_alias is null from public.pro_connections where id = t.c('d')) and t.content(t.c('d')) ~ '^[0-9]+/0/0/0/0/0/0$');

select t.put('e_s', t.mk_stylist('es', true)::text); select t.put('e_c', t.mk_user('ec')::text);
select t.put('e', t.mk_conn(t.c('e_s'), t.c('e_c'), 'Client E')::text);
select t.fill(t.c('e'));
select t.as_user(t.c('e_s'));
select public.delete_user_account();
select t.as_admin();
select t.check('D (stylist leaves) the connection is left active with no stylist, still labelled and with its grant',
  (select status = 'active' and stylist_id is null and stylist_label is not null from public.pro_connections where id = t.c('e'))
  and (select count(*) = 1 from public.pro_grants where connection_id = t.c('e'))
  and (select count(*) = 1 from public.pro_recommendations where connection_id = t.c('e') and status = 'draft'));
select t.as_user(t.c('e_c'));
select t.check('D the client''s next read ends it and shows "Former stylist"',
  (select other_label = 'Former stylist' and status = 'ended' and ended_by = 'stylist' from public.list_pro_connections('client') where connection_id = t.c('e')));
select t.as_admin();
select t.check('D and clears the stylist''s label and the grant, keeping the delivered look',
  (select stylist_label is null from public.pro_connections where id = t.c('e'))
  and (select count(*) = 0 from public.pro_grants where connection_id = t.c('e'))
  and (select count(*) = 1 from public.pro_recommendations where connection_id = t.c('e') and status = 'sent'));
select t.check('D and deletes the unsent draft the stylist left behind (the repair of a trigger that failed)',
  (select count(*) = 0 from public.pro_recommendations where connection_id = t.c('e') and status = 'draft'));
select t.as_user(t.c('e_c'));
select public.delete_user_account();
select t.as_admin();
-- With the trigger failing, the last person leaving cannot delete the connection row (nobody is left to repair it); it
-- waits as an ended row with no one on it, and the janitor deletes it 90 days after it ended, with everything under it.
select t.check('D the last person leaving, with the trigger failing, leaves an ended row with no one on it',
  (select status = 'ended' and stylist_id is null and client_id is null from public.pro_connections where id = t.c('e')));
select t.eq('D nothing in it names a person any more', (select count(*) from public.pro_messages where connection_id = t.c('e') and sender_id is not null), 0::bigint);
update public.pro_connections set ended_at = now() - interval '91 days' where id = t.c('e');
select t.as_service(); select public.pro_janitor(true); select t.as_admin();
select t.eq('D the janitor deletes it after the retention period, with its looks', (select count(*) from public.pro_connections where id = t.c('e'))
  + (select count(*) from public.pro_recommendations where connection_id = t.c('e')), 0::bigint);
