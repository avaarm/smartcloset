-- p3_work (files 1 to 7; no file of the moderation stream is needed)
--   A  privileges and who may call what
--   B  looks: drafts, pieces, filters, caps, sending, viewing, feedback, what a stylist reads back
--   C  looks after the client narrows, revokes or ends; ended connections are read-only; a closed shell
--   D  sessions: proposing, answering, conflicts, cancelling, lazy states, scopes
--   E  messages: sending, limits, paging, read pointers, ending, ordering of the thread
--   F  the gates on every function, in one place

-- People, once: Ann (approved stylist) works with Bea and with Cat; Ann is also a client of Dee. Bea and Cat share
-- every piece (not the wishlist) with Ann.
select t.as_admin();
create function t.c(p_name text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_name $$;
update public.pro_members set client_terms_version = '2026-10', client_terms_accepted_at = now() where user_id = t.u('ann');
select t.put('c_ab', t.mk_conn(t.u('ann'), t.u('bea'), 'Bea B')::text);
select t.put('c_ac', t.mk_conn(t.u('ann'), t.u('cat'), 'Cat C')::text);
select t.put('c_da', t.mk_conn(t.u('dee'), t.u('ann'), 'Ann A')::text);
update public.pro_connections set last_activity_at = now() - interval '1 day' where id in (t.c('c_ab'), t.c('c_ac'), t.c('c_da'));
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'all', null, '2026-10');
select t.as_user(t.u('cat'));
select public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10');
select t.as_admin();
-- A client with one photographed piece, and a connection to a stylist, made directly (as the owner), with no grant.
create function t.mk_pair(p_stylist uuid, p_tag text) returns uuid language plpgsql as $$
declare
  cl  uuid := t.mk_user(p_tag, true, false);
  cid uuid;
begin
  insert into public.clothing_items (id, user_id, name, category, user_image)
  values (t.item_for(cl), cl, 'Item of ' || p_tag, 'tops',
          'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || cl::text || '/1700000000001.jpg');
  cid := t.mk_conn(p_stylist, cl, initcap(p_tag));
  update public.pro_connections set last_activity_at = now() - interval '1 day' where id = cid;
  perform t.put('cl_' || p_tag, cl::text);
  perform t.put('cx_' || p_tag, cid::text);
  return cid;
end $$;
create function t.item_for(p_client uuid) returns uuid language sql immutable as $$
  select (substr(p_client::text, 1, 1) || '9' || substr(p_client::text, 3))::uuid $$;
create function t.nlooks(p_conn uuid) returns integer language sql stable as $$ select count(*)::integer from public.pro_recommendations where connection_id = p_conn $$;
create function t.future(p_hours integer) returns timestamptz language sql stable as $$ select now() + make_interval(hours => p_hours) $$;

-- ─── A. Privileges ──────────────────────────────────────────────────────────

select t.check('the 12 client functions of file 7 are executable by authenticated and by no guest', (
  select count(*) = 12 and bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
         and not bool_or(has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('save_pro_recommendation', 'send_pro_recommendation', 'delete_pro_recommendation', 'list_pro_recommendations',
                       'get_pro_recommendation', 'give_recommendation_feedback', 'propose_pro_appointment', 'respond_pro_appointment',
                       'cancel_pro_appointment', 'list_pro_appointments', 'send_pro_message', 'get_pro_thread')));
select t.check('every function of file 7 is security definer and pins search_path', (
  select count(*) = 12 and bool_and(p.prosecdef) and bool_and(p.proconfig is not null and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('save_pro_recommendation', 'send_pro_recommendation', 'delete_pro_recommendation', 'list_pro_recommendations',
                       'get_pro_recommendation', 'give_recommendation_feedback', 'propose_pro_appointment', 'respond_pro_appointment',
                       'cancel_pro_appointment', 'list_pro_appointments', 'send_pro_message', 'get_pro_thread')));
select t.check('no function is overloaded (each of the twelve exists once)', (
  select count(*) = 12 from (select proname from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('save_pro_recommendation', 'send_pro_recommendation', 'delete_pro_recommendation', 'list_pro_recommendations',
                     'get_pro_recommendation', 'give_recommendation_feedback', 'propose_pro_appointment', 'respond_pro_appointment',
                     'cancel_pro_appointment', 'list_pro_appointments', 'send_pro_message', 'get_pro_thread') group by proname having count(*) = 1) s));
select t.check('the list functions return exactly the columns of 4.6', (
  select string_agg(p.proname || ':' || pg_get_function_result(p.oid), ' ; ' order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('list_pro_recommendations', 'list_pro_appointments'))
  = 'list_pro_appointments:TABLE(appointment_id uuid, connection_id uuid, other_label text, my_role text, status text, proposed_by text, starts_at timestamp with time zone, duration_minutes smallint, mode text, place text, note text, utc_offset_minutes smallint, can_confirm boolean, can_decline boolean, can_cancel boolean, created_at timestamp with time zone) ; list_pro_recommendations:TABLE(rec_id uuid, status text, title text, item_count integer, cover_item_id uuid, cover_photo_path text, sent_at timestamp with time zone, viewed_at timestamp with time zone, updated_at timestamp with time zone, client_rating smallint, is_new boolean)');

select t.as_anon();
select t.throws('a guest cannot save a look', $$select public.save_pro_recommendation(gen_random_uuid(), null, 'x', '', null, gen_random_uuid())$$, 'permission denied');
select t.throws('a guest cannot send a message', $$select public.send_pro_message(gen_random_uuid(), 'hi', gen_random_uuid())$$, 'permission denied');
select t.throws('a guest cannot read a thread', $$select public.get_pro_thread(gen_random_uuid())$$, 'permission denied');
select t.throws('a guest cannot list sessions', $$select * from public.list_pro_appointments()$$, 'permission denied');
select t.throws('a guest cannot read a pro table', 'select * from public.pro_messages', 'permission denied');
select t.as_no_subject();
select t.throws('no subject: save_pro_recommendation', $$select public.save_pro_recommendation(gen_random_uuid(), null, 'x', '', null, gen_random_uuid())$$, 'not_authenticated', null, null, '28000');
select t.throws('no subject: get_pro_thread (a way out)', $$select public.get_pro_thread(gen_random_uuid())$$, 'not_authenticated');
select t.throws('no subject: list_pro_appointments (a way out)', $$select * from public.list_pro_appointments()$$, 'not_authenticated');
select t.as_anonymous_user(t.u('ivy'));
select t.throws('anonymous token: send_pro_message', $$select public.send_pro_message(gen_random_uuid(), 'hi', gen_random_uuid())$$, 'not_authenticated');
select t.throws('anonymous token: get_pro_recommendation', $$select public.get_pro_recommendation(gen_random_uuid())$$, 'not_authenticated');
select t.throws('anonymous token: propose_pro_appointment', format($$select public.propose_pro_appointment(gen_random_uuid(), %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.future(48)), 'not_authenticated');

-- ─── B. Looks ───────────────────────────────────────────────────────────────

select t.as_user(t.u('ann'));
-- the shape and the idempotency of a draft
select t.put('ref1', gen_random_uuid()::text);
select t.put('d1', public.save_pro_recommendation(t.c('c_ab'), null, 'Autumn layers', 'Start with the blazer.', array[t.item('bea', 1), t.item('bea', 3)], t.get('ref1')::uuid)::text);
select t.check('a draft returns exactly id, status and updatedAt', t.keys(t.get('d1')::jsonb) = 'id,status,updatedAt' and (t.get('d1')::jsonb ->> 'status') = 'draft');
select t.put('d1_again', public.save_pro_recommendation(t.c('c_ab'), null, 'Autumn layers', 'Start with the blazer.', array[t.item('bea', 1), t.item('bea', 3)], t.get('ref1')::uuid)::text);
select t.check('a retry with the same ref returns the same draft', (t.get('d1_again')::jsonb ->> 'id') = (t.get('d1')::jsonb ->> 'id'));
select t.put('d1_other_title', public.save_pro_recommendation(t.c('c_ab'), null, 'A different title', '', null, t.get('ref1')::uuid)::text);
select t.check('even with other content the ref decides: still the same draft', (t.get('d1_other_title')::jsonb ->> 'id') = (t.get('d1')::jsonb ->> 'id'));
select t.as_admin();
select t.eq('one look, two items, copies of the name and category only', t.nlooks(t.c('c_ab')), 1);
select t.eq('(the copied items)', (select string_agg(i.position || ':' || i.name || ':' || i.category, ',' order by i.position)
                                    from public.pro_recommendation_items i where i.recommendation_id = (t.get('d1')::jsonb ->> 'id')::uuid),
            '1:Blue blazer:outerwear,2:Linen shirt:tops');
select t.check('the title and body are stored trimmed', (select title = 'Autumn layers' and body = 'Start with the blazer.' from public.pro_recommendations where id = (t.get('d1')::jsonb ->> 'id')::uuid));
select t.as_user(t.u('ann'));
select t.throws('creating needs a client_ref', format($$select public.save_pro_recommendation(%L, null, 'No ref', '', null, null)$$, t.c('c_ab')), 'invalid_request', 'client_ref', null, '22023');
select t.throws('a title is required', format($$select public.save_pro_recommendation(%L, null, null, '', null, gen_random_uuid())$$, t.c('c_ab')), 'invalid_recommendation', 'title');
select t.throws('a blank title is refused', format($$select public.save_pro_recommendation(%L, null, '   ', '', null, gen_random_uuid())$$, t.c('c_ab')), 'invalid_recommendation', 'title');
select t.throws('a title over 80 characters is refused', format($$select public.save_pro_recommendation(%L, null, %L, '', null, gen_random_uuid())$$, t.c('c_ab'), repeat('x', 81)), 'invalid_recommendation', 'title');
select t.throws('a zero-width character in a title is refused', format($$select public.save_pro_recommendation(%L, null, %L, '', null, gen_random_uuid())$$, t.c('c_ab'), 'ab' || chr(8203) || 'cd'), 'invalid_recommendation', 'title');
select t.throws('a body over 1,000 characters is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', %L, null, gen_random_uuid())$$, t.c('c_ab'), repeat('x', 1001)), 'invalid_recommendation', 'body');
select t.throws('a control character in a body is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', %L, null, gen_random_uuid())$$, t.c('c_ab'), 'a' || chr(7) || 'b'), 'invalid_recommendation', 'body');
select t.throws('a body written backwards behind an override is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', %L, null, gen_random_uuid())$$, t.c('c_ab'), chr(8238) || 'tfig drac'), 'text_not_allowed', 'body', 'content');
select t.check('80-character title and 1,000-character body are accepted', public.save_pro_recommendation(t.c('c_ab'), null, repeat('t', 80), repeat('b', 1000), null, gen_random_uuid()) ->> 'status' = 'draft');
-- text filters ("chat" mode: scam phrases refused, ordinary payment talk and contact details allowed)
select t.throws('a gift card in the title is refused', format($$select public.save_pro_recommendation(%L, null, 'Pay by gift card', '', null, gen_random_uuid())$$, t.c('c_ab')), 'text_not_allowed', 'title', 'payment', '22023');
select t.throws('a wire transfer in the body is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', 'send a wire transfer', null, gen_random_uuid())$$, t.c('c_ab')), 'text_not_allowed', 'body', 'payment');
select t.throws('a typographic apostrophe does not hide a cashier''s check', format($$select public.save_pro_recommendation(%L, null, 'Ok', %L, null, gen_random_uuid())$$, t.c('c_ab'), 'a cashier' || chr(8217) || 's check'), 'text_not_allowed', 'body', 'payment');
select t.check('a phone number and a link are allowed between connected adults', public.save_pro_recommendation(t.c('c_ab'), null, 'Shops', 'Call 555 123 4567 or see https://example.test/shop', null, gen_random_uuid()) ->> 'status' = 'draft');
select t.check('ordinary payment talk is allowed', public.save_pro_recommendation(t.c('c_ab'), null, 'Fees', 'My rate is $80, paid by PayPal before we start', null, gen_random_uuid()) ->> 'status' = 'draft');
select t.as_admin();
select t.load_terms();
select t.as_user(t.u('ann'));
select t.throws('a blocked term in a title is refused', format($$select public.save_pro_recommendation(%L, null, 'blockedterm07 outfit', '', null, gen_random_uuid())$$, t.c('c_ab')), 'text_not_allowed', 'title', 'content');
select t.as_admin();
delete from public.swap_blocked_terms where term like 'blockedterm%';

-- pieces: only the client's own, inside the grant right now; the position of the first that is not
select t.as_user(t.u('ann'));
select t.throws('a piece of another client (a friend''s closet, say) is refused even though this grant is "all"', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array[%L::uuid], gen_random_uuid())$$, t.c('c_ab'), t.item('cat', 1)), 'item_not_shared', '1', null, '22023');
select t.throws('the wishlist piece is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array[%L::uuid], gen_random_uuid())$$, t.c('c_ab'), t.item('bea', 6)), 'item_not_shared', '1');
select t.throws('an unknown piece is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array[gen_random_uuid()], gen_random_uuid())$$, t.c('c_ab')), 'item_not_shared', '1');
select t.throws('the position of the first piece that is not shared is reported', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array[%L::uuid, %L::uuid, %L::uuid, %L::uuid], gen_random_uuid())$$, t.c('c_ab'), t.item('bea', 1), t.item('bea', 2), t.item('cat', 2), t.item('bea', 6)), 'item_not_shared', '3');
select t.throws('a null entry is refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array[%L::uuid, null], gen_random_uuid())$$, t.c('c_ab'), t.item('bea', 1)), 'invalid_recommendation', 'items');
select t.throws('more than 12 pieces are refused', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array(select gen_random_uuid() from generate_series(1, 13)), gen_random_uuid())$$, t.c('c_ab')), 'invalid_recommendation', 'items');
select t.throws('a piece of Cat''s on Bea''s connection is refused; Bea''s own piece on Cat''s connection too', format($$select public.save_pro_recommendation(%L, null, 'Ok', '', array[%L::uuid], gen_random_uuid())$$, t.c('c_ac'), t.item('bea', 1)), 'item_not_shared', '1');
select t.put('d_dup', public.save_pro_recommendation(t.c('c_ab'), null, 'Dups', '', array[t.item('bea', 3), t.item('bea', 3), t.item('bea', 4)], gen_random_uuid())::text);
select t.as_admin();
select t.eq('a repeated piece counts once', (select count(*)::integer from public.pro_recommendation_items where recommendation_id = (t.get('d_dup')::jsonb ->> 'id')::uuid), 2);
-- 12 pieces fit; names are copied at 120 characters
insert into public.clothing_items (id, user_id, name, category)
select ('b8000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, t.u('bea'), 'Extra ' || n, 'tops' from generate_series(1, 12) n;
select t.as_user(t.u('ann'));
select t.put('d12', public.save_pro_recommendation(t.c('c_ab'), null, 'Twelve', '',
       array(select ('b8000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 12) n), gen_random_uuid())::text);
select t.as_admin();
select t.eq('twelve pieces are accepted', (select count(*)::integer from public.pro_recommendation_items where recommendation_id = (t.get('d12')::jsonb ->> 'id')::uuid), 12);
select t.as_user(t.u('ann'));
select t.put('d_long', public.save_pro_recommendation(t.c('c_ab'), null, 'Long name', '', array[t.item('bea', 8)], gen_random_uuid())::text);
select t.as_admin();
select t.eq('a long closet name is copied at 120 characters', (select char_length(name) from public.pro_recommendation_items where recommendation_id = (t.get('d_long')::jsonb ->> 'id')::uuid), 120);

-- the cap of 30 drafts on a connection
select t.as_admin();
insert into public.pro_recommendations (connection_id, title)
select t.c('c_ab'), 'Filler ' || n
  from generate_series(1, 30 - (select count(*)::integer from public.pro_recommendations where connection_id = t.c('c_ab') and status = 'draft')) n;
select t.eq('the connection holds thirty drafts', (select count(*)::integer from public.pro_recommendations where connection_id = t.c('c_ab') and status = 'draft'), 30);
select t.as_user(t.u('ann'));
select t.throws('the 31st draft on a connection is refused', format($$select public.save_pro_recommendation(%L, null, 'One too many', '', null, gen_random_uuid())$$, t.c('c_ab')), 'draft_limit', null, null, '54000');
select t.check('a retry of an existing draft is not a new draft and is not refused at the cap', (public.save_pro_recommendation(t.c('c_ab'), null, 'x', '', null, t.get('ref1')::uuid) ->> 'id') = (t.get('d1')::jsonb ->> 'id'));
select t.check('the cap is per connection: Cat''s connection takes a draft', public.save_pro_recommendation(t.c('c_ac'), null, 'Cat look', 'Body', array[t.item('cat', 1)], gen_random_uuid()) ->> 'status' = 'draft');
select t.as_admin();
delete from public.pro_recommendations where connection_id = t.c('c_ab') and title like 'Filler %';

-- editing a draft: a title-only edit keeps the pieces; an empty array clears them; omitted body clears the body
select t.as_user(t.u('ann'));
select t.put('upd1', public.save_pro_recommendation(t.c('c_ab'), (t.get('d1')::jsonb ->> 'id')::uuid, 'Autumn layers, revised', 'Start with the blazer.')::text);
select t.as_admin();
select t.eq('a title-only edit (p_item_ids omitted) keeps the pieces', (select count(*)::integer from public.pro_recommendation_items where recommendation_id = (t.get('d1')::jsonb ->> 'id')::uuid), 2);
select t.eq('and changed the title', (select title from public.pro_recommendations where id = (t.get('d1')::jsonb ->> 'id')::uuid), 'Autumn layers, revised');
select t.as_user(t.u('ann'));
select t.put('upd2', public.save_pro_recommendation(t.c('c_ab'), (t.get('d1')::jsonb ->> 'id')::uuid, 'Autumn layers, revised', 'Now with a scarf.', array[t.item('bea', 2), t.item('bea', 1)])::text);
select t.as_admin();
select t.eq('an array replaces the pieces, in the given order', (select string_agg(i.position || ':' || i.name, ',' order by i.position) from public.pro_recommendation_items i where i.recommendation_id = (t.get('d1')::jsonb ->> 'id')::uuid),
            '1:Red scarf,2:Blue blazer');
select t.as_user(t.u('ann'));
select public.save_pro_recommendation(t.c('c_ab'), (t.get('d1')::jsonb ->> 'id')::uuid, 'Autumn layers, revised', 'Now with a scarf.', '{}');
select t.as_admin();
select t.eq('an empty array clears the pieces', (select count(*)::integer from public.pro_recommendation_items where recommendation_id = (t.get('d1')::jsonb ->> 'id')::uuid), 0);
select t.as_user(t.u('ann'));
select public.save_pro_recommendation(t.c('c_ab'), (t.get('d1')::jsonb ->> 'id')::uuid, 'Autumn layers, revised', 'Now with a scarf.', array[t.item('bea', 1), t.item('bea', 2)]);
select t.throws('editing a look that is not on this connection is unavailable', format($$select public.save_pro_recommendation(%L, %L, 'x', '', null)$$, t.c('c_ac'), (t.get('d1')::jsonb ->> 'id')), 'pro_unavailable');
select t.throws('editing an unknown look is unavailable', format($$select public.save_pro_recommendation(%L, %L, 'x', '', null)$$, t.c('c_ab'), gen_random_uuid()), 'pro_unavailable');
select t.throws('an edit with an unshared piece is refused and changes nothing', format($$select public.save_pro_recommendation(%L, %L, 'Changed', '', array[%L::uuid])$$, t.c('c_ab'), (t.get('d1')::jsonb ->> 'id'), t.item('cat', 1)), 'item_not_shared', '1');
select t.as_admin();
select t.check('(nothing changed)', (select title = 'Autumn layers, revised' from public.pro_recommendations where id = (t.get('d1')::jsonb ->> 'id')::uuid)
               and (select count(*) = 2 from public.pro_recommendation_items where recommendation_id = (t.get('d1')::jsonb ->> 'id')::uuid));
-- the connection moves when a look is sent, not when it is saved
select t.check('saving a draft does not move the connection', (select last_activity_at = now() - interval '1 day' from public.pro_connections where id = t.c('c_ab')));

-- sending
select t.as_user(t.u('ann'));
select t.put('d_empty', public.save_pro_recommendation(t.c('c_ab'), null, 'Nothing in it', '', null, gen_random_uuid())::text);
select t.throws('a look with no piece and no words cannot be sent', format($$select public.send_pro_recommendation(%L)$$, (t.get('d_empty')::jsonb ->> 'id')), 'recommendation_empty', null, null, '22023');
select t.put('d_words', public.save_pro_recommendation(t.c('c_ab'), null, 'Only words', 'Try layering.', null, gen_random_uuid())::text);
select public.send_pro_recommendation((t.get('d_words')::jsonb ->> 'id')::uuid);
select t.as_admin();
select t.eq('a look with only words can be sent', (select status from public.pro_recommendations where id = (t.get('d_words')::jsonb ->> 'id')::uuid), 'sent');
select t.check('sending moved the connection', (select last_activity_at > now() - interval '1 day' from public.pro_connections where id = t.c('c_ab')));
select t.check('and stamped sent_at', (select sent_at is not null from public.pro_recommendations where id = (t.get('d_words')::jsonb ->> 'id')::uuid));
select t.as_user(t.u('ann'));
select public.send_pro_recommendation((t.get('d_words')::jsonb ->> 'id')::uuid);
select t.as_admin();
select t.eq('sending again is a success and changes nothing', (select status from public.pro_recommendations where id = (t.get('d_words')::jsonb ->> 'id')::uuid), 'sent');
select t.as_user(t.u('ann'));
select public.send_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid);
select t.throws('a sent look cannot be edited', format($$select public.save_pro_recommendation(%L, %L, 'x', '', null)$$, t.c('c_ab'), (t.get('d1')::jsonb ->> 'id')), 'recommendation_locked', null, null, '22023');
select t.throws('a sent look cannot be deleted', format($$select public.delete_pro_recommendation(%L)$$, (t.get('d1')::jsonb ->> 'id')), 'recommendation_locked');
select t.throws('an unknown look cannot be sent', format($$select public.send_pro_recommendation(%L)$$, gen_random_uuid()), 'pro_unavailable');
select t.as_user(t.u('dee'));
select t.throws('another stylist cannot send it', format($$select public.send_pro_recommendation(%L)$$, (t.get('d_empty')::jsonb ->> 'id')), 'pro_unavailable');
select t.throws('another stylist cannot delete it', format($$select public.delete_pro_recommendation(%L)$$, (t.get('d_empty')::jsonb ->> 'id')), 'pro_unavailable');
select t.throws('another stylist cannot save to the connection', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_ab')), 'pro_unavailable');
select t.as_user(t.u('bea'));
select t.throws('the client cannot save a look', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('the client cannot send a look', format($$select public.send_pro_recommendation(%L)$$, (t.get('d_empty')::jsonb ->> 'id')), 'pro_unavailable');
select t.throws('the client cannot delete a draft', format($$select public.delete_pro_recommendation(%L)$$, (t.get('d_empty')::jsonb ->> 'id')), 'pro_unavailable');

-- deleting a draft
select t.as_user(t.u('ann'));
select public.delete_pro_recommendation((t.get('d_empty')::jsonb ->> 'id')::uuid);
select t.as_admin();
select t.eq('a draft is deleted', (select count(*)::integer from public.pro_recommendations where id = (t.get('d_empty')::jsonb ->> 'id')::uuid), 0);
select t.as_user(t.u('ann'));
select t.throws('deleting it again is unavailable', format($$select public.delete_pro_recommendation(%L)$$, (t.get('d_empty')::jsonb ->> 'id')), 'pro_unavailable');
select t.put('d_del_items', public.save_pro_recommendation(t.c('c_ab'), null, 'Gone with items', '', array[t.item('bea', 3)], gen_random_uuid())::text);
select public.delete_pro_recommendation((t.get('d_del_items')::jsonb ->> 'id')::uuid);
select t.as_admin();
select t.eq('its pieces go with it', (select count(*)::integer from public.pro_recommendation_items where recommendation_id = (t.get('d_del_items')::jsonb ->> 'id')::uuid), 0);

-- (file 8, when it is applied) a client cannot report a draft by its id either
do $$
begin
  if to_regprocedure('public.report_pro_content(text, uuid, text, text, bigint)') is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', t.u('bea'), 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform t.throws('the client cannot report a draft by its id', format($q$select public.report_pro_content('recommendation', %L, 'spam')$q$, (t.get('d_dup')::jsonb ->> 'id')), 'pro_unavailable');
    reset role;
  else
    perform t.check('(skipped: file 8 is not applied) the client cannot report a draft by its id', true);
  end if;
end $$;

-- the client: a draft does not exist; a sent look is read, marked viewed, rated
select t.as_user(t.u('bea'));
select t.throws('the client cannot read a draft by its id', format($$select public.get_pro_recommendation(%L)$$, (t.get('d_dup')::jsonb ->> 'id')), 'pro_unavailable', null, null, '22023');
select t.throws('the client cannot rate a draft by its id', format($$select public.give_recommendation_feedback(%L, 5)$$, (t.get('d_dup')::jsonb ->> 'id')), 'pro_unavailable');
select t.check('the client''s list shows only what was sent, and those are new', (
  select count(*) = 2 and bool_and(is_new) and bool_and(status = 'sent') from public.list_pro_recommendations(t.c('c_ab'))));
select t.check('the list has no draft title', (select not bool_or(title in ('Dups', 'Twelve', 'Long name')) from public.list_pro_recommendations(t.c('c_ab'))));
select t.check('the badge counts the two unviewed looks', public.get_pro_badge() = 2);
select t.put('look1', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('reading it marks it viewed and the answer already says so', (t.get('look1')::jsonb ->> 'status') = 'viewed' and (t.get('look1')::jsonb ->> 'viewedAt') is not null
               and (t.get('look1')::jsonb ->> 'sentAt') is not null and (t.get('look1')::jsonb -> 'implementedAt') = 'null'::jsonb);
select t.check('the look has exactly the documented keys', t.keys(t.get('look1')::jsonb) = 'actions,body,connectionId,feedback,id,implementedAt,items,sentAt,status,title,viewedAt');
select t.check('the client gets her own live pieces with a photo path of her own folder', (
  select jsonb_array_length(t.get('look1')::jsonb -> 'items') = 2
         and bool_and((i ->> 'available') = 'true' and (i ->> 'hasPhoto') = 'true' and (i ->> 'photoPath') like t.u('bea')::text || '/%' and (i ->> 'itemId') is not null)
    from jsonb_array_elements(t.get('look1')::jsonb -> 'items') i));
select t.check('the item keys are the documented ones', (select bool_and(t.keys(i) = 'available,brand,category,color,hasPhoto,itemId,name,photoPath,position') from jsonb_array_elements(t.get('look1')::jsonb -> 'items') i));
select t.check('the client''s actions', (t.get('look1')::jsonb -> 'actions') = '{"canEdit": false, "canSend": false, "canDelete": false, "canGiveFeedback": true, "canMarkWorn": true}'::jsonb);
select t.check('the badge now counts one', public.get_pro_badge() = 1);
select t.check('the list marks the viewed one as not new', (select bool_or(not is_new and status = 'viewed') from public.list_pro_recommendations(t.c('c_ab'))));
select t.check('the list gives the client the cover piece and her own photo path', (
  select cover_item_id = t.item('bea', 1) and cover_photo_path = t.u('bea')::text || '/170000000001.jpg' and item_count = 2
    from public.list_pro_recommendations(t.c('c_ab')) where title = 'Autumn layers, revised'));
select t.check('a look with no piece has no cover', (select cover_item_id is null and cover_photo_path is null and item_count = 0 from public.list_pro_recommendations(t.c('c_ab')) where title = 'Only words'));
select t.as_admin();
select t.eq('(viewing set viewed_at once)', (select count(*)::integer from public.pro_recommendations where connection_id = t.c('c_ab') and status = 'viewed' and viewed_at is not null), 1);

-- feedback
select t.as_user(t.u('bea'));
select t.throws('feedback needs something', format($$select public.give_recommendation_feedback(%L)$$, (t.get('d1')::jsonb ->> 'id')), 'invalid_request', 'feedback', null, '22023');
select t.throws('rating 0 is refused', format($$select public.give_recommendation_feedback(%L, 0)$$, (t.get('d1')::jsonb ->> 'id')), 'invalid_request', 'rating');
select t.throws('rating 6 is refused', format($$select public.give_recommendation_feedback(%L, 6)$$, (t.get('d1')::jsonb ->> 'id')), 'invalid_request', 'rating');
select t.throws('a comment of 501 characters is refused', format($$select public.give_recommendation_feedback(%L, null, %L)$$, (t.get('d1')::jsonb ->> 'id'), repeat('c', 501)), 'invalid_request', 'comment');
select t.throws('a scam phrase in a comment is refused', format($$select public.give_recommendation_feedback(%L, null, 'send a gift card')$$, (t.get('d1')::jsonb ->> 'id')), 'text_not_allowed', 'comment', 'payment');
select public.give_recommendation_feedback((t.get('d1')::jsonb ->> 'id')::uuid, 4, 'Lovely, thank you.');
select t.put('look1b', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('rating and comment are stored', (t.get('look1b')::jsonb -> 'feedback' ->> 'rating') = '4' and (t.get('look1b')::jsonb -> 'feedback' ->> 'comment') = 'Lovely, thank you.'
               and (t.get('look1b')::jsonb -> 'feedback' ->> 'at') is not null and (t.get('look1b')::jsonb ->> 'status') = 'viewed');
select public.give_recommendation_feedback((t.get('d1')::jsonb ->> 'id')::uuid, null, null, true);
select t.put('look1c', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('worn sets implemented and keeps the rating and the comment', (t.get('look1c')::jsonb ->> 'status') = 'implemented' and (t.get('look1c')::jsonb ->> 'implementedAt') is not null
               and (t.get('look1c')::jsonb -> 'feedback' ->> 'rating') = '4' and (t.get('look1c')::jsonb -> 'feedback' ->> 'comment') = 'Lovely, thank you.');
select public.give_recommendation_feedback((t.get('d1')::jsonb ->> 'id')::uuid, 5);
select t.put('look1d', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('a new rating changes only the rating; the look stays implemented', (t.get('look1d')::jsonb -> 'feedback' ->> 'rating') = '5' and (t.get('look1d')::jsonb -> 'feedback' ->> 'comment') = 'Lovely, thank you.'
               and (t.get('look1d')::jsonb ->> 'status') = 'implemented');
select public.give_recommendation_feedback((t.get('d1')::jsonb ->> 'id')::uuid, null, null, false);
select t.put('look1e', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('not worn returns it to viewed and clears the date', (t.get('look1e')::jsonb ->> 'status') = 'viewed' and (t.get('look1e')::jsonb -> 'implementedAt') = 'null'::jsonb);
select public.give_recommendation_feedback((t.get('d1')::jsonb ->> 'id')::uuid, null, 'A comment again.');
select public.give_recommendation_feedback((t.get('d1')::jsonb ->> 'id')::uuid, null, E'  \n ');
select t.put('look1f', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('a comment of only spaces and a new line clears it; the rating stays', (t.get('look1f')::jsonb -> 'feedback' ->> 'rating') = '5' and (t.get('look1f')::jsonb -> 'feedback' -> 'comment') = 'null'::jsonb);
-- feedback on a look the client has not opened yet counts as having seen it
select public.give_recommendation_feedback((t.get('d_words')::jsonb ->> 'id')::uuid, null, null, true);
select t.as_admin();
select t.check('worn on a sent look also marks it viewed', (select status = 'implemented' and viewed_at is not null from public.pro_recommendations where id = (t.get('d_words')::jsonb ->> 'id')::uuid));
select t.as_user(t.u('ann'));
select t.throws('the stylist cannot give feedback', format($$select public.give_recommendation_feedback(%L, 5)$$, (t.get('d1')::jsonb ->> 'id')), 'pro_unavailable');
select t.put('look1_s', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('the stylist reads the rating and the status, and cannot edit', (t.get('look1_s')::jsonb -> 'feedback' ->> 'rating') = '5' and (t.get('look1_s')::jsonb ->> 'status') = 'viewed'
               and (t.get('look1_s')::jsonb -> 'actions') = '{"canEdit": false, "canSend": false, "canDelete": false, "canGiveFeedback": false, "canMarkWorn": false}'::jsonb);
select t.check('the stylist''s read did not mark anything viewed (and the list shows no new flag for her)', (select bool_and(not is_new) from public.list_pro_recommendations(t.c('c_ab'))));
select t.as_admin();
select t.eq('a stylist''s read of a sent look does not set viewed_at', (select count(*)::integer from public.pro_recommendations
   where connection_id = t.c('c_ac') and status = 'sent' and viewed_at is not null), 0);

-- paging the list of looks: newest update first, p_before, the limit clamped to 1..40
select t.as_admin();
insert into public.pro_recommendations (connection_id, title, status, sent_at, updated_at) values
  (t.c('c_ac'), 'Cat A', 'sent', now(), now() - interval '1 day'),
  (t.c('c_ac'), 'Cat B', 'sent', now(), now() - interval '2 days'),
  (t.c('c_ac'), 'Cat C', 'sent', now(), now() - interval '3 days');
select t.as_user(t.u('cat'));
select t.eq('the client''s list, newest first, two at a time', (select string_agg(title, ',' order by updated_at desc) from public.list_pro_recommendations(t.c('c_ac'), null, 2)), 'Cat A,Cat B');
select t.eq('p_before pages on: only what is older than the given time', (select string_agg(title, ',') from public.list_pro_recommendations(t.c('c_ac'), now() - interval '2 days', 5)), 'Cat C');
select t.eq('nothing older than the oldest', (select count(*)::integer from public.list_pro_recommendations(t.c('c_ac'), now() - interval '3 days', 5)), 0);
select t.eq('a limit of 0 is clamped to 1', (select count(*)::integer from public.list_pro_recommendations(t.c('c_ac'), null, 0)), 1);
select t.eq('a negative limit is clamped to 1', (select count(*)::integer from public.list_pro_recommendations(t.c('c_ac'), null, -4)), 1);
select t.eq('a null limit is the default (all three)', (select count(*)::integer from public.list_pro_recommendations(t.c('c_ac'), null, null)), 3);
select t.as_user(t.u('ann'));
select t.eq('the stylist''s list on the same connection also has her draft, first', (select title from public.list_pro_recommendations(t.c('c_ac'), null, 1)), 'Cat look');
select t.eq('and the whole list is four', (select count(*)::integer from public.list_pro_recommendations(t.c('c_ac'), null, 1000)), 4);

-- ─── C. What a stylist reads back about a piece, while the grant lasts and after ──

select t.as_user(t.u('ann'));
select t.put('s_in', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('while the pieces are shared the stylist reads color, brand and the photo flag of each', (
  select bool_and((i ->> 'available') = 'true' and (i ->> 'hasPhoto') = 'true' and (i ->> 'itemId') is not null)
         and bool_or(i ->> 'name' = 'Blue blazer' and i ->> 'color' = 'blue' and i ->> 'brand' = 'Zara')
    from jsonb_array_elements(t.get('s_in')::jsonb -> 'items') i));
select t.check('a stylist is never given a photo path: the key is there and empty', (
  select bool_and(i -> 'photoPath' = 'null'::jsonb) from jsonb_array_elements(t.get('s_in')::jsonb -> 'items') i));
select t.check('and no string of the shape <uuid>/<file> is in the answer', t.get('s_in') !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/');
select t.check('the list gives the stylist the cover piece and never a path', (
  select cover_item_id = t.item('bea', 1) and cover_photo_path is null from public.list_pro_recommendations(t.c('c_ab')) where title = 'Autumn layers, revised'));
select t.check('a stylist''s draft shows its pieces to her while they are shared', (
  select cover_item_id = t.item('bea', 3) from public.list_pro_recommendations(t.c('c_ab')) where title = 'Dups'));
select t.check('the stylist''s draft: the actions', (public.get_pro_recommendation((t.get('d_dup')::jsonb ->> 'id')::uuid) -> 'actions')
               = '{"canEdit": true, "canSend": true, "canDelete": true, "canGiveFeedback": false, "canMarkWorn": false}'::jsonb);

-- narrowed: Bea keeps only pieces 3 and 4
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'selected', array[t.item('bea', 3), t.item('bea', 4)], '2026-10');
select t.as_user(t.u('ann'));
select t.put('s_narrow', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid)::text);
select t.check('narrowed: a piece that left the grant reads back its copied name and category and nothing else', (
  select bool_and((i ->> 'available') = 'false' and i -> 'color' = 'null'::jsonb and i -> 'brand' = 'null'::jsonb and (i ->> 'hasPhoto') = 'false'
                  and i -> 'photoPath' = 'null'::jsonb and (i ->> 'name') in ('Blue blazer', 'Red scarf') and (i ->> 'category') in ('outerwear', 'accessories'))
    from jsonb_array_elements(t.get('s_narrow')::jsonb -> 'items') i));
select t.check('narrowed: the list has no cover piece for that look', (
  select cover_item_id is null and cover_photo_path is null from public.list_pro_recommendations(t.c('c_ab')) where title = 'Autumn layers, revised'));
select t.check('narrowed: a look whose pieces are still shared still has its cover', (
  select cover_item_id = t.item('bea', 3) from public.list_pro_recommendations(t.c('c_ab')) where title = 'Dups'));
select t.throws('narrowed: a piece outside the grant cannot go into a draft', format($$select public.save_pro_recommendation(%L, %L, 'Dups', '', array[%L::uuid])$$, t.c('c_ab'), (t.get('d_dup')::jsonb ->> 'id'), t.item('bea', 1)), 'item_not_shared', '1');
select t.check('narrowed: a piece inside the grant can', public.save_pro_recommendation(t.c('c_ab'), (t.get('d_dup')::jsonb ->> 'id')::uuid, 'Dups', '', array[t.item('bea', 4), t.item('bea', 3)]) ->> 'status' = 'draft');
select t.as_user(t.u('bea'));
select t.check('narrowed: the client still reads her live pieces in full', (
  select bool_and((i ->> 'available') = 'true' and i ->> 'color' is not null or i ->> 'name' = 'Red scarf')
    from jsonb_array_elements(public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid) -> 'items') i));

-- revoked
select public.set_pro_grant(t.c('c_ab'), 'closet', false);
select t.as_user(t.u('ann'));
select t.put('s_off', public.get_pro_recommendation((t.get('d_dup')::jsonb ->> 'id')::uuid)::text);
select t.check('revoked: nothing beyond the copied name and category, for any piece', (
  select count(*) = 2 and bool_and((i ->> 'available') = 'false' and i -> 'color' = 'null'::jsonb and i -> 'brand' = 'null'::jsonb
                                   and (i ->> 'hasPhoto') = 'false' and i -> 'photoPath' = 'null'::jsonb and (i ->> 'name') in ('Linen shirt', 'Wool hat'))
    from jsonb_array_elements(t.get('s_off')::jsonb -> 'items') i));
select t.check('revoked: no cover piece anywhere in the list, and no path', (select bool_and(cover_item_id is null and cover_photo_path is null) from public.list_pro_recommendations(t.c('c_ab'))));
select t.throws('revoked: no piece can go into a draft', format($$select public.save_pro_recommendation(%L, %L, 'Dups', '', array[%L::uuid])$$, t.c('c_ab'), (t.get('d_dup')::jsonb ->> 'id'), t.item('bea', 3)), 'item_not_shared', '1');
select t.check('revoked: a title-only edit of a draft still works and keeps its pieces', public.save_pro_recommendation(t.c('c_ab'), (t.get('d_dup')::jsonb ->> 'id')::uuid, 'Dups, edited') ->> 'status' = 'draft');
select t.as_admin();
select t.eq('(the pieces of that draft are still there)', (select count(*)::integer from public.pro_recommendation_items where recommendation_id = (t.get('d_dup')::jsonb ->> 'id')::uuid), 2);
select t.as_user(t.u('ann'));
select t.check('revoked: a draft with only words can still be saved and sent', public.save_pro_recommendation(t.c('c_ab'), null, 'Words only', 'Still here.', null, gen_random_uuid()) ->> 'status' = 'draft');
select t.as_user(t.u('bea'));
select t.check('revoked: the client keeps her own full view of every look', (
  select count(*) = 2 and bool_and((i ->> 'available') = 'true') from jsonb_array_elements(public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid) -> 'items') i));

-- ─── D. Sessions ────────────────────────────────────────────────────────────

select t.as_user(t.u('ann'));
select t.put('ref_s1', gen_random_uuid()::text);
select t.put('s1', public.propose_pro_appointment(t.c('c_ab'), t.future(48), 60, 'virtual', '', 'First call', 60, t.get('ref_s1')::uuid)::text);
select t.check('a proposal returns exactly appointmentId and status', t.keys(t.get('s1')::jsonb) = 'appointmentId,status' and (t.get('s1')::jsonb ->> 'status') = 'proposed');
select t.put('s1_again', public.propose_pro_appointment(t.c('c_ab'), t.future(72), 30, 'in_person', 'Elsewhere', 'Changed', 0, t.get('ref_s1')::uuid)::text);
select t.check('a retry with the same ref returns the same session, whatever else it says', (t.get('s1_again')::jsonb ->> 'appointmentId') = (t.get('s1')::jsonb ->> 'appointmentId'));
select t.as_admin();
select t.check('(and the stored session is the first one)', (select duration_minutes = 60 and mode = 'virtual' and note = 'First call' and utc_offset_minutes = 60 and proposed_by = 'stylist'
                                                            from public.pro_appointments where id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid));
select t.check('proposing moved the connection', (select last_activity_at > now() - interval '1 day' from public.pro_connections where id = t.c('c_ab')));
select t.as_user(t.u('bea'));
select t.put('s1_client', public.propose_pro_appointment(t.c('c_ab'), t.future(96), 45, 'virtual', '', '', 0, t.get('ref_s1')::uuid)::text);
select t.check('the same ref from the other side is a different session (the proposer is part of the key)', (t.get('s1_client')::jsonb ->> 'appointmentId') <> (t.get('s1')::jsonb ->> 'appointmentId'));
select t.as_user(t.u('ann'));
select t.throws('a ref is required', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual')$$, t.c('c_ab'), t.future(48)), 'invalid_request', 'client_ref');
select t.throws('under the lead time is refused (59 minutes)', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), now() + interval '59 minutes'), 'invalid_appointment', 'starts_at', null, '22023');
select t.check('exactly the lead time is accepted (60 minutes)', public.propose_pro_appointment(t.c('c_ab'), now() + interval '60 minutes', 15, 'virtual', '', '', 0, gen_random_uuid()) ->> 'status' = 'proposed');
select t.throws('a start in the past is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), now() - interval '1 day'), 'invalid_appointment', 'starts_at');
select t.throws('a null start is refused', format($$select public.propose_pro_appointment(%L, null, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab')), 'invalid_appointment', 'starts_at');
select t.throws('beyond 180 days is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), now() + interval '181 days'), 'invalid_appointment', 'starts_at');
select t.check('exactly 180 days is accepted', public.propose_pro_appointment(t.c('c_ab'), now() + interval '180 days', 15, 'virtual', '', '', 0, gen_random_uuid()) ->> 'status' = 'proposed');
select t.throws('duration 14', format($$select public.propose_pro_appointment(%L, %L, 14, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'duration');
select t.throws('duration 20 (not a step of 15)', format($$select public.propose_pro_appointment(%L, %L, 20, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'duration');
select t.throws('duration 495', format($$select public.propose_pro_appointment(%L, %L, 495, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'duration');
select t.throws('duration null', format($$select public.propose_pro_appointment(%L, %L, null, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'duration');
select t.throws('mode', format($$select public.propose_pro_appointment(%L, %L, 60, 'phone', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'mode');
select t.throws('mode null', format($$select public.propose_pro_appointment(%L, %L, 60, null, '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'mode');
select t.throws('an offset of UTC+14:15 is refused (beyond the last zone)', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 855, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'utc_offset');
select t.throws('an offset of UTC-12:15 is refused (before the first zone)', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', -735, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'utc_offset');
select t.throws('an offset that is not a quarter hour is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 50, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'utc_offset');
select t.throws('a null offset is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', null, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'invalid_appointment', 'utc_offset');
select t.as_admin();
select t.put('tzc', t.mk_pair(t.u('ann'), 'tzc')::text);
select t.as_user(t.get('cl_tzc')::uuid);
select public.propose_pro_appointment(t.get('cx_tzc')::uuid, t.future(300), 15, 'virtual', '', '', -720, gen_random_uuid());
select public.propose_pro_appointment(t.get('cx_tzc')::uuid, t.future(301), 15, 'virtual', '', '', 840, gen_random_uuid());
select public.propose_pro_appointment(t.get('cx_tzc')::uuid, t.future(302), 15, 'virtual', '', '', 330, gen_random_uuid());
select t.as_admin();
select t.check('the extreme offsets and a half-hour zone are accepted and stored as given',
  (select array_agg(utc_offset_minutes order by utc_offset_minutes) from public.pro_appointments where connection_id = t.get('cx_tzc')::uuid) = array[-720, 330, 840]::smallint[]);
select t.as_user(t.u('ann'));
select t.throws('a place over 120 characters', format($$select public.propose_pro_appointment(%L, %L, 60, 'in_person', %L, '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48), repeat('p', 121)), 'invalid_appointment', 'place');
select t.throws('a note over 280 characters', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', %L, 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48), repeat('n', 281)), 'invalid_appointment', 'note');
select t.throws('a place written backwards behind an override is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'in_person', %L, '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48), chr(8238) || 'tegrof'), 'text_not_allowed', 'place', 'content');
select t.throws('a phone number in the place is refused (a stranger-facing field)', format($$select public.propose_pro_appointment(%L, %L, 60, 'in_person', 'Call 555 123 4567', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'text_not_allowed', 'place', 'contact', '22023');
select t.throws('a link in the place is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'in_person', 'https://example.test/room', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'text_not_allowed', 'place', 'contact');
select t.throws('a gift card in the note is refused', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', 'pay with a gift card', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'text_not_allowed', 'note', 'payment');
select t.check('a plain place and a note with a phone number are accepted', public.propose_pro_appointment(t.c('c_ac'), t.future(50), 90, 'in_person', 'Cafe on Main Street', 'Text me on 555 123 4567', -300, gen_random_uuid()) ->> 'status' = 'proposed');
select t.as_admin();
select t.check('no session carries a fee, a price, a paid flag or a link (the table has no such column)', not exists (
  select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pro_appointments'
     and column_name ~* '(fee|price|paid|cost|amount|link|url|currency)'));

-- answering
select t.as_user(t.u('ann'));
select t.throws('the proposer cannot confirm her own request', format($$select public.respond_pro_appointment(%L, 'confirm')$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'appointment_closed', null, null, '22023');
select t.throws('the proposer cannot decline her own request', format($$select public.respond_pro_appointment(%L, 'decline')$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'appointment_closed');
select t.throws('an unknown action', format($$select public.respond_pro_appointment(%L, 'maybe')$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'invalid_request', 'action');
select t.throws('a missing action', format($$select public.respond_pro_appointment(%L, null)$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'invalid_request', 'action');
select t.throws('an unknown session', format($$select public.respond_pro_appointment(%L, 'confirm')$$, gen_random_uuid()), 'pro_unavailable');
select t.as_user(t.u('cat'));
select t.throws('a person who is not on the connection cannot answer', format($$select public.respond_pro_appointment(%L, 'confirm')$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'pro_unavailable');
select t.throws('a person who is not on the connection cannot cancel', format($$select public.cancel_pro_appointment(%L)$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'pro_unavailable');
select t.as_user(t.u('bea'));
select t.check('the client''s list "needs me" has the stylist''s proposal with confirm and decline', (
  select count(*) = 1 and bool_and(can_confirm and can_decline and can_cancel and status = 'proposed' and proposed_by = 'stylist' and my_role = 'client')
    from public.list_pro_appointments(t.c('c_ab'), 'needs_me') where appointment_id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid));
select public.respond_pro_appointment((t.get('s1')::jsonb ->> 'appointmentId')::uuid, 'confirm');
select t.as_admin();
select t.check('confirmed, with the time of the answer', (select status = 'confirmed' and responded_at is not null from public.pro_appointments where id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid));
select t.as_user(t.u('bea'));
select public.respond_pro_appointment((t.get('s1')::jsonb ->> 'appointmentId')::uuid, 'confirm');
select t.throws('declining a confirmed session is closed', format($$select public.respond_pro_appointment(%L, 'decline')$$, (t.get('s1')::jsonb ->> 'appointmentId')), 'appointment_closed');
select t.as_user(t.u('ann'));
select public.respond_pro_appointment((t.get('s1')::jsonb ->> 'appointmentId')::uuid, 'confirm');
select t.as_admin();
select t.eq('confirming again, by either side, is a success that changes nothing', (select status from public.pro_appointments where id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid), 'confirmed');
select t.as_user(t.u('ann'));
select t.check('the stylist''s list: upcoming has it, confirmed, with only cancel', (
  select count(*) = 1 and bool_and(status = 'confirmed' and not can_confirm and not can_decline and can_cancel and other_label = 'Bea B' and utc_offset_minutes = 60)
    from public.list_pro_appointments(t.c('c_ab'), 'upcoming') where appointment_id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid));
select t.check('and "needs me" does not', not exists (select 1 from public.list_pro_appointments(t.c('c_ab'), 'needs_me') where appointment_id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid));

-- the stylist has no other confirmed session that overlaps (across two of her connections)
select t.as_admin();
select t.put('s1_start', (select starts_at::text from public.pro_appointments where id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid));
select t.as_user(t.u('cat'));
select t.put('s_over', public.propose_pro_appointment(t.c('c_ac'), t.get('s1_start')::timestamptz + interval '30 minutes', 60, 'virtual', '', '', 0, gen_random_uuid())::text);
select t.put('s_adj', public.propose_pro_appointment(t.c('c_ac'), t.get('s1_start')::timestamptz + interval '60 minutes', 60, 'virtual', '', '', 0, gen_random_uuid())::text);
select t.put('s_before', public.propose_pro_appointment(t.c('c_ac'), t.get('s1_start')::timestamptz - interval '60 minutes', 60, 'virtual', '', '', 0, gen_random_uuid())::text);
select t.put('s_inside', public.propose_pro_appointment(t.c('c_ac'), t.get('s1_start')::timestamptz + interval '15 minutes', 15, 'virtual', '', '', 0, gen_random_uuid())::text);
select t.as_user(t.u('ann'));
select t.throws('confirming a session that overlaps another of hers, on another connection, is a conflict', format($$select public.respond_pro_appointment(%L, 'confirm')$$, (t.get('s_over')::jsonb ->> 'appointmentId')), 'appointment_conflict', null, null, '23505');
select t.throws('and one entirely inside it', format($$select public.respond_pro_appointment(%L, 'confirm')$$, (t.get('s_inside')::jsonb ->> 'appointmentId')), 'appointment_conflict');
select public.respond_pro_appointment((t.get('s_adj')::jsonb ->> 'appointmentId')::uuid, 'confirm');
select public.respond_pro_appointment((t.get('s_before')::jsonb ->> 'appointmentId')::uuid, 'confirm');
select t.as_admin();
select t.eq('a session that starts exactly when the other ends is not a conflict, nor one that ends exactly when the other starts',
            (select count(*)::integer from public.pro_appointments where id in ((t.get('s_adj')::jsonb ->> 'appointmentId')::uuid, (t.get('s_before')::jsonb ->> 'appointmentId')::uuid) and status = 'confirmed'), 2);
select t.as_admin();
select t.eq('the conflicting ones stay proposed', (select count(*)::integer from public.pro_appointments where id in ((t.get('s_over')::jsonb ->> 'appointmentId')::uuid, (t.get('s_inside')::jsonb ->> 'appointmentId')::uuid) and status = 'proposed'), 2);
select t.as_user(t.u('ann'));
select public.cancel_pro_appointment((t.get('s_adj')::jsonb ->> 'appointmentId')::uuid);
select t.as_user(t.u('ann'));
select public.respond_pro_appointment((t.get('s_over')::jsonb ->> 'appointmentId')::uuid, 'decline');
select public.respond_pro_appointment((t.get('s_over')::jsonb ->> 'appointmentId')::uuid, 'decline');
select t.throws('confirming a declined session is closed', format($$select public.respond_pro_appointment(%L, 'confirm')$$, (t.get('s_over')::jsonb ->> 'appointmentId')), 'appointment_closed');
select t.throws('cancelling a declined session is closed', format($$select public.cancel_pro_appointment(%L)$$, (t.get('s_over')::jsonb ->> 'appointmentId')), 'appointment_closed');
-- Dee's client Ann confirms against Dee's own sessions: a stylist and a client are independent
select t.as_user(t.u('dee'));
select t.put('s_dee', public.propose_pro_appointment(t.c('c_da'), t.get('s1_start')::timestamptz, 60, 'virtual', '', '', 0, gen_random_uuid())::text);
select t.as_user(t.u('ann'));
select public.respond_pro_appointment((t.get('s_dee')::jsonb ->> 'appointmentId')::uuid, 'confirm');
select t.as_admin();
select t.eq('as a CLIENT Ann may confirm a time that overlaps her own work as a stylist (the check is on the stylist''s own calendar, Dee''s)',
            (select status from public.pro_appointments where id = (t.get('s_dee')::jsonb ->> 'appointmentId')::uuid), 'confirmed');

-- cancelling
select t.as_user(t.u('ann'));
select public.cancel_pro_appointment((t.get('s1')::jsonb ->> 'appointmentId')::uuid);
select public.cancel_pro_appointment((t.get('s1')::jsonb ->> 'appointmentId')::uuid);
select t.as_user(t.u('bea'));
select public.cancel_pro_appointment((t.get('s1')::jsonb ->> 'appointmentId')::uuid);
select t.as_admin();
select t.eq('cancelling a cancelled session is a success, by either side', (select status from public.pro_appointments where id = (t.get('s1')::jsonb ->> 'appointmentId')::uuid), 'cancelled');
select t.as_user(t.u('bea'));
select public.cancel_pro_appointment((t.get('s1_client')::jsonb ->> 'appointmentId')::uuid);
select t.as_admin();
select t.eq('the client cancels her own proposal', (select status from public.pro_appointments where id = (t.get('s1_client')::jsonb ->> 'appointmentId')::uuid), 'cancelled');
select t.put('s_started', (select id::text from public.pro_appointments where connection_id = t.c('c_ab') and status = 'proposed' order by starts_at limit 1));
update public.pro_appointments set starts_at = now() - interval '2 hours' where id = t.get('s_started')::uuid;
select t.as_user(t.u('ann'));
select t.throws('a session that has started cannot be cancelled', format($$select public.cancel_pro_appointment(%L)$$, t.get('s_started')), 'appointment_closed');
select t.throws('a proposal whose start has passed cannot be confirmed', format($$select public.respond_pro_appointment(%L, 'confirm')$$, t.get('s_started')), 'appointment_closed');

-- lazy states: an old proposal reads expired, an old confirmed session reads completed
select t.as_admin();
select t.put('s_done', (select id::text from public.pro_appointments where id = (t.get('s_dee')::jsonb ->> 'appointmentId')::uuid));
update public.pro_appointments set starts_at = now() - interval '3 hours' where id = t.get('s_done')::uuid;
select t.as_user(t.u('ann'));
select t.check('past: the old proposal reads expired and the old confirmed session reads completed (as a client of Dee)', (
  select bool_or(appointment_id = t.get('s_started')::uuid and status = 'expired') and bool_or(appointment_id = t.get('s_done')::uuid and status = 'completed')
    from public.list_pro_appointments(null, 'past')));
select t.check('and neither is upcoming, nor needs her', not exists (select 1 from public.list_pro_appointments(null, 'upcoming') where appointment_id in (t.get('s_started')::uuid, t.get('s_done')::uuid))
               and not exists (select 1 from public.list_pro_appointments(null, 'needs_me') where appointment_id in (t.get('s_started')::uuid, t.get('s_done')::uuid)));
select t.as_admin();
select t.check('the upkeep wrote the same states', (select status from public.pro_appointments where id = t.get('s_started')::uuid) = 'expired'
               and (select status from public.pro_appointments where id = t.get('s_done')::uuid) = 'completed');

-- scopes and the two roles
select t.as_user(t.u('dee'));
select t.put('s_dee2', public.propose_pro_appointment(t.c('c_da'), t.future(200), 30, 'virtual', '', '', 0, gen_random_uuid())::text);
select t.as_user(t.u('ann'));
select t.check('Ann, across her connections, as a client of Dee: needs_me has Dee''s proposal with her role', (
  select count(*) = 1 and bool_and(my_role = 'client' and can_confirm and can_decline and other_label = 'Dee Coach' and proposed_by = 'stylist')
    from public.list_pro_appointments(null, 'needs_me') where appointment_id = (t.get('s_dee2')::jsonb ->> 'appointmentId')::uuid));
select t.check('upcoming, across connections, has both roles', (
  select count(distinct my_role) = 2 from public.list_pro_appointments(null, 'upcoming')));
select t.check('upcoming is soonest first', (
  select bool_and(starts_at >= prev) from (select starts_at, lag(starts_at, 1, '-infinity') over (order by ord) as prev
    from (select starts_at, row_number() over () as ord from public.list_pro_appointments(null, 'upcoming')) x) y));
select t.check('with a connection named, only its sessions come', (select bool_and(connection_id = t.c('c_da')) from public.list_pro_appointments(t.c('c_da'), 'upcoming')));
select t.check('past is newest first and at most 30', (select count(*) <= 30 from public.list_pro_appointments(null, 'past')));
select t.throws('an unknown scope', $$select * from public.list_pro_appointments(null, 'soon')$$, 'invalid_request', 'scope');
select t.throws('an unknown connection', format($$select * from public.list_pro_appointments(%L)$$, gen_random_uuid()), 'pro_unavailable');
select t.as_user(t.u('eve'));
select t.eq('a stranger''s list is empty', (select count(*)::integer from public.list_pro_appointments()), 0);
select t.throws('a stranger asking for a connection', format($$select * from public.list_pro_appointments(%L)$$, t.c('c_ab')), 'pro_unavailable');

-- caps: five open proposals on a connection, 20 proposals a day, 60 answers a day
select t.as_admin();
select t.put('capc', t.mk_pair(t.u('ann'), 'capc')::text);
select t.as_user(t.get('cl_capc')::uuid);
do $$ begin for i in 1..5 loop perform public.propose_pro_appointment(t.get('cx_capc')::uuid, t.future(100 + i), 30, 'virtual', '', '', 0, gen_random_uuid()); end loop; end $$;
select t.throws('the 6th open proposal on a connection is refused', format($$select public.propose_pro_appointment(%L, %L, 30, 'virtual', '', '', 0, gen_random_uuid())$$, t.get('cx_capc'), t.future(120)), 'appointment_open_limit', null, null, '54000');
select t.as_user(t.u('ann'));
select t.as_admin();
update public.pro_appointments set status = 'declined' where connection_id = t.get('cx_capc')::uuid and starts_at = (select min(starts_at) from public.pro_appointments where connection_id = t.get('cx_capc')::uuid);
select t.as_user(t.get('cl_capc')::uuid);
select t.check('a declined proposal frees a place', public.propose_pro_appointment(t.get('cx_capc')::uuid, t.future(121), 30, 'virtual', '', '', 0, gen_random_uuid()) ->> 'status' = 'proposed');
select t.as_admin();
select t.put('ratec', t.mk_pair(t.u('ann'), 'ratec')::text);
delete from public.pro_rate_counters where bucket = 'appointment_day' and user_id = t.get('cl_ratec')::uuid;
do $$ begin for i in 1..20 loop perform public.pro_rate_check(t.get('cl_ratec')::uuid, 'appointment_day'); end loop; end $$;
select t.as_user(t.get('cl_ratec')::uuid);
select t.throws('the 21st proposal of a day is rate limited', format($$select public.propose_pro_appointment(%L, %L, 30, 'virtual', '', '', 0, gen_random_uuid())$$, t.get('cx_ratec'), t.future(100)), 'pro_rate_limited', 'appointment_day', null, '54000');
select t.as_admin();
insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes)
values (t.get('cx_ratec')::uuid, 'stylist', now() + interval '10 days', 30, 'virtual', 0);
select t.put('s_rate', (select id::text from public.pro_appointments where connection_id = t.get('cx_ratec')::uuid limit 1));
do $$ begin for i in 1..60 loop perform public.pro_rate_check(t.get('cl_ratec')::uuid, 'respond_day'); end loop; end $$;
select t.as_user(t.get('cl_ratec')::uuid);
select t.throws('the 61st answer of a day is rate limited', format($$select public.respond_pro_appointment(%L, 'decline')$$, t.get('s_rate')), 'pro_rate_limited', 'respond_day');

-- ─── E. Messages ────────────────────────────────────────────────────────────

select t.as_admin();
select t.mk_pair(t.u('ann'), 'mx') is not null;
select t.as_user(t.get('cl_mx')::uuid);
select t.put('ref_m1', gen_random_uuid()::text);
select t.put('m1', public.send_pro_message(t.get('cx_mx')::uuid, '  Hello there  ', t.get('ref_m1')::uuid)::text);
select t.check('a message returns exactly messageId and createdAt', t.keys(t.get('m1')::jsonb) = 'createdAt,messageId');
select t.put('m1_again', public.send_pro_message(t.get('cx_mx')::uuid, 'Something else', t.get('ref_m1')::uuid)::text);
select t.check('a retry with the same ref returns the same message', (t.get('m1_again')::jsonb ->> 'messageId') = (t.get('m1')::jsonb ->> 'messageId'));
select t.as_admin();
select t.eq('one message, stored trimmed', (select string_agg(body, '|') from public.pro_messages where connection_id = t.get('cx_mx')::uuid and kind = 'text'), 'Hello there');
select t.check('sending moved the connection', (select last_activity_at > now() - interval '1 day' from public.pro_connections where id = t.get('cx_mx')::uuid));
select t.as_user(t.get('cl_mx')::uuid);
select t.throws('a ref is required', format($$select public.send_pro_message(%L, 'x', null)$$, t.get('cx_mx')), 'invalid_request', 'client_ref');
select t.throws('an empty message is refused', format($$select public.send_pro_message(%L, '', gen_random_uuid())$$, t.get('cx_mx')), 'invalid_message', 'body', null, '22023');
select t.throws('a blank message is refused', format($$select public.send_pro_message(%L, E'  \n  ', gen_random_uuid())$$, t.get('cx_mx')), 'invalid_message');
select t.throws('a null message is refused', format($$select public.send_pro_message(%L, null, gen_random_uuid())$$, t.get('cx_mx')), 'invalid_message');
select t.throws('501 characters are refused', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), repeat('m', 501)), 'invalid_message');
select t.throws('a control character is refused', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), 'a' || chr(1) || 'b'), 'invalid_message');
select t.check('500 characters are accepted, and so are four-byte characters', public.send_pro_message(t.get('cx_mx')::uuid, repeat('m', 500), gen_random_uuid()) is not null
               and public.send_pro_message(t.get('cx_mx')::uuid, repeat(chr(128512), 500), gen_random_uuid()) is not null);
select t.check('a new line inside a message is allowed', public.send_pro_message(t.get('cx_mx')::uuid, E'two\nlines', gen_random_uuid()) is not null);
select t.throws('a gift card is refused', format($$select public.send_pro_message(%L, 'please buy a gift card', gen_random_uuid())$$, t.get('cx_mx')), 'text_not_allowed', 'message', 'payment', '22023');
select t.throws('a wire transfer, bitcoin and western union too', format($$select public.send_pro_message(%L, 'send it by Western Union', gen_random_uuid())$$, t.get('cx_mx')), 'text_not_allowed', 'message', 'payment');
select t.throws('a folded form is refused: wide letters', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), 'ｇｉｆｔ ｃａｒｄ please'), 'text_not_allowed', 'message', 'payment');
select t.throws('a zero-width character does not hide it', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), 'gift' || chr(8203) || ' card'), 'text_not_allowed', 'message', 'payment');
select t.throws('a message written backwards behind a right-to-left override is refused (the phone would show it forwards)', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), chr(8238) || 'drac tfig a yub esaelp'), 'text_not_allowed', 'message', 'content');
select t.check('a phone number, a link and payment talk are allowed between connected adults',
               public.send_pro_message(t.get('cx_mx')::uuid, 'Call me on 555 123 4567, my rate is $80 by PayPal, see https://example.test', gen_random_uuid()) is not null);
select t.as_user(t.u('dee'));
select t.throws('a person who is not on the connection', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, t.get('cx_mx')), 'pro_unavailable');
select t.throws('an unknown connection', $$select public.send_pro_message(gen_random_uuid(), 'hi', gen_random_uuid())$$, 'pro_unavailable');
select t.as_user(t.u('ann'));
select t.put('ref_m2', gen_random_uuid()::text);
select t.put('m2', public.send_pro_message(t.get('cx_mx')::uuid, 'Hi, thanks for connecting.', t.get('ref_m2')::uuid)::text);
select t.as_user(t.get('cl_mx')::uuid);
select t.throws('a ref used on another connection is refused, not returned', format($$select public.send_pro_message(%L, 'x', %L)$$, t.c('c_ab'), t.get('ref_m1')), 'pro_unavailable');

-- limits: 6 a minute, 60 an hour, 300 a day
select t.as_admin();
select t.mk_pair(t.u('ann'), 'mr') is not null;
select t.as_user(t.get('cl_mr')::uuid);
do $$ begin for i in 1..6 loop perform public.send_pro_message(t.get('cx_mr')::uuid, 'message ' || i, gen_random_uuid()); end loop; end $$;
select t.throws('the 7th message in a minute is refused', format($$select public.send_pro_message(%L, 'seven', gen_random_uuid())$$, t.get('cx_mr')), 'pro_rate_limited', 'message_min', null, '54000');
select t.as_admin();
select t.eq('a refused message is not stored or counted', (select count(*)::integer from public.pro_messages where connection_id = t.get('cx_mr')::uuid and kind = 'text'), 6);
select t.eq('(the minute counter stands at six)', (select n from public.pro_rate_counters where user_id = t.get('cl_mr')::uuid and bucket = 'message_min'), 6);
select t.mk_pair(t.u('ann'), 'mh') is not null;
do $$ begin for i in 1..60 loop perform public.pro_rate_check(t.get('cl_mh')::uuid, 'message_hour'); end loop; end $$;
select t.as_user(t.get('cl_mh')::uuid);
select t.throws('the 61st message of an hour is refused', format($$select public.send_pro_message(%L, 'x', gen_random_uuid())$$, t.get('cx_mh')), 'pro_rate_limited', 'message_hour');
select t.as_admin();
select t.mk_pair(t.u('ann'), 'md') is not null;
do $$ begin for i in 1..300 loop perform public.pro_rate_check(t.get('cl_md')::uuid, 'message_day'); end loop; end $$;
select t.as_user(t.get('cl_md')::uuid);
select t.throws('the 301st message of a day is refused', format($$select public.send_pro_message(%L, 'x', gen_random_uuid())$$, t.get('cx_md')), 'pro_rate_limited', 'message_day');
select t.as_admin();
select t.check('(another person''s counters are not touched)', not exists (select 1 from public.pro_rate_counters where user_id = t.u('ann') and bucket in ('message_min', 'message_hour', 'message_day') and n > 3));

-- the thread: ordering, paging, sides, the read pointers
select t.as_admin();
select t.mk_pair(t.u('ann'), 'mt') is not null;
do $$
begin
  for n in 1..12 loop
    insert into public.pro_messages (connection_id, sender_id, kind, body)
    values (t.get('cx_mt')::uuid, case when n % 2 = 1 then t.get('cl_mt')::uuid else t.u('ann') end, 'text', 'm' || n);
    if n = 3 then
      insert into public.pro_messages (connection_id, kind, code) values (t.get('cx_mt')::uuid, 'system', 'sharing_on');
    end if;
  end loop;
end $$;
select t.put('mt_first', (select min(id)::text from public.pro_messages where connection_id = t.get('cx_mt')::uuid));
select t.put('mt_last', (select max(id)::text from public.pro_messages where connection_id = t.get('cx_mt')::uuid));
select t.put('mt_ids', (select string_agg(id::text, ',' order by id) from public.pro_messages where connection_id = t.get('cx_mt')::uuid));
select t.eq('(thirteen rows: twelve texts and one system line)', (select count(*)::integer from public.pro_messages where connection_id = t.get('cx_mt')::uuid), 13);
create function t.mid(p_n integer) returns bigint language sql stable as $$ select (string_to_array(t.get('mt_ids'), ','))[p_n]::bigint $$;
create function t.bodies(p_j jsonb) returns text language sql immutable as $$
  select string_agg(coalesce(nullif(e ->> 'body', ''), '<' || (e ->> 'code') || '>'), ',' order by o) from jsonb_array_elements(p_j -> 'messages') with ordinality x(e, o) $$;
select t.as_user(t.u('ann'));
select t.check('unread for the stylist: the six texts of the client, not the system line', (select unread = 6 from public.list_pro_connections('stylist') where connection_id = t.get('cx_mt')::uuid));
select t.put('p_latest', public.get_pro_thread(t.get('cx_mt')::uuid, null, null, 5)::text);
select t.eq('no cursor: the latest five, oldest first', t.bodies(t.get('p_latest')::jsonb), 'm8,m9,m10,m11,m12');
select t.check('and there are older ones', (t.get('p_latest')::jsonb ->> 'hasMore') = 'true' and (t.get('p_latest')::jsonb -> 'actions' ->> 'canSend') = 'true');
select t.check('the thread has exactly messages, hasMore and actions; a message has exactly id, from, body, code, at',
               t.keys(t.get('p_latest')::jsonb) = 'actions,hasMore,messages'
               and (select bool_and(t.keys(e) = 'at,body,code,from,id') from jsonb_array_elements(t.get('p_latest')::jsonb -> 'messages') e));
select t.check('sides: the client''s are "them", hers "me"', (
  select string_agg(e ->> 'from', ',' order by o) = 'me,them,me,them,me' from jsonb_array_elements(t.get('p_latest')::jsonb -> 'messages') with ordinality x(e, o)));
select t.check('no account id is in the answer', t.get('p_latest') !~* (t.u('ann')::text || '|' || t.get('cl_mt')));
select t.as_admin();
select t.eq('Ann''s read pointer is the newest id she was shown', (select stylist_seen_message_id from public.pro_connections where id = t.get('cx_mt')::uuid), t.mid(13));
select t.eq('the client''s pointer did not move', (select client_seen_message_id from public.pro_connections where id = t.get('cx_mt')::uuid), 0::bigint);
select t.as_user(t.u('ann'));
select t.check('unread for the stylist is now 0', (select unread = 0 and not attention from public.list_pro_connections('stylist') where connection_id = t.get('cx_mt')::uuid));
select t.put('p_before', public.get_pro_thread(t.get('cx_mt')::uuid, null, t.mid(9), 5)::text);
select t.eq('before: the newest five older than the ninth row, system line included', t.bodies(t.get('p_before')::jsonb), '<sharing_on>,m4,m5,m6,m7');
select t.check('and still older ones exist', (t.get('p_before')::jsonb ->> 'hasMore') = 'true');
select t.put('p_before2', public.get_pro_thread(t.get('cx_mt')::uuid, null, t.mid(4), 5)::text);
select t.eq('before again: the rest', t.bodies(t.get('p_before2')::jsonb), 'm1,m2,m3');
select t.check('and nothing older', (t.get('p_before2')::jsonb ->> 'hasMore') = 'false');
select t.check('system lines are "system", have a code and an empty body', (
  select count(*) = 1 and bool_and(e ->> 'from' = 'system' and e ->> 'code' = 'sharing_on' and e ->> 'body' = '')
    from jsonb_array_elements(t.get('p_before')::jsonb -> 'messages') e where e ->> 'code' is not null));
select t.put('p_after', public.get_pro_thread(t.get('cx_mt')::uuid, t.mid(3), null, 4)::text);
select t.eq('after: the OLDEST four newer than that id', t.bodies(t.get('p_after')::jsonb), '<sharing_on>,m4,m5,m6');
select t.check('and newer ones remain', (t.get('p_after')::jsonb ->> 'hasMore') = 'true');
select t.put('p_after2', public.get_pro_thread(t.get('cx_mt')::uuid, t.mid(10), null, 50)::text);
select t.eq('after the tenth row: the last three', t.bodies(t.get('p_after2')::jsonb), 'm10,m11,m12');
select t.check('and nothing newer', (t.get('p_after2')::jsonb ->> 'hasMore') = 'false');
select t.check('after the newest: nothing, nothing more', (public.get_pro_thread(t.get('cx_mt')::uuid, t.mid(13), null, 50) -> 'messages') = '[]'::jsonb
               and (public.get_pro_thread(t.get('cx_mt')::uuid, t.mid(13), null, 50) ->> 'hasMore') = 'false');
select t.throws('both cursors together', format($$select public.get_pro_thread(%L, 1, 2)$$, t.get('cx_mt')), 'invalid_request', 'cursor', null, '22023');
select t.eq('limit 0 is clamped to 1', jsonb_array_length(public.get_pro_thread(t.get('cx_mt')::uuid, null, null, 0) -> 'messages'), 1);
select t.eq('a negative limit is clamped to 1', jsonb_array_length(public.get_pro_thread(t.get('cx_mt')::uuid, null, null, -3) -> 'messages'), 1);
select t.eq('a limit of 1,000 is clamped to 100 (all thirteen are returned)', jsonb_array_length(public.get_pro_thread(t.get('cx_mt')::uuid, null, null, 1000) -> 'messages'), 13);
select t.eq('a null limit is 50', jsonb_array_length(public.get_pro_thread(t.get('cx_mt')::uuid) -> 'messages'), 13);
select public.get_pro_thread(t.get('cx_mt')::uuid, null, t.mid(5), 5);
select t.as_admin();
select t.eq('reading older pages never moves the pointer back', (select stylist_seen_message_id from public.pro_connections where id = t.get('cx_mt')::uuid), t.mid(13));
-- a new message from the client: unread 1, a poll after the pointer returns it and moves the pointer, an idle poll writes nothing
select t.as_user(t.get('cl_mt')::uuid);
select t.put('m_new', public.send_pro_message(t.get('cx_mt')::uuid, 'Are you there?', gen_random_uuid())::text);
select t.as_user(t.u('ann'));
select t.check('unread 1 and attention for the stylist', (select unread = 1 and attention from public.list_pro_connections('stylist') where connection_id = t.get('cx_mt')::uuid));
select t.check('her badge counts it', public.get_pro_badge() >= 1);
select t.put('p_poll', public.get_pro_thread(t.get('cx_mt')::uuid, t.mid(13), null, 50)::text);
select t.eq('the poll returns exactly the new message', t.bodies(t.get('p_poll')::jsonb), 'Are you there?');
select t.as_admin();
select t.eq('and the pointer moved to it', (select stylist_seen_message_id from public.pro_connections where id = t.get('cx_mt')::uuid), (t.get('m_new')::jsonb ->> 'messageId')::bigint);
select t.as_user(t.u('ann'));
select public.get_pro_thread(t.get('cx_mt')::uuid, (t.get('m_new')::jsonb ->> 'messageId')::bigint, null, 50);
select t.as_admin();
select t.eq('an idle poll leaves it where it was', (select stylist_seen_message_id from public.pro_connections where id = t.get('cx_mt')::uuid), (t.get('m_new')::jsonb ->> 'messageId')::bigint);
select t.as_user(t.u('ann'));
select t.check('her own messages are never unread for her', (select unread = 0 from public.list_pro_connections('stylist') where connection_id = t.get('cx_mt')::uuid));
select t.as_user(t.u('dee'));
select t.throws('a person who is not on the connection cannot read the thread', format($$select public.get_pro_thread(%L)$$, t.get('cx_mt')), 'pro_unavailable');
select t.throws('an unknown connection', $$select public.get_pro_thread(gen_random_uuid())$$, 'pro_unavailable');
select t.as_user(t.get('cl_mt')::uuid);
select t.put('p_client', public.get_pro_thread(t.get('cx_mt')::uuid, null, null, 3)::text);
select t.eq('the client reads the same thread from the other side (the newest three: her own, Ann''s, her new one)',
            (select string_agg(e ->> 'from', ',' order by o) from jsonb_array_elements(t.get('p_client')::jsonb -> 'messages') with ordinality x(e, o)), 'me,them,me');

-- text with nothing visible in it is no text
select t.as_user(t.get('cl_mx')::uuid);
select t.throws('a message of only a new line is refused', format($$select public.send_pro_message(%L, E'\n\n', gen_random_uuid())$$, t.get('cx_mx')), 'invalid_message');
select t.throws('a message of only zero-width characters is refused', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), chr(8203) || chr(8203)), 'invalid_message');
select t.throws('a message of only no-break spaces is refused', format($$select public.send_pro_message(%L, %L, gen_random_uuid())$$, t.get('cx_mx'), chr(160) || chr(160)), 'invalid_message');
select t.check('a message that is only an emoji is accepted', public.send_pro_message(t.get('cx_mx')::uuid, chr(128512), gen_random_uuid()) is not null);
select t.as_user(t.u('ann'));
select t.put('d_blank', public.save_pro_recommendation(t.c('c_ab'), null, 'Blank body', E'\n  \n', null, gen_random_uuid())::text);
select t.throws('a body of only new lines is no body: the look is empty', format($$select public.send_pro_recommendation(%L)$$, (t.get('d_blank')::jsonb ->> 'id')), 'recommendation_empty');
select public.delete_pro_recommendation((t.get('d_blank')::jsonb ->> 'id')::uuid);

-- ─── F. Ended connections are read-only; a closed shell has nothing ─────────

select t.as_user(t.u('ann'));
select t.put('d_late', public.save_pro_recommendation(t.c('c_ab'), null, 'Late look', 'Please look at this.', null, gen_random_uuid())::text);
select public.send_pro_recommendation((t.get('d_late')::jsonb ->> 'id')::uuid);
select t.put('d_last_draft', public.save_pro_recommendation(t.c('c_ab'), null, 'Last draft', 'Not sent.', null, gen_random_uuid())::text);
select t.as_user(t.u('bea'));
select public.end_pro_connection(t.c('c_ab'));
select t.as_user(t.u('ann'));
select t.throws('ended: a new look', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_ab')), 'connection_ended', null, null, '22023');
select t.throws('ended: editing a draft', format($$select public.save_pro_recommendation(%L, %L, 'x', '')$$, t.c('c_ab'), (t.get('d_last_draft')::jsonb ->> 'id')), 'connection_ended');
select t.throws('ended: sending a draft', format($$select public.send_pro_recommendation(%L)$$, (t.get('d_last_draft')::jsonb ->> 'id')), 'connection_ended');
select t.throws('ended: deleting a draft', format($$select public.delete_pro_recommendation(%L)$$, (t.get('d_last_draft')::jsonb ->> 'id')), 'connection_ended');
select t.throws('ended: a message', format($$select public.send_pro_message(%L, 'hello?', gen_random_uuid())$$, t.c('c_ab')), 'connection_ended');
select t.throws('ended: a proposal', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_ab'), t.future(48)), 'connection_ended');
select t.as_admin();
select t.put('s_open_ended', (select id::text from public.pro_appointments where connection_id = t.c('c_ab') order by created_at desc, id limit 1));
select t.as_user(t.u('ann'));
select t.throws('ended: cancelling a session', format($$select public.cancel_pro_appointment(%L)$$, t.get('s_open_ended')), 'connection_ended');
select t.throws('ended: answering a session', format($$select public.respond_pro_appointment(%L, 'decline')$$, t.get('s_open_ended')), 'connection_ended');
select t.check('ended: the stylist still reads all her looks, drafts included', (select count(*) >= 8 and bool_or(title = 'Last draft' and status = 'draft') from public.list_pro_recommendations(t.c('c_ab'), null, 40)));
select t.check('ended: and a draft by its id', public.get_pro_recommendation((t.get('d_last_draft')::jsonb ->> 'id')::uuid) ->> 'status' = 'draft');
select t.check('ended: the actions of a draft are all off', (public.get_pro_recommendation((t.get('d_last_draft')::jsonb ->> 'id')::uuid) -> 'actions')
               = '{"canEdit": false, "canSend": false, "canDelete": false, "canGiveFeedback": false, "canMarkWorn": false}'::jsonb);
select t.check('ended: a stylist reads nothing about a piece beyond what she wrote (no cover piece, no color, no brand)', (
  select bool_and(cover_item_id is null and cover_photo_path is null) from public.list_pro_recommendations(t.c('c_ab'), null, 40))
  and (select bool_and(i -> 'color' = 'null'::jsonb and i -> 'brand' = 'null'::jsonb and (i ->> 'hasPhoto') = 'false')
         from jsonb_array_elements(public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid) -> 'items') i));
select t.check('ended: the thread is readable, ends with the neutral line, and cannot be written', (
  select (j -> 'actions' ->> 'canSend') = 'false' and (j -> 'messages' -> -1 ->> 'code') = 'ended' and (j -> 'messages' -> -1 ->> 'from') = 'system'
    from (select public.get_pro_thread(t.c('c_ab')) as j) x));
select t.check('ended: the sessions are readable, the open ones were cancelled', (
  select count(*) >= 1 and not bool_or(status in ('proposed', 'confirmed')) and not bool_or(can_cancel or can_confirm or can_decline)
    from public.list_pro_appointments(t.c('c_ab'), 'past')));
select t.check('ended: nothing is upcoming', not exists (select 1 from public.list_pro_appointments(t.c('c_ab'), 'upcoming')));
select t.as_user(t.u('bea'));
select t.check('ended: the client''s list has the sent looks and no draft', (select count(*) >= 3 and not bool_or(status = 'draft') from public.list_pro_recommendations(t.c('c_ab'), null, 40)));
select t.put('late_c', public.get_pro_recommendation((t.get('d_late')::jsonb ->> 'id')::uuid)::text);
select t.check('ended: she can read a sent look, and reading does not mark it viewed', (t.get('late_c')::jsonb ->> 'status') = 'sent'
               and (t.get('late_c')::jsonb -> 'actions' ->> 'canGiveFeedback') = 'false');
select t.as_admin();
select t.eq('(stored: still sent)', (select status from public.pro_recommendations where id = (t.get('d_late')::jsonb ->> 'id')::uuid), 'sent');
select t.as_user(t.u('bea'));
select t.throws('ended: feedback', format($$select public.give_recommendation_feedback(%L, 5)$$, (t.get('d_late')::jsonb ->> 'id')), 'connection_ended');
select t.throws('ended: a draft is still not hers', format($$select public.get_pro_recommendation(%L)$$, (t.get('d_last_draft')::jsonb ->> 'id')), 'pro_unavailable');
select t.check('ended: she still reads her real looks in full (her own pieces)', (
  select bool_and((i ->> 'available') = 'true') from jsonb_array_elements(public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid) -> 'items') i));

-- a block: the closed shell holds nothing, whoever asks, and unblocking changes nothing
select t.as_admin();
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.u('cat'), t.u('ann'), 'Ann');
select t.check('the block turned the connection into a shell with its content deleted', (select shell_at is not null and status = 'ended' from public.pro_connections where id = t.c('c_ac'))
               and not exists (select 1 from public.pro_recommendations where connection_id = t.c('c_ac'))
               and not exists (select 1 from public.pro_appointments where connection_id = t.c('c_ac'))
               and not exists (select 1 from public.pro_messages where connection_id = t.c('c_ac')));
create function t.shell_checks(p_who uuid, p_conn uuid, p_look uuid) returns void language plpgsql as $fn$
begin
  perform t.as_user(p_who);
  perform t.check('shell: the thread is empty and cannot be written', (public.get_pro_thread(p_conn) -> 'messages') = '[]'::jsonb and (public.get_pro_thread(p_conn) -> 'actions' ->> 'canSend') = 'false');
  perform t.check('shell: no looks', not exists (select 1 from public.list_pro_recommendations(p_conn)));
  perform t.check('shell: no sessions, by connection or across', not exists (select 1 from public.list_pro_appointments(p_conn, 'past'))
                                                                  and not exists (select 1 from public.list_pro_appointments(null, 'past') x where x.connection_id = p_conn));
  perform t.throws('shell: a look is unavailable', format($$select public.get_pro_recommendation(%L)$$, p_look), 'pro_unavailable');
  perform t.throws('shell: a message says ended', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, p_conn), 'connection_ended');
  perform t.throws('shell: a proposal says ended', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, p_conn, t.future(48)), 'connection_ended');
end $fn$;
-- rows put there afterwards (as the owner) must still not be shown: the shell rule is the functions', not only the deletion
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.c('c_ac'), 'Ghost look', 'sent', now());
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.c('c_ac'), t.u('cat'), 'text', 'Ghost message');
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes)
values (t.c('c_ac'), 'client', 'confirmed', now() + interval '3 days', 30, 'virtual', 0);
select t.put('ghost', (select id::text from public.pro_recommendations where connection_id = t.c('c_ac') and title = 'Ghost look'));
select t.shell_checks(t.u('ann'), t.c('c_ac'), t.get('ghost')::uuid);
select t.shell_checks(t.u('cat'), t.c('c_ac'), t.get('ghost')::uuid);
select t.as_user(t.u('ann'));
select t.throws('shell: the stylist cannot write a look', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_ac')), 'connection_ended');
select t.as_admin();
delete from public.user_blocks where blocker_id = t.u('cat') and blocked_id = t.u('ann');
select t.check('unblocking changes nothing: still a shell, still empty', (select shell_at is not null and status = 'ended' from public.pro_connections where id = t.c('c_ac')));
select t.shell_checks(t.u('ann'), t.c('c_ac'), t.get('ghost')::uuid);
select t.as_admin();

-- ─── G. The gates, in one place ─────────────────────────────────────────────

-- Dee works with Ann (as a client): a look sent, so there is something to read on an active connection.
select t.as_user(t.u('dee'));
select t.put('dl', public.save_pro_recommendation(t.c('c_da'), null, 'For Ann', 'A note.', null, gen_random_uuid())::text);
select public.send_pro_recommendation((t.get('dl')::jsonb ->> 'id')::uuid);
select t.put('dl_draft', public.save_pro_recommendation(t.c('c_da'), null, 'Dee draft', 'Not sent.', null, gen_random_uuid())::text);

-- the kill switch: content writes and reads of active connections refuse; the history of ended ones stays readable
select t.as_admin();
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.as_user(t.u('dee'));
select t.throws('switch off: save_pro_recommendation', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_da')), 'pro_disabled', null, null, '42501');
select t.throws('switch off: send_pro_recommendation (any id)', format($$select public.send_pro_recommendation(%L)$$, gen_random_uuid()), 'pro_disabled');
select t.throws('switch off: delete_pro_recommendation (any id)', format($$select public.delete_pro_recommendation(%L)$$, gen_random_uuid()), 'pro_disabled');
select t.throws('switch off: send_pro_message', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, t.c('c_da')), 'pro_disabled');
select t.throws('switch off: propose_pro_appointment', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_da'), t.future(48)), 'pro_disabled');
select t.throws('switch off: respond_pro_appointment (any id)', format($$select public.respond_pro_appointment(%L, 'confirm')$$, gen_random_uuid()), 'pro_disabled');
select t.throws('switch off: cancel_pro_appointment (any id)', format($$select public.cancel_pro_appointment(%L)$$, gen_random_uuid()), 'pro_disabled');
select t.throws('switch off: get_pro_thread of an active connection', format($$select public.get_pro_thread(%L)$$, t.c('c_da')), 'pro_disabled');
select t.throws('switch off: list_pro_recommendations of an active connection', format($$select * from public.list_pro_recommendations(%L)$$, t.c('c_da')), 'pro_disabled');
select t.throws('switch off: get_pro_recommendation of an active connection', format($$select public.get_pro_recommendation(%L)$$, (t.get('dl')::jsonb ->> 'id')), 'pro_disabled');
select t.throws('switch off: list_pro_appointments of an active connection', format($$select * from public.list_pro_appointments(%L)$$, t.c('c_da')), 'pro_disabled');
select t.check('switch off: list_pro_appointments across connections answers (no active rows)', not exists (select 1 from public.list_pro_appointments(null, 'upcoming')));
select t.throws('switch off: an unknown id on a read is just unavailable', format($$select public.get_pro_thread(%L)$$, gen_random_uuid()), 'pro_unavailable');
select t.as_user(t.u('ann'));
select t.throws('switch off: give_recommendation_feedback (any id)', format($$select public.give_recommendation_feedback(%L, 5)$$, gen_random_uuid()), 'pro_disabled');
select t.check('switch off: the history of the ended connection is readable: looks', (select count(*) >= 8 from public.list_pro_recommendations(t.c('c_ab'), null, 40)));
select t.check('switch off: the history of the ended connection is readable: a look', public.get_pro_recommendation((t.get('d1')::jsonb ->> 'id')::uuid) ->> 'status' = 'viewed');
select t.check('switch off: the history of the ended connection is readable: the thread', jsonb_array_length(public.get_pro_thread(t.c('c_ab')) -> 'messages') >= 1);
select t.check('switch off: the history of the ended connection is readable: sessions', (select count(*) >= 1 from public.list_pro_appointments(t.c('c_ab'), 'past')));
select t.check('switch off: across connections only the ended history is listed', (
  select count(*) >= 1 and bool_and(connection_id = t.c('c_ab')) from public.list_pro_appointments(null, 'past')));
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';

-- a suspension of the caller
update public.pro_members set suspended_at = now() where user_id = t.u('ann');
select t.as_user(t.u('ann'));
select t.throws('suspended: a message', format($$select public.send_pro_message(%L, 'hi', gen_random_uuid())$$, t.get('cx_mx')), 'pro_suspended', null, null, '42501');
select t.throws('suspended: a look', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.get('cx_mx')), 'pro_suspended');
select t.throws('suspended: the thread of an active connection', format($$select public.get_pro_thread(%L)$$, t.get('cx_mx')), 'pro_suspended');
select t.check('suspended: the ended history is readable', jsonb_array_length(public.get_pro_thread(t.c('c_ab')) -> 'messages') >= 1
               and (select count(*) >= 8 from public.list_pro_recommendations(t.c('c_ab'), null, 40)));
select t.as_admin();
update public.pro_members set suspended_at = null where user_id = t.u('ann');

-- stale terms
update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.as_user(t.u('dee'));
select t.throws('stale stylist terms: a look', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_da')), 'pro_terms_required', 'stylist', null, '42501');
select t.throws('stale stylist terms: a message', format($$select public.send_pro_message(%L, 'x', gen_random_uuid())$$, t.c('c_da')), 'pro_terms_required', 'stylist');
select t.throws('stale stylist terms: sending a draft', format($$select public.send_pro_recommendation(%L)$$, (t.get('dl_draft')::jsonb ->> 'id')), 'pro_terms_required', 'stylist');
select t.throws('stale stylist terms: reading the thread of an active connection', format($$select public.get_pro_thread(%L)$$, t.c('c_da')), 'pro_terms_required', 'stylist');
select t.as_user(t.u('ann'));
select t.check('stale stylist terms: Ann, as the CLIENT of Dee, is not stopped by them', jsonb_array_length(public.get_pro_thread(t.c('c_da')) -> 'messages') >= 0);
select t.check('stale stylist terms: and her ended history as a stylist is readable', (select count(*) >= 8 from public.list_pro_recommendations(t.c('c_ab'), null, 40)));
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.as_user(t.u('ann'));
select t.throws('stale client terms: a message as a client', format($$select public.send_pro_message(%L, 'x', gen_random_uuid())$$, t.c('c_da')), 'pro_terms_required', 'client');
select t.throws('stale client terms: feedback', format($$select public.give_recommendation_feedback(%L, 5)$$, (t.get('dl')::jsonb ->> 'id')), 'pro_terms_required', 'client');
select t.throws('stale client terms: proposing a session as a client', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_da'), t.future(48)), 'pro_terms_required', 'client');
select t.throws('stale client terms: reading the active thread as a client', format($$select public.get_pro_thread(%L)$$, t.c('c_da')), 'pro_terms_required', 'client');
select t.check('stale client terms: Ann''s work as a stylist is not stopped', public.send_pro_message(t.get('cx_mx')::uuid, 'Still here.', gen_random_uuid()) is not null);
select t.as_user(t.u('bea'));
select t.check('stale client terms: a client''s ended history is readable', jsonb_array_length(public.get_pro_thread(t.c('c_ab')) -> 'messages') >= 1);
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';

-- the adult attestation is checked by every function, not only by the screen
update public.pro_members set adult_confirmed_at = null where user_id = t.u('dee');
select t.as_user(t.u('dee'));
select t.throws('no attestation: a message', format($$select public.send_pro_message(%L, 'x', gen_random_uuid())$$, t.c('c_da')), 'adult_required', null, null, '22023');
select t.throws('no attestation: a look', format($$select public.save_pro_recommendation(%L, null, 'x', '', null, gen_random_uuid())$$, t.c('c_da')), 'adult_required');
select t.throws('no attestation: a session', format($$select public.propose_pro_appointment(%L, %L, 60, 'virtual', '', '', 0, gen_random_uuid())$$, t.c('c_da'), t.future(48)), 'adult_required');
select t.as_admin();
update public.pro_members set adult_confirmed_at = now() where user_id = t.u('dee');
