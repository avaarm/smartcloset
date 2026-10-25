-- p6_moderation (files 1 to 8)
--   A  report_pro_content: each reference type, who may report what, bad input, the details filter, the safety gate
--   B  evidence: chat (marked, flagged message kept, the byte budget), profile, look, session, invite; and the same
--      long messages through report_swap_content
--   C  the daily limit shared with report_user and report_swap_content; folding of identical reports only
--   D  the widened constraints; report_user keeps its narrow lists
--   E  the automatic hold: who counts, what it changes, how it ends; creating a profile; close/save; remove/restore
--   F  a client's serious report stops that client's own sharing
--   G  the admin functions, the views, the backlog, the digest and the switch
--   H  block_pro_member: label, list, limit
--   I  export_my_pro_data: the caller's own data only

select t.as_admin();
create function t.ok(p_label text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t.log(ok, label, detail) values (true, p_label, null);
exception when others then
  insert into t.log(ok, label, detail) values (false, p_label, sqlerrm);
end $$;
create function t.chk(p_label text, p_expr text) returns void language plpgsql as $$
declare b boolean;
begin
  execute 'select coalesce((' || p_expr || ')::boolean, false)' into b;
  insert into t.log(ok, label, detail) values (b, p_label, case when b then null else 'false' end);
exception when others then
  insert into t.log(ok, label, detail) values (false, p_label, sqlerrm);
end $$;
create function t.c(p_name text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_name $$;

-- A message in a connection, made directly: returns its id.
create function t.msg(p_conn uuid, p_sender uuid, p_body text, p_at timestamptz default now()) returns bigint language sql as $$
  insert into public.pro_messages (connection_id, sender_id, kind, body, created_at) values (p_conn, p_sender, 'text', p_body, p_at) returning id $$;

-- The reports a reporter has filed about a reference: one text, "context/reason/reported".
create function t.rep(p_reporter uuid, p_ref uuid) returns text language sql stable as $$
  select coalesce(string_agg(context || '/' || reason || '/' || reported_user_id::text, ',' order by created_at, id), '')
    from public.content_reports where reporter_id = p_reporter and ref_id = p_ref $$;

-- ─── A. report_pro_content ──────────────────────────────────────────────────

-- Ann (approved stylist) works with Bea (connection three days old) and with Cat (new; Ann has sent her three text messages).
select t.put('ab', t.mk_conn(t.u('ann'), t.u('bea'), 'Bea B')::text);
select t.put('ac', t.mk_conn(t.u('ann'), t.u('cat'), 'Cat C')::text);
update public.pro_connections set started_at = now() - interval '3 days' where id = t.c('ab');
select t.msg(t.c('ac'), t.u('cat'), 'hello'); select t.msg(t.c('ac'), t.u('ann'), 'hi'); select t.msg(t.c('ac'), t.u('cat'), 'thanks');
select t.msg(t.c('ac'), t.u('ann'), 'welcome'); select t.msg(t.c('ac'), t.u('ann'), 'see you soon');
select t.put('m_ann', t.msg(t.c('ab'), t.u('ann'), 'a message from Ann')::text);
select t.put('m_bea', t.msg(t.c('ab'), t.u('bea'), 'a message from Bea')::text);
select t.put('m_ann2', t.msg(t.c('ab'), t.u('ann'), 'a second message from Ann')::text);
insert into public.pro_messages (connection_id, kind, code) values (t.c('ab'), 'system', 'connected');
select t.put('m_sys', (select max(id)::text from public.pro_messages where connection_id = t.c('ab') and kind = 'system'));
-- a sent look with a piece and a draft, a session
insert into public.pro_recommendations (connection_id, title, body, status, sent_at, client_rating, client_comment)
values (t.c('ab'), 'Weekend look', 'Wear the scarf', 'sent', now() - interval '1 day', 4, 'Nice');
select t.put('look', (select id::text from public.pro_recommendations where connection_id = t.c('ab') and status = 'sent'));
insert into public.pro_recommendation_items (recommendation_id, position, item_id, name, category) values (t.c('look'), 1, null, 'Red scarf', 'accessories');
insert into public.pro_recommendations (connection_id, title, body) values (t.c('ab'), 'A draft look', 'Not sent');
select t.put('draft', (select id::text from public.pro_recommendations where connection_id = t.c('ab') and status = 'draft'));
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, place, note, utc_offset_minutes)
values (t.c('ab'), 'stylist', 'proposed', now() + interval '3 days', 60, 'in_person', 'The cafe on Main', 'Bring the scarf', 60);
select t.put('appt', (select id::text from public.pro_appointments where connection_id = t.c('ab')));
select t.put('m_ac', (select min(id)::text from public.pro_messages where connection_id = t.c('ac') and sender_id = t.u('ann')));
select t.mk_invite(t.u('ann'));
select t.put('inv', (select id::text from public.pro_invites where stylist_id = t.u('ann') limit 1));

-- A1: a profile report on a connection.
select t.as_user(t.u('bea'));
select public.report_pro_content('connection', t.c('ab'), 'spam');
select t.as_admin();
select t.check('A1 the report is stored about the stylist, in the profile context, with the reference and the reason',
  (select context = 'pro_profile' and reason = 'spam' and ref_type = 'connection' and ref_id = t.c('ab')
          and reporter_id = t.u('bea') and reported_user_id = t.u('ann') and details is null and reviewed_at is null
     from public.content_reports where reporter_id = t.u('bea') and ref_id = t.c('ab')));
select t.check('A1 the evidence is the profile as it is now, the role, and the qualified flag',
  (select evidence ->> 'kind' = 'profile' and evidence ->> 'reportedRole' = 'stylist' and evidence -> 'profile' ->> 'displayName' = 'Ann Styles'
          and evidence -> 'profile' ->> 'headline' = 'Wardrobe edits and capsule closets'
          and evidence -> 'profile' -> 'services' = '["wardrobe_audit","outfit_styling","virtual_sessions"]'::jsonb
          and evidence ->> 'qualified' = 'true' and evidence -> 'flaggedMessageId' = 'null'::jsonb and evidence ->> 'connectionStatus' = 'active'
     from public.content_reports where reporter_id = t.u('bea') and ref_id = t.c('ab')));
select t.check('A1 the evidence holds no account id and no email',
  (select evidence::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-' and evidence::text !~ '@' from public.content_reports where reporter_id = t.u('bea') and ref_id = t.c('ab')));

-- A2: a chat report with a message of the other person.
select t.as_user(t.u('bea'));
select public.report_pro_content('connection', t.c('ab'), 'harassment', 'rude and repeated', t.get('m_ann')::bigint);
select t.as_user(t.u('ann'));
select public.report_pro_content('connection', t.c('ab'), 'spam', null, t.get('m_bea')::bigint);
select t.as_admin();
select t.check('A2 a message report is a chat report, with the details',
  (select context = 'pro_chat' and reason = 'harassment' and details = 'rude and repeated' and reported_user_id = t.u('ann')
          and evidence ->> 'flaggedMessageId' = t.get('m_ann') and evidence ->> 'kind' = 'chat'
     from public.content_reports where reporter_id = t.u('bea') and ref_id = t.c('ab') and reason = 'harassment'));
select t.eq('A2 the messages are marked reporter, reported and system, oldest first, with the system line',
  (select string_agg(m ->> 'who', ',' order by (m ->> 'id')::bigint) from public.content_reports, jsonb_array_elements(evidence -> 'messages') m
    where reporter_id = t.u('bea') and reason = 'harassment'), 'reported,reporter,reported,system');
select t.check('A2 the stylist reporting a client''s message resolves the client and marks the roles the other way round',
  (select reported_user_id = t.u('bea') and context = 'pro_chat' and evidence ->> 'reportedRole' = 'client'
          and (select count(*) from jsonb_array_elements(evidence -> 'messages') m where m ->> 'who' = 'reporter') = 2
     from public.content_reports where reporter_id = t.u('ann') and ref_id = t.c('ab')));

-- A3: a look, a session, an invite.
select t.as_user(t.u('bea'));
select public.report_pro_content('recommendation', t.c('look'), 'inappropriate');
select public.report_pro_content('appointment', t.c('appt'), 'unsafe_meeting', 'a meeting place I do not like');
select public.report_pro_content('invite', t.c('inv'), 'impersonation');
select t.as_admin();
select t.eq('A3 a look report is content about the stylist', t.rep(t.u('bea'), t.c('look')), 'pro_content/inappropriate/' || t.u('ann'));
select t.eq('A3 a session report is content about the stylist', t.rep(t.u('bea'), t.c('appt')), 'pro_content/unsafe_meeting/' || t.u('ann'));
select t.eq('A3 an invite report is a profile report about the stylist', t.rep(t.u('bea'), t.c('inv')), 'pro_profile/impersonation/' || t.u('ann'));
select t.check('A3 the look evidence is the look and its pieces, with the client''s feedback',
  (select evidence ->> 'kind' = 'recommendation' and evidence ->> 'title' = 'Weekend look' and evidence -> 'items' -> 0 ->> 'name' = 'Red scarf'
          and evidence -> 'feedback' ->> 'comment' = 'Nice' and evidence ->> 'qualified' = 'true'
     from public.content_reports where ref_id = t.c('look')));
select t.check('A3 the session evidence is its fields',
  (select evidence ->> 'kind' = 'appointment' and evidence ->> 'place' = 'The cafe on Main' and evidence ->> 'note' = 'Bring the scarf'
          and evidence ->> 'mode' = 'in_person' and evidence ->> 'utcOffsetMinutes' = '60' and evidence::text !~ '"tz"' and evidence ->> 'proposedBy' = 'stylist'
     from public.content_reports where ref_id = t.c('appt')));
select t.check('A3 an invite report is never qualified, and carries the profile',
  (select evidence ->> 'qualified' = 'false' and evidence ->> 'inviteStatus' = 'live' and evidence -> 'profile' ->> 'displayName' = 'Ann Styles'
     from public.content_reports where ref_id = t.c('inv')));
select t.as_user(t.u('ann'));
select t.ok('A3 a stylist can report a draft look (a client cannot see it)', format($$select public.report_pro_content('recommendation', %L, 'harassment')$$, t.c('draft')));
select t.as_user(t.u('bea'));
select t.throws('A3 a client cannot report a draft look by its id', format($$select public.report_pro_content('recommendation', %L, 'spam')$$, t.c('draft')), 'pro_unavailable', null, null, '22023');

-- A4: who may not report what.
select t.as_user(t.u('eve'));
select t.throws('A4 a stranger cannot report a connection', format($$select public.report_pro_content('connection', %L, 'spam')$$, t.c('ab')), 'pro_unavailable');
select t.throws('A4 nor a look', format($$select public.report_pro_content('recommendation', %L, 'spam')$$, t.c('look')), 'pro_unavailable');
select t.throws('A4 nor a session', format($$select public.report_pro_content('appointment', %L, 'spam')$$, t.c('appt')), 'pro_unavailable');
select t.throws('A4 nor a message', format($$select public.report_pro_content('connection', %L, 'spam', null, %s)$$, t.c('ab'), t.get('m_ann')), 'pro_unavailable');
select t.as_user(t.u('cat'));
select t.throws('A4 another client cannot report Bea''s connection', format($$select public.report_pro_content('connection', %L, 'spam')$$, t.c('ab')), 'pro_unavailable');
select t.throws('A4 an unknown connection is unavailable', $$select public.report_pro_content('connection', gen_random_uuid(), 'spam')$$, 'pro_unavailable');
select t.throws('A4 an unknown invite is unavailable', $$select public.report_pro_content('invite', gen_random_uuid(), 'spam')$$, 'pro_unavailable');
select t.as_user(t.u('ann'));
select t.throws('A4 a stylist cannot report their own invite', format($$select public.report_pro_content('invite', %L, 'spam')$$, t.c('inv')), 'pro_unavailable');
select t.as_user(t.u('bea'));

-- A5: bad input.
select t.throws('A5 no reason', format($$select public.report_pro_content('connection', %L, null)$$, t.c('ab')), 'invalid_report', 'reason', null, '22023');
select t.throws('A5 a reason that is not on the list', format($$select public.report_pro_content('connection', %L, 'rude')$$, t.c('ab')), 'invalid_report', 'reason');
select t.throws('A5 "not_as_described" is a swap reason, not a pro one', format($$select public.report_pro_content('connection', %L, 'not_as_described')$$, t.c('ab')), 'invalid_report', 'reason');
select t.throws('A5 a reference type that is not a pro one', format($$select public.report_pro_content('listing', %L, 'spam')$$, t.c('ab')), 'invalid_report', 'ref_type');
select t.throws('A5 no reference type', format($$select public.report_pro_content(null, %L, 'spam')$$, t.c('ab')), 'invalid_report', 'ref_type');
select t.throws('A5 no reference', $$select public.report_pro_content('connection', null, 'spam')$$, 'invalid_report', 'ref_id');
select t.throws('A5 a message id with a look', format($$select public.report_pro_content('recommendation', %L, 'spam', null, 1)$$, t.c('look')), 'invalid_report', 'message_id');
select t.throws('A5 a message the reporter sent herself', format($$select public.report_pro_content('connection', %L, 'spam', null, %s)$$, t.c('ab'), t.get('m_bea')), 'invalid_report', 'message_id');
select t.throws('A5 a system line', format($$select public.report_pro_content('connection', %L, 'spam', null, %s)$$, t.c('ab'), t.get('m_sys')), 'invalid_report', 'message_id');
select t.throws('A5 a message from another connection', format($$select public.report_pro_content('connection', %L, 'spam', null, %s)$$, t.c('ab'), t.get('m_ac')), 'invalid_report', 'message_id');
select t.throws('A5 a message that does not exist', format($$select public.report_pro_content('connection', %L, 'spam', null, 999999999)$$, t.c('ab')), 'invalid_report', 'message_id');
-- the details are not filtered: a person reporting a scam must be able to quote it
select public.report_pro_content('connection', t.c('ab'), 'scam', 'He told me to pay with a gift card and send bitcoin, or wire transfer ' || U&'\202E' || 'drac tfig');
select public.report_pro_content('connection', t.c('ab'), 'impersonation', 'bad' || chr(1) || ' words' || chr(7) || '  ');
select public.report_pro_content('connection', t.c('ab'), 'other', repeat('x', 600));
select public.report_pro_content('connection', t.c('ab'), 'inappropriate', E'   \n  ');
select t.as_admin();
select t.check('A5 a report may quote a scam phrase, a payment word and reversed text: the details are stored as written (control characters stripped)',
  (select details like 'He told me to pay with a gift card and send bitcoin, or wire transfer %' from public.content_reports where reporter_id = t.u('bea') and reason = 'scam' and ref_id = t.c('ab'))
  and (select details = 'bad words' from public.content_reports where reporter_id = t.u('bea') and reason = 'impersonation' and ref_id = t.c('ab')));
select t.eq('A5 long details are cut to 500 characters', (select char_length(details) from public.content_reports where reporter_id = t.u('bea') and reason = 'other'), 500);
select t.check('A5 blank details are stored as nothing', (select details is null from public.content_reports where reporter_id = t.u('bea') and reason = 'inappropriate' and ref_id = t.c('ab')));

-- A6: the safety gate. Nothing but being signed in stops a report.
select t.as_no_subject();
select t.throws('A6 a token with no subject', format($$select public.report_pro_content('connection', %L, 'spam')$$, t.c('ab')), 'not_authenticated', null, null, '28000');
select t.as_anonymous_user(t.u('bea'));
select t.throws('A6 an anonymous token', format($$select public.report_pro_content('connection', %L, 'spam')$$, t.c('ab')), 'not_authenticated');
select t.as_anon();
select t.throws('A6 a guest', format($$select public.report_pro_content('connection', %L, 'spam')$$, t.c('ab')), 'permission denied');
select t.as_admin();
update public.pro_config set value = 'false' where key = 'pro_enabled';
update public.pro_members set suspended_at = now() where user_id = t.u('cat');
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.as_user(t.u('cat'));
select t.ok('A6 paused, suspended and out of date at once: still a report', format($$select public.report_pro_content('connection', %L, 'scam')$$, t.c('ac')));
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';
update public.pro_members set suspended_at = null where user_id = t.u('cat');

-- A7: an ended connection and a closed shell can still be reported (profile evidence only where the messages are gone).
select t.put('a7_s', t.mk_stylist('a7s', true)::text); select t.put('a7_c', t.mk_user('a7c')::text);
select t.put('a7', t.mk_conn(t.c('a7_s'), t.c('a7_c'), 'Client A7')::text);
select t.put('a7_m', t.msg(t.c('a7'), t.c('a7_s'), 'before the end')::text);
select t.as_user(t.c('a7_c'));
select public.end_pro_connection(t.c('a7'));
select public.report_pro_content('connection', t.c('a7'), 'spam', null, t.get('a7_m')::bigint);
select t.as_admin();
select t.check('A7 an ended connection can be reported, message included',
  (select context = 'pro_chat' and evidence ->> 'connectionStatus' = 'ended' from public.content_reports where reporter_id = t.c('a7_c') and ref_id = t.c('a7')));
select t.put('a7b_s', t.mk_stylist('a7bs', true)::text); select t.put('a7b_c', t.mk_user('a7bc')::text);
select t.put('a7b', t.mk_conn(t.c('a7b_s'), t.c('a7b_c'), 'Client A7b')::text);
select t.put('a7b_m', t.msg(t.c('a7b'), t.c('a7b_s'), 'before the block')::text);
select t.as_user(t.c('a7b_c'));
select public.block_pro_member(p_connection => t.c('a7b'));
select public.report_pro_content('connection', t.c('a7b'), 'harassment');
select t.throws('A7 a closed shell has no messages left to flag', format($$select public.report_pro_content('connection', %L, 'spam', null, %s)$$, t.c('a7b'), t.get('a7b_m')), 'invalid_report', 'message_id');
select t.as_user(t.c('a7b_s'));
select public.report_pro_content('connection', t.c('a7b'), 'spam');
select t.as_admin();
select t.check('A7 a closed shell can be reported from either side, with the profile only',
  (select count(*) = 2 and bool_and(context = 'pro_profile') from public.content_reports where ref_id = t.c('a7b')));
select t.check('A7 the stylist reporting a client sends the client''s chosen name as the profile',
  (select evidence -> 'profile' ->> 'alias' = 'Client A7b' and evidence ->> 'reportedRole' = 'client' from public.content_reports where reporter_id = t.c('a7b_s') and ref_id = t.c('a7b')));

-- ─── B. Evidence ────────────────────────────────────────────────────────────

-- B1: more than 30 messages: the last 30 and the flagged one, marked.
select t.put('b_s', t.mk_stylist('bs', true)::text); select t.put('b_c', t.mk_user('bc')::text);
select t.put('b', t.mk_conn(t.c('b_s'), t.c('b_c'), 'Client B')::text);
update public.pro_connections set started_at = now() - interval '5 days' where id = t.c('b');
select t.put('b_first', t.msg(t.c('b'), t.c('b_s'), 'the very first message', now() - interval '4 days')::text);
insert into public.pro_messages (connection_id, sender_id, kind, body, created_at)
  select t.c('b'), case when n % 2 = 0 then t.c('b_s') else t.c('b_c') end, 'text', 'message number ' || n, now() - interval '3 days' + n * interval '1 minute'
    from generate_series(1, 40) n;
select t.as_user(t.c('b_c'));
select public.report_pro_content('connection', t.c('b'), 'harassment', null, t.get('b_first')::bigint);
select t.as_admin();
select t.check('B1 thirty messages and the flagged one, which is older than all of them',
  (select jsonb_array_length(evidence -> 'messages') = 31 and (evidence -> 'messages' -> 0 ->> 'id') = t.get('b_first')
          and evidence ->> 'flaggedMessageId' = t.get('b_first')
     from public.content_reports where reporter_id = t.c('b_c') and ref_id = t.c('b')));
select t.check('B1 each message carries id, who, body, code and time; the roles are the reporter''s and the reported''s',
  (select bool_and(m ? 'id' and m ? 'who' and m ? 'body' and m ? 'at' and m ->> 'who' in ('reporter', 'reported', 'system')) and count(*) = 31
          and count(*) filter (where m ->> 'who' = 'reported') > 0 and count(*) filter (where m ->> 'who' = 'reporter') > 0
     from public.content_reports, jsonb_array_elements(evidence -> 'messages') m where reporter_id = t.c('b_c') and ref_id = t.c('b')));
select t.check('B1 the flagged message is the stylist''s, so it is marked as the reported person''s',
  (select evidence -> 'messages' -> 0 ->> 'who' = 'reported' from public.content_reports where reporter_id = t.c('b_c') and ref_id = t.c('b')));

-- B2: thirty long messages in a script of four-byte characters fit the table's size check; bodies are cut to 300; the
-- flagged message is kept.
select t.put('l_s', t.mk_stylist('ls', true)::text); select t.put('l_c', t.mk_user('lc')::text);
select t.put('l', t.mk_conn(t.c('l_s'), t.c('l_c'), 'Client L')::text);
update public.pro_connections set started_at = now() - interval '5 days' where id = t.c('l');
select t.put('l_first', t.msg(t.c('l'), t.c('l_s'), repeat(E'\U0001F600', 500), now() - interval '4 days')::text);
insert into public.pro_messages (connection_id, sender_id, kind, body, created_at)
  select t.c('l'), case when n % 2 = 0 then t.c('l_s') else t.c('l_c') end, 'text', repeat(E'\U0001F600', 500), now() - interval '3 days' + n * interval '1 minute'
    from generate_series(1, 40) n;
select t.check('B2 a long message really is 2,000 bytes of body', (select octet_length(body) = 2000 and char_length(body) = 500 from public.pro_messages where id = t.get('l_first')::bigint));
select t.as_user(t.c('l_c'));
select public.report_pro_content('connection', t.c('l'), 'harassment', null, t.get('l_first')::bigint);
select t.as_admin();
select t.check('B2 the report was stored: the evidence is within the budget and under the table''s check',
  (select pg_column_size(evidence) <= 18000 from public.content_reports where reporter_id = t.c('l_c') and ref_id = t.c('l')));
select t.check('B2 every body is cut to 300 characters',
  (select bool_and(char_length(m ->> 'body') = 300) from public.content_reports, jsonb_array_elements(evidence -> 'messages') m where reporter_id = t.c('l_c') and ref_id = t.c('l')));
select t.check('B2 the oldest are dropped, never the flagged one: it is there, first, and others are fewer than thirty',
  (select (evidence -> 'messages' -> 0 ->> 'id') = t.get('l_first') and jsonb_array_length(evidence -> 'messages') between 2 and 30
     from public.content_reports where reporter_id = t.c('l_c') and ref_id = t.c('l')));
select t.check('B2 the newest message is the last one of the evidence',
  (select (evidence -> 'messages' -> -1 ->> 'id')::bigint = (select max(id) from public.pro_messages where connection_id = t.c('l'))
     from public.content_reports where reporter_id = t.c('l_c') and ref_id = t.c('l')));

-- B3: the helper on its own: a flagged message older than the budget allows, and no flagged message at all.
select t.eq('B3 no flagged message: the evidence still has its keys', (select t.keys(public.pro_chat_evidence(t.c('b'), t.c('b_c'), null, false))), 'flaggedMessageId,messages,qualified');
select t.eq('B3 thirty messages without a flagged one', (select jsonb_array_length(public.pro_chat_evidence(t.c('b'), t.c('b_c'), null, true) -> 'messages')), 30);
select t.eq('B3 a connection with no messages has an empty list', (select jsonb_array_length(public.pro_chat_evidence(t.c('a7b'), t.c('a7b_c'), null, true) -> 'messages')), 0);

-- B4: the same long messages through report_swap_content (the function file 8 replaces) no longer fail.
select t.put('sw_p', t.mk_user('swp', false)::text); select t.put('sw_r', t.mk_user('swr', false)::text);
insert into public.swaps (proposer_id, recipient_id, pair_kind, status) values (t.c('sw_p'), t.c('sw_r'), 'friends', 'accepted');
select t.put('sw', (select id::text from public.swaps where proposer_id = t.c('sw_p')));
insert into public.swap_items (swap_id, side, name, size) values (t.c('sw'), 'offer', 'A linen shirt', 'M'), (t.c('sw'), 'request', 'A wool hat', 'One size');
insert into public.swap_messages (swap_id, sender_id, kind, body, created_at)
  select t.c('sw'), case when n % 2 = 0 then t.c('sw_p') else t.c('sw_r') end, 'text', repeat(E'\U0001F600', 500), now() - interval '3 days' + n * interval '1 minute'
    from generate_series(1, 40) n;
insert into public.swap_messages (swap_id, sender_id, kind, body, created_at) values (t.c('sw'), t.c('sw_p'), 'text', repeat(E'\U0001F600', 500), now() - interval '4 days');
insert into public.swap_messages (swap_id, kind, code, created_at) values (t.c('sw'), 'system', 'accepted', now() - interval '2 days');
select t.put('sw_flag', (select min(id)::text from public.swap_messages where swap_id = t.c('sw') and sender_id = t.c('sw_p')));
select t.as_user(t.c('sw_r'));
select public.report_swap_content('swap', t.c('sw'), 'harassment', 'rude', t.get('sw_flag')::bigint);
select t.as_admin();
select t.check('B4 the swap report was stored with long messages, within the budget',
  (select pg_column_size(evidence) <= 18000 and context = 'swap_chat' and details = 'rude' from public.content_reports where reporter_id = t.c('sw_r') and ref_id = t.c('sw')));
select t.check('B4 the flagged message is kept and bodies are cut to 300',
  (select (select count(*) from jsonb_array_elements(evidence -> 'messages') m where (m ->> 'id') = t.get('sw_flag')) = 1
          and (select bool_and(char_length(coalesce(m ->> 'body', '')) <= 300) from jsonb_array_elements(evidence -> 'messages') m)
     from public.content_reports where reporter_id = t.c('sw_r') and ref_id = t.c('sw')));
select t.check('B4 the message keys stay those swap''s tools read: id, from, body, code, at',
  (select bool_and(m ?& array['id', 'from', 'body', 'code', 'at'] and not (m ? 'who')) and bool_and(m ->> 'from' in ('reporter', 'reported', 'system'))
     from public.content_reports, jsonb_array_elements(evidence -> 'messages') m where reporter_id = t.c('sw_r') and ref_id = t.c('sw')));
select t.check('B4 the other keys of the swap evidence are as before',
  (select t.keys(evidence) = 'closedReason,createdAt,flaggedMessageId,items,messages,pairKind,status' from public.content_reports where reporter_id = t.c('sw_r') and ref_id = t.c('sw')));
select t.check('B4 the system line is marked as system with its code and no body',
  (select bool_or(m ->> 'from' = 'system' and m ->> 'code' = 'accepted' and m -> 'body' = 'null'::jsonb) from public.content_reports, jsonb_array_elements(evidence -> 'messages') m
    where reporter_id = t.c('sw_r') and ref_id = t.c('sw')));
-- a short chat keeps every message, and a listing report keeps its evidence as it was
insert into public.swaps (proposer_id, recipient_id, pair_kind, status) values (t.c('sw_p'), t.c('sw_r'), 'friends', 'proposed');
select t.put('sw2', (select id::text from public.swaps where proposer_id = t.c('sw_p') and status = 'proposed'));
insert into public.swap_messages (swap_id, sender_id, kind, body) values
  (t.c('sw2'), t.c('sw_p'), 'text', 'one'), (t.c('sw2'), t.c('sw_r'), 'text', 'two'), (t.c('sw2'), t.c('sw_p'), 'text', 'three');
select t.as_user(t.c('sw_r'));
select public.report_swap_content('swap', t.c('sw2'), 'spam');
select t.as_admin();
select t.eq('B4 a short chat keeps every message, whole, oldest first',
  (select string_agg(m ->> 'from' || ':' || (m ->> 'body'), ',' order by (m ->> 'id')::bigint)
     from public.content_reports, jsonb_array_elements(evidence -> 'messages') m where reporter_id = t.c('sw_r') and ref_id = t.c('sw2')),
  'reported:one,reporter:two,reported:three');

-- ─── C. The daily limit, and folding ────────────────────────────────────────

-- C1: twenty a day, shared by report_user, report_swap_content and report_pro_content.
select t.put('r_s', t.mk_stylist('rs', true)::text); select t.put('r_c', t.mk_user('rc')::text);
select t.put('r', t.mk_conn(t.c('r_s'), t.c('r_c'), 'Client R')::text);
insert into public.swaps (proposer_id, recipient_id, pair_kind, status) values (t.c('sw_p'), t.c('r_c'), 'friends', 'proposed');
select t.put('r_swap', (select id::text from public.swaps where recipient_id = t.c('r_c')));
select t.as_user(t.c('r_c'));
select public.report_user(t.u('eve'), 'profile', 'spam') from generate_series(1, 19);
select public.report_pro_content('connection', t.c('r'), 'spam');
select t.as_admin();
select t.eq('C1 twenty reports so far, nineteen the old way and one the new', (select count(*) from public.content_reports where reporter_id = t.c('r_c')), 20::bigint);
select t.as_user(t.c('r_c'));
select t.throws('C1 the 21st is limited for report_pro_content', format($$select public.report_pro_content('connection', %L, 'scam')$$, t.c('r')), 'report_rate_limited', null, null, '54000');
select t.throws('C1 and for report_user', format($$select public.report_user(%L, 'profile', 'spam')$$, t.u('eve')), 'report_rate_limited');
select t.throws('C1 and for report_swap_content', format($$select public.report_swap_content('swap', %L, 'spam')$$, t.c('r_swap')), 'report_rate_limited');
select t.as_admin();
select t.eq('C1 none of the three added a row', (select count(*) from public.content_reports where reporter_id = t.c('r_c')), 20::bigint);
update public.content_reports set created_at = now() - interval '2 days' where reporter_id = t.c('r_c') and ref_id is null;
select t.as_user(t.c('r_c'));
select t.ok('C1 a day later it works again', format($$select public.report_pro_content('connection', %L, 'scam')$$, t.c('r')));

-- C2: folding: only the identical report within a week.
select t.as_admin();
select t.put('f_s', t.mk_stylist('fs', true)::text); select t.put('f_c', t.mk_user('fc')::text);
select t.put('f', t.mk_conn(t.c('f_s'), t.c('f_c'), 'Client F')::text);
select t.put('f_m1', t.msg(t.c('f'), t.c('f_s'), 'first words')::text); select t.put('f_m2', t.msg(t.c('f'), t.c('f_s'), 'second words')::text);
create function t.reports(p_reason text, p_msg bigint default null) returns bigint language sql stable as $$
  select count(*) from public.content_reports where reporter_id = t.c('f_c') and ref_id = t.c('f') and reason = p_reason
     and coalesce(evidence ->> 'flaggedMessageId', '0') = coalesce(p_msg::text, '0') $$;
select t.as_user(t.c('f_c'));
select public.report_pro_content('connection', t.c('f'), 'spam');
select public.report_pro_content('connection', t.c('f'), 'spam');
select t.as_admin();
select t.eq('C2 the same report twice is one row', t.reports('spam'), 1::bigint);
select t.as_user(t.c('f_c'));
select public.report_pro_content('connection', t.c('f'), 'spam', null, t.get('f_m1')::bigint);
select public.report_pro_content('connection', t.c('f'), 'spam', null, t.get('f_m1')::bigint);
select public.report_pro_content('connection', t.c('f'), 'spam', null, t.get('f_m2')::bigint);
select t.as_admin();
select t.eq('C2 message A then message B are two rows, and A again is folded', t.reports('spam', t.get('f_m1')::bigint) || '/' || t.reports('spam', t.get('f_m2')::bigint), '1/1');
select t.as_user(t.c('f_c'));
select public.report_pro_content('connection', t.c('f'), 'scam');
select t.as_admin();
select t.eq('C2 "spam" then "scam" on the same thing are two rows', t.reports('spam') || '/' || t.reports('scam'), '1/1');
select t.as_user(t.c('f_c'));
select public.report_pro_content('connection', t.c('f'), 'unsafe_meeting'); select public.report_pro_content('connection', t.c('f'), 'unsafe_meeting');
select public.report_pro_content('connection', t.c('f'), 'harassment');     select public.report_pro_content('connection', t.c('f'), 'harassment');
select t.as_admin();
select t.eq('C2 unsafe_meeting and harassment are never folded', t.reports('unsafe_meeting') || '/' || t.reports('harassment'), '2/2');
update public.content_reports set created_at = now() - interval '8 days' where reporter_id = t.c('f_c') and reason = 'spam' and evidence ->> 'flaggedMessageId' is null;
select t.as_user(t.c('f_c'));
select public.report_pro_content('connection', t.c('f'), 'spam');
select t.as_admin();
select t.eq('C2 after a week the same report is a new row', t.reports('spam'), 2::bigint);
select t.as_user(t.c('f_c'));
select public.report_pro_content('connection', t.c('f'), 'underage'); select public.report_pro_content('connection', t.c('f'), 'underage');
select public.report_pro_content('connection', t.c('f'), 'unsafe');     select public.report_pro_content('connection', t.c('f'), 'unsafe');
select t.as_admin();
select t.eq('C2 underage and unsafe are never folded either', t.reports('underage') || '/' || t.reports('unsafe'), '2/2');

-- ─── D. The widened constraints, and the old report functions ───────────────

select t.ok('D every old and new context is accepted by the table', $$
  insert into public.content_reports (reporter_id, reported_user_id, context, reason, details)
  select t.u('bea'), t.u('eve'), c, 'spam', 'constraint probe'
    from unnest(array['friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat', 'pro_profile', 'pro_chat', 'pro_content']) c $$);
select t.ok('D every old and new reason is accepted', $$
  insert into public.content_reports (reporter_id, reported_user_id, context, reason, details)
  select t.u('bea'), t.u('eve'), 'profile', r, 'constraint probe'
    from unnest(array['spam', 'harassment', 'inappropriate', 'impersonation', 'scam', 'not_as_described', 'unsafe', 'other',
                      'underage', 'false_credentials', 'data_misuse', 'unsafe_meeting']) r $$);
select t.ok('D every old and new reference type, and none, is accepted', $$
  insert into public.content_reports (reporter_id, reported_user_id, context, reason, details, ref_type)
  select t.u('bea'), t.u('eve'), 'profile', 'spam', 'constraint probe', r
    from unnest(array['listing', 'swap', 'message', 'connection', 'recommendation', 'appointment', 'invite', null]::text[]) r $$);
select t.throws('D an unknown context is refused', $$insert into public.content_reports (reporter_id, reported_user_id, context, reason) values (t.u('bea'), t.u('eve'), 'pro_other', 'spam')$$, 'content_reports_context_check');
select t.throws('D an unknown reason is refused', $$insert into public.content_reports (reporter_id, reported_user_id, context, reason) values (t.u('bea'), t.u('eve'), 'profile', 'rude')$$, 'content_reports_reason_check');
select t.throws('D an unknown reference type is refused', $$insert into public.content_reports (reporter_id, reported_user_id, context, reason, ref_type) values (t.u('bea'), t.u('eve'), 'profile', 'spam', 'user')$$, 'content_reports_ref_type_check');
select t.throws('D evidence over 20,000 bytes is refused', $$insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence) values (t.u('bea'), t.u('eve'), 'profile', 'spam', jsonb_build_object('x', repeat(E'\U0001F600', 6000)))$$, 'content_reports_evidence_check');
delete from public.content_reports where details = 'constraint probe';
select t.as_user(t.u('bea'));
select t.throws('D report_user still refuses a pro context', format($$select public.report_user(%L, 'pro_chat', 'spam')$$, t.u('eve')), 'invalid_report');
select t.throws('D report_user still refuses a pro reason', format($$select public.report_user(%L, 'profile', 'underage')$$, t.u('eve')), 'invalid_report');
select t.ok('D report_user still works for what it did', format($$select public.report_user(%L, 'profile', 'spam')$$, t.u('eve')));
select t.as_user(t.c('sw_r'));
select t.throws('D report_swap_content still has its own reasons: "underage" is refused', format($$select public.report_swap_content('swap', %L, 'underage')$$, t.c('sw')), 'invalid_report');
select t.as_admin();
select t.check('D the sources of report_user, block_user and delete_user_account do not mention the feature',
  (select count(*) = 3 and bool_and(prosrc !~ 'pro_') from pg_proc where pronamespace = 'public'::regnamespace and proname in ('report_user', 'block_user', 'delete_user_account')));
select t.check('D report_swap_content does not call a pro function (swap must not depend on pro)',
  (select prosrc !~ 'pro_' from pg_proc where pronamespace = 'public'::regnamespace and proname = 'report_swap_content'));
select t.check('D report_swap_content is still executable by signed-in people and by nobody else',
  has_function_privilege('authenticated', 'public.report_swap_content(text, uuid, text, text, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.report_swap_content(text, uuid, text, text, bigint)', 'execute'));

-- ─── E. The automatic hold ──────────────────────────────────────────────────

-- Section A already filed reports from two qualified reporters about Ann (Bea and Cat), so the hold is on: that is the
-- hold working. It is cleared here, with the reports, to start the section from nothing.
select t.check('E0 the reports of section A held Ann''s invites as the system', public.pro_invites_held(t.u('ann')) and (select invites_held_by = 'system' from public.pro_members where user_id = t.u('ann')));
delete from public.content_reports where id is not null;
update public.pro_members set invites_held_at = null, invites_held_by = null where user_id = t.u('ann');
select t.put('e_code', t.mk_invite(t.u('ann')));
select t.put('e_cl', t.mk_user('ecl')::text);
select t.as_user(t.u('bea')); select public.report_pro_content('connection', t.c('ab'), 'spam');
select t.as_admin();
select t.check('E1 one qualified reporter does not hold', not public.pro_invites_held(t.u('ann')));
select t.as_user(t.u('cat')); select public.report_pro_content('connection', t.c('ac'), 'spam');
select t.as_admin();
select t.check('E1 two different qualified reporters hold the invites, as the system',
  public.pro_invites_held(t.u('ann')) and (select invites_held_by = 'system' and invites_held_at is not null from public.pro_members where user_id = t.u('ann')));
select t.check('E1 Cat qualifies by three text messages, Bea by a connection of over a day',
  (select bool_and(evidence ->> 'qualified' = 'true') and count(*) = 2 from public.content_reports where reported_user_id = t.u('ann')));
select t.as_user(t.u('ann'));
select t.throws('E1 the held stylist cannot create a code', $$select public.create_pro_invite(gen_random_uuid())$$, 'invites_held', null, null, '42501');
select t.check('E1 her profile and her status say so', (public.get_my_stylist_profile() ->> 'invitesHeld') = 'true' and (public.get_pro_status() -> 'stylist' ->> 'invitesHeld') = 'true');
select t.ok('E1 existing connections continue: she can message', format($$select public.send_pro_message(%L, 'still here', gen_random_uuid())$$, t.c('ab')));
select t.ok('E1 she can still switch accepting', 'select public.set_stylist_accepting(false)');
select t.ok('E1 and back', 'select public.set_stylist_accepting(true)');
select t.ok('E1 and take her data', 'select public.export_my_pro_data()');
select t.as_user(t.c('e_cl'));
select t.check('E1 her live code answers invite_invalid to a preview', public.preview_pro_invite(t.get('e_code')) = '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.check('E1 and to a redeem', public.redeem_pro_invite(t.get('e_code'), 'Ecl') = '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_user(t.u('bea'));
select t.ok('E1 her client can still message her', format($$select public.send_pro_message(%L, 'ok', gen_random_uuid())$$, t.c('ab')));
-- it releases itself after seven days
select t.as_admin();
update public.pro_members set invites_held_at = now() - interval '8 days' where user_id = t.u('ann');
select t.check('E2 a system hold ends after seven days', not public.pro_invites_held(t.u('ann')));
select t.as_user(t.u('ann'));
select t.ok('E2 and she can create a code again', 'select public.create_pro_invite(gen_random_uuid())');
select t.as_user(t.c('e_cl'));
select t.check('E2 the old code previews again', (public.preview_pro_invite(t.get('e_code')) ->> 'valid') = 'true');
-- a hold a person makes does not
select t.as_service(); select public.pro_admin_hold_stylist(t.u('ann')); select t.as_admin();
select t.check('E3 an admin hold holds', public.pro_invites_held(t.u('ann')) and (select invites_held_by = 'admin' from public.pro_members where user_id = t.u('ann')));
update public.pro_members set invites_held_at = now() - interval '30 days' where user_id = t.u('ann');
select t.check('E3 and does not release itself after thirty days', public.pro_invites_held(t.u('ann')));
select t.put('e3_at', (select invites_held_at::text from public.pro_members where user_id = t.u('ann')));
select t.as_user(t.u('bea')); select public.report_pro_content('connection', t.c('ab'), 'scam');
select t.as_admin();
select t.check('E3 a new report pair never replaces it with a system hold',
  (select invites_held_by = 'admin' and invites_held_at::text = t.get('e3_at') from public.pro_members where user_id = t.u('ann')));
select t.as_service(); select public.pro_admin_release_stylist(t.u('ann')); select t.as_admin();
select t.check('E3 a person lifts it early', not public.pro_invites_held(t.u('ann')) and (select invites_held_at is null and invites_held_by is null from public.pro_members where user_id = t.u('ann')));
-- a system hold that a person confirms becomes theirs
select t.as_user(t.u('bea')); select public.report_pro_content('connection', t.c('ab'), 'harassment');
select t.as_admin();
select t.check('E3 another report while two qualified ones stand holds again, as the system', (select invites_held_by = 'system' from public.pro_members where user_id = t.u('ann')));
select t.as_service(); select public.pro_admin_hold_stylist(t.u('ann')); select t.as_admin();
select t.check('E3 and a person confirming it makes it theirs', (select invites_held_by = 'admin' from public.pro_members where user_id = t.u('ann')));
-- close then save keeps the hold and the approval
select t.as_user(t.u('ann'));
select public.close_stylist_profile();
select public.save_stylist_profile('Ann Styles', 'Back again', 'Ten years of styling.', array['outfit_styling'], array['en'], 'From $80 per session', true);
select t.as_admin();
select t.check('E4 closing the profile and saving it again keeps the hold and the approval',
  public.pro_invites_held(t.u('ann')) and (select stylist_approved_at is not null and invites_held_by = 'admin' from public.pro_members where user_id = t.u('ann')));
select t.as_service(); select public.pro_admin_release_stylist(t.u('ann')); select t.as_admin();

-- who does not count
select t.put('dee_hal', t.mk_conn(t.u('dee'), t.u('hal'), 'Hal H')::text);
update public.pro_connections set started_at = now() - interval '5 days' where id = t.c('dee_hal');
select t.put('dee_gus', t.mk_conn(t.u('dee'), t.u('gus'), 'Gus G')::text);
select t.mk_invite(t.u('dee'));
select t.put('dee_inv', (select id::text from public.pro_invites where stylist_id = t.u('dee')));
select t.as_user(t.u('hal')); select public.report_pro_content('connection', t.c('dee_hal'), 'spam');
select t.as_user(t.u('gus')); select public.report_pro_content('connection', t.c('dee_gus'), 'spam');
select t.as_admin();
select t.check('E5 two reporters who never really worked with her (an account of one hour; a connection of minutes with no messages) do not hold',
  not public.pro_invites_held(t.u('dee'))
  and (select bool_and(evidence ->> 'qualified' = 'false') and count(*) = 2 from public.content_reports where reported_user_id = t.u('dee')));
select t.as_user(t.u('bea')); select public.report_pro_content('invite', t.c('dee_inv'), 'impersonation');
select t.as_user(t.u('cat')); select public.report_pro_content('invite', t.c('dee_inv'), 'impersonation');
select t.as_admin();
select t.check('E5 two invite reports do not hold', not public.pro_invites_held(t.u('dee')));
select t.put('dee_bea', t.mk_conn(t.u('dee'), t.u('bea'), 'Bea D')::text);
update public.pro_connections set started_at = now() - interval '3 days' where id = t.c('dee_bea');
select t.as_user(t.u('bea'));
select public.report_pro_content('connection', t.c('dee_bea'), 'spam'); select public.report_pro_content('connection', t.c('dee_bea'), 'scam');
select t.as_admin();
select t.check('E5 one reporter twice does not hold', not public.pro_invites_held(t.u('dee')));
select t.put('dee_cat', t.mk_conn(t.u('dee'), t.u('cat'), 'Cat D')::text);
update public.pro_connections set started_at = now() - interval '3 days' where id = t.c('dee_cat');
select t.as_user(t.u('cat')); select public.report_pro_content('connection', t.c('dee_cat'), 'spam');
select t.as_admin();
select t.check('E5 a second qualified reporter does, and the same reporters'' invite reports never counted',
  public.pro_invites_held(t.u('dee')) and (select count(distinct reporter_id) = 2 from public.content_reports where reported_user_id = t.u('dee') and evidence ->> 'qualified' = 'true'));

-- creating a profile looks at the last fourteen days of reports
create function t.qreport(p_reporter uuid, p_reported uuid, p_qualified boolean, p_age interval) returns void language sql as $$
  insert into public.content_reports (reporter_id, reported_user_id, context, reason, ref_type, ref_id, evidence, created_at)
  values (p_reporter, p_reported, 'pro_profile', 'spam', 'connection', gen_random_uuid(), jsonb_build_object('qualified', p_qualified), now() - p_age) $$;
select t.put('z1', t.mk_user('z1', false, true)::text); select t.put('z2', t.mk_user('z2', false, true)::text); select t.put('z3', t.mk_user('z3', false, true)::text);
select t.put('z4', t.mk_user('z4', false, true)::text); select t.put('z5', t.mk_stylist('z5')::text);
select t.qreport(t.u('bea'), t.c('z1'), true, interval '1 day'); select t.qreport(t.u('cat'), t.c('z1'), true, interval '2 days');
select t.qreport(t.u('bea'), t.c('z2'), true, interval '15 days'); select t.qreport(t.u('cat'), t.c('z2'), true, interval '16 days');
select t.qreport(t.u('bea'), t.c('z3'), false, interval '1 day'); select t.qreport(t.u('cat'), t.c('z3'), false, interval '2 days');
select t.qreport(t.u('bea'), t.c('z4'), true, interval '1 day'); select t.qreport(t.u('bea'), t.c('z4'), true, interval '2 days');
select t.qreport(t.u('bea'), t.c('z5'), true, interval '1 day'); select t.qreport(t.u('cat'), t.c('z5'), true, interval '2 days');
select t.as_user(t.c('z1')); select public.save_stylist_profile('Zed One', '', '', array['outfit_styling'], '{}', '', true);
select t.as_user(t.c('z2')); select public.save_stylist_profile('Zed Two', '', '', array['outfit_styling'], '{}', '', true);
select t.as_user(t.c('z3')); select public.save_stylist_profile('Zed Three', '', '', array['outfit_styling'], '{}', '', true);
select t.as_user(t.c('z4')); select public.save_stylist_profile('Zed Four', '', '', array['outfit_styling'], '{}', '', true);
select t.as_user(t.c('z5')); select public.save_stylist_profile('Zed Five', '', '', array['outfit_styling'], '{}', '', true);
select t.as_admin();
select t.check('E6 creating a profile with two qualified reporters in the last fourteen days is held at once', public.pro_invites_held(t.c('z1')));
select t.check('E6 reports older than fourteen days do not count', not public.pro_invites_held(t.c('z2')));
select t.check('E6 reports that were not qualified do not count', not public.pro_invites_held(t.c('z3')));
select t.check('E6 one reporter twice does not count', not public.pro_invites_held(t.c('z4')));
select t.check('E6 updating a profile that exists never looks at reports', not public.pro_invites_held(t.c('z5')));

-- remove and restore
select t.put('rm', t.mk_stylist('rm', true)::text);
select t.as_service(); select public.pro_admin_remove_stylist(t.c('rm'), 'pretended to be certified'); select t.as_admin();
select t.as_user(t.c('rm'));
select t.throws('E7 a removed stylist cannot save a profile', $$select public.save_stylist_profile('Rm Again', '', '', array['outfit_styling'], '{}', '', true)$$, 'stylist_profile_removed', null, 'email support', '42501');
select t.check('E7 closing and re-creating is no way round it: status says removed', (public.get_pro_status() ->> 'stylistRemoved') = 'true');
select t.as_service(); select public.pro_admin_restore_stylist(t.c('rm')); select t.as_admin();
select t.as_user(t.c('rm'));
select t.ok('E7 after a restore the profile can be saved', $$select public.save_stylist_profile('Rm Again', '', '', array['outfit_styling'], '{}', '', true)$$);
select t.check('E7 and the status says so', (public.get_pro_status() ->> 'stylistRemoved') = 'false');

-- ─── F. A client's serious report stops that client's own sharing ───────────

select t.as_admin();
-- One case: a client turns sharing on (all, or the chosen pieces), reports, and we read what is left.
create function t.serious(p_tag text, p_client uuid, p_selected boolean, p_reason text, p_revokes boolean) returns void language plpgsql as $$
declare
  s    uuid := t.mk_stylist(p_tag, true);
  cid  uuid := t.mk_conn(s, p_client, 'Client ' || p_tag);
  act  timestamptz;
  msgs bigint;
begin
  perform t.as_user(p_client);
  if p_selected then
    perform public.set_pro_grant(cid, 'closet', true, 'selected', array[t.item(case when p_client = t.u('cat') then 'cat' else 'bea' end, 2), t.item(case when p_client = t.u('cat') then 'cat' else 'bea' end, 3)], '2026-10');
  else
    perform public.set_pro_grant(cid, 'closet', true, 'all', null, '2026-10');
  end if;
  perform t.as_admin();
  update public.pro_connections set last_activity_at = now() - interval '1 day' where id = cid;
  select last_activity_at into act from public.pro_connections where id = cid;
  select count(*) into msgs from public.pro_messages where connection_id = cid;
  perform t.chk(p_tag || ': sharing is on before the report', format($q$exists (select 1 from public.pro_grants where connection_id = %L)$q$, cid));
  perform t.as_user(p_client);
  perform public.report_pro_content('connection', cid, p_reason);
  perform t.as_admin();
  perform t.chk(p_tag || ': ' || p_reason || (case when p_revokes then ' stops the sharing, pieces included' else ' leaves the sharing alone' end),
    format($q$(not exists (select 1 from public.pro_grants where connection_id = %L) and not exists (select 1 from public.pro_grant_items where connection_id = %L)) = %L$q$, cid, cid, p_revokes));
  perform t.chk(p_tag || ': the connection stays open', format($q$(select status = 'active' and shell_at is null from public.pro_connections where id = %L)$q$, cid));
  perform t.chk(p_tag || ': the stylist is told nothing: no new line, and the connection did not move',
    format($q$(select count(*) from public.pro_messages where connection_id = %L) = %s and (select last_activity_at from public.pro_connections where id = %L) = %L$q$, cid, msgs, cid, act));
  perform t.chk(p_tag || ': the event is written for the client only when it was revoked',
    format($q$(select count(*) from public.pro_grant_events where connection_id = %L and event = 'revoked') = %s$q$, cid, case when p_revokes then 1 else 0 end));
  perform t.put(p_tag || '_c', cid::text);
end $$;
select t.serious('fa', t.mk_user('fac'), false, 'harassment', true);
select t.serious('fb', t.u('cat'), true, 'data_misuse', true);
select t.serious('fc', t.mk_user('fcc'), false, 'unsafe_meeting', true);
select t.serious('fd', t.u('cat'), true, 'underage', true);
select t.serious('fe', t.mk_user('fec'), false, 'spam', false);
select t.serious('ff', t.mk_user('ffc'), false, 'scam', false);
select t.serious('fg', t.mk_user('fgc'), false, 'unsafe', false);
select t.serious('fh', t.mk_user('fhc'), false, 'impersonation', false);
-- a stylist's report never touches the client's grant
select t.as_admin();
select t.put('fi_c', t.mk_user('fic')::text);
select t.put('fi_s', t.mk_stylist('fis', true)::text);
select t.put('fi', t.mk_conn(t.c('fi_s'), t.c('fi_c'), 'Client FI')::text);
select t.as_user(t.c('fi_c')); select public.set_pro_grant(t.c('fi'), 'closet', true, 'all', null, '2026-10');
select t.as_user(t.c('fi_s')); select public.report_pro_content('connection', t.c('fi'), 'harassment');
select t.as_admin();
select t.check('F a stylist''s report leaves the client''s sharing alone', exists (select 1 from public.pro_grants where connection_id = t.c('fi')));
-- an identical repeat is folded, but a client who turned sharing on again is still protected
select t.as_user(t.c('fi_c'));
select public.report_pro_content('connection', t.c('fi'), 'data_misuse');
select public.set_pro_grant(t.c('fi'), 'closet', true, 'all', null, '2026-10');
select public.report_pro_content('connection', t.c('fi'), 'data_misuse');
select t.as_admin();
select t.eq('F a folded repeat adds no row but still stops sharing again',
  (select count(*) from public.content_reports where reporter_id = t.c('fi_c')) || '/' || (select count(*) from public.pro_grants where connection_id = t.c('fi')), '1/0');
select t.as_user(t.c('a7_c'));
select t.ok('F a serious report on an ended connection is fine', format($$select public.report_pro_content('connection', %L, 'underage')$$, t.c('a7')));
-- an invite report reaches no connection
select t.as_user(t.c('fi_c'));
select t.ok('F a serious invite report stops nothing and is stored', format($$select public.report_pro_content('invite', %L, 'underage')$$, t.c('dee_inv')));
select t.as_admin();

-- ─── G. Admin functions, views, backlog, digest, the switch ─────────────────

select t.as_admin();
delete from public.content_reports where id is not null;
select t.put('g_s', t.mk_stylist('gs', true)::text);
select t.put('g1', t.mk_user('g1')::text); select t.put('g2', t.mk_user('g2')::text); select t.put('g3', t.mk_user('g3')::text); select t.put('g4', t.mk_user('g4')::text);
select t.put('g1c', t.mk_conn(t.c('g_s'), t.c('g1'), 'G1')::text); select t.put('g2c', t.mk_conn(t.c('g_s'), t.c('g2'), 'G2')::text);
select t.put('g3c', t.mk_conn(t.c('g_s'), t.c('g3'), 'G3')::text); select t.put('g4c', t.mk_conn(t.c('g_s'), t.c('g4'), 'G4')::text);
select t.as_user(t.c('g1')); select public.report_pro_content('connection', t.c('g1c'), 'spam');
select t.as_user(t.c('g2')); select public.report_pro_content('connection', t.c('g2c'), 'underage');
select t.as_user(t.c('g3')); select public.report_pro_content('connection', t.c('g3c'), 'scam');
select t.as_user(t.c('g4')); select public.report_pro_content('connection', t.c('g4c'), 'harassment');
select t.as_admin();
update public.content_reports set created_at = now() - interval '10 hours' where reporter_id = t.c('g1');
update public.content_reports set created_at = now() - interval '2 hours'  where reporter_id = t.c('g2');
update public.content_reports set created_at = now() - interval '6 hours'  where reporter_id = t.c('g3');
update public.content_reports set created_at = now() - interval '1 hour'   where reporter_id = t.c('g4');
-- reports of the other features never appear
insert into public.content_reports (reporter_id, reported_user_id, context, reason, created_at) values
  (t.u('bea'), t.u('eve'), 'profile', 'spam', now() - interval '20 hours'), (t.u('bea'), t.u('eve'), 'swap_chat', 'spam', now() - interval '20 hours');
-- one already handled
insert into public.content_reports (reporter_id, reported_user_id, context, reason, created_at, reviewed_at, outcome)
values (t.u('bea'), t.u('eve'), 'pro_chat', 'spam', now() - interval '30 hours', now(), 'handled');
select t.as_service();
select t.eq('G1 the queue lists safety reasons first (oldest first), then the rest oldest first, and only unreviewed pro reports',
  (select string_agg(reason, ',') from (select reason from public.pro_moderation_queue) q), 'underage,harassment,spam,scam');
select t.eq('G1 the queue''s columns', (select t.keys(to_jsonb(q)) from public.pro_moderation_queue q limit 1),
  'context,created_at,details,evidence,id,outcome,qualified,reason,ref_id,ref_type,reported_user_id,reporter_id,reviewed_at');
select t.check('G1 qualified is a boolean read from the evidence', (select bool_and(qualified is not null) from public.pro_moderation_queue));
select t.eq('G2 the backlog counts everything older than the interval', (select waiting || '/' || oldest_hours from public.pro_report_backlog(interval '0 seconds')), '4/10');
select t.eq('G2 by default only reports older than four hours', (select waiting || '/' || oldest_hours from public.pro_report_backlog()), '2/10');
select t.as_admin();
update public.content_reports set reviewed_at = now(), outcome = 'removed' where reporter_id = t.c('g1');
select t.as_service();
select t.eq('G2 a handled report leaves the queue and the backlog', (select count(*) from public.pro_moderation_queue)::text || '/' || (select waiting from public.pro_report_backlog()), '3/1');
select t.eq('G3 the digest returns false and raises nothing where pg_net or the secret is missing', public.pro_send_report_digest(interval '0 seconds'), false);
select t.as_admin();
update public.content_reports set reviewed_at = now(), outcome = 'all done' where reviewed_at is null;
select t.as_service();
select t.eq('G3 and false when nothing waits', public.pro_send_report_digest(interval '0 seconds'), false);
select t.eq('G3 an empty queue has a zero backlog', (select waiting || '/' || oldest_hours from public.pro_report_backlog(interval '0 seconds')), '0/0');
select t.as_user(t.u('ann'));
select t.throws('G4 the moderation queue is closed to app users', 'select * from public.pro_moderation_queue', 'permission denied');
select t.throws('G4 and the review queue', 'select * from public.pro_review_queue', 'permission denied');
select t.throws('G4 pro_set_enabled', 'select public.pro_set_enabled(true)', 'permission denied');
select t.throws('G4 pro_admin_approve_stylist', format($$select public.pro_admin_approve_stylist(%L)$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_admin_hold_stylist', format($$select public.pro_admin_hold_stylist(%L)$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_admin_release_stylist', format($$select public.pro_admin_release_stylist(%L)$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_admin_suspend', format($$select public.pro_admin_suspend(%L, 'x')$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_admin_unsuspend', format($$select public.pro_admin_unsuspend(%L)$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_admin_remove_stylist', format($$select public.pro_admin_remove_stylist(%L, 'x')$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_admin_restore_stylist', format($$select public.pro_admin_restore_stylist(%L)$$, t.u('dee')), 'permission denied');
select t.throws('G4 pro_report_backlog', 'select * from public.pro_report_backlog()', 'permission denied');
select t.throws('G4 pro_send_report_digest', 'select public.pro_send_report_digest()', 'permission denied');
select t.as_anon();
select t.throws('G4 a guest cannot read the queue either', 'select * from public.pro_moderation_queue', 'permission denied');
select t.throws('G4 nor switch the feature', 'select public.pro_set_enabled(false)', 'permission denied');

-- the switch
select t.as_service();
select public.pro_set_enabled(false);
select t.as_user(t.u('bea'));
select t.check('G5 switching off is read by the status call', (public.get_pro_status() ->> 'proEnabled') = 'false');
select t.as_admin();
delete from public.swap_blocked_terms where kind = 'content';
select t.as_service();
select t.throws('G5 switching on is refused with no terms loaded', 'select public.pro_set_enabled(true)', 'load at least 50 content terms into swap_blocked_terms first', null, null, '55000');
select t.as_admin();
insert into public.swap_blocked_terms (term, kind) select 'probeterm' || lpad(n::text, 2, '0'), 'content' from generate_series(1, 49) n;
select t.as_service();
select t.throws('G5 and with 49', 'select public.pro_set_enabled(true)', 'load at least 50', null, null, '55000');
select t.as_admin();
insert into public.swap_blocked_terms (term, kind) values ('probetermfifty', 'content');
select t.as_service();
select public.pro_set_enabled(true);
select t.as_admin();
select t.check('G5 and with 50 it succeeds and is stored as a boolean', (select value = 'true'::jsonb and updated_at is not null from public.pro_config where key = 'pro_enabled'));
select t.as_service();
select t.throws('G5 a null switch is a bad request', 'select public.pro_set_enabled(null)', 'invalid_request');
select public.pro_set_enabled(false);
select t.as_admin();
select t.check('G5 switching off needs no terms and is stored', (select value = 'false'::jsonb from public.pro_config where key = 'pro_enabled'));
update public.pro_config set value = 'true' where key = 'pro_enabled';

-- approval, the review queue and the caps
select t.as_service();
select t.check('G6 the review queue lists Dee (on probation) and not Ann (approved)',
  exists (select 1 from public.pro_review_queue where user_id = t.u('dee')) and not exists (select 1 from public.pro_review_queue where user_id = t.u('ann')));
select t.check('G6 with the profile text and the number of active clients',
  (select display_name = 'Dee Coach' and headline = 'Colour and occasion dressing' and services = array['color_analysis', 'event_styling'] and rates_text = 'Ask me about rates' and active_clients = 4
     from public.pro_review_queue where user_id = t.u('dee')));
select t.eq('G6 the review queue''s columns', (select t.keys(to_jsonb(q)) from public.pro_review_queue q limit 1), 'active_clients,bio,created_at,display_name,headline,rates_text,services,user_id');
select public.pro_admin_release_stylist(t.u('dee'));             -- the hold of section E
select t.as_admin();
update public.pro_invites set status = 'revoked', revoked_at = now() where stylist_id = t.u('dee');
select t.as_user(t.u('dee'));
select t.ok('G6 a stylist on probation can have one live code', 'select public.create_pro_invite(gen_random_uuid())');
select t.throws('G6 not two', 'select public.create_pro_invite(gen_random_uuid())', 'invite_limit', null, null, '54000');
select t.as_service(); select public.pro_admin_approve_stylist(t.u('dee')); select t.as_user(t.u('dee'));
select t.ok('G6 once approved the second is allowed', 'select public.create_pro_invite(gen_random_uuid())');
select t.as_service();
select t.check('G6 an approved stylist leaves the review queue', not exists (select 1 from public.pro_review_queue where user_id = t.u('dee')));
select t.throws('G6 approving someone with no pro record is unavailable', $$select public.pro_admin_approve_stylist(gen_random_uuid())$$, 'pro_unavailable');
select t.throws('G6 releasing someone with no pro record is unavailable', $$select public.pro_admin_release_stylist(gen_random_uuid())$$, 'pro_unavailable');
select t.throws('G6 restoring someone with no pro record is unavailable', $$select public.pro_admin_restore_stylist(gen_random_uuid())$$, 'pro_unavailable');

-- removal
select t.as_admin();
select t.put('rm2', t.mk_stylist('rmtwo', true)::text);
select t.put('rm2a', t.mk_user('rm2a')::text); select t.put('rm2b', t.mk_user('rm2b')::text);
select t.put('rm2ac', t.mk_conn(t.c('rm2'), t.c('rm2a'), 'RM A')::text); select t.put('rm2bc', t.mk_conn(t.c('rm2'), t.c('rm2b'), 'RM B')::text);
select t.mk_invite(t.c('rm2')); select t.mk_invite(t.c('rm2'));
select t.as_user(t.c('rm2a')); select public.report_pro_content('connection', t.c('rm2ac'), 'false_credentials');
select t.as_user(t.c('rm2b')); select public.report_pro_content('connection', t.c('rm2bc'), 'impersonation');
select t.as_admin();
insert into public.content_reports (reporter_id, reported_user_id, context, reason) values (t.u('bea'), t.c('rm2'), 'profile', 'spam');       -- a Friends report
select t.as_service(); select public.pro_admin_remove_stylist(t.c('rm2'), 'Claimed a licence that does not exist'); select t.as_admin();
select t.check('G7 a removal ends their connections as the system', (select count(*) = 2 and bool_and(status = 'ended' and ended_by = 'system') from public.pro_connections where id in (t.c('rm2ac'), t.c('rm2bc'))));
select t.eq('G7 deletes their invites and their profile', (select count(*) from public.pro_invites where stylist_id = t.c('rm2')) + (select count(*) from public.pro_stylists where user_id = t.c('rm2')), 0::bigint);
select t.check('G7 records the removal on the person, with the reason',
  (select stylist_removed_at is not null and stylist_removed_reason = 'Claimed a licence that does not exist' and stylist_terms_version is not null from public.pro_members where user_id = t.c('rm2')));
select t.eq('G7 marks their open pro reports handled with the reason, and no other report',
  (select count(*) from public.content_reports where reported_user_id = t.c('rm2') and reviewed_at is not null and outcome = 'Claimed a licence that does not exist' and context like 'pro\_%')
  || '/' || (select count(*) from public.content_reports where reported_user_id = t.c('rm2') and reviewed_at is null), '2/1');
select t.as_service();
select t.check('G7 they are not in the review queue', not exists (select 1 from public.pro_review_queue where user_id = t.c('rm2')));
select public.pro_admin_restore_stylist(t.c('rm2'));
select t.as_admin();
select t.check('G7 a restore clears the removal and recreates nothing',
  (select stylist_removed_at is null and stylist_removed_reason is null from public.pro_members where user_id = t.c('rm2'))
  and not exists (select 1 from public.pro_stylists where user_id = t.c('rm2'))
  and (select bool_and(status = 'ended') from public.pro_connections where id in (t.c('rm2ac'), t.c('rm2bc'))));

-- ─── H. block_pro_member: the daily limit ───────────────────────────────────

select t.put('h_s', t.mk_stylist('hs', true)::text); select t.put('h_c', t.mk_user('hc')::text);
select t.put('h', t.mk_conn(t.c('h_s'), t.c('h_c'), 'Client H')::text);
select t.as_user(t.c('h_c'));
select public.block_pro_member(p_connection => t.c('h')) from generate_series(1, 30);
select t.throws('H the 31st block call in a day is limited', format($$select public.block_pro_member(p_connection => %L)$$, t.c('h')), 'pro_rate_limited', 'block_day', null, '54000');
select t.eq('H and still there is one block', (select count(*) from public.list_pro_blocks()), 1::bigint);

-- ─── I. export_my_pro_data: the caller's own data only ──────────────────────

select t.as_admin();
select t.put('x_s', t.mk_stylist('xs', true)::text); select t.put('x_c', t.mk_user('xc')::text);
select t.put('x', t.mk_conn(t.c('x_s'), t.c('x_c'), 'Client X')::text);
update auth.users set email = 'stylist.xs@example.test' where id = t.c('x_s');
update auth.users set email = 'client.xc@example.test' where id = t.c('x_c');
insert into public.clothing_items (user_id, name, category, brand, notes, cost) values (t.c('x_c'), 'SECRET_CLOSET_PIECE', 'tops', 'SECRET_BRAND', 'SECRET_NOTE', 99);
select t.msg(t.c('x'), t.c('x_s'), 'OTHER_SIDE_WORDS_OF_THE_STYLIST'); select t.msg(t.c('x'), t.c('x_c'), 'MY_OWN_WORDS_OF_THE_CLIENT');
insert into public.pro_recommendations (connection_id, title, body, status, sent_at, client_rating, client_comment)
values (t.c('x'), 'Sent look', 'Sent body', 'sent', now() - interval '1 day', 5, 'Loved it');
insert into public.pro_recommendation_items (recommendation_id, position, item_id, name, category)
select id, 1, null, 'Red scarf', 'accessories' from public.pro_recommendations where connection_id = t.c('x') and status = 'sent';
insert into public.pro_recommendations (connection_id, title, body) values (t.c('x'), 'Draft look', 'DRAFT_TEXT_ONLY_THE_STYLIST_SEES');
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, place, note, utc_offset_minutes)
values (t.c('x'), 'client', 'confirmed', now() + interval '4 days', 45, 'in_person', 'The cafe', 'Bring the scarf', 60);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.c('x'), 'closet', 'all', now() + interval '10 days', '2026-10');
insert into public.pro_grant_events (connection_id, scope, event, item_mode, item_count, text_version) values (t.c('x'), 'closet', 'granted', 'all', null, '2026-10');
select t.mk_invite(t.c('x_s')); select t.mk_invite(t.c('x_s'), 'used'); select t.mk_invite(t.c('x_s'), 'revoked'); select t.mk_invite(t.c('x_s'), 'live', interval '-1 day');
select t.put('x_code', (select code from public.pro_invites where stylist_id = t.c('x_s') and status = 'live' order by expires_at desc limit 1));
select t.put('x_ended', t.mk_conn(t.c('x_s'), t.c('x_c'), 'Client X again')::text) where false;
-- the client
select t.as_user(t.c('x_c'));
select t.put('x_client', public.export_my_pro_data()::text);
select t.as_user(t.c('x_s'));
select t.put('x_stylist', public.export_my_pro_data()::text);
select t.as_admin();
select t.eq('I the top-level parts', t.keys(t.get('x_client')::jsonb), 'connections,invites,settings,stylistProfile');
select t.check('I a client''s export has no profile and no invites', (t.get('x_client')::jsonb -> 'stylistProfile') = 'null'::jsonb and (t.get('x_client')::jsonb -> 'invites') = '[]'::jsonb);
select t.eq('I the settings', t.keys(t.get('x_client')::jsonb -> 'settings'), 'adultConfirmedAt,clientTerms,stylistTerms,suspended');
select t.check('I the client''s settings carry the attestation time and the client terms version',
  (t.get('x_client')::jsonb -> 'settings' ->> 'adultConfirmedAt') is not null and (t.get('x_client')::jsonb -> 'settings' -> 'clientTerms' ->> 'version') = '2026-10'
  and (t.get('x_client')::jsonb -> 'settings' ->> 'suspended') = 'false');
select t.eq('I a client''s connection has these parts', t.keys(t.get('x_client')::jsonb -> 'connections' -> 0),
  'endedAt,grantHistory,looks,myMessages,otherLabel,role,sessions,startedAt,status');
select t.eq('I a stylist''s connection lacks the grant history', t.keys(t.get('x_stylist')::jsonb -> 'connections' -> 0),
  'endedAt,looks,myMessages,otherLabel,role,sessions,startedAt,status');
select t.check('I the client''s own words are there, the stylist''s are not',
  t.get('x_client') like '%MY_OWN_WORDS_OF_THE_CLIENT%' and t.get('x_client') not like '%OTHER_SIDE_WORDS%');
select t.check('I the stylist''s own words are there, the client''s are not',
  t.get('x_stylist') like '%OTHER_SIDE_WORDS_OF_THE_STYLIST%' and t.get('x_stylist') not like '%MY_OWN_WORDS_OF_THE_CLIENT%');
select t.check('I the client sees the sent look, with the piece name and their own feedback, and not the draft',
  t.get('x_client') like '%Sent body%' and t.get('x_client') like '%Red scarf%' and t.get('x_client') like '%Loved it%' and t.get('x_client') not like '%DRAFT_TEXT%');
select t.check('I the stylist sees the looks they wrote, drafts included',
  t.get('x_stylist') like '%Sent body%' and t.get('x_stylist') like '%DRAFT_TEXT_ONLY_THE_STYLIST_SEES%');
select t.check('I the session is there with its details on both sides', t.get('x_client') like '%The cafe%' and t.get('x_stylist') like '%Bring the scarf%' and (t.get('x_stylist')::jsonb -> 'connections' -> 0 -> 'sessions' -> 0 ->> 'utcOffsetMinutes') = '60' and t.get('x_stylist') !~ '"tz"');
select t.check('I the client''s grant history is there', jsonb_array_length(t.get('x_client')::jsonb -> 'connections' -> 0 -> 'grantHistory') = 1);
select t.check('I a stylist''s export carries the profile', (t.get('x_stylist')::jsonb -> 'stylistProfile' ->> 'displayName') = 'Xs Stylist');
select t.check('I and the invites, with a status and two dates, never the code',
  jsonb_array_length(t.get('x_stylist')::jsonb -> 'invites') = 4 and t.keys(t.get('x_stylist')::jsonb -> 'invites' -> 0) = 'createdAt,expiresAt,status'
  and t.get('x_stylist') not like '%' || t.get('x_code') || '%'
  and (select string_agg(i ->> 'status', ',' order by i ->> 'status') from jsonb_array_elements(t.get('x_stylist')::jsonb -> 'invites') i) = 'expired,live,revoked,used');
select t.check('I nothing from the client''s closet, in either export: no piece, brand, note or price',
  t.get('x_stylist') !~ 'SECRET|"cost"|"price"|"notes"|"brand"' and t.get('x_client') !~ 'SECRET|"cost"|"price"|"notes"|"brand"');
select t.check('I no account id or email of the other person, in either export',
  t.get('x_client') !~ (t.c('x_s')::text || '|stylist\.xs') and t.get('x_stylist') !~ (t.c('x_c')::text || '|client\.xc'));
select t.check('I the label of the other person is what they chose to show', t.get('x_client') like '%Xs Stylist%' and t.get('x_stylist') like '%Client X%');
-- a person with nothing
select t.as_user(t.u('gus'));
select t.eq('I a person with no pro data still gets the four parts', t.keys(public.export_my_pro_data()), 'connections,invites,settings,stylistProfile');
select t.as_no_subject();
select t.throws('I no subject, no export', 'select public.export_my_pro_data()', 'not_authenticated');
select t.as_anonymous_user(t.u('gus'));
select t.throws('I an anonymous token, no export', 'select public.export_my_pro_data()', 'not_authenticated');
select t.as_anon();
select t.throws('I a guest, no export', 'select public.export_my_pro_data()', 'permission denied');
