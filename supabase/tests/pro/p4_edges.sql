-- p4_edges (files 1 to 8)
--   A  blocks: Friends, swap-style and Stylists blocks end a connection both ways and turn it into a closed shell; the
--      shell is stored and identical for the blocked person before and after an unblock; friends, invite previews,
--      callers who are not on the connection
--   B  suspension ends and refuses; unsuspend restores nothing
--   C  the ways out under a paused feature, a suspension, stale terms and a closed profile: ended history, end, block,
--      report, export and stop sharing
--   D  close_stylist_profile
--   E  a terms bump gates content reads and writes, and the ways out stay open
--   F  the churn hold: ten connections the client ended under 48 hours, and not ten the stylist ended
--   G  pro_refresh: expiry, completion, orphans, and the repair of a connection an account deletion left half done
--   H  the janitor: retention, throttle, idempotence, bounded sweeps

select t.as_admin();
-- A statement that must succeed (the opposite of t.throws).
create function t.ok(p_label text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t.log(ok, label, detail) values (true, p_label, null);
exception when others then
  insert into t.log(ok, label, detail) values (false, p_label, sqlerrm);
end $$;
create function t.c(p_name text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_name $$;
create function t.has(p_text text, p_word text) returns boolean language sql immutable as $$ select position(lower(p_word) in lower(p_text)) > 0 $$;

-- Content for a connection, made directly (as the owner): messages from both sides, a sent look with one piece, a draft
-- look, a confirmed session five days ahead, a closet view counter, and (when p_grant) a grant with one selected piece and
-- its event. The messages say 'history msg'.
create function t.fill(p_conn uuid, p_grant boolean default true) returns void language plpgsql as $$
declare
  c   public.pro_connections;
  rid uuid;
begin
  select * into c from public.pro_connections where id = p_conn;
  insert into public.pro_messages (connection_id, sender_id, kind, body) values
    (p_conn, c.stylist_id, 'text', 'history msg from the stylist'),
    (p_conn, c.client_id, 'text', 'history msg from the client');
  insert into public.pro_recommendations (connection_id, title, body, status, sent_at)
  values (p_conn, 'History look', 'A look that was sent', 'sent', now() - interval '2 days') returning id into rid;
  insert into public.pro_recommendation_items (recommendation_id, position, item_id, name, category)
  values (rid, 1, null, 'Red scarf', 'accessories');
  insert into public.pro_recommendations (connection_id, title, body) values (p_conn, 'A draft', 'Only the stylist sees this');
  insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes)
  values (p_conn, 'stylist', 'confirmed', now() + interval '5 days', 60, 'virtual', 0);
  insert into public.pro_closet_views (connection_id, day, pages) values (p_conn, current_date, 2);
  if p_grant then
    insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version)
    values (p_conn, 'closet', 'selected', now() + interval '30 days', '2026-10');
    insert into public.pro_grant_items (connection_id, item_id) values (p_conn, t.item('bea', 2));
    insert into public.pro_grant_events (connection_id, scope, event, item_mode, item_count, text_version)
    values (p_conn, 'closet', 'granted', 'selected', 1, '2026-10');
  end if;
end $$;

-- A connection that ended an hour ago by the client, with content (history that stays readable until it is deleted).
create function t.mk_ended(p_stylist uuid, p_client uuid, p_by text default 'client') returns uuid language plpgsql as $$
declare cid uuid := t.mk_conn(p_stylist, p_client, 'An old client');
begin
  perform t.fill(cid, false);
  update public.pro_connections
     set status = 'ended', ended_at = now(), ended_by = p_by, started_at = now() - interval '3 days'
   where id = cid;
  update public.pro_appointments set status = 'cancelled' where connection_id = cid;
  insert into public.pro_messages (connection_id, kind, code) values (cid, 'system', 'ended');
  return cid;
end $$;

-- Runs a boolean expression and logs it; an error is a failed check, not the end of the script.
create function t.chk(p_label text, p_expr text) returns void language plpgsql as $$
declare b boolean;
begin
  execute 'select coalesce((' || p_expr || ')::boolean, false)' into b;
  insert into t.log(ok, label, detail) values (b, p_label, case when b then null else 'false' end);
exception when others then
  insert into t.log(ok, label, detail) values (false, p_label, sqlerrm);
end $$;

-- How many rows of content a connection holds, as one text: messages, looks, sessions, view counters, grant events, grants, pieces.
create function t.content(p_conn uuid) returns text language sql stable as $$
  select (select count(*) from public.pro_messages where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_recommendations where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_appointments where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_closet_views where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_grant_events where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_grants where connection_id = p_conn) || '/'
      || (select count(*) from public.pro_grant_items where connection_id = p_conn) $$;

-- What a signed-in person's own direct table delete on user_blocks removes (the old "Blocked people" screen does this).
create function t.delete_my_blocks() returns bigint language plpgsql as $$
declare n bigint;
begin
  delete from public.user_blocks where blocker_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;

-- ─── A. Blocks ──────────────────────────────────────────────────────────────

-- A1: a block made in Friends (block_user) by the client.
select t.put('a1_s', t.mk_stylist('a1s', true)::text); select t.put('a1_c', t.mk_user('a1c')::text);
select t.put('a1', t.mk_conn(t.c('a1_s'), t.c('a1_c'), 'Client A1')::text);
select t.fill(t.c('a1'));
select t.eq('A1 before: the connection holds content', t.content(t.c('a1')), '2/2/1/1/1/1/1');
select t.as_user(t.c('a1_c'));
select public.block_user(t.c('a1_s'));
select t.as_admin();
select t.check('A1 a Friends block ends the connection with the blocker''s role and turns it into a shell',
  (select status = 'ended' and shell_at is not null and ended_by = 'client' and ended_at is not null
     from public.pro_connections where id = t.c('a1')));
select t.eq('A1 its content is deleted at once: messages, looks, sessions, counters, events, grant and pieces', t.content(t.c('a1')), '0/0/0/0/0/0/0');
select t.check('A1 the Friends block row is not marked as a pro block',
  (select not via_pro from public.user_blocks where blocker_id = t.c('a1_c') and blocked_id = t.c('a1_s')));
select t.as_user(t.c('a1_s'));
select t.check('A1 the stylist reads a closed shell: ended, "Former client", every action false, no counts, nothing shared',
  (with j as (select public.get_pro_connection(t.c('a1')) j)
   select j->>'status' = 'ended' and j->>'otherLabel' = 'Former client' and j->>'safetyOnly' = 'false'
          and j->'stylist' = 'null'::jsonb and j->'myAlias' = 'null'::jsonb
          and not exists (select 1 from jsonb_each_text(j->'actions') a where a.value <> 'false')
          and (j->'counts'->>'looks')::int = 0 and (j->'counts'->>'upcoming')::int = 0
          and j->'closet'->>'shared' = 'false' from j));
select t.check('A1 the stylist''s list shows the shell with no preview and no attention',
  (select other_label = 'Former client' and status = 'ended' and unread = 0 and not attention and last_message_preview is null
          and last_message_at is null and not closet_shared and pending_appointments = 0 and next_appointment_at is null
     from public.list_pro_connections('stylist') where connection_id = t.c('a1')));
select t.check('A1 the thread is empty and cannot be written to',
  (with j as (select public.get_pro_thread(t.c('a1')) j) select jsonb_array_length(j->'messages') = 0 and j->'actions'->>'canSend' = 'false' from j));
select t.eq('A1 no looks', (select count(*) from public.list_pro_recommendations(t.c('a1'))), 0::bigint);
select t.eq('A1 no sessions (any scope)', (select count(*) from public.list_pro_appointments(t.c('a1'), 'past')), 0::bigint);
select t.eq('A1 no sessions across all connections either', (select count(*) from public.list_pro_appointments(null, 'past') where connection_id = t.c('a1')), 0::bigint);
select t.throws('A1 the closet is closed', format($$select * from public.get_client_closet(%L)$$, t.c('a1')), 'pro_unavailable');
select t.throws('A1 a message is refused as an ended connection', format($$select public.send_pro_message(%L, 'hello', gen_random_uuid())$$, t.c('a1')), 'connection_ended');
select t.check('A1 the stylist''s grant view says only "not shared"', (public.get_pro_grant(t.c('a1'))->>'enabled') = 'false');
select t.as_user(t.c('a1_c'));
select t.check('A1 the client reads the same shell with the other label',
  (with j as (select public.get_pro_connection(t.c('a1')) j)
   select j->>'status' = 'ended' and j->>'otherLabel' = 'Former stylist' and j->'stylist' = 'null'::jsonb
          and not exists (select 1 from jsonb_each_text(j->'actions') a where a.value <> 'false') from j));
select t.check('A1 the word "blocked" appears nowhere the people read',
  not t.has((select public.get_pro_connection(t.c('a1')))::text || (select public.get_pro_thread(t.c('a1')))::text
            || (select string_agg(l::text, ' ') from public.list_pro_connections('client') l), 'block'));
select t.as_user(t.c('a1_s'));
select t.check('A1 the word "blocked" appears nowhere the blocked person reads',
  not t.has((select public.get_pro_connection(t.c('a1')))::text || (select public.get_pro_thread(t.c('a1')))::text
            || (select string_agg(l::text, ' ') from public.list_pro_connections('stylist') l), 'block'));

-- A2: a swap-style block (via_swap) by the stylist.
select t.as_admin();
select t.put('a2_s', t.mk_stylist('a2s', true)::text); select t.put('a2_c', t.mk_user('a2c')::text);
select t.put('a2', t.mk_conn(t.c('a2_s'), t.c('a2_c'), 'Client A2')::text);
select t.fill(t.c('a2'));
insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_swap) values (t.c('a2_s'), t.c('a2_c'), 'A swap member', true);
select t.check('A2 a swap-style block ends the connection with the stylist''s role and shells it',
  (select status = 'ended' and shell_at is not null and ended_by = 'stylist' from public.pro_connections where id = t.c('a2')));
select t.eq('A2 its content is deleted', t.content(t.c('a2')), '0/0/0/0/0/0/0');
select t.as_user(t.c('a2_c'));
select t.check('A2 the blocked client reads "Former stylist" and no actions',
  (with j as (select public.get_pro_connection(t.c('a2')) j)
   select j->>'otherLabel' = 'Former stylist' and not exists (select 1 from jsonb_each_text(j->'actions') a where a.value <> 'false') from j));

-- A2b: both ways: a Friends block by the stylist (block_user), and a swap-style block by the client.
select t.as_admin();
select t.put('a2b_s', t.mk_stylist('a2bs', true)::text); select t.put('a2b_c', t.mk_user('a2bc')::text);
select t.put('a2b', t.mk_conn(t.c('a2b_s'), t.c('a2b_c'), 'Client A2b')::text);
select t.fill(t.c('a2b'));
select t.as_user(t.c('a2b_s'));
select public.block_user(t.c('a2b_c'));
select t.as_admin();
select t.check('A2b a Friends block by the stylist ends the connection with the stylist''s role and shells it',
  (select status = 'ended' and shell_at is not null and ended_by = 'stylist' from public.pro_connections where id = t.c('a2b')) and t.content(t.c('a2b')) = '0/0/0/0/0/0/0');
select t.put('a2c_s', t.mk_stylist('a2cs', true)::text); select t.put('a2c_c', t.mk_user('a2cc')::text);
select t.put('a2c', t.mk_conn(t.c('a2c_s'), t.c('a2c_c'), 'Client A2c')::text);
select t.fill(t.c('a2c'));
insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_swap) values (t.c('a2c_c'), t.c('a2c_s'), 'A swap member', true);
select t.check('A2b a swap-style block by the client ends the connection with the client''s role and shells it',
  (select status = 'ended' and shell_at is not null and ended_by = 'client' from public.pro_connections where id = t.c('a2c')) and t.content(t.c('a2c')) = '0/0/0/0/0/0/0');
select t.as_user(t.c('a2c_s'));
select t.check('A2b the blocked stylist reads "Former client" and no actions',
  (with j as (select public.get_pro_connection(t.c('a2c')) j)
   select j->>'otherLabel' = 'Former client' and not exists (select 1 from jsonb_each_text(j->'actions') a where a.value <> 'false') from j));

-- A3: block_pro_member from a connection, by the client.
select t.as_admin();
select t.put('a3_s', t.mk_stylist('a3s', true)::text); select t.put('a3_c', t.mk_user('a3c')::text);
select t.put('a3', t.mk_conn(t.c('a3_s'), t.c('a3_c'), 'Client A3')::text);
select t.fill(t.c('a3'));
select t.as_user(t.c('a3_c'));
select public.block_pro_member(p_connection => t.c('a3'));
select t.as_admin();
select t.check('A3 block_pro_member ends the connection and shells it, ended by the client',
  (select status = 'ended' and shell_at is not null and ended_by = 'client' from public.pro_connections where id = t.c('a3')));
select t.eq('A3 its content is deleted', t.content(t.c('a3')), '0/0/0/0/0/0/0');
select t.check('A3 the block row is a pro block that carries the stylist''s label, not an email',
  (select via_pro and not via_swap and blocked_name = 'A3s Stylist' and blocked_name !~ '@'
     from public.user_blocks where blocker_id = t.c('a3_c') and blocked_id = t.c('a3_s')));
select t.as_user(t.c('a3_c'));
select t.eq('A3 the old "Blocked people" list (direct table read) does not show it', (select count(*) from public.user_blocks), 0::bigint);
select t.check('A3 list_pro_blocks lists it under an opaque ref and the label',
  (select count(*) = 1 and min(label) = 'A3s Stylist' and min(ref::text) !~ 'a0000000|b0000000' and min(ref::text) <> t.c('a3_s')::text
     from public.list_pro_blocks()));
select t.eq('A3 the old table delete cannot remove a pro block (the row is not visible to it)', t.delete_my_blocks(), 0::bigint);
select t.ok('A3 blocking again is a quiet no-op', format($$select public.block_pro_member(p_connection => %L)$$, t.c('a3')));
select t.eq('A3 still one row', (select count(*) from public.list_pro_blocks()), 1::bigint);

-- A4: block, unblock, and the blocked person's reads are identical before and after.
select t.as_admin();
select t.put('a4_s', t.mk_stylist('a4s', true)::text); select t.put('a4_c', t.mk_user('a4c')::text);
select t.put('a4', t.mk_conn(t.c('a4_s'), t.c('a4_c'), 'Client A4')::text);
select t.fill(t.c('a4'));
select t.as_user(t.c('a4_c'));
select public.block_pro_member(p_connection => t.c('a4'));
select t.put('a4_ref', (select ref::text from public.list_pro_blocks()));
select t.as_user(t.c('a4_s'));
select t.put('a4_before_s', (public.get_pro_connection(t.c('a4')))::text || (select string_agg(l::text, ' ') from public.list_pro_connections('stylist') l)
                            || (public.get_pro_thread(t.c('a4')))::text);
select t.put('a4_before_s2', (public.get_pro_connection(t.c('a4')))::text || (select string_agg(l::text, ' ') from public.list_pro_connections('stylist') l)
                             || (public.get_pro_thread(t.c('a4')))::text);
select t.check('A4 the blocked person reads the identical shell every time', t.get('a4_before_s') = t.get('a4_before_s2'));
select t.as_user(t.c('a4_c'));
select t.put('a4_before_c', (public.get_pro_connection(t.c('a4')))::text || (select string_agg(l::text, ' ') from public.list_pro_connections('client') l));
select t.as_user(t.u('eve'));
select t.ok('A4 someone else cannot remove the block with the blocker''s ref', format($$select public.unblock_pro_member(%L)$$, t.get('a4_ref')));
select t.as_admin();
select t.eq('A4 and it is still there', (select count(*) from public.user_blocks where blocker_id = t.c('a4_c') and blocked_id = t.c('a4_s')), 1::bigint);
select t.as_user(t.c('a4_c'));
select public.unblock_pro_member(t.get('a4_ref')::uuid);
select t.as_admin();
select t.eq('A4 unblocking removes the block row', (select count(*) from public.user_blocks where blocker_id = t.c('a4_c') and blocked_id = t.c('a4_s')), 0::bigint);
select t.check('A4 the connection stays ended and shelled, nothing comes back',
  (select status = 'ended' and shell_at is not null from public.pro_connections where id = t.c('a4')) and t.content(t.c('a4')) = '0/0/0/0/0/0/0');
select t.as_user(t.c('a4_s'));
select t.check('A4 the blocked person''s reads are unchanged by the unblock',
  t.get('a4_before_s') = (public.get_pro_connection(t.c('a4')))::text || (select string_agg(l::text, ' ') from public.list_pro_connections('stylist') l)
                         || (public.get_pro_thread(t.c('a4')))::text);
select t.as_user(t.c('a4_c'));
select t.check('A4 so are the blocker''s',
  t.get('a4_before_c') = (public.get_pro_connection(t.c('a4')))::text || (select string_agg(l::text, ' ') from public.list_pro_connections('client') l));
select t.eq('A4 the blocker''s list is empty again', (select count(*) from public.list_pro_blocks()), 0::bigint);
select t.ok('A4 unblocking an unknown ref is quiet', $$select public.unblock_pro_member(gen_random_uuid())$$);
select t.throws('A4 unblocking with no ref is a bad request', $$select public.unblock_pro_member(null)$$, 'invalid_request', 'ref');

-- A5: a stylist who is also an accepted friend: blocking them removes the friendship (the folder-wide friends read has no block check).
select t.as_admin();
select t.put('a5_s', t.mk_stylist('a5s', true)::text); select t.put('a5_c', t.mk_user('a5c')::text);
select t.put('a5', t.mk_conn(t.c('a5_s'), t.c('a5_c'), 'Client A5')::text);
insert into public.friend_requests (requester_id, recipient_id, status) values (t.c('a5_c'), t.c('a5_s'), 'accepted');
select t.check('A5 before: they are accepted friends', public.are_friends(t.c('a5_c'), t.c('a5_s')));
select t.as_user(t.c('a5_c'));
select public.block_pro_member(p_connection => t.c('a5'));
select t.as_admin();
select t.check('A5 the friendship is gone', not public.are_friends(t.c('a5_c'), t.c('a5_s')));
select t.eq('A5 no friend request row is left between them', (select count(*) from public.friend_requests
  where (requester_id = t.c('a5_c') and recipient_id = t.c('a5_s')) or (requester_id = t.c('a5_s') and recipient_id = t.c('a5_c'))), 0::bigint);
select t.check('A5 the block stays a pro block, out of the old Friends list',
  (select via_pro from public.user_blocks where blocker_id = t.c('a5_c') and blocked_id = t.c('a5_s')));
select t.check('A5 the connection is a shell', (select shell_at is not null and status = 'ended' from public.pro_connections where id = t.c('a5')));
-- and without a friendship no friend row is created or needed
select t.put('a5b_s', t.mk_stylist('a5bs', true)::text); select t.put('a5b_c', t.mk_user('a5bc')::text);
select t.put('a5b', t.mk_conn(t.c('a5b_s'), t.c('a5b_c'), 'Client A5b')::text);
select t.as_user(t.c('a5b_c'));
select public.block_pro_member(p_connection => t.c('a5b'));
select t.as_admin();
select t.eq('A5 a non-friend leaves no friend rows behind', (select count(*) from public.friend_requests where requester_id in (t.c('a5b_c'), t.c('a5b_s')) or recipient_id in (t.c('a5b_c'), t.c('a5b_s'))), 0::bigint);

-- A6: a block made from an invite preview, before ever connecting.
select t.put('a6_s', t.mk_stylist('a6s', true)::text); select t.put('a6_c', t.mk_user('a6c')::text);
select t.put('a6_o', t.mk_user('a6o')::text);
select t.put('a6_code', t.mk_invite(t.c('a6_s')));
select t.put('a6_code2', t.mk_invite(t.c('a6_s')));
select t.as_user(t.c('a6_c'));
select t.put('a6_inv', (public.preview_pro_invite(t.get('a6_code')) ->> 'inviteId'));
select t.check('A6 the preview works before the block', t.get('a6_inv') is not null);
select t.throws('A6 a connection and an invite together are a bad request', format($$select public.block_pro_member(%L, %L)$$, gen_random_uuid(), t.get('a6_inv')::uuid), 'invalid_request');
select t.throws('A6 neither is a bad request too', $$select public.block_pro_member()$$, 'invalid_request');
select t.throws('A6 an unknown invite is unavailable', $$select public.block_pro_member(p_invite => gen_random_uuid())$$, 'pro_unavailable', null, null, '22023');
select t.throws('A6 an unknown connection is unavailable', $$select public.block_pro_member(p_connection => gen_random_uuid())$$, 'pro_unavailable');
select public.block_pro_member(p_invite => t.get('a6_inv')::uuid);
select t.as_admin();
select t.check('A6 the block is a pro block with the stylist''s display name',
  (select via_pro and blocked_name = 'A6s Stylist' from public.user_blocks where blocker_id = t.c('a6_c') and blocked_id = t.c('a6_s')));
select t.as_user(t.c('a6_c'));
select t.check('A6 its code now answers invite_invalid for the blocker', public.preview_pro_invite(t.get('a6_code')) = '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.check('A6 so does a later code of that stylist', public.preview_pro_invite(t.get('a6_code2')) = '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.check('A6 and redeeming it', public.redeem_pro_invite(t.get('a6_code'), 'Blocker') = '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_user(t.c('a6_o'));
select t.check('A6 someone else can still preview it', (public.preview_pro_invite(t.get('a6_code')) ->> 'valid') = 'true');
select t.as_user(t.c('a6_s'));
select t.throws('A6 a stylist cannot block their own invite', format($$select public.block_pro_member(p_invite => %L)$$, t.get('a6_inv')::uuid), 'pro_unavailable');
select t.as_user(t.u('eve'));
select t.throws('A6 a stranger cannot block a connection she is not on', format($$select public.block_pro_member(p_connection => %L)$$, t.c('a5b')), 'pro_unavailable');
select t.as_user(t.c('a6_c'));
select public.unblock_pro_member((select ref from public.list_pro_blocks()));
select t.check('A6 after unblocking, the code previews again', (public.preview_pro_invite(t.get('a6_code')) ->> 'valid') = 'true');

-- A7: a pair with an old ended connection and a current one: both become shells.
select t.as_admin();
select t.put('a7_s', t.mk_stylist('a7s', true)::text); select t.put('a7_c', t.mk_user('a7c')::text);
select t.put('a7_old', t.mk_ended(t.c('a7_s'), t.c('a7_c'))::text);
select t.put('a7', t.mk_conn(t.c('a7_s'), t.c('a7_c'), 'Client A7')::text);
select t.fill(t.c('a7'));
select t.eq('A7 before: the old connection still holds its history', t.content(t.c('a7_old')), '3/2/1/1/0/0/0');
select t.as_user(t.c('a7_s'));
select public.block_pro_member(p_connection => t.c('a7'));
select t.as_admin();
select t.check('A7 both connections are shells', (select count(*) = 2 and bool_and(shell_at is not null and status = 'ended')
  from public.pro_connections where id in (t.c('a7_old'), t.c('a7'))));
select t.check('A7 the old connection kept its first ending (client), the current one is ended by the stylist',
  (select ended_by from public.pro_connections where id = t.c('a7_old')) = 'client' and (select ended_by from public.pro_connections where id = t.c('a7')) = 'stylist');
select t.eq('A7 the old history is deleted too', t.content(t.c('a7_old')) || '|' || t.content(t.c('a7')), '0/0/0/0/0/0/0|0/0/0/0/0/0/0');

-- A8: blocking when the other account has gone is unavailable, and a connection of someone else is too.
select t.put('a8_s', t.mk_stylist('a8s', true)::text); select t.put('a8_c', t.mk_user('a8c')::text);
select t.put('a8', t.mk_conn(t.c('a8_s'), t.c('a8_c'))::text);
alter table public.pro_connections disable trigger pro_on_member_left;
delete from auth.users where id = t.c('a8_c');
alter table public.pro_connections enable trigger pro_on_member_left;
select t.as_user(t.c('a8_s'));
select t.throws('A8 there is nobody left to block', format($$select public.block_pro_member(p_connection => %L)$$, t.c('a8')), 'pro_unavailable');

-- A9: a block the trigger did not finish (it swallows its errors so a block never fails). The next read of either
-- person finishes it: the connection ends with the role of whoever blocked, becomes a closed shell and loses its content.
-- This is what stands behind the pair lock of pro_on_block when a block commits inside a redeem.
select t.as_admin();
select t.put('a9_s', t.mk_stylist('a9s', true)::text); select t.put('a9_c', t.mk_user('a9c')::text);
select t.put('a9', t.mk_conn(t.c('a9_s'), t.c('a9_c'), 'Client A9')::text);
select t.fill(t.c('a9'));
alter table public.user_blocks disable trigger pro_on_block;
select t.as_user(t.c('a9_c'));
select public.block_user(t.c('a9_s'));
select t.as_admin();
alter table public.user_blocks enable trigger pro_on_block;
select t.check('A9 with the trigger out of the way the connection is still active (the broken state)',
  (select status = 'active' and shell_at is null from public.pro_connections where id = t.c('a9')) and t.content(t.c('a9')) = '2/2/1/1/1/1/1');
select t.as_user(t.c('a9_s'));
select t.check('A9 the blocked stylist''s next read of the list finishes it: a closed shell, Former client, no actions',
  (select status = 'ended' and other_label = 'Former client' and unread = 0 and not closet_shared and last_message_preview is null
     from public.list_pro_connections('stylist') where connection_id = t.c('a9')));
select t.as_admin();
select t.check('A9 ended with the role of the one who blocked (the client), shell set, content deleted',
  (select status = 'ended' and shell_at is not null and ended_by = 'client' and ended_at is not null from public.pro_connections where id = t.c('a9'))
  and t.content(t.c('a9')) = '0/0/0/0/0/0/0');
-- the same from the blocker's side, with a block made the other way round
select t.put('a9b_s', t.mk_stylist('a9bs', true)::text); select t.put('a9b_c', t.mk_user('a9bc')::text);
select t.put('a9b', t.mk_conn(t.c('a9b_s'), t.c('a9b_c'), 'Client A9B')::text);
alter table public.user_blocks disable trigger pro_on_block;
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.c('a9b_s'), t.c('a9b_c'), 'someone');
alter table public.user_blocks enable trigger pro_on_block;
select t.as_user(t.c('a9b_c'));
select t.check('A9 the blocked client''s own detail read finishes a stylist''s block too, and reads as an ordinary ending',
  (public.get_pro_connection(t.c('a9b')) ->> 'status') = 'ended' and (public.get_pro_connection(t.c('a9b')) ->> 'endedBy') = 'them'
  and (public.get_pro_connection(t.c('a9b')) ->> 'otherLabel') = 'Former stylist');
select t.as_admin();
select t.check('A9 ended as the stylist, a shell', (select ended_by = 'stylist' and shell_at is not null from public.pro_connections where id = t.c('a9b')));
-- a repaired shell is left alone: unblocking changes nothing, and a later read repairs nothing more
delete from public.user_blocks where blocker_id = t.c('a9b_s') and blocked_id = t.c('a9b_c');
select t.as_user(t.c('a9b_s'));
select count(*) from public.list_pro_connections('stylist');
select t.as_admin();
select t.check('A9 after the unblock the shell is unchanged', (select ended_by = 'stylist' and shell_at is not null and status = 'ended' from public.pro_connections where id = t.c('a9b')));

-- ─── B. Suspension ──────────────────────────────────────────────────────────

select t.as_admin();
select t.put('b_s', t.mk_stylist('bs', true)::text);                     -- the person suspended: a stylist, and also a client of T
select t.put('b_t', t.mk_stylist('bt', true)::text);
select t.put('b_x', t.mk_user('bx')::text); select t.put('b_y', t.mk_user('by')::text);
select t.put('b_sx', t.mk_conn(t.c('b_s'), t.c('b_x'), 'Client X')::text);
select t.put('b_sy', t.mk_conn(t.c('b_s'), t.c('b_y'), 'Client Y')::text);
select t.put('b_ts', t.mk_conn(t.c('b_t'), t.c('b_s'), 'Stylist S as a client')::text);
update public.pro_members set client_terms_version = '2026-10', client_terms_accepted_at = now() where user_id = t.c('b_s');
select t.fill(t.c('b_sx')); select t.fill(t.c('b_ts'));
select t.put('b_code', t.mk_invite(t.c('b_s')));
select t.as_user(t.c('b_x'));
select t.check('B before: the code of the stylist previews', (public.preview_pro_invite(t.get('b_code')) ->> 'valid') = 'true');
select t.as_user(t.u('eve'));
select t.throws('B the admin functions are closed to an app user', format($$select public.pro_admin_suspend(%L, 'x')$$, t.c('b_s')), 'permission denied');
select t.as_anon();
select t.throws('B and to a guest', format($$select public.pro_admin_suspend(%L, 'x')$$, t.c('b_s')), 'permission denied');
select t.as_service();
select public.pro_admin_suspend(t.c('b_s'), 'a test suspension');
select t.as_admin();
select t.check('B the suspension is recorded on the person with its reason',
  (select suspended_at is not null and suspended_reason = 'a test suspension' from public.pro_members where user_id = t.c('b_s')));
select t.check('B every active connection of theirs, on either side, ended as system',
  (select count(*) = 3 and bool_and(status = 'ended' and ended_by = 'system' and shell_at is null)
     from public.pro_connections where id in (t.c('b_sx'), t.c('b_sy'), t.c('b_ts'))));
select t.eq('B their grants are gone and a connection_ended event was written for the one that had a grant',
  (select count(*) from public.pro_grants where connection_id in (t.c('b_sx'), t.c('b_ts'))) || '/' ||
  (select count(*) from public.pro_grant_events where connection_id in (t.c('b_sx'), t.c('b_ts')) and event = 'connection_ended'), '0/2');
select t.as_user(t.c('b_s'));
select t.check('B the suspended person can ask for status and sees they are suspended', (public.get_pro_status() ->> 'suspended') = 'true');
select t.throws('B create_pro_invite is paused', $$select public.create_pro_invite(gen_random_uuid())$$, 'pro_suspended', null, null, '42501');
select t.throws('B so is saving the profile', $$select public.save_stylist_profile('Bs Stylist', '', '', array['outfit_styling'], '{}', '', true)$$, 'pro_suspended');
select t.throws('B so is accepting terms', $$select public.accept_pro_terms('client', '2026-10', true)$$, 'pro_suspended');
select t.throws('B and messaging', format($$select public.send_pro_message(%L, 'hello', gen_random_uuid())$$, t.c('b_sx')), 'pro_suspended');
select t.eq('B the list of connections still answers (a way out)', (select count(*) from public.list_pro_connections('stylist')), 2::bigint);
select t.check('B and so does the history of an ended connection, with its messages',
  jsonb_array_length((public.get_pro_thread(t.c('b_sx')))->'messages') >= 2);
select t.as_user(t.c('b_x'));
select t.check('B the client sees "ended by them" and the label stays (the list never says "system": a suspension is not for them to learn)', (select ended_by = 'stylist' and other_label = 'Bs Stylist' from public.list_pro_connections('client') where connection_id = t.c('b_sx')));
select t.eq('B and no row of the client''s list says "system" (nor does the suspended stylist''s own list)',
  (select count(*) from public.list_pro_connections('client') where ended_by = 'system'), 0::bigint);
select t.check('B the client''s own view says ended by them',
  (public.get_pro_connection(t.c('b_sx')) ->> 'endedBy') = 'them');
select t.check('B the suspended stylist''s code now answers invite_invalid', public.preview_pro_invite(t.get('b_code')) = '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_service();
select public.pro_admin_unsuspend(t.c('b_s'));
select t.throws('B unsuspending a person with no pro record is unavailable', $$select public.pro_admin_unsuspend(gen_random_uuid())$$, 'pro_unavailable');
select t.as_admin();
select t.check('B unsuspending clears the flag and the reason', (select suspended_at is null and suspended_reason is null from public.pro_members where user_id = t.c('b_s')));
select t.check('B and restores nothing: the connections stay ended', (select count(*) = 3 and bool_and(status = 'ended') from public.pro_connections where id in (t.c('b_sx'), t.c('b_sy'), t.c('b_ts'))));
select t.as_user(t.c('b_s'));
select t.ok('B the stylist can create a code again', $$select public.create_pro_invite(gen_random_uuid())$$);
select t.as_user(t.c('b_x'));
select t.check('B the old code works again (it was only refused during the suspension)', (public.preview_pro_invite(t.get('b_code')) ->> 'valid') = 'true');

-- ─── C. The ways out under every kind of pause ──────────────────────────────

select t.as_admin();
-- A person with four connections: an ended one with history, and three active ones (one to stop sharing and report on,
-- one to end, one to block). p_client says whether the person is the client or the stylist of them.
create function t.exit_fixture(p_tag text, p_client boolean) returns void language plpgsql as $$
declare who uuid; o uuid; i integer; cid uuid;
begin
  if p_client then who := t.mk_user(p_tag || 'x'); else who := t.mk_stylist(p_tag || 'x', true); end if;
  perform t.put(p_tag || '_who', who::text);
  for i in 0..3 loop
    if p_client then o := t.mk_stylist(p_tag || 's' || i, true); else o := t.mk_user(p_tag || 'c' || i); end if;
    if i = 0 then
      cid := t.mk_ended(case when p_client then o else who end, case when p_client then who else o end);
    elsif p_client then
      cid := t.mk_conn(o, who, 'Client ' || p_tag);
    else
      cid := t.mk_conn(who, o, 'Client ' || p_tag || i);
    end if;
    if i = 1 then perform t.fill(cid); end if;
    perform t.put(p_tag || '_c' || i, cid::text);
  end loop;
end $$;

-- Everything a person must still be able to do, as that person, in whatever state the caller has put them in.
-- p_safety_only: what get_pro_connection should say about the active connections (the role's own gate would refuse).
create function t.exits(p_label text, p_tag text, p_client boolean, p_safety_only boolean, p_live boolean default true) returns void language plpgsql as $$
declare
  who   uuid := t.c(p_tag || '_who');
  ended uuid := t.c(p_tag || '_c0');
  a1    uuid := t.c(p_tag || '_c1');
  a2    uuid := t.c(p_tag || '_c2');
  a3    uuid := t.c(p_tag || '_c3');
  role  text := case when p_client then 'client' else 'stylist' end;
begin
  perform t.as_user(who);
  perform t.chk(p_label || ': the ended connection opens', format($q$(public.get_pro_connection(%L) ->> 'status') = 'ended'$q$, ended));
  perform t.chk(p_label || ': its thread is readable, with the history', format($q$jsonb_array_length((public.get_pro_thread(%L)) -> 'messages') >= 3$q$, ended));
  perform t.chk(p_label || ': its looks are readable', format($q$(select count(*) from public.list_pro_recommendations(%L)) >= 1$q$, ended));
  perform t.chk(p_label || ': its sessions are readable', format($q$(select count(*) from public.list_pro_appointments(%L, 'past')) >= 1$q$, ended));
  perform t.chk(p_label || ': the list of connections answers', format($q$(select count(*) from public.list_pro_connections(%L)) >= 1$q$, role));
  perform t.chk(p_label || ': a connection opens, safety-only as expected',
                format($q$(public.get_pro_connection(%L) ->> 'safetyOnly')::boolean = %L$q$, a1, p_safety_only));
  if p_live then
    perform t.chk(p_label || ': the list shows no message preview when the role''s own gate would refuse',
                  format($q$(select bool_and((last_message_preview is null) = %L) from public.list_pro_connections(%L) where status = 'active')$q$, p_safety_only, role));
    perform t.chk(p_label || ': an active connection offers End', format($q$(public.get_pro_connection(%L) -> 'actions' ->> 'canEnd') = 'true'$q$, a1));
    perform t.chk(p_label || ': and offers no message or proposal while safety-only',
                  format($q$(public.get_pro_connection(%L) -> 'actions' ->> 'canMessage')::boolean = %L$q$, a1, not p_safety_only));
  end if;
  if p_client then
    perform t.chk(p_label || ': the client sees what is shared', format($q$(public.get_pro_grant(%L) ->> 'enabled') = 'true'$q$, a1));
    perform t.chk(p_label || ': and Stop sharing is offered', format($q$(public.get_pro_connection(%L) -> 'actions' ->> 'canStopSharing') = 'true'$q$, a1));
    perform t.ok(p_label || ': the client stops sharing, with no text version', format($q$select public.set_pro_grant(%L, 'closet', false)$q$, a1));
    perform t.chk(p_label || ': and it is off', format($q$(public.get_pro_grant(%L) ->> 'enabled') = 'false'$q$, a1));
  end if;
  perform t.ok(p_label || ': report', format($q$select public.report_pro_content('connection', %L, 'spam')$q$, a1));
  perform t.ok(p_label || ': report the ended connection', format($q$select public.report_pro_content('connection', %L, 'harassment')$q$, ended));
  perform t.ok(p_label || ': end', format($q$select public.end_pro_connection(%L)$q$, a2));
  perform t.chk(p_label || ': and it ended', format($q$(public.get_pro_connection(%L) ->> 'status') = 'ended'$q$, a2));
  perform t.ok(p_label || ': block', format($q$select public.block_pro_member(p_connection => %L)$q$, a3));
  perform t.chk(p_label || ': and the connection is a shell', format($q$(public.get_pro_connection(%L) ->> 'otherLabel') like 'Former %%'$q$, a3));
  perform t.chk(p_label || ': the block is listed', $q$(select count(*) from public.list_pro_blocks()) = 1$q$);
  perform t.ok(p_label || ': unblock', $q$select public.unblock_pro_member((select ref from public.list_pro_blocks()))$q$);
  perform t.chk(p_label || ': export has the whole connection list',
                $q$(select jsonb_array_length(public.export_my_pro_data() -> 'connections')) = 4$q$);
end $$;

-- C1: the feature is switched off. Everyone can still leave, report, block and take their data.
select t.as_admin();
select t.exit_fixture('c1c', true); select t.exit_fixture('c1s', false);
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.exits('C1 paused, client', 'c1c', true, true);
select t.exits('C1 paused, stylist', 'c1s', false, true);
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';

-- C2: the person is suspended (the flag alone: their connections are still open).
select t.exit_fixture('c2c', true); select t.exit_fixture('c2s', false);
update public.pro_members set suspended_at = now(), suspended_reason = 'a test' where user_id in (t.c('c2c_who'), t.c('c2s_who'));
select t.exits('C2 suspended, client', 'c2c', true, true);
select t.exits('C2 suspended, stylist', 'c2s', false, true);

-- C3: stale terms. A new client terms version stops the client's content, and a new stylist terms version the stylist's.
select t.as_admin();
select t.exit_fixture('c3c', true); select t.exit_fixture('c3s', false);
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.exits('C3 stale client terms, client', 'c3c', true, true);
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';
update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.exits('C3 stale stylist terms, stylist', 'c3s', false, true);
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';

-- C4: the stylist closed the profile. Their connections ended; what they wrote and what they said stay readable to them.
select t.exit_fixture('c4s', false);
select t.as_user(t.c('c4s_who'));
select public.close_stylist_profile();
select t.exits('C4 closed profile, stylist', 'c4s', false, true, false);
select t.as_admin();
select t.check('C4 a closed profile has no profile row and no invite, and keeps the approval and the terms',
  not exists (select 1 from public.pro_stylists where user_id = t.c('c4s_who'))
  and (select stylist_approved_at is not null and stylist_terms_version = '2026-10' from public.pro_members where user_id = t.c('c4s_who')));

-- ─── D. close_stylist_profile ───────────────────────────────────────────────

select t.put('d_s', t.mk_stylist('ds', true)::text); select t.put('d_x', t.mk_user('dx')::text); select t.put('d_y', t.mk_user('dy')::text);
select t.put('d_sx', t.mk_conn(t.c('d_s'), t.c('d_x'), 'Client DX')::text); select t.put('d_sy', t.mk_conn(t.c('d_s'), t.c('d_y'), 'Client DY')::text);
select t.fill(t.c('d_sx'));
select t.mk_invite(t.c('d_s')); select t.mk_invite(t.c('d_s'), 'used'); select t.mk_invite(t.c('d_s'), 'revoked');
select t.as_user(t.c('d_s'));
select public.close_stylist_profile();
select t.as_admin();
select t.check('D both connections ended as the stylist''s, no shell', (select count(*) = 2 and bool_and(status = 'ended' and ended_by = 'stylist' and shell_at is null)
  from public.pro_connections where id in (t.c('d_sx'), t.c('d_sy'))));
select t.check('D the grant went with the end, the sessions were cancelled, the looks and messages stay',
  t.content(t.c('d_sx')) ~ '^[0-9]+/2/1/1/[0-9]+/0/0$' and (select status from public.pro_appointments where connection_id = t.c('d_sx')) = 'cancelled');
select t.eq('D the invites are deleted', (select count(*) from public.pro_invites where stylist_id = t.c('d_s')), 0::bigint);
select t.eq('D the profile row is deleted', (select count(*) from public.pro_stylists where user_id = t.c('d_s')), 0::bigint);
select t.as_user(t.c('d_x'));
select t.check('D the client sees an ended connection, ended by them, and the stylist''s name stays',
  (select status = 'ended' and ended_by = 'stylist' and other_label = 'Ds Stylist' from public.list_pro_connections('client') where connection_id = t.c('d_sx'))
  and (public.get_pro_connection(t.c('d_sx')) ->> 'endedBy') = 'them');
select t.as_user(t.c('d_s'));
select t.ok('D closing again is a no-op', 'select public.close_stylist_profile()');
select t.check('D the stylist still reads the looks they wrote', (select count(*) = 2 from public.list_pro_recommendations(t.c('d_sx'))));
select t.throws('D but the stylist workspace is closed without a profile', $$select public.set_stylist_accepting(true)$$, 'stylist_profile_required');
select t.as_user(t.u('eve'));
select t.ok('D a person with no profile can call it too (a no-op)', 'select public.close_stylist_profile()');
-- a paused feature, a suspension or stale terms do not stop a stylist from closing
select t.as_admin();
select t.put('d2_s', t.mk_stylist('d2s', true)::text); select t.put('d2_x', t.mk_user('d2x')::text);
select t.put('d2', t.mk_conn(t.c('d2_s'), t.c('d2_x'))::text);
update public.pro_config set value = 'false' where key = 'pro_enabled';
update public.pro_members set suspended_at = now() where user_id = t.c('d2_s');
update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.as_user(t.c('d2_s'));
select t.ok('D a paused, suspended, out-of-date stylist can still close the profile', 'select public.close_stylist_profile()');
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';
select t.check('D and it ended their connection', (select status = 'ended' and ended_by = 'stylist' from public.pro_connections where id = t.c('d2')));

-- ─── E. A terms bump gates content, not the ways out ────────────────────────

select t.put('e_s', t.mk_stylist('es', true)::text); select t.put('e_c', t.mk_user('ec')::text);
select t.put('e', t.mk_conn(t.c('e_s'), t.c('e_c'), 'Client E')::text);
select t.fill(t.c('e'));
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.as_user(t.c('e_c'));
select t.throws('E client terms stale: a message is refused', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, t.c('e')), 'pro_terms_required', 'client', null, '42501');
select t.throws('E client terms stale: the live thread is refused', format($$select public.get_pro_thread(%L)$$, t.c('e')), 'pro_terms_required', 'client');
select t.throws('E client terms stale: the live looks are refused', format($$select * from public.list_pro_recommendations(%L)$$, t.c('e')), 'pro_terms_required');
select t.throws('E client terms stale: sharing cannot be turned on', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.c('e')), 'pro_terms_required');
select t.throws('E client terms stale: a session cannot be proposed', format($$select public.propose_pro_appointment(%L, now() + interval '3 days', 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('e')), 'pro_terms_required');
select t.throws('E client terms stale: the alias cannot be changed', format($$select public.set_pro_alias(%L, 'Someone')$$, t.c('e')), 'pro_terms_required');
select t.as_user(t.c('e_s'));
select t.ok('E the stylist (terms current) can still write', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, t.c('e')));
select t.as_user(t.c('e_c'));
select public.accept_pro_terms('client', '2026-11', true);
select t.ok('E accepting the new version opens the content again', format($$select public.send_pro_message(%L, 'thanks', gen_random_uuid())$$, t.c('e')));
select t.as_admin();
update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.as_user(t.c('e_s'));
select t.throws('E stylist terms stale: a message is refused', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, t.c('e')), 'pro_terms_required', 'stylist');
select t.throws('E stylist terms stale: the closet is refused', format($$select * from public.get_client_closet(%L)$$, t.c('e')), 'pro_terms_required', 'stylist');
select t.throws('E stylist terms stale: a look cannot be written', format($$select public.save_pro_recommendation(%L, null, 'A look', '', null, gen_random_uuid())$$, t.c('e')), 'pro_terms_required');
select t.throws('E stylist terms stale: a code cannot be made', $$select public.create_pro_invite(gen_random_uuid())$$, 'pro_terms_required');
select t.ok('E the stylist can still end', format($$select public.end_pro_connection(%L)$$, t.c('e')));
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';

-- ─── F. The churn hold ──────────────────────────────────────────────────────

-- Ten short connections that the client ended in a month hold a stylist's new invites; ten that the stylist ended do not.
create function t.churn(p_tag text, p_n integer, p_by text, p_hours integer default 1, p_block boolean default false) returns uuid
language plpgsql as $$
declare s uuid := t.mk_stylist(p_tag, true); c uuid; cid uuid; i integer;
begin
  for i in 1..p_n loop
    c := t.mk_user(p_tag || 'c' || i);
    cid := t.mk_conn(s, c, 'Churn ' || i);
    update public.pro_connections set started_at = now() - make_interval(hours => p_hours) where id = cid;
    perform t.as_user(case when p_by = 'client' then c else s end);
    if p_block then perform public.block_pro_member(p_connection => cid); else perform public.end_pro_connection(cid); end if;
    perform t.as_admin();
  end loop;
  return s;
end $$;
select t.put('f1', t.churn('f1', 9, 'client')::text);
select t.check('F nine short connections ended by clients do not hold', not public.pro_invites_held(t.c('f1')));
select t.as_admin();
select t.put('f1b', t.churn('f1b', 10, 'client')::text);
select t.check('F ten short connections ended by clients hold the invites, as the system',
  public.pro_invites_held(t.c('f1b')) and (select invites_held_by = 'system' from public.pro_members where user_id = t.c('f1b')));
select t.as_user(t.c('f1b'));
select t.throws('F a held stylist cannot create a code', $$select public.create_pro_invite(gen_random_uuid())$$, 'invites_held', null, null, '42501');
select t.as_admin();
select t.put('f2', t.churn('f2', 10, 'stylist')::text);
select t.check('F ten short connections ended by the stylist (junk redemptions removed) do not hold', not public.pro_invites_held(t.c('f2')));
select t.put('f3', t.churn('f3', 10, 'client', 1, true)::text);
select t.check('F ten blocks by clients count as client endings', public.pro_invites_held(t.c('f3')));
select t.put('f4', t.churn('f4', 9, 'client', 1)::text);
select t.put('f4_late', t.mk_user('f4late')::text);
select t.put('f4_conn', t.mk_conn(t.c('f4'), t.c('f4_late'), 'Late')::text);
update public.pro_connections set started_at = now() - interval '3 days' where id = t.c('f4_conn');
select t.as_user(t.c('f4_late'));
select public.end_pro_connection(t.c('f4_conn'));
select t.as_admin();
select t.check('F a ninth short one plus a long one (over 48 hours) do not hold', not public.pro_invites_held(t.c('f4')));
-- an admin hold is never replaced by a system one
select t.put('f5', t.churn('f5', 9, 'client')::text);
select t.as_service(); select public.pro_admin_hold_stylist(t.c('f5')); select t.as_admin();
select t.put('f5_last', t.mk_user('f5last')::text);
select t.put('f5_conn', t.mk_conn(t.c('f5'), t.c('f5_last'), 'Last')::text);
update public.pro_connections set started_at = now() - interval '1 hour' where id = t.c('f5_conn');
select t.as_user(t.c('f5_last')); select public.end_pro_connection(t.c('f5_conn')); select t.as_admin();
select t.check('F a hold a person made stays theirs when the churn rule fires', (select invites_held_by = 'admin' from public.pro_members where user_id = t.c('f5')));

-- ─── G. pro_refresh ─────────────────────────────────────────────────────────

-- G1: an expired grant is deleted, with exactly one 'expired' event, whoever refreshes and however often.
select t.put('g1_s', t.mk_stylist('g1s', true)::text); select t.put('g1_c', t.mk_user('g1c')::text);
select t.put('g1', t.mk_conn(t.c('g1_s'), t.c('g1_c'), 'Client G1')::text);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.c('g1'), 'closet', 'selected', now() - interval '1 hour', '2026-10');
insert into public.pro_grant_items (connection_id, item_id) values (t.c('g1'), t.item('bea', 2));
select t.as_user(t.c('g1_s')); select count(*) from public.list_pro_connections('stylist');
select t.as_user(t.c('g1_c')); select count(*) from public.list_pro_connections('client'); select count(*) from public.list_pro_connections('client');
select t.as_admin();
select t.eq('G1 the grant and its pieces are gone, with one expired event', (select count(*) from public.pro_grants where connection_id = t.c('g1')) || '/'
  || (select count(*) from public.pro_grant_items where connection_id = t.c('g1')) || '/'
  || (select count(*) from public.pro_grant_events where connection_id = t.c('g1') and event = 'expired'), '0/0/1');
select t.check('G1 the connection itself did not move', (select status = 'active' from public.pro_connections where id = t.c('g1')));

-- G2: a proposal whose start has passed expires; a confirmed session that has ended is completed.
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes) values
  (t.c('g1'), 'stylist', 'proposed', now() - interval '1 day', 60, 'virtual', 0),
  (t.c('g1'), 'client', 'confirmed', now() - interval '2 days', 60, 'virtual', 0),
  (t.c('g1'), 'client', 'confirmed', now() + interval '2 days', 60, 'virtual', 0);
select t.as_user(t.c('g1_s')); select count(*) from public.list_pro_connections('stylist');
select t.as_admin();
select t.eq('G2 expired, completed and left alone', (select string_agg(status, ',' order by starts_at) from public.pro_appointments where connection_id = t.c('g1')), 'completed,expired,confirmed');

-- G3: grant pieces of a connection with no grant are cleared.
insert into public.pro_grant_items (connection_id, item_id) values (t.c('g1'), t.item('bea', 3));
select t.as_user(t.c('g1_c')); select count(*) from public.list_pro_connections('client');
select t.as_admin();
select t.eq('G3 orphan pieces are deleted', (select count(*) from public.pro_grant_items where connection_id = t.c('g1')), 0::bigint);

-- G4: the repair of a connection an account deletion left half done. The trigger is switched off for the test, as if it
-- had failed (it swallows its errors, so a deletion never fails because of it).
select t.put('g4_s', t.mk_stylist('g4s', true)::text); select t.put('g4_c', t.mk_user('g4c')::text);
select t.put('g4', t.mk_conn(t.c('g4_s'), t.c('g4_c'), 'Client G4')::text);
select t.fill(t.c('g4'));
alter table public.pro_connections disable trigger pro_on_member_left;
delete from auth.users where id = t.c('g4_c');
alter table public.pro_connections enable trigger pro_on_member_left;
select t.check('G4 before the repair: the connection is active with no client, and still holds the client''s looks and grant',
  (select status = 'active' and client_id is null and client_alias = 'Client G4' from public.pro_connections where id = t.c('g4'))
  and (select count(*) = 2 from public.pro_recommendations where connection_id = t.c('g4')));
select t.as_user(t.c('g4_s'));
select t.check('G4 the stylist''s next read shows a stub', (select other_label = 'Former client' and status = 'ended' and ended_by = 'client'
  from public.list_pro_connections('stylist') where connection_id = t.c('g4')));
select t.as_admin();
select t.check('G4 the repair ended it as the system, cleared the alias, and deleted looks, sessions, events, counters and grant',
  (select status = 'ended' and ended_by = 'system' and client_alias is null and client_id is null from public.pro_connections where id = t.c('g4'))
  and t.content(t.c('g4')) ~ '^[0-9]+/0/0/0/0/0/0$');
-- and the stylist side: a stylist who left leaves the client the looks already delivered
select t.put('g5_s', t.mk_stylist('g5s', true)::text); select t.put('g5_c', t.mk_user('g5c')::text);
select t.put('g5', t.mk_conn(t.c('g5_s'), t.c('g5_c'), 'Client G5')::text);
select t.fill(t.c('g5'));
alter table public.pro_connections disable trigger pro_on_member_left;
delete from auth.users where id = t.c('g5_s');
alter table public.pro_connections enable trigger pro_on_member_left;
select t.as_user(t.c('g5_c'));
select t.check('G5 the client''s next read shows "Former stylist"', (select other_label = 'Former stylist' and status = 'ended' from public.list_pro_connections('client') where connection_id = t.c('g5')));
select t.as_admin();
select t.check('G5 the stylist''s label is cleared, the grant is gone, the delivered look stays',
  (select stylist_label is null and stylist_id is null from public.pro_connections where id = t.c('g5'))
  and (select count(*) = 0 from public.pro_grants where connection_id = t.c('g5'))
  and (select count(*) = 1 from public.pro_recommendations where connection_id = t.c('g5') and status = 'sent'));

-- ─── H. The janitor ─────────────────────────────────────────────────────────

select t.put('h_s', t.mk_stylist('hs', true)::text);
select t.put('h_a', t.mk_user('ha')::text); select t.put('h_b', t.mk_user('hb')::text); select t.put('h_c', t.mk_user('hc')::text);
select t.put('h_ca', t.mk_conn(t.c('h_s'), t.c('h_a'), 'HA')::text);                 -- active: messages 181 and 179 days old
select t.put('h_cb', t.mk_conn(t.c('h_s'), t.c('h_b'), 'HB')::text);                 -- ended 31 days ago
select t.put('h_cc', t.mk_conn(t.c('h_s'), t.c('h_c'), 'HC')::text);                 -- ended 91 days ago
insert into public.pro_messages (connection_id, sender_id, kind, body, created_at) values
  (t.c('h_ca'), t.c('h_a'), 'text', 'old message', now() - interval '181 days'),
  (t.c('h_ca'), t.c('h_a'), 'text', 'recent message', now() - interval '179 days');
select t.fill(t.c('h_cb'), false); select t.fill(t.c('h_cc'), false);
update public.pro_connections set status = 'ended', ended_at = now() - interval '31 days', ended_by = 'client', started_at = now() - interval '40 days' where id = t.c('h_cb');
update public.pro_connections set status = 'ended', ended_at = now() - interval '91 days', ended_by = 'client', started_at = now() - interval '100 days' where id = t.c('h_cc');
insert into public.pro_closet_views (connection_id, day, pages) values (t.c('h_ca'), current_date - 91, 1), (t.c('h_ca'), current_date - 89, 1);
-- invites: each counted from its own date
insert into public.pro_invites (stylist_id, code, status, expires_at, client_ref, created_at, used_at, revoked_at) values
  (t.c('h_s'), 'HH00000001', 'used',    now() - interval '35 days', gen_random_uuid(), now() - interval '40 days', now() - interval '31 days', null),
  (t.c('h_s'), 'HH00000002', 'used',    now() - interval '35 days', gen_random_uuid(), now() - interval '40 days', now() - interval '29 days', null),
  (t.c('h_s'), 'HH00000003', 'revoked', now() - interval '33 days', gen_random_uuid(), now() - interval '40 days', null, now()),
  (t.c('h_s'), 'HH00000004', 'revoked', now() - interval '45 days', gen_random_uuid(), now() - interval '50 days', null, now() - interval '31 days'),
  (t.c('h_s'), 'HH00000005', 'live',    now() - interval '31 days', gen_random_uuid(), now() - interval '38 days', null, null),
  (t.c('h_s'), 'HH00000006', 'live',    now() - interval '29 days', gen_random_uuid(), now() - interval '36 days', null, null);
insert into public.pro_rate_counters (user_id, bucket, window_start, n) values
  (t.c('h_a'), 'message_day', now() - interval '3 days', 5), (t.c('h_a'), 'message_day', now() - interval '1 day', 5);
-- the throttle: a sweep inside 15 minutes of the last one does nothing
update public.pro_meta set last_janitor_at = now() where id;
select t.as_service(); select public.pro_janitor(false); select t.as_admin();
select t.eq('H a sweep inside the throttle deletes nothing', (select count(*) from public.pro_invites where code ~ '^HH0000000[0-9]$') || '/' || (select count(*) from public.pro_rate_counters where user_id = t.c('h_a')), '6/2');
update public.pro_meta set last_janitor_at = now() - interval '16 minutes' where id;
select t.as_service(); select public.pro_janitor(false); select t.as_admin();
select t.check('H after the throttle the sweep runs and stamps the time', (select last_janitor_at > now() - interval '1 minute' from public.pro_meta));
select t.eq('H messages: 181 days and the ones of a connection ended 31 days ago are gone, 179 days stays',
  (select string_agg(body, ',' order by body) from public.pro_messages where connection_id in (t.c('h_ca'), t.c('h_cb'))), 'recent message');
select t.eq('H the connection ended 31 days ago stays, with its looks and sessions', (select count(*) from public.pro_connections where id = t.c('h_cb')) || '/' || (select count(*) from public.pro_recommendations where connection_id = t.c('h_cb')), '1/2');
select t.eq('H the connection ended 91 days ago is deleted, with everything under it',
  (select count(*) from public.pro_connections where id = t.c('h_cc')) || '/' || (select count(*) from public.pro_recommendations where connection_id = t.c('h_cc'))
  || '/' || (select count(*) from public.pro_appointments where connection_id = t.c('h_cc')) || '/' || (select count(*) from public.pro_closet_views where connection_id = t.c('h_cc')), '0/0/0/0');
select t.eq('H invites are kept 30 days from used, revoked or expiry (a code made 40 days ago and revoked just now stays)',
  (select string_agg(code, ',' order by code) from public.pro_invites where code ~ '^HH0000000[0-9]$'), 'HH00000002,HH00000003,HH00000006');
select t.eq('H rate counters older than two days are gone', (select count(*) from public.pro_rate_counters where user_id = t.c('h_a') and bucket = 'message_day'), 1::bigint);
select t.eq('H closet view counters older than 90 days are gone', (select count(*) from public.pro_closet_views where connection_id = t.c('h_ca')), 1::bigint);
-- idempotent
select t.put('h_before', (select count(*) from public.pro_messages)::text || '/' || (select count(*) from public.pro_connections)::text || '/' || (select count(*) from public.pro_invites)::text);
select t.as_service(); select public.pro_janitor(true); select t.as_admin();
select t.eq('H a second forced sweep changes nothing', (select count(*) from public.pro_messages)::text || '/' || (select count(*) from public.pro_connections)::text || '/' || (select count(*) from public.pro_invites)::text, t.get('h_before'));
-- bounded: one sweep removes at most 5,000 rows of a table
delete from public.pro_rate_counters where window_start < now() - interval '2 days';
insert into public.pro_rate_counters (user_id, bucket, window_start, n)
  select t.c('h_b'), 'bulk_day', now() - interval '3 days' - n * interval '1 second', 1 from generate_series(1, 5001) n;
select t.as_service(); select public.pro_janitor(true); select t.as_admin();
select t.eq('H one sweep deletes at most 5,000 rows (one is left)', (select count(*) from public.pro_rate_counters where bucket = 'bulk_day'), 1::bigint);
select t.as_service(); select public.pro_janitor(true); select t.as_admin();
select t.eq('H and the next sweep finishes the job', (select count(*) from public.pro_rate_counters where bucket = 'bulk_day'), 0::bigint);
-- only the service role runs it
select t.as_user(t.c('h_a'));
select t.throws('H an app user cannot run the janitor', $$select public.pro_janitor(true)$$, 'permission denied');
select t.as_anon();
select t.throws('H a guest cannot run it', $$select public.pro_janitor(true)$$, 'permission denied');
