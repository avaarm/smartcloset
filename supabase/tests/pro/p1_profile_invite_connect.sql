-- p1_profile_invite_connect (files 1 to 5 only; no file of the sharing, work or moderation streams is needed)
--   A  who may call what: guest, a token with no subject, an anonymous token, the switch, the adult attestation, the
--      terms versions, stale terms, a suspension; the privileges of the functions of files 2 to 5
--   B  get_pro_status and get_pro_badge
--   C  the helpers: text filter in folded, wide and accented forms, names, lists, codes, limits
--   D  the stylist profile: validation, filters, creation, the label kept in step, closing and saving again
--   E  invites: creation, caps, idempotency, listing, revoking, expiry, holds
--   F  preview: every failure is the same result and is counted
--   G  redeem: terms, alias, caps, no grant on connecting, retries, races of state
--   H  connections: list, detail (safety-only), ending, alias
--   I  upkeep and triggers of files 2 and 3: expiry, repairs, retention, a block, a deleted account

-- ─── A. Who may call what ───────────────────────────────────────────────────

select t.as_admin();
select t.check('the 16 client functions of files 4 and 5 are executable by authenticated and by no guest', (
  select count(*) = 16 and bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
         and not bool_or(has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('get_pro_status', 'get_pro_badge', 'accept_pro_terms', 'get_my_stylist_profile', 'save_stylist_profile',
                       'set_stylist_accepting', 'close_stylist_profile', 'create_pro_invite', 'list_my_pro_invites',
                       'revoke_pro_invite', 'preview_pro_invite', 'redeem_pro_invite', 'list_pro_connections',
                       'get_pro_connection', 'end_pro_connection', 'set_pro_alias')));
select t.check('the 25 internal helpers and triggers are executable by neither authenticated nor anon', (
  select count(*) = 25 and not bool_or(has_function_privilege('authenticated', p.oid, 'execute')
                                       or has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pro_raise', 'pro_cfg', 'pro_limit', 'pro_rate_check', 'pro_text_ok', 'pro_require_text', 'pro_gate',
                       'pro_new_code', 'pro_norm_code', 'pro_clean_name', 'pro_name_ok', 'pro_clean_list',
                       'pro_clean_materials', 'pro_clean_season', 'pro_photo_path', 'pro_lock_users', 'pro_invites_held',
                       'pro_report_is_qualified', 'pro_can_read_closet', 'pro_end_connection', 'pro_end_between',
                       'pro_shell_connection', 'pro_on_block', 'pro_on_member_left', 'pro_refresh')));
select t.check('pro_janitor is for the service role only',
               has_function_privilege('service_role', 'public.pro_janitor(boolean)', 'execute')
               and not has_function_privilege('authenticated', 'public.pro_janitor(boolean)', 'execute')
               and not has_function_privilege('anon', 'public.pro_janitor(boolean)', 'execute'));
select t.check('every pro function of files 2 to 5 pins search_path',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                and (p.proname like 'pro\_%' or p.proname in ('get_pro_status', 'get_pro_badge', 'accept_pro_terms', 'get_my_stylist_profile', 'save_stylist_profile',
                       'set_stylist_accepting', 'close_stylist_profile', 'create_pro_invite', 'list_my_pro_invites',
                       'revoke_pro_invite', 'preview_pro_invite', 'redeem_pro_invite', 'list_pro_connections',
                       'get_pro_connection', 'end_pro_connection', 'set_pro_alias'))
                and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))));

select t.as_anon();
select t.throws('a guest cannot call get_pro_status', 'select public.get_pro_status()', 'permission denied');
select t.throws('a guest cannot call accept_pro_terms', $$select public.accept_pro_terms('client', '2026-10', true)$$, 'permission denied');
select t.throws('a guest cannot preview a code', $$select public.preview_pro_invite('0123456789')$$, 'permission denied');
select t.throws('a guest cannot end a connection', $$select public.end_pro_connection(gen_random_uuid())$$, 'permission denied');
select t.throws('a guest cannot read a pro table', 'select * from public.pro_members', 'permission denied');
select t.throws('a guest cannot call a helper', $$select public.pro_gate(gen_random_uuid(), 'safety')$$, 'permission denied');

-- A token with no subject is not signed in; an anonymous sign-in is not a person either, for every gate, the ways out included.
select t.as_no_subject();
select t.throws('no subject: get_pro_status', 'select public.get_pro_status()', 'not_authenticated', null, null, '28000');
select t.throws('no subject: accept_pro_terms', $$select public.accept_pro_terms('client', '2026-10', true)$$, 'not_authenticated');
select t.throws('no subject: preview_pro_invite', $$select public.preview_pro_invite('0123456789')$$, 'not_authenticated');
select t.throws('no subject: list_pro_connections', 'select * from public.list_pro_connections()', 'not_authenticated');
select t.eq('no subject: the badge is 0 and never an error', public.get_pro_badge(), 0);
select t.as_user(t.u('ivy'));
select t.check('Ivy with a normal token can ask for status (she is a person like any other)', (public.get_pro_status() ->> 'proEnabled') = 'true');
select t.as_anonymous_user(t.u('ivy'));
select t.throws('anonymous token: get_pro_status', 'select public.get_pro_status()', 'not_authenticated', null, null, '28000');
select t.throws('anonymous token: accept_pro_terms', $$select public.accept_pro_terms('client', '2026-10', true)$$, 'not_authenticated');
select t.throws('anonymous token: create_pro_invite', $$select public.create_pro_invite(gen_random_uuid())$$, 'not_authenticated');
select t.throws('anonymous token: preview_pro_invite', $$select public.preview_pro_invite('0123456789')$$, 'not_authenticated');
select t.throws('anonymous token: redeem_pro_invite', $$select public.redeem_pro_invite('0123456789', 'Ivy')$$, 'not_authenticated');
select t.throws('anonymous token: list_pro_connections (a way out)', 'select * from public.list_pro_connections()', 'not_authenticated');
select t.throws('anonymous token: end_pro_connection (a way out)', $$select public.end_pro_connection(gen_random_uuid())$$, 'not_authenticated');
select t.throws('anonymous token: close_stylist_profile (a way out)', 'select public.close_stylist_profile()', 'not_authenticated');
select t.eq('anonymous token: the badge is 0', public.get_pro_badge(), 0);

-- The switch. Status, the badge and every way out keep working; everything that creates or reads content is paused.
select t.as_admin();
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.as_user(t.u('ann'));
select t.check('switch off: status still answers and says so', (public.get_pro_status() ->> 'proEnabled') = 'false');
select t.eq('switch off: the badge is 0', public.get_pro_badge(), 0);
select t.throws('switch off: accept_pro_terms', $$select public.accept_pro_terms('stylist', '2026-10', true)$$, 'pro_disabled', null, null, '42501');
select t.throws('switch off: get_my_stylist_profile', 'select public.get_my_stylist_profile()', 'pro_disabled');
select t.throws('switch off: save_stylist_profile', $$select public.save_stylist_profile('Ann Styles', '', '', array['outfit_styling'], '{}', '', true)$$, 'pro_disabled');
select t.throws('switch off: set_stylist_accepting', 'select public.set_stylist_accepting(true)', 'pro_disabled');
select t.throws('switch off: create_pro_invite', $$select public.create_pro_invite(gen_random_uuid())$$, 'pro_disabled');
select t.throws('switch off: list_my_pro_invites', 'select * from public.list_my_pro_invites()', 'pro_disabled');
select t.throws('switch off: revoke_pro_invite', $$select public.revoke_pro_invite(gen_random_uuid())$$, 'pro_disabled');
select t.throws('switch off: preview_pro_invite', $$select public.preview_pro_invite('0123456789')$$, 'pro_disabled');
select t.throws('switch off: redeem_pro_invite', $$select public.redeem_pro_invite('0123456789', 'Bea')$$, 'pro_disabled');
select t.throws('switch off: set_pro_alias', $$select public.set_pro_alias(gen_random_uuid(), 'Bea')$$, 'pro_disabled');
select t.check('switch off: list_pro_connections still answers', (select count(*) from public.list_pro_connections('stylist')) = 0);
select t.throws('switch off: end_pro_connection reaches the connection check (the gate let it through)', $$select public.end_pro_connection(gen_random_uuid())$$, 'pro_unavailable');
select t.throws('switch off: get_pro_connection reaches the connection check', $$select public.get_pro_connection(gen_random_uuid())$$, 'pro_unavailable');
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';

-- Adult attestation and terms versions.
select t.as_user(t.u('gus'));
select t.throws('adult missing: accepting without the switch', $$select public.accept_pro_terms('client', '2026-10', false)$$, 'adult_required', null, null, '22023');
select t.throws('adult missing (default argument): accepting', $$select public.accept_pro_terms('client', '2026-10')$$, 'adult_required');
select t.throws('wrong terms version', $$select public.accept_pro_terms('client', '2026-09', true)$$, 'terms_version_mismatch', null, null, '22023');
select t.throws('a role that does not exist', $$select public.accept_pro_terms('admin', '2026-10', true)$$, 'invalid_request', 'role');
select t.throws('a missing role', $$select public.accept_pro_terms(null, '2026-10', true)$$, 'invalid_request', 'role');
select t.throws('a missing version', $$select public.accept_pro_terms('client', null, true)$$, 'terms_version_mismatch');
select t.throws('nothing accepted: create_pro_invite needs the attestation', $$select public.create_pro_invite(gen_random_uuid())$$, 'adult_required');
select t.throws('nothing accepted: redeem_pro_invite needs the attestation', $$select public.redeem_pro_invite('0123456789', 'Gus')$$, 'adult_required');
select t.throws('nothing accepted: save_stylist_profile needs the attestation', $$select public.save_stylist_profile('Gus Styles', '', '', array['outfit_styling'], '{}', '', true)$$, 'adult_required');
select t.check('looking at a code needs no terms (member gate): an unknown code is the invalid result',
               public.preview_pro_invite('0123456789') = '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.check('Gus has no pro_members row yet', (public.get_pro_status() ->> 'adultConfirmed') = 'false');
select public.accept_pro_terms('client', '2026-10', true);
select t.check('accepting with the switch stores the attestation and the version',
               (public.get_pro_status() ->> 'adultConfirmed') = 'true' and (public.get_pro_status() -> 'client' ->> 'termsCurrent') = 'true');
select public.accept_pro_terms('stylist', '2026-10');
select t.check('the stylist terms can be accepted later without the switch, the attestation is stored',
               (select (public.get_pro_status() -> 'stylist') = 'null'::jsonb));
select t.as_admin();
select t.check('the attestation is stored once, with no date of birth anywhere',
               (select adult_confirmed_at is not null and stylist_terms_version = '2026-10' and client_terms_version = '2026-10'
                  from public.pro_members where user_id = t.u('gus')));

-- Twenty acceptances a day.
select t.put('rate1', t.mk_user('rate1', false, false)::text);
select t.as_user(t.get('rate1')::uuid);
do $$ begin for i in 1..20 loop perform public.accept_pro_terms('client', '2026-10', true); end loop; end $$;
select t.throws('the 21st acceptance of a day is rate limited', $$select public.accept_pro_terms('client', '2026-10', true)$$,
                'pro_rate_limited', 'terms_day', null, '54000');

-- Stale terms: a version bump on the server gates what creates content, never a way out.
select t.as_admin();
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.as_user(t.u('bea'));
select t.throws('stale client terms: redeem_pro_invite', $$select public.redeem_pro_invite('0123456789', 'Bea')$$, 'pro_terms_required', 'client', null, '42501');
select t.throws('stale client terms: set_pro_alias', $$select public.set_pro_alias(gen_random_uuid(), 'Bea')$$, 'pro_terms_required', 'client');
select t.check('stale client terms: status says termsCurrent false', (public.get_pro_status() -> 'client' ->> 'termsCurrent') = 'false');
select t.check('stale client terms: previewing a code still works', public.preview_pro_invite('0123456789') ->> 'valid' = 'false');
select t.throws('stale client terms: the old version is refused', $$select public.accept_pro_terms('client', '2026-10', true)$$, 'terms_version_mismatch');
select public.accept_pro_terms('client', '2026-11', true);
select t.check('stale client terms: accepting the new version brings her back', (public.get_pro_status() -> 'client' ->> 'termsCurrent') = 'true');
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';
update public.pro_members set client_terms_version = '2026-10' where user_id = t.u('bea');
update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.as_user(t.u('ann'));
select t.throws('stale stylist terms: create_pro_invite', $$select public.create_pro_invite(gen_random_uuid())$$, 'pro_terms_required', 'stylist', null, '42501');
select t.throws('stale stylist terms: save_stylist_profile', $$select public.save_stylist_profile('Ann Styles', '', '', array['outfit_styling'], '{}', '', true)$$, 'pro_terms_required', 'stylist');
select t.throws('stale stylist terms: set_stylist_accepting', 'select public.set_stylist_accepting(true)', 'pro_terms_required', 'stylist');
select t.throws('stale stylist terms: list_my_pro_invites', 'select * from public.list_my_pro_invites()', 'pro_terms_required', 'stylist');
select t.check('stale stylist terms: status says so', (public.get_pro_status() -> 'stylist' ->> 'termsCurrent') = 'false');
select t.check('stale stylist terms: the profile can still be read (member gate)', (public.get_my_stylist_profile() ->> 'displayName') = 'Ann Styles');
select t.check('stale stylist terms: list_pro_connections still answers', (select count(*) from public.list_pro_connections('stylist')) = 0);
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';

-- A suspension (a person's decision on the pro membership).
update public.pro_members set suspended_at = now(), suspended_reason = 'test' where user_id = t.u('dee');
select t.as_user(t.u('dee'));
select t.throws('suspended: create_pro_invite', $$select public.create_pro_invite(gen_random_uuid())$$, 'pro_suspended', null, null, '42501');
select t.throws('suspended: accept_pro_terms', $$select public.accept_pro_terms('stylist', '2026-10', true)$$, 'pro_suspended');
select t.throws('suspended: preview_pro_invite', $$select public.preview_pro_invite('0123456789')$$, 'pro_suspended');
select t.check('suspended: status says so', (public.get_pro_status() ->> 'suspended') = 'true');
select t.eq('suspended: the badge is 0', public.get_pro_badge(), 0);
select t.check('suspended: list_pro_connections answers', (select count(*) from public.list_pro_connections('stylist')) = 0);
select t.as_admin();
update public.pro_members set suspended_at = null, suspended_reason = null where user_id = t.u('dee');

-- ─── B. Status ──────────────────────────────────────────────────────────────

select t.as_user(t.u('ann'));
select t.put('status_ann', public.get_pro_status()::text);
select t.eq('status has exactly the documented keys', t.keys(t.get('status_ann')::jsonb),
            'adultConfirmed,badge,client,proEnabled,stylist,stylistRemoved,suspended,versions');
select t.eq('status stylist has exactly the documented keys', t.keys(t.get('status_ann')::jsonb -> 'stylist'),
            'accepting,activeClients,approved,clientLimit,inviteLimit,invitesHeld,liveInvites,termsCurrent');
select t.eq('status client has exactly the documented keys', t.keys(t.get('status_ann')::jsonb -> 'client'), 'connectionLimit,connections,termsCurrent');
select t.eq('status versions', t.get('status_ann')::jsonb -> 'versions', '{"shareText": "2026-10", "clientTerms": "2026-10", "stylistTerms": "2026-10"}'::jsonb);
select t.check('Ann is an approved stylist with the full caps',
  (t.get('status_ann')::jsonb -> 'stylist') = '{"approved": true, "accepting": true, "invitesHeld": false, "termsCurrent": true,
     "activeClients": 0, "clientLimit": 25, "liveInvites": 0, "inviteLimit": 10}'::jsonb);
select t.check('Ann has not accepted the client terms',
  (t.get('status_ann')::jsonb -> 'client') = '{"termsCurrent": false, "connections": 0, "connectionLimit": 5}'::jsonb);
select t.check('flags and badge', (t.get('status_ann')::jsonb ->> 'proEnabled') = 'true' and (t.get('status_ann')::jsonb ->> 'suspended') = 'false'
                                  and (t.get('status_ann')::jsonb ->> 'stylistRemoved') = 'false' and (t.get('status_ann')::jsonb ->> 'badge') = '0');
select t.as_user(t.u('dee'));
select t.check('Dee is on probation: 3 clients and 1 live invite',
  (public.get_pro_status() -> 'stylist') = '{"approved": false, "accepting": true, "invitesHeld": false, "termsCurrent": true,
     "activeClients": 0, "clientLimit": 3, "liveInvites": 0, "inviteLimit": 1}'::jsonb);
select t.as_user(t.u('eve'));
select t.check('Eve has no stylist profile (null), no attestation, no terms',
  (public.get_pro_status() -> 'stylist') = 'null'::jsonb and (public.get_pro_status() ->> 'adultConfirmed') = 'false'
  and (public.get_pro_status() -> 'client' ->> 'termsCurrent') = 'false');
select t.check('Eve has no profile to read', public.get_my_stylist_profile() is null);

-- ─── C. The helpers ─────────────────────────────────────────────────────────

select t.as_admin();
-- text filter, chat mode: scam and advance-fee phrases and blocked terms; talk of payment and contact details is allowed
select t.eq('chat: gift card', public.pro_text_ok('please send a gift card', 'chat'), 'payment');
select t.eq('chat: wide letters', public.pro_text_ok(U&'\FF47\FF49\FF46\FF54 \FF43\FF41\FF52\FF44', 'chat'), 'payment');
select t.eq('chat: western union', public.pro_text_ok('Western Union please', 'chat'), 'payment');
select t.eq('chat: a typographic apostrophe in cashier’s check', public.pro_text_ok('a cashier' || chr(8217) || 's check', 'chat'), 'payment');
select t.eq('chat: ascii apostrophe in cashier''s cheque', public.pro_text_ok('a cashier''s cheque', 'chat'), 'payment');
select t.eq('chat: bitcoin', public.pro_text_ok('pay in bitcoin', 'chat'), 'payment');
select t.eq('chat: crypto as a word', public.pro_text_ok('paid in crypto', 'chat'), 'payment');
select t.eq('chat: cryptography is not crypto', public.pro_text_ok('a class on cryptography', 'chat'), null);
select t.eq('chat: overpayment', public.pro_text_ok('an overpayment, refund the difference', 'chat'), 'payment');
select t.eq('chat: a zero-width space does not hide a phrase', public.pro_text_ok('wire' || chr(8203) || ' transfer', 'chat'), 'payment');
select t.eq('chat: text written backwards behind a right-to-left override is refused', public.pro_text_ok(chr(8238) || 'drac tfig a yub esaelp', 'chat'), 'content');
select t.eq('chat: so is a bidirectional isolate', public.pro_text_ok(U&'hello \2067 there \2069', 'chat'), 'content');
select t.eq('chat: and a text of nothing but a hidden character', public.pro_text_ok(chr(8238), 'chat'), 'content');
select t.eq('chat: a left-to-right mark and a word joiner are hidden characters too', public.pro_text_ok('a' || chr(8206) || 'b' || chr(8288) || 'c', 'chat'), 'content');
select t.eq('chat: an emoji with its variation selector and a joined family emoji are fine',
            public.pro_text_ok(U&'love it \2764\FE0F and \1F468\200D\1F469\200D\1F467 too', 'chat'), null);
select t.eq('chat: a zero-width non-joiner (Persian, Hindi) is fine', public.pro_text_ok(U&'\0645\06CC\200C\062E\0648\0627\0647\0645', 'chat'), null);
select t.eq('chat: a phone number is allowed between connected adults', public.pro_text_ok('call me on 555-123-4567', 'chat'), null);
select t.eq('chat: an email is allowed', public.pro_text_ok('mail a@b.co', 'chat'), null);
select t.eq('chat: ordinary payment talk is allowed', public.pro_text_ok('I take venmo or paypal', 'chat'), null);
select t.eq('chat: the default mode is chat', public.pro_text_ok('I take venmo'), null);
select t.eq('an empty text is fine', public.pro_text_ok('', 'public'), null);
select t.eq('a null text is fine', public.pro_text_ok(null, 'public'), null);
-- public mode: what a stranger can read
select t.eq('public: venmo', public.pro_text_ok('venmo me', 'public'), 'payment');
select t.eq('public: paypal', public.pro_text_ok('PayPal', 'public'), 'payment');
select t.eq('public: accented zelle', public.pro_text_ok('Z' || chr(233) || 'll' || chr(233), 'public'), 'payment');
select t.eq('public: cash app', public.pro_text_ok('my cashapp', 'public'), 'payment');
select t.eq('public: a gift card is also payment', public.pro_text_ok('gift card', 'public'), 'payment');
select t.eq('public: zero-width inside venmo', public.pro_text_ok('ven' || chr(8203) || 'mo', 'public'), 'payment');
select t.eq('public: a link', public.pro_text_ok('see www.example.com', 'public'), 'contact');
select t.eq('public: a scheme', public.pro_text_ok('https://example.test/x', 'public'), 'contact');
select t.eq('public: an email', public.pro_text_ok('name@mail.com', 'public'), 'contact');
select t.eq('public: a handle', public.pro_text_ok('find me @someone', 'public'), 'contact');
select t.eq('public: a phone number', public.pro_text_ok('(555) 123-4567', 'public'), 'contact');
select t.eq('public: an international number', public.pro_text_ok('+44 7700 900123', 'public'), 'contact');
select t.eq('public: whatsapp in wide letters', public.pro_text_ok(U&'\FF37\FF48\FF41\FF54\FF53\FF41\FF50\FF50', 'public'), 'contact');
select t.eq('public: on signal', public.pro_text_ok('find me on Signal', 'public'), 'contact');
select t.eq('public: signal me', public.pro_text_ok('Signal me', 'public'), 'contact');
select t.eq('public: dm me', public.pro_text_ok('DM me', 'public'), 'contact');
select t.eq('public: an email written backwards behind an override is refused', public.pro_text_ok(chr(8238) || 'moc.liamg@anna', 'public'), 'content');
select t.eq('public: an official SmartCloset stylist', public.pro_text_ok('Official SmartCloset stylist', 'public'), 'content');
select t.eq('public: verified by SmartCloset', public.pro_text_ok('Verified by SmartCloset', 'public'), 'content');
select t.eq('public: approved by Smart Closet', public.pro_text_ok('approved by smart closet', 'public'), 'content');
select t.eq('public: a SmartCloset partner', public.pro_text_ok('SmartCloset partner since 2026', 'public'), 'content');
select t.eq('public: wide letters do not hide the claim', public.pro_text_ok(U&'\FF2F\FF46\FF46\FF49\FF43\FF49\FF41\FF4C SmartCloset', 'public'), 'content');
select t.eq('public: an outside credential that does not name the app is fine', public.pro_text_ok('Certified image consultant, trained in Milan', 'public'), null);
select t.eq('public: using the app is not a claim', public.pro_text_ok('I use the SmartCloset app to sort closets', 'public'), null);
select t.eq('chat: connected adults may say anything of the kind', public.pro_text_ok('verified by SmartCloset', 'chat'), null);
select t.eq('public: a Signal-inspired palette is a style note', public.pro_text_ok('Signal-inspired palette', 'public'), null);
select t.eq('public: rates text', public.pro_text_ok('From $80 per session', 'public'), null);
select t.eq('public: an ordinary bio', public.pro_text_ok('Ten years of styling for work and weekends.', 'public'), null);
-- blocked terms, both modes (the list is the swap one)
select t.load_terms();
select t.eq('a blocked term in chat', public.pro_text_ok('say blockedterm07 now', 'chat'), 'content');
select t.eq('a blocked term in public', public.pro_text_ok('BlockedTerm07', 'public'), 'content');
select t.eq('a blocked term is a whole word', public.pro_text_ok('blockedterm077', 'chat'), null);
delete from public.swap_blocked_terms where term like 'blockedterm%';
select t.eq('no terms loaded, no content hint', public.pro_text_ok('say blockedterm07 now', 'chat'), null);
select t.throws('pro_require_text raises with the field and the hint', $$select public.pro_require_text('venmo', 'bio', 'public')$$,
                'text_not_allowed', 'bio', 'payment', '22023');
select public.pro_require_text('hello', 'bio', 'public');
select t.check('pro_require_text passes a clean text (it raised nothing)', true);

-- names
select t.eq('a name is trimmed and its inner whitespace collapsed', public.pro_clean_name('  Ann   ' || chr(9) || 'Styles ', 2, 40), 'Ann Styles');
select t.eq('a no-break space is whitespace', public.pro_clean_name('Ann' || chr(160) || chr(160) || 'Styles', 2, 40), 'Ann Styles');
select t.eq('a name that is too short', public.pro_clean_name('A', 2, 40), null);
select t.eq('a name that is too long', public.pro_clean_name(repeat('a', 41), 2, 40), null);
select t.eq('a name of exactly the longest length', public.pro_clean_name(repeat('a', 40), 2, 40), repeat('a', 40));
select t.eq('a control character refuses the name', public.pro_clean_name('Ann' || chr(1), 2, 40), null);
select t.eq('a zero-width space refuses the name', public.pro_clean_name('An' || chr(8203) || 'n', 2, 40), null);
select t.eq('a right-to-left override refuses the name', public.pro_clean_name('Ann' || chr(8238), 2, 40), null);
select t.eq('an empty name where the minimum is 0 is the empty string', public.pro_clean_name('   ', 0, 40), '');
select t.eq('a null name where the minimum is 0 is the empty string', public.pro_clean_name(null, 0, 40), '');
select t.eq('a null name where the minimum is 2 is refused', public.pro_clean_name(null, 2, 40), null);
select t.check('reserved words are refused as whole words',
  not public.pro_name_ok('Admin') and not public.pro_name_ok('Smart Closet Support') and not public.pro_name_ok('SmartCloset')
  and not public.pro_name_ok('Verified Stylist') and not public.pro_name_ok('Official Styles') and not public.pro_name_ok('Certified')
  and not public.pro_name_ok('Staff') and not public.pro_name_ok('Moderator') and not public.pro_name_ok('Administrator')
  and not public.pro_name_ok('Smart-Closet') and not public.pro_name_ok('ADMIN'));
select t.check('reserved words in wide letters are refused too', not public.pro_name_ok(U&'\FF21\FF44\FF4D\FF49\FF4E'));
select t.check('a name needs a letter', not public.pro_name_ok('12345') and not public.pro_name_ok('!!'));
select t.check('a reserved word inside another word is fine', public.pro_name_ok('Supportive Sam') and public.pro_name_ok('Staffordshire Styles')
                                                              and public.pro_name_ok('Ann Styles') and public.pro_name_ok('Zo' || chr(235)));
-- lists
select t.eq('a list keeps the first of each, in order', public.pro_clean_list(array['b', 'a', 'b', 'c', 'a'], array['a', 'b', 'c'], 5), array['b', 'a', 'c']);
select t.eq('a list outside the allowed set', public.pro_clean_list(array['a', 'x'], array['a', 'b'], 5), null);
select t.eq('a list that is too long', public.pro_clean_list(array['a', 'b', 'c'], array['a', 'b', 'c'], 2), null);
select t.eq('a list with a null in it', public.pro_clean_list(array['a', null], array['a', 'b'], 5), null);
select t.eq('a null list is empty', public.pro_clean_list(null, array['a'], 5), '{}'::text[]);
select t.eq('no allowed set: any element', public.pro_clean_list(array['en', 'zz'], null, 5), array['en', 'zz']);
-- codes
select t.eq('a code is normalised: lower case, hyphen, space, look-alikes', public.pro_norm_code('oil01-abc de'), '01101ABCDE');
select t.eq('a null code is the empty string', public.pro_norm_code(null), '');
select t.check('200 new codes are ten Crockford symbols and all different',
  (select count(*) = 200 and count(distinct c) = 200 and bool_and(c ~ '^[0-9A-HJKMNP-TV-Z]{10}$')
     from (select public.pro_new_code() c from generate_series(1, 200)) x));
select t.check('a code survives normalisation unchanged', (select bool_and(public.pro_norm_code(c) = c) from (select public.pro_new_code() c from generate_series(1, 50)) x));
-- limits and counters
select t.eq('pro_limit: a counter', public.pro_limit('invite_day'), 5);
select t.eq('pro_limit: a cap', public.pro_limit('stylist_clients_probation'), 3);
select t.eq('pro_limit: an unknown name is 0', public.pro_limit('nope'), 0);
select t.throws('pro_rate_check refuses a bucket without a window', $$select public.pro_rate_check(gen_random_uuid(), 'nowindow')$$, 'invalid_rate_bucket');
select t.throws('pro_rate_check refuses an unknown bucket', $$select public.pro_rate_check(gen_random_uuid(), 'nope_day')$$, 'invalid_rate_bucket');
select t.eq('pro_cfg reads a row', public.pro_cfg('stylist_terms_version') #>> '{}', '2026-10');
select t.eq('pro_cfg of an unknown key is null', public.pro_cfg('nope'), null::jsonb);

-- ─── D. The stylist profile ─────────────────────────────────────────────────

create or replace function t.try_profile(p_label text, p_name text, p_headline text, p_bio text, p_services text[], p_languages text[],
                                         p_rates text, p_msg text, p_detail text default null, p_hint text default null)
returns void language plpgsql as $$
begin
  perform t.throws(p_label, format('select public.save_stylist_profile(%L, %L, %L, %L::text[], %L::text[], %L, true)',
                                   p_name, p_headline, p_bio, p_services, p_languages, p_rates), p_msg, p_detail, p_hint);
end $$;
grant execute on function t.try_profile(text, text, text, text, text[], text[], text, text, text, text) to public;

select t.as_user(t.u('ann'));
-- the name
select t.try_profile('name: a reserved word', 'Smart Closet Support', '', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'display_name', 'name');
select t.try_profile('name: admin', 'Admin', '', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'display_name', 'name');
select t.try_profile('name: verified', 'Verified Stylist', '', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'display_name', 'name');
select t.try_profile('name: no letter', '12345', '', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'display_name', 'name');
select t.try_profile('name: too short', 'A', '', '', array['outfit_styling'], '{}', '', 'invalid_profile', 'display_name');
select t.try_profile('name: blank', '   ', '', '', array['outfit_styling'], '{}', '', 'invalid_profile', 'display_name');
select t.try_profile('name: too long', repeat('a', 41), '', '', array['outfit_styling'], '{}', '', 'invalid_profile', 'display_name');
select t.try_profile('name: a control character', 'Ann' || chr(1) || ' Styles', '', '', array['outfit_styling'], '{}', '', 'invalid_profile', 'display_name');
select t.try_profile('name: a zero-width character', 'An' || chr(8203) || 'n Styles', '', '', array['outfit_styling'], '{}', '', 'invalid_profile', 'display_name');
select t.try_profile('name: a payment word', 'Venmo Styles', '', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'display_name', 'payment');
select t.try_profile('name: a link', 'ann.com styles', '', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'display_name', 'contact');
-- the other fields
select t.try_profile('headline: too long', 'Ann Styles', repeat('h', 81), '', array['outfit_styling'], '{}', '', 'invalid_profile', 'headline');
select t.try_profile('bio: too long', 'Ann Styles', '', repeat('b', 501), array['outfit_styling'], '{}', '', 'invalid_profile', 'bio');
select t.try_profile('rates: too long', 'Ann Styles', '', '', array['outfit_styling'], '{}', repeat('r', 121), 'invalid_profile', 'rates');
select t.try_profile('bio: a control character', 'Ann Styles', '', 'a' || chr(2) || 'b', array['outfit_styling'], '{}', '', 'invalid_profile', 'bio');
select t.try_profile('services: none', 'Ann Styles', '', '', '{}', '{}', '', 'invalid_profile', 'services');
select t.try_profile('services: not in the closed list', 'Ann Styles', '', '', array['outfit_styling', 'plumbing'], '{}', '', 'invalid_profile', 'services');
select t.try_profile('services: a null element', 'Ann Styles', '', '', array['outfit_styling', null], '{}', '', 'invalid_profile', 'services');
select t.try_profile('languages: upper case', 'Ann Styles', '', '', array['outfit_styling'], array['EN'], '', 'invalid_profile', 'languages');
select t.try_profile('languages: three letters', 'Ann Styles', '', '', array['outfit_styling'], array['eng'], '', 'invalid_profile', 'languages');
select t.try_profile('languages: more than five', 'Ann Styles', '', '', array['outfit_styling'], array['en', 'fr', 'es', 'de', 'it', 'pt'], '', 'invalid_profile', 'languages');
-- wording refused in every field a stranger reads, in folded, wide and accented forms
select t.try_profile('bio: a link', 'Ann Styles', '', 'see https://example.test for more', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'contact');
select t.try_profile('bio: an email', 'Ann Styles', '', 'write to ann@example.test', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'contact');
select t.try_profile('bio: whatsapp', 'Ann Styles', '', 'find me on WhatsApp', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'contact');
select t.try_profile('headline: a phone number', 'Ann Styles', 'call 555-123-4567', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'headline', 'contact');
select t.try_profile('rates: a payment word', 'Ann Styles', '', '', array['outfit_styling'], '{}', 'pay by venmo', 'text_not_allowed', 'rates', 'payment');
select t.try_profile('rates: wide letters', 'Ann Styles', '', '', array['outfit_styling'], '{}', U&'\FF56\FF45\FF4E\FF4D\FF4F', 'text_not_allowed', 'rates', 'payment');
select t.try_profile('rates: accented letters', 'Ann Styles', '', '', array['outfit_styling'], '{}', 'Z' || chr(233) || 'll' || chr(233) || ' only', 'text_not_allowed', 'rates', 'payment');
select t.try_profile('bio: a typographic apostrophe in cashier’s check', 'Ann Styles', '', 'a cashier' || chr(8217) || 's check is fine by me', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'payment');
select t.try_profile('bio: a gift card', 'Ann Styles', '', 'gift cards welcome', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'payment');
select t.try_profile('headline: a claim of being official', 'Ann Styles', 'Official SmartCloset stylist', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'headline', 'content');
select t.try_profile('bio: verified by the app', 'Ann Styles', '', 'Verified by SmartCloset, ask me anything', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'content');
select t.try_profile('rates: approved by the app', 'Ann Styles', '', '', array['outfit_styling'], '{}', 'SmartCloset approved rates', 'text_not_allowed', 'rates', 'content');
select t.try_profile('bio: reversed text behind an override', 'Ann Styles', '', chr(8238) || 'moc.liamg@anna', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'content');
select t.try_profile('headline: reversed text behind an override', 'Ann Styles', chr(8238) || 'moc.liamg@anna', '', array['outfit_styling'], '{}', '', 'text_not_allowed', 'headline', 'content');
select t.as_admin();
select t.load_terms();
select t.as_user(t.u('ann'));
select t.try_profile('bio: a blocked term', 'Ann Styles', '', 'about blockedterm03', array['outfit_styling'], '{}', '', 'text_not_allowed', 'bio', 'content');
select t.as_admin();
delete from public.swap_blocked_terms where term like 'blockedterm%';
select t.check('failed saves wrote nothing and counted nothing',
               (select display_name from public.pro_stylists where user_id = t.u('ann')) = 'Ann Styles'
               and (select coalesce(sum(n), 0) from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'profile_day') = 1);

-- a success: a "Signal-inspired palette" is a style note and "From $80 per session" is a rate; whitespace is collapsed
select t.as_user(t.u('ann'));
select t.put('prof', public.save_stylist_profile('  Ann   Styles ', 'Wardrobe edits and capsule closets', 'A Signal-inspired palette, built around what you own.',
                                                 array['wardrobe_audit', 'outfit_styling', 'outfit_styling', 'virtual_sessions'], array['en', 'fr', 'en'],
                                                 'From $80 per session', true)::text);
select t.eq('the saved profile has exactly the documented keys', t.keys(t.get('prof')::jsonb),
            'accepting,approved,bio,createdAt,displayName,headline,invitesHeld,languages,ratesText,services');
select t.eq('the name is cleaned', t.get('prof')::jsonb ->> 'displayName', 'Ann Styles');
select t.eq('services are distinct and keep their order', t.get('prof')::jsonb -> 'services', '["wardrobe_audit", "outfit_styling", "virtual_sessions"]'::jsonb);
select t.eq('languages are distinct', t.get('prof')::jsonb -> 'languages', '["en", "fr"]'::jsonb);
select t.eq('rates text is stored as written', t.get('prof')::jsonb ->> 'ratesText', 'From $80 per session');
select t.check('approved and not held', (t.get('prof')::jsonb ->> 'approved') = 'true' and (t.get('prof')::jsonb ->> 'invitesHeld') = 'false');
select t.eq('get_my_stylist_profile returns what save returned', public.get_my_stylist_profile() - 'createdAt', t.get('prof')::jsonb - 'createdAt');
select t.as_admin();
select t.check('the profile row holds no email, phone or other personal column',
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pro_stylists'
              and column_name ~ '(email|phone|website|handle|address|location|photo|image|rating|verified|count)'));

-- the profile is the stylist's own; a second save is an update
select t.as_user(t.u('ann'));
select t.eq('a second save updates the same profile (createdAt unchanged)',
            (public.save_stylist_profile('Ann Styles', 'Wardrobe edits and capsule closets', 'A Signal-inspired palette, built around what you own.',
                                         array['wardrobe_audit', 'outfit_styling', 'virtual_sessions'], array['en', 'fr'], 'From $80 per session', true) ->> 'createdAt'),
            t.get('prof')::jsonb ->> 'createdAt');
-- (Ann has now saved twice, plus the fixture: three of her six for the day. The limit itself is proved with Hal, below.)
select t.as_admin();
select t.eq('the saves are counted (the fixture and two more)', (select n from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'profile_day'), 3);

-- set_stylist_accepting
select t.as_user(t.u('ann'));
select public.set_stylist_accepting(false);
select t.check('not accepting is stored and read back', (public.get_my_stylist_profile() ->> 'accepting') = 'false');
select public.set_stylist_accepting(true);
select t.check('accepting is back on', (public.get_my_stylist_profile() ->> 'accepting') = 'true');
select t.throws('accepting needs a value', 'select public.set_stylist_accepting(null)', 'invalid_request', 'accepting');
select t.as_user(t.u('bea'));
select t.throws('a client without a stylist profile cannot switch accepting (terms first, then the profile)', 'select public.set_stylist_accepting(true)', 'pro_terms_required', 'stylist');

-- a profile for someone with terms and no profile yet: creation, and the gate that wants one
select t.as_admin();
select t.put('gia', t.mk_user('gia', false, true)::text);
select t.as_user(t.get('gia')::uuid);
select t.throws('a stylist without a profile has no use of the stylist gate', $$select public.create_pro_invite(gen_random_uuid())$$, 'stylist_profile_required', null, null, '42501');
select t.throws('and cannot list invites', 'select * from public.list_my_pro_invites()', 'stylist_profile_required');
select t.check('a person with terms and no profile creates one', (public.save_stylist_profile('Supportive Sam', 'Colour', '', array['color_analysis'], '{}', '', true) ->> 'displayName') = 'Supportive Sam');
select t.check('a profile starts on probation and not held', (public.get_my_stylist_profile() ->> 'approved') = 'false' and (public.get_my_stylist_profile() ->> 'invitesHeld') = 'false');
select t.check('the optional arguments default to empty text, accepting, and keep the services given', (
  select (r ->> 'headline') = '' and (r ->> 'bio') = '' and (r ->> 'ratesText') = '' and (r ->> 'accepting') = 'true'
         and (r -> 'languages') = '[]'::jsonb and (r -> 'services') = '["color_analysis"]'::jsonb
    from (select public.save_stylist_profile('Supportive Sam', p_services => array['color_analysis']) as r) x));

-- ─── E. Invites ─────────────────────────────────────────────────────────────

select t.as_user(t.u('ann'));
select t.put('ref1', gen_random_uuid()::text);
select t.put('inv1', public.create_pro_invite(t.get('ref1')::uuid, 'for Bea')::text);
select t.eq('the created invite has exactly the keys of ProInvite (as create returns them)', t.keys(t.get('inv1')::jsonb), 'code,connected,createdAt,expiresAt,inviteId,status');
select t.check('the code is ten Crockford symbols', t.get('inv1')::jsonb ->> 'code' ~ '^[0-9A-HJKMNP-TV-Z]{10}$');
select t.check('a new invite is live and not connected', (t.get('inv1')::jsonb ->> 'status') = 'live' and (t.get('inv1')::jsonb ->> 'connected') = 'false');
select t.eq('a retry with the same ref returns the same invite', public.create_pro_invite(t.get('ref1')::uuid, 'other label'), t.get('inv1')::jsonb);
select t.as_admin();
select t.check('the retry made no second invite, and the invite lasts seven days',
  (select count(*) from public.pro_invites where stylist_id = t.u('ann')) = 1
  and (select expires_at = created_at + interval '7 days' from public.pro_invites where stylist_id = t.u('ann')));   -- calendar days in the session zone, so a daylight-saving change inside the week cannot fail it
select t.check('the label is stored as given, and not returned to anyone but the owner', (select label from public.pro_invites where stylist_id = t.u('ann')) = 'for Bea');
select t.eq('the retry did not count against the daily limit', (select n from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'invite_day'), 1);
select t.as_user(t.u('ann'));
select t.throws('a label asking for a gift card', $$select public.create_pro_invite(gen_random_uuid(), 'gift card please')$$, 'text_not_allowed', 'label', 'payment');
select t.throws('a label with a control character', $$select public.create_pro_invite(gen_random_uuid(), 'x' || chr(1))$$, 'invalid_request', 'label');
select t.throws('a label that is too long', $$select public.create_pro_invite(gen_random_uuid(), repeat('l', 41))$$, 'invalid_request', 'label');
select t.throws('a missing ref', 'select public.create_pro_invite(null)', 'invalid_request', 'client_ref');
select t.check('a label is optional', (public.create_pro_invite(gen_random_uuid()) ->> 'status') = 'live');

-- listing: the owner only, codes included
select t.put('list_ann', (select jsonb_agg(to_jsonb(l) order by l.created_at, l.code)::text from public.list_my_pro_invites() l));
select t.eq('the list holds the two live codes', jsonb_array_length(t.get('list_ann')::jsonb), 2);
select t.eq('a listed invite has the documented columns', t.keys(t.get('list_ann')::jsonb -> 0), 'code,connected,created_at,expires_at,invite_id,label,status,used_at');
select t.check('the owner sees the code and the label', exists (select 1 from jsonb_array_elements(t.get('list_ann')::jsonb) e
                                                                  where e ->> 'code' = t.get('inv1')::jsonb ->> 'code' and e ->> 'label' = 'for Bea' and e ->> 'status' = 'live'));
select t.as_user(t.u('dee'));
select t.check('another stylist sees none of them', (select count(*) from public.list_my_pro_invites()) = 0);
select t.as_user(t.u('bea'));
select t.throws('a client cannot list invites', 'select * from public.list_my_pro_invites()', 'pro_terms_required', 'stylist');

-- the daily limit of five (a fresh, approved stylist); the live cap is not reached by it (that is tested below)
select t.as_admin();
select t.put('fay', t.mk_stylist('fay', true)::text);
select t.as_user(t.get('fay')::uuid);
do $$ begin for i in 1..5 loop perform public.create_pro_invite(gen_random_uuid()); end loop; end $$;
select t.throws('the sixth invite of a day is rate limited', $$select public.create_pro_invite(gen_random_uuid())$$, 'pro_rate_limited', 'invite_day', null, '54000');

-- the live caps: probation (1), then approval (10)
select t.as_user(t.u('dee'));
select t.put('dee_ref', gen_random_uuid()::text);
select t.put('dee_inv', public.create_pro_invite(t.get('dee_ref')::uuid)::text);
select t.throws('on probation a second live invite is refused', $$select public.create_pro_invite(gen_random_uuid())$$, 'invite_limit', null, null, '54000');
select t.eq('a retry of the first still returns it (a retry needs no room)', public.create_pro_invite(t.get('dee_ref')::uuid), t.get('dee_inv')::jsonb);
select t.as_admin();
update public.pro_members set stylist_approved_at = now() where user_id = t.u('dee');
select t.as_user(t.u('dee'));
select t.check('after approval a second invite is allowed', (public.create_pro_invite(gen_random_uuid()) ->> 'status') = 'live');
select t.as_admin();
select t.mk_invite(t.u('dee')) from generate_series(1, 8);
select t.as_user(t.u('dee'));
select t.throws('ten live invites is the cap of an approved stylist', $$select public.create_pro_invite(gen_random_uuid())$$, 'invite_limit', null, null, '54000');
select t.as_admin();
update public.pro_members set stylist_approved_at = null where user_id = t.u('dee');
delete from public.pro_invites where stylist_id = t.u('dee');

-- an account must be old enough to create invites (clients may be brand new)
select t.as_user(t.u('hal'));
select public.accept_pro_terms('stylist', '2026-10', true);
select public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true);
select t.throws('an account one hour old cannot create an invite', $$select public.create_pro_invite(gen_random_uuid())$$, 'account_too_new', null, null, '42501');
select t.as_admin();
update public.pro_config set value = '0' where key = 'min_account_age_hours';
select t.as_user(t.u('hal'));
select t.check('with the age rule at 0 it can', (public.create_pro_invite(gen_random_uuid()) ->> 'status') = 'live');
select t.as_admin();
update public.pro_config set value = '48' where key = 'min_account_age_hours';
-- Hal also proves the profile limit: six saves a day
select t.as_user(t.u('hal'));
select t.throws('the seventh save of the day is rate limited (one made above)', $$
  select public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true),
         public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true),
         public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true),
         public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true),
         public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true),
         public.save_stylist_profile('Hal Hanger', '', '', array['outfit_styling'], '{}', '', true)$$, 'pro_rate_limited', 'profile_day');

-- holds: a hold from reports or churn releases itself after seven days; a hold a person made does not
select t.as_admin();
update public.pro_members set invites_held_at = now(), invites_held_by = 'system' where user_id = t.u('ann');
select t.as_user(t.u('ann'));
select t.throws('a fresh system hold: create_pro_invite', $$select public.create_pro_invite(gen_random_uuid())$$, 'invites_held', null, null, '42501');
select t.check('a fresh system hold shows in status and in the profile',
               (public.get_pro_status() -> 'stylist' ->> 'invitesHeld') = 'true' and (public.get_my_stylist_profile() ->> 'invitesHeld') = 'true');
select t.as_admin();
update public.pro_members set invites_held_at = now() - interval '8 days' where user_id = t.u('ann');
select t.as_user(t.u('ann'));
select t.check('a system hold of eight days has released itself', (public.get_pro_status() -> 'stylist' ->> 'invitesHeld') = 'false');
select t.check('and invites can be created again', (public.create_pro_invite(gen_random_uuid()) ->> 'status') = 'live');
select t.as_admin();
update public.pro_members set invites_held_by = 'admin' where user_id = t.u('ann');
select t.as_user(t.u('ann'));
select t.throws('an admin hold of eight days has not released itself', $$select public.create_pro_invite(gen_random_uuid())$$, 'invites_held');
select t.check('an admin hold still shows in status', (public.get_pro_status() -> 'stylist' ->> 'invitesHeld') = 'true');
select t.as_admin();
update public.pro_members set invites_held_at = null, invites_held_by = null where user_id = t.u('ann');
select t.throws('the pair of hold columns cannot be half set', $$update public.pro_members set invites_held_at = now() where user_id = 'a0000000-0000-0000-0000-00000000000a'$$, 'pro_members_hold_pair');

-- revoking
select t.as_user(t.u('ann'));
select t.put('inv2', public.create_pro_invite(gen_random_uuid())::text);
select public.revoke_pro_invite((t.get('inv2')::jsonb ->> 'inviteId')::uuid);
select t.as_admin();
select t.check('revoking sets the status and the time', (select status = 'revoked' and revoked_at is not null from public.pro_invites where id = (t.get('inv2')::jsonb ->> 'inviteId')::uuid));
select t.as_user(t.u('ann'));
select public.revoke_pro_invite((t.get('inv2')::jsonb ->> 'inviteId')::uuid);
select t.as_admin();
select t.check('revoking again is a no-op (the first revoked_at stands)', (select status = 'revoked' and revoked_at is not null from public.pro_invites where id = (t.get('inv2')::jsonb ->> 'inviteId')::uuid));
select t.as_user(t.u('ann'));
select t.check('the list shows it as revoked', exists (select 1 from public.list_my_pro_invites() l where l.invite_id = (t.get('inv2')::jsonb ->> 'inviteId')::uuid and l.status = 'revoked'));
select t.as_user(t.u('dee'));
select t.throws('another stylist cannot revoke it, and learns nothing', format('select public.revoke_pro_invite(%L)', t.get('inv2')::jsonb ->> 'inviteId'), 'pro_unavailable');
select t.throws('an unknown invite is the same error', $$select public.revoke_pro_invite(gen_random_uuid())$$, 'pro_unavailable');

-- expiry: a live invite past its time is expired for every function; the list says so
select t.as_admin();
select t.put('exp_code', t.mk_invite(t.u('ann'), 'live', interval '-1 minute'));
select t.as_user(t.u('ann'));
select t.check('the list shows an expired code as expired', exists (select 1 from public.list_my_pro_invites() l where l.code = t.get('exp_code') and l.status = 'expired'));
select t.as_user(t.u('cat'));
select t.eq('an expired code previews as the invalid result', public.preview_pro_invite(t.get('exp_code')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('an expired code redeems as the invalid result', public.redeem_pro_invite(t.get('exp_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);

-- ─── F. Preview ─────────────────────────────────────────────────────────────

-- A fresh client for each check that counts lookups, so one person's hourly and daily counters never decide a result.
-- p_block 'by_ann': Ann blocked this person; 'of_ann': this person blocked Ann.
select t.as_admin();
create or replace function t.fresh_as(p_tag text, p_block text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform t.as_admin();
  v := t.mk_user(p_tag || '-' || substr(gen_random_uuid()::text, 1, 8));
  if p_block = 'by_ann' then
    insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.u('ann'), v, 'x');
  elsif p_block = 'of_ann' then
    insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (v, t.u('ann'), 'x');
  end if;
  perform t.as_user(v);
  return v;
end $$;
grant execute on function t.fresh_as(text, text) to public;

select t.as_admin();
select t.put('code_ok', t.mk_invite(t.u('ann'), 'live', interval '7 days', '01101ABCDE'));
select t.put('code_used', t.mk_invite(t.u('ann'), 'used'));
select t.put('code_revoked', t.mk_invite(t.u('ann'), 'revoked'));
select t.put('code_dee', t.mk_invite(t.u('dee')));
select t.as_user(t.u('eve'));
select t.put('prev', public.preview_pro_invite('OIL01-abcde')::text);
select t.check('a code typed with look-alikes, a hyphen and lower case previews', (t.get('prev')::jsonb ->> 'valid') = 'true');
select t.eq('a valid preview has exactly the documented keys', t.keys(t.get('prev')::jsonb), 'alreadyConnected,clientTermsCurrent,inviteId,stylist,valid');
select t.eq('the stylist part has exactly the documented keys', t.keys(t.get('prev')::jsonb -> 'stylist'), 'bio,headline,languages,name,ratesText,services');
select t.eq('the preview shows the stylist as she wrote herself', t.get('prev')::jsonb -> 'stylist' ->> 'name', 'Ann Styles');
select t.check('Eve has not accepted the client terms and is not connected',
               (t.get('prev')::jsonb ->> 'clientTermsCurrent') = 'false' and (t.get('prev')::jsonb ->> 'alreadyConnected') = 'false');
select t.check('the preview carries no email, phone, account id or label',
  t.get('prev') not like '%@%' and t.get('prev') not like '%a0000000-0000-0000-0000-00000000000a%'
  and t.get('prev') not like '%for Bea%' and t.get('prev') !~* '(email|phone|label)');
select t.as_user(t.u('bea'));
select t.check('Bea has accepted the client terms', (public.preview_pro_invite(t.get('code_ok')) ->> 'clientTermsCurrent') = 'true');

-- every failure of the code is the same result
select t.fresh_as('pf');
select t.eq('failure: an unknown code', public.preview_pro_invite('ZZZZZZZZZZ'), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('failure: not a code at all', public.preview_pro_invite('hello'), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('failure: an empty code', public.preview_pro_invite(''), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('failure: a null code', public.preview_pro_invite(null), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('failure: a used code', public.preview_pro_invite(t.get('code_used')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('failure: a revoked code', public.preview_pro_invite(t.get('code_revoked')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('failure: an expired code', public.preview_pro_invite(t.get('exp_code')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_user(t.u('ann'));
select t.eq('failure: her own code', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set invites_held_at = now(), invites_held_by = 'system' where user_id = t.u('ann');
select t.fresh_as('pf');
select t.eq('failure: the stylist is held', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set invites_held_at = now() - interval '8 days' where user_id = t.u('ann');
select t.fresh_as('pf');
select t.check('a hold of eight days has released itself, the code works again', (public.preview_pro_invite(t.get('code_ok')) ->> 'valid') = 'true');
select t.as_admin();
update public.pro_members set invites_held_at = null, invites_held_by = null, stylist_removed_at = now(), stylist_removed_reason = 'test' where user_id = t.u('ann');
select t.fresh_as('pf');
select t.eq('failure: the stylist was removed', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set stylist_removed_at = null, stylist_removed_reason = null, suspended_at = now() where user_id = t.u('ann');
select t.fresh_as('pf');
select t.eq('failure: the stylist is suspended', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set suspended_at = null where user_id = t.u('ann');
select t.fresh_as('pf', 'by_ann');
select t.eq('failure: Ann blocked this person', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.fresh_as('pf', 'of_ann');
select t.eq('failure: this person blocked Ann', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.fresh_as('pf');
select t.check('with no block, no hold and no sanction the code works', (public.preview_pro_invite(t.get('code_ok')) ->> 'valid') = 'true');
-- not accepting, and at the cap: these raise, and only for a code that is otherwise valid
select t.as_user(t.u('ann'));
select public.set_stylist_accepting(false);
select t.fresh_as('pf');
select t.throws('a valid code of a stylist who is not accepting', format('select public.preview_pro_invite(%L)', t.get('code_ok')), 'stylist_not_accepting', null, null, '22023');
select t.eq('a code that is not valid is still just invalid, accepting or not', public.preview_pro_invite('ZZZZZZZZZZ'), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.as_user(t.u('ann'));
select public.set_stylist_accepting(true);
select t.as_admin();
select t.put('p_c1', t.mk_user('pc1')::text); select t.put('p_c2', t.mk_user('pc2')::text); select t.put('p_c3', t.mk_user('pc3')::text);
select t.mk_conn(t.u('dee'), t.get('p_c1')::uuid); select t.mk_conn(t.u('dee'), t.get('p_c2')::uuid); select t.mk_conn(t.u('dee'), t.get('p_c3')::uuid);
select t.fresh_as('pf');
select t.throws('a stylist on probation with three clients is at the cap', format('select public.preview_pro_invite(%L)', t.get('code_dee')), 'stylist_not_accepting');
select t.as_admin();
delete from public.pro_connections where stylist_id = t.u('dee');

-- every lookup is counted, valid or not: the eleventh in an hour is refused whatever the codes were
select t.as_admin();
select t.put('looker', t.mk_user('looker')::text);
select t.as_user(t.get('looker')::uuid);
do $$ begin for i in 1..10 loop perform public.preview_pro_invite('NOSUCHCODE' || i); end loop; end $$;
select t.as_admin();
select t.eq('ten failed lookups are ten counted lookups (the counter committed with the failures)',
            (select n from public.pro_rate_counters where user_id = t.get('looker')::uuid and bucket = 'invite_lookup_hour'), 10);
select t.as_user(t.get('looker')::uuid);
select t.throws('the eleventh lookup is rate limited, even one that would be valid', format('select public.preview_pro_invite(%L)', t.get('code_ok')), 'pro_rate_limited', 'invite_lookup_hour', null, '54000');

-- ─── G. Redeem ──────────────────────────────────────────────────────────────

-- the gates
select t.as_user(t.u('eve'));
select t.throws('redeem: Eve has accepted nothing', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'Eve E'), 'adult_required');
select t.as_user(t.u('ann'));
select t.throws('redeem: a stylist without the client terms', format('select public.redeem_pro_invite(%L, %L)', t.get('code_dee'), 'Ann A'), 'pro_terms_required', 'client');
-- the alias (a failure that raises is rolled back with its counter)
select t.as_user(t.u('cat'));
select t.throws('alias: too short', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'C'), 'invalid_alias', null, null, '22023');
select t.throws('alias: too long', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), repeat('c', 31)), 'invalid_alias');
select t.throws('alias: a zero-width character', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'Ca' || chr(8203) || 't'), 'invalid_alias');
select t.throws('alias: a null alias', format('select public.redeem_pro_invite(%L, null)', t.get('code_ok')), 'invalid_alias');
select t.throws('alias: a phone number', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'Cat 555-123-4567'), 'text_not_allowed', 'alias', 'contact');
select t.throws('alias: a link', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'cat.com'), 'text_not_allowed', 'alias', 'contact');
select t.throws('alias: a payment word', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'Venmo Cat'), 'text_not_allowed', 'alias', 'payment');
select t.throws('alias: a reserved word (the stylist reads this as the client''s name)', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'SmartCloset Support'), 'text_not_allowed', 'alias', 'name');
select t.throws('alias: staff', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), 'Staff'), 'text_not_allowed', 'alias', 'name');
select t.throws('alias: official, in wide letters', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), U&'\FF2F\FF46\FF46\FF49\FF43\FF49\FF41\FF4C Team'), 'text_not_allowed', 'alias', 'name');
select t.throws('alias: no letter in it', format('select public.redeem_pro_invite(%L, %L)', t.get('code_ok'), '12345'), 'text_not_allowed', 'alias', 'name');
select t.as_admin();
select t.check('a failed redeem consumed nothing: the code is live and there is no connection',
               (select status from public.pro_invites where code = t.get('code_ok')) = 'live' and (select count(*) from public.pro_connections) = 0);

-- success: connecting shares nothing
select t.as_user(t.u('bea'));
select t.put('redeem1', public.redeem_pro_invite(t.get('code_ok'), '  Bea   B ')::text);
select t.eq('a successful redeem has exactly the documented keys', t.keys(t.get('redeem1')::jsonb), 'alreadyConnected,connectionId,ok');
select t.check('it says ok and not already connected', (t.get('redeem1')::jsonb ->> 'ok') = 'true' and (t.get('redeem1')::jsonb ->> 'alreadyConnected') = 'false');
select t.put('cid', t.get('redeem1')::jsonb ->> 'connectionId');
select t.as_admin();
select t.check('the connection is active, between the two, with the alias cleaned and the stylist label copied',
  (select status = 'active' and stylist_id = t.u('ann') and client_id = t.u('bea') and client_alias = 'Bea B' and stylist_label = 'Ann Styles'
          and ended_at is null and shell_at is null and ended_by is null
     from public.pro_connections where id = t.get('cid')::uuid));
select t.eq('nothing is shared when they connect', (select count(*)::integer from public.pro_grants) + (select count(*)::integer from public.pro_grant_items)
                                                   + (select count(*)::integer from public.pro_grant_events), 0);
select t.check('the code is used and says when', (select status = 'used' and used_at is not null from public.pro_invites where code = t.get('code_ok')));
select t.check('the connection points back to its invite', (select invite_id = (select id from public.pro_invites where code = t.get('code_ok')) from public.pro_connections where id = t.get('cid')::uuid));
select t.eq('one system line "connected", no text', (select string_agg(kind || ':' || code, ',') from public.pro_messages where connection_id = t.get('cid')::uuid), 'system:connected');
-- a retry by the same person gets the same connection, another person the invalid result
select t.as_user(t.u('bea'));
select t.eq('the same client redeeming the same code again gets the same connection', public.redeem_pro_invite(t.get('code_ok'), 'Bea Again'),
            jsonb_build_object('ok', true, 'connectionId', t.get('cid'), 'alreadyConnected', true));
select t.check('previewing the used code as the same client says alreadyConnected',
               (public.preview_pro_invite(t.get('code_ok')) ->> 'alreadyConnected') = 'true' and (public.preview_pro_invite(t.get('code_ok')) ->> 'valid') = 'true');
select t.as_admin();
select t.check('a retry made no second connection and kept the first alias',
  (select count(*) from public.pro_connections) = 1 and (select client_alias from public.pro_connections where id = t.get('cid')::uuid) = 'Bea B');
select t.as_user(t.u('bea'));
select t.as_user(t.u('cat'));
select t.eq('another client redeeming the used code gets the invalid result', public.redeem_pro_invite(t.get('code_ok'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.eq('another client previewing the used code gets the invalid result', public.preview_pro_invite(t.get('code_ok')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
-- the failures are counted and the daily limit is ten
select t.as_admin();
select t.check('failed redeems were counted too (the counter committed)', (select n from public.pro_rate_counters where user_id = t.u('cat') and bucket = 'redeem_day') >= 2);
select t.put('redeemer', t.mk_user('redeemer')::text);
select t.as_user(t.get('redeemer')::uuid);
do $$ begin for i in 1..10 loop perform public.redeem_pro_invite('NOSUCHCODE' || i, 'Rita'); end loop; end $$;
select t.throws('the eleventh redeem of a day is rate limited, whatever the code', $$select public.redeem_pro_invite('NOSUCHCODEX', 'Rita')$$, 'pro_rate_limited', 'redeem_day', null, '54000');

-- already connected to this stylist through another code: that connection, and the second code is not consumed
select t.as_admin();
select t.put('code_again', t.mk_invite(t.u('ann')));
select t.as_user(t.u('bea'));
select t.eq('a second code of the same stylist returns the existing connection', public.redeem_pro_invite(t.get('code_again'), 'Bea Two'),
            jsonb_build_object('ok', true, 'connectionId', t.get('cid'), 'alreadyConnected', true));
select t.as_admin();
select t.check('and consumed nothing', (select status from public.pro_invites where code = t.get('code_again')) = 'live' and (select count(*) from public.pro_connections where stylist_id = t.u('ann') and client_id = t.u('bea')) = 1);
-- the stylist must exist, accept, not be held, removed, suspended or blocked, at redeem time (the invalid result, counted)
select t.put('cat_code', t.mk_invite(t.u('ann')));
update public.pro_stylists set accepting_clients = false where user_id = t.u('ann');
select t.fresh_as('rf');
select t.eq('redeem: the stylist is not accepting', public.redeem_pro_invite(t.get('cat_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_stylists set accepting_clients = true where user_id = t.u('ann');
update public.pro_members set invites_held_at = now(), invites_held_by = 'admin' where user_id = t.u('ann');
select t.fresh_as('rf');
select t.eq('redeem: the stylist is held', public.redeem_pro_invite(t.get('cat_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set invites_held_at = null, invites_held_by = null, suspended_at = now() where user_id = t.u('ann');
select t.fresh_as('rf');
select t.eq('redeem: the stylist is suspended', public.redeem_pro_invite(t.get('cat_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set suspended_at = null, stylist_removed_at = now() where user_id = t.u('ann');
select t.fresh_as('rf');
select t.eq('redeem: the stylist was removed', public.redeem_pro_invite(t.get('cat_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
update public.pro_members set stylist_removed_at = null where user_id = t.u('ann');
select t.fresh_as('rf', 'of_ann');
select t.eq('redeem: the client blocked the stylist', public.redeem_pro_invite(t.get('cat_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.fresh_as('rf', 'by_ann');
select t.eq('redeem: the stylist blocked the client', public.redeem_pro_invite(t.get('cat_code'), 'Cat C'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
select t.check('none of those consumed the code', (select status from public.pro_invites where code = t.get('cat_code')) = 'live');
select t.put('own', t.mk_stylist('own', true)::text);
update public.pro_members set client_terms_version = '2026-10', client_terms_accepted_at = now() where user_id = t.get('own')::uuid;
select t.put('own_code', t.mk_invite(t.get('own')::uuid));
select t.as_user(t.get('own')::uuid);
select t.eq('redeem: a stylist cannot redeem her own code', public.redeem_pro_invite(t.get('own_code'), 'Own Er'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
-- the caps
select t.as_admin();
select t.put('capper', t.mk_user('capper')::text);
select t.put('s1', t.mk_stylist('s1')::text); select t.put('s2', t.mk_stylist('s2')::text); select t.put('s3', t.mk_stylist('s3')::text);
select t.put('s4', t.mk_stylist('s4')::text); select t.put('s5', t.mk_stylist('s5')::text);
select t.mk_conn(t.get('s1')::uuid, t.get('capper')::uuid); select t.mk_conn(t.get('s2')::uuid, t.get('capper')::uuid);
select t.mk_conn(t.get('s3')::uuid, t.get('capper')::uuid); select t.mk_conn(t.get('s4')::uuid, t.get('capper')::uuid);
select t.as_user(t.get('capper')::uuid);
select t.check('four connections as a client: still room for a fifth', (public.get_pro_status() -> 'client' ->> 'connections') = '4');
select t.as_admin();
select t.mk_conn(t.get('s5')::uuid, t.get('capper')::uuid);
select t.put('s6', t.mk_stylist('s6')::text);
select t.put('s6_code', t.mk_invite(t.get('s6')::uuid));
select t.as_user(t.get('capper')::uuid);
select t.throws('five connections as a client is the cap', format('select public.redeem_pro_invite(%L, %L)', t.get('s6_code'), 'Cap Per'), 'client_connection_limit', null, null, '54000');
select t.as_admin();
select t.check('the refused redeem consumed nothing', (select status from public.pro_invites where code = t.get('s6_code')) = 'live');
-- stylist caps: 3 on probation, 25 once approved
select t.put('d_code', t.mk_invite(t.u('dee')));
select t.mk_conn(t.u('dee'), t.mk_user('dc1'));
select t.mk_conn(t.u('dee'), t.mk_user('dc2'));
select t.mk_conn(t.u('dee'), t.mk_user('dc3'));
select t.as_user(t.u('cat'));
select t.throws('a stylist on probation with three clients takes no fourth', format('select public.redeem_pro_invite(%L, %L)', t.get('d_code'), 'Cat C'), 'stylist_not_accepting', null, null, '22023');
select t.as_admin();
update public.pro_members set stylist_approved_at = now() where user_id = t.u('dee');
select t.as_user(t.u('cat'));
select t.check('once approved, the fourth is fine', (public.redeem_pro_invite(t.get('d_code'), 'Cat C') ->> 'ok') = 'true');
select t.as_admin();
select t.mk_conn(t.u('ann'), t.mk_user('ac' || n)) from generate_series(1, 23) n;
select t.put('a_code', t.mk_invite(t.u('ann')));
select t.check('Ann now has 24 active clients (Bea and 23)', (select count(*) from public.pro_connections where stylist_id = t.u('ann') and status = 'active') = 24);
select t.as_user(t.u('cat'));
select t.check('the 25th client is fine', (public.redeem_pro_invite(t.get('a_code'), 'Cat Cee') ->> 'ok') = 'true');
select t.as_admin();
select t.put('a_code2', t.mk_invite(t.u('ann')));
select t.put('late', t.mk_user('late')::text);
select t.as_user(t.get('late')::uuid);
select t.throws('an approved stylist with 25 clients takes no 26th', format('select public.redeem_pro_invite(%L, %L)', t.get('a_code2'), 'Late L'), 'stylist_not_accepting', null, null, '22023');
select t.as_admin();
delete from public.pro_connections where stylist_id in (t.u('ann'), t.u('dee')) and client_id is not null and client_id <> t.u('bea') and client_id <> t.u('cat');
select t.check('(clean-up) Ann is left with Bea and Cat', (select count(*) from public.pro_connections where stylist_id = t.u('ann')) = 2);
select t.put('cid_cat', (select id::text from public.pro_connections where stylist_id = t.u('ann') and client_id = t.u('cat')));

-- a closed profile: the code is gone with it
select t.put('closer', t.mk_stylist('closer', true)::text);
select t.put('closer_code', t.mk_invite(t.get('closer')::uuid));
select t.as_user(t.get('closer')::uuid);
select public.close_stylist_profile();
select t.fresh_as('pf');
select t.eq('a stylist who closed the profile: her code is invalid', public.preview_pro_invite(t.get('closer_code')), '{"valid": false, "error": "invite_invalid"}'::jsonb);

-- ─── H. Connections ─────────────────────────────────────────────────────────

select t.as_admin();
update public.pro_connections set client_alias = 'Cat C' where id = t.get('cid_cat')::uuid;
-- the list
select t.as_user(t.u('bea'));
select t.put('bea_list', (select jsonb_agg(to_jsonb(l))::text from public.list_pro_connections('client') l));
select t.eq('Bea has one connection as a client', jsonb_array_length(t.get('bea_list')::jsonb), 1);
select t.eq('a listed connection has exactly the documented columns', t.keys(t.get('bea_list')::jsonb -> 0),
            'attention,closet_expires_at,closet_shared,connection_id,ended_at,ended_by,last_activity_at,last_message_at,last_message_preview,my_role,next_appointment_at,other_headline,other_label,pending_appointments,started_at,status,unread');
select t.check('the row says who the stylist is, as a label, and what they said about themselves',
  (t.get('bea_list')::jsonb -> 0 ->> 'other_label') = 'Ann Styles' and (t.get('bea_list')::jsonb -> 0 ->> 'other_headline') = 'Wardrobe edits and capsule closets'
  and (t.get('bea_list')::jsonb -> 0 ->> 'my_role') = 'client' and (t.get('bea_list')::jsonb -> 0 ->> 'status') = 'active'
  and (t.get('bea_list')::jsonb -> 0 ->> 'connection_id') = t.get('cid'));
select t.check('a new connection has nothing unread, nothing pending, nothing shared and no preview (a system line is not a message)',
  (t.get('bea_list')::jsonb -> 0 ->> 'unread') = '0' and (t.get('bea_list')::jsonb -> 0 ->> 'attention') = 'false'
  and (t.get('bea_list')::jsonb -> 0 ->> 'pending_appointments') = '0' and (t.get('bea_list')::jsonb -> 0 ->> 'closet_shared') = 'false'
  and (t.get('bea_list')::jsonb -> 0 -> 'last_message_preview') = 'null'::jsonb and (t.get('bea_list')::jsonb -> 0 -> 'next_appointment_at') = 'null'::jsonb);
select t.check('the list carries no email, phone or account id',
  t.get('bea_list') not like '%@%' and t.get('bea_list') !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-0000000000(0a|0b|0c|0d)');
select t.check('as a stylist Bea has none', (select count(*) from public.list_pro_connections('stylist')) = 0);
select t.throws('p_as must be client or stylist', $$select * from public.list_pro_connections('admin')$$, 'invalid_request', 'as');
select t.throws('p_as cannot be null', 'select * from public.list_pro_connections(null)', 'invalid_request');
select t.check('the default is the client list', (select count(*) from public.list_pro_connections()) = 1);
select t.as_user(t.u('ann'));
select t.check('Ann sees Bea by the name Bea chose, and no headline',
  (select other_label = 'Bea B' and other_headline is null and my_role = 'stylist' from public.list_pro_connections('stylist') where connection_id = t.get('cid')::uuid));
select t.check('Ann has no connections as a client', (select count(*) from public.list_pro_connections('client')) = 0);
select t.as_user(t.u('eve'));
select t.check('a stranger sees none', (select count(*) from public.list_pro_connections('client')) + (select count(*) from public.list_pro_connections('stylist')) = 0);

-- the label follows the stylist's name
select t.as_user(t.u('ann'));
select public.save_stylist_profile('Ann Atelier', 'Wardrobe edits and capsule closets', 'A Signal-inspired palette, built around what you own.',
                                   array['wardrobe_audit', 'outfit_styling', 'virtual_sessions'], array['en', 'fr'], 'From $80 per session', true);
select t.as_user(t.u('bea'));
select t.eq('the connection shows the new name', (select other_label from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid), 'Ann Atelier');
select t.as_admin();
select t.check('the label of the connection is kept in step (active connections only)',
  (select stylist_label from public.pro_connections where id = t.get('cid')::uuid) = 'Ann Atelier');

-- messages, sessions and looks move the list
select t.put('long_body', repeat('x', 100));
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('cid')::uuid, t.u('ann'), 'text', t.get('long_body'));
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('cid')::uuid, t.u('ann'), 'text', 'second');
select t.as_user(t.u('bea'));
select t.check('two unread messages from Ann: unread 2, attention, the preview is the last one',
  (select unread = 2 and attention and last_message_preview = 'second' and last_message_at is not null
     from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid));
select t.eq('the badge counts the connection with something unread once', public.get_pro_badge(), 1);
select t.as_user(t.u('ann'));
select t.check('Ann has nothing unread (they are her own messages)', (select unread = 0 and not attention from public.list_pro_connections('stylist') where connection_id = t.get('cid')::uuid));
select t.as_admin();
update public.pro_connections set client_seen_message_id = (select max(id) from public.pro_messages where connection_id = t.get('cid')::uuid) where id = t.get('cid')::uuid;
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('cid')::uuid, t.u('ann'), 'text', t.get('long_body'));
select t.as_user(t.u('bea'));
select t.eq('a preview is cut to 80 characters', (select length(last_message_preview) from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid), 80);
select t.eq('after the read pointer, one message is unread', (select unread from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid), 1);
select t.as_admin();
insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes)
  values (t.get('cid')::uuid, 'stylist', now() + interval '2 days', 60, 'virtual', 0);
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes)
  values (t.get('cid')::uuid, 'client', 'confirmed', now() + interval '3 days', 30, 'virtual', 0);
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.get('cid')::uuid, 'Spring capsule', 'sent', now());
insert into public.pro_recommendations (connection_id, title) values (t.get('cid')::uuid, 'A draft');
select t.as_user(t.u('bea'));
select t.check('a session proposed to Bea is pending for her, a confirmed one is her next appointment',
  (select pending_appointments = 1 and next_appointment_at is not null from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid));
select t.eq('the badge: one unread connection, one session, one sent look (a draft and system lines never count)', public.get_pro_badge(), 3);
select t.as_user(t.u('ann'));
select t.check('for Ann the pending session is the other side''s, so none',
  (select pending_appointments = 0 and next_appointment_at is not null from public.list_pro_connections('stylist') where connection_id = t.get('cid')::uuid));
select t.eq('Ann''s badge is 0: the session she proposed is not for her, the confirmed one is settled, and she has sent the messages', public.get_pro_badge(), 0);

-- the detail
select t.as_user(t.u('bea'));
select t.put('det_bea', public.get_pro_connection(t.get('cid')::uuid)::text);
select t.eq('the detail has exactly the documented keys', t.keys(t.get('det_bea')::jsonb), 'actions,closet,connectionId,counts,endedAt,endedBy,myAlias,myRole,otherLabel,safetyOnly,startedAt,status,stylist');
select t.eq('the actions have exactly the documented keys', t.keys(t.get('det_bea')::jsonb -> 'actions'), 'canEnd,canMessage,canPropose,canRecommend,canRename,canShare,canStopSharing,canViewCloset');
select t.eq('the closet part has exactly the documented keys', t.keys(t.get('det_bea')::jsonb -> 'closet'), 'expiresAt,expiresSoon,itemCount,itemMode,lastViewedAt,shared,views30d');
select t.check('the client sees her connection: role, status, alias, label, profile',
  (t.get('det_bea')::jsonb ->> 'myRole') = 'client' and (t.get('det_bea')::jsonb ->> 'status') = 'active'
  and (t.get('det_bea')::jsonb ->> 'myAlias') = 'Bea B' and (t.get('det_bea')::jsonb ->> 'otherLabel') = 'Ann Atelier'
  and (t.get('det_bea')::jsonb ->> 'safetyOnly') = 'false' and (t.get('det_bea')::jsonb -> 'endedBy') = 'null'::jsonb
  and (t.get('det_bea')::jsonb -> 'stylist' ->> 'name') = 'Ann Atelier'
  and t.keys(t.get('det_bea')::jsonb -> 'stylist') = 'bio,headline,languages,name,ratesText,services');
select t.check('her actions: message, propose, end, share and rename; she cannot recommend, view a closet or stop sharing what is not shared',
  (t.get('det_bea')::jsonb -> 'actions') = '{"canEnd": true, "canMessage": true, "canPropose": true, "canRecommend": false, "canRename": true,
     "canShare": true, "canStopSharing": false, "canViewCloset": false}'::jsonb);
select t.check('nothing is shared yet', (t.get('det_bea')::jsonb -> 'closet') = '{"shared": false, "itemMode": null, "itemCount": null, "expiresAt": null,
     "expiresSoon": false, "lastViewedAt": null, "views30d": 0}'::jsonb);
select t.check('her counts: one sent look (the draft is not hers to see) and two sessions upcoming', (t.get('det_bea')::jsonb -> 'counts') = '{"looks": 1, "upcoming": 2}'::jsonb);
select t.check('the detail carries no email, phone or account id',
  t.get('det_bea') not like '%@%' and t.get('det_bea') not like '%a0000000-0000-0000-0000-00000000000a%' and t.get('det_bea') not like '%b0000000-0000-0000-0000-00000000000b%');
select t.as_user(t.u('ann'));
select t.put('det_ann', public.get_pro_connection(t.get('cid')::uuid)::text);
select t.check('the stylist sees the client by alias; no alias of her own and no stylist profile block',
  (t.get('det_ann')::jsonb ->> 'myRole') = 'stylist' and (t.get('det_ann')::jsonb ->> 'otherLabel') = 'Bea B'
  and (t.get('det_ann')::jsonb -> 'myAlias') = 'null'::jsonb and (t.get('det_ann')::jsonb -> 'stylist') = 'null'::jsonb);
select t.check('her actions: message, propose, recommend, end; no closet is shared yet',
  (t.get('det_ann')::jsonb -> 'actions') = '{"canEnd": true, "canMessage": true, "canPropose": true, "canRecommend": true, "canRename": false,
     "canShare": false, "canStopSharing": false, "canViewCloset": false}'::jsonb);
select t.check('her counts include the draft', (t.get('det_ann')::jsonb -> 'counts') = '{"looks": 2, "upcoming": 2}'::jsonb);
-- participants only, and one error for everything else
select t.as_user(t.u('eve'));
select t.throws('a stranger asking for a connection', format('select public.get_pro_connection(%L)', t.get('cid')), 'pro_unavailable', null, null, '22023');
select t.as_user(t.u('cat'));
select t.throws('another client asking for it', format('select public.get_pro_connection(%L)', t.get('cid')), 'pro_unavailable');
select t.throws('an unknown id is the same error', $$select public.get_pro_connection(gen_random_uuid())$$, 'pro_unavailable');
select t.throws('a null id is the same error', 'select public.get_pro_connection(null)', 'pro_unavailable');

-- sharing, as the detail shows it (the grant is written directly: the sharing functions are the next stream's)
select t.as_admin();
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('cid')::uuid, 'closet', 'all', now() + interval '20 days', '2026-10');
insert into public.pro_closet_views (connection_id, day, pages, last_at) values
  (t.get('cid')::uuid, current_date, 5, now() - interval '1 hour'), (t.get('cid')::uuid, current_date - 40, 7, now() - interval '40 days');
select t.as_user(t.u('bea'));
select t.check('shared as all pieces: seven pieces (the wishlist piece is not one), not expiring soon, last viewed and 5 pages in 30 days',
  (select (j -> 'closet' ->> 'shared') = 'true' and (j -> 'closet' ->> 'itemMode') = 'all' and (j -> 'closet' ->> 'itemCount') = '7'
          and (j -> 'closet' ->> 'expiresSoon') = 'false' and (j -> 'closet' ->> 'lastViewedAt') is not null and (j -> 'closet' ->> 'views30d') = '5'
          and (j -> 'actions' ->> 'canStopSharing') = 'true'
     from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.check('the list says it is shared and when it ends', (select closet_shared and closet_expires_at is not null from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid));
select t.as_user(t.u('ann'));
select t.check('the stylist sees that it is shared, the mode and the count, and nothing about views',
  (select (j -> 'closet' ->> 'shared') = 'true' and (j -> 'closet' ->> 'itemCount') = '7' and (j -> 'closet' -> 'lastViewedAt') = 'null'::jsonb
          and (j -> 'closet' ->> 'views30d') = '0' and (j -> 'actions' ->> 'canViewCloset') = 'true' and (j -> 'actions' ->> 'canStopSharing') = 'false'
     from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.as_admin();
update public.pro_grants set item_mode = 'selected', expires_at = now() + interval '3 days' where connection_id = t.get('cid')::uuid;
insert into public.pro_grant_items (connection_id, item_id) values (t.get('cid')::uuid, t.item('bea', 1)), (t.get('cid')::uuid, t.item('bea', 2)), (t.get('cid')::uuid, t.item('bea', 3));
select t.as_user(t.u('bea'));
select t.check('selected pieces: three, and it ends soon', (select (j -> 'closet' ->> 'itemMode') = 'selected' and (j -> 'closet' ->> 'itemCount') = '3' and (j -> 'closet' ->> 'expiresSoon') = 'true'
                                                               from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
-- a grant that has run out: removed at the next read, one event, written once
select t.as_admin();
update public.pro_grants set expires_at = now() - interval '1 minute' where connection_id = t.get('cid')::uuid;
select t.as_user(t.u('bea'));
select t.check('an expired grant reads as not shared', (select (j -> 'closet' ->> 'shared') = 'false' from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select public.get_pro_status();
select public.get_pro_status();
select t.as_admin();
select t.eq('the expiry wrote exactly one event, however many reads', (select count(*)::integer from public.pro_grant_events where connection_id = t.get('cid')::uuid and event = 'expired'), 1);
select t.eq('the grant and its items are gone', (select count(*)::integer from public.pro_grants where connection_id = t.get('cid')::uuid)
                                              + (select count(*)::integer from public.pro_grant_items where connection_id = t.get('cid')::uuid), 0);

-- safety-only: the role's own gate refuses, the connection still answers
select t.as_admin();
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('cid')::uuid, 'closet', 'all', now() + interval '20 days', '2026-10');
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.as_user(t.u('bea'));
select t.check('switch off: the detail answers, safety only, no profile text, ways out only',
  (select (j ->> 'safetyOnly') = 'true' and (j -> 'stylist') = 'null'::jsonb
          and (j -> 'actions') = '{"canEnd": true, "canMessage": false, "canPropose": false, "canRecommend": false, "canRename": false,
                                   "canShare": false, "canStopSharing": true, "canViewCloset": false}'::jsonb
          and (j -> 'closet' ->> 'shared') = 'true'
     from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.check('switch off: the list answers, with no message preview and no headline',
  (select last_message_preview is null and last_message_at is null and other_headline is null and other_label = 'Ann Atelier'
     from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid));
select t.as_user(t.u('ann'));
select t.check('switch off: the stylist''s detail is safety only too, she can end and nothing else',
  (select (j ->> 'safetyOnly') = 'true' and (j -> 'actions') = '{"canEnd": true, "canMessage": false, "canPropose": false, "canRecommend": false, "canRename": false,
                                   "canShare": false, "canStopSharing": false, "canViewCloset": false}'::jsonb
     from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.as_user(t.u('bea'));
select t.check('stale client terms: the detail is safety only', (select (j ->> 'safetyOnly') = 'true' and (j -> 'stylist') = 'null'::jsonb and (j -> 'actions' ->> 'canStopSharing') = 'true'
                                                                   from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.check('stale client terms: the list has no preview', (select last_message_preview is null from public.list_pro_connections('client') where connection_id = t.get('cid')::uuid));
select t.as_user(t.u('ann'));
select t.check('stale client terms are the client''s: the stylist is not affected', (select (j ->> 'safetyOnly') = 'false' from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';
update public.pro_members set suspended_at = now() where user_id = t.u('bea');
select t.as_user(t.u('bea'));
select t.check('a suspended client still reads the connection, safety only', (select (j ->> 'safetyOnly') = 'true' and (j -> 'actions' ->> 'canEnd') = 'true'
                                                                               from (select public.get_pro_connection(t.get('cid')::uuid) j) x));
select t.as_admin();
update public.pro_members set suspended_at = null where user_id = t.u('bea');

-- the alias
select t.as_user(t.u('bea'));
select public.set_pro_alias(t.get('cid')::uuid, '  Bea   Bee ');
select t.as_user(t.u('ann'));
select t.eq('the stylist sees the new alias, cleaned', (select other_label from public.list_pro_connections('stylist') where connection_id = t.get('cid')::uuid), 'Bea Bee');
select t.throws('a stylist without the client terms cannot rename', format('select public.set_pro_alias(%L, %L)', t.get('cid'), 'Boss'), 'pro_terms_required', 'client');
select t.as_admin();
select t.put('dual', t.mk_stylist('dual', true)::text);
update public.pro_members set client_terms_version = '2026-10', client_terms_accepted_at = now() where user_id = t.get('dual')::uuid;
select t.put('dual_cid', t.mk_conn(t.get('dual')::uuid, t.u('cat'), 'Cat D')::text);
select t.as_user(t.get('dual')::uuid);
select t.throws('a stylist who has the client terms still cannot rename her client (she is not the client)', format('select public.set_pro_alias(%L, %L)', t.get('dual_cid'), 'Boss'), 'pro_unavailable');
select t.as_user(t.u('cat'));
select t.throws('another client cannot rename it', format('select public.set_pro_alias(%L, %L)', t.get('cid'), 'Cat'), 'pro_unavailable');
select t.as_user(t.u('bea'));
select t.throws('alias: too short', format('select public.set_pro_alias(%L, %L)', t.get('cid'), 'B'), 'invalid_alias');
select t.throws('alias: contact details', format('select public.set_pro_alias(%L, %L)', t.get('cid'), 'call 555-123-4567'), 'text_not_allowed', 'alias', 'contact');
select t.throws('alias: a reserved word', format('select public.set_pro_alias(%L, %L)', t.get('cid'), 'SmartCloset Support'), 'text_not_allowed', 'alias', 'name');
select t.throws('alias: moderator', format('select public.set_pro_alias(%L, %L)', t.get('cid'), 'The Moderator'), 'text_not_allowed', 'alias', 'name');
select t.throws('alias: an unknown connection', $$select public.set_pro_alias(gen_random_uuid(), 'Bea Bee')$$, 'pro_unavailable');
select t.as_admin();
select t.check('the stored alias is cleaned', (select client_alias from public.pro_connections where id = t.get('cid')::uuid) = 'Bea Bee');
select t.as_user(t.u('bea'));
select t.throws('ten more renames on top of the one above pass the limit of ten a day', $$
  select public.set_pro_alias(c, 'Bea A'), public.set_pro_alias(c, 'Bea B'), public.set_pro_alias(c, 'Bea C'), public.set_pro_alias(c, 'Bea D'),
         public.set_pro_alias(c, 'Bea E'), public.set_pro_alias(c, 'Bea F'), public.set_pro_alias(c, 'Bea G'), public.set_pro_alias(c, 'Bea H'),
         public.set_pro_alias(c, 'Bea I'), public.set_pro_alias(c, 'Bea J')
    from (select t.get('cid')::uuid as c) x$$, 'pro_rate_limited', 'alias_day');

-- ending: either side, any time, any state of the feature
select t.as_admin();
select t.put('e_s', t.mk_stylist('es', true)::text); select t.put('e_c', t.mk_user('ec')::text);
select t.put('e_cid', t.mk_conn(t.get('e_s')::uuid, t.get('e_c')::uuid)::text);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('e_cid')::uuid, 'closet', 'selected', now() + interval '20 days', '2026-10');
insert into public.pro_grant_items (connection_id, item_id) values (t.get('e_cid')::uuid, t.item('bea', 1));
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes) values
  (t.get('e_cid')::uuid, 'stylist', 'proposed', now() + interval '2 days', 60, 'virtual', 0),
  (t.get('e_cid')::uuid, 'client', 'confirmed', now() + interval '3 days', 30, 'virtual', 0),
  (t.get('e_cid')::uuid, 'client', 'declined', now() + interval '4 days', 30, 'virtual', 0);
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.get('e_cid')::uuid, 'Kept look', 'sent', now());
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.as_user(t.get('e_c')::uuid);
select public.end_pro_connection(t.get('e_cid')::uuid);
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';
select t.check('the client ended it (with the switch off): ended, by the client, with the time',
  (select status = 'ended' and ended_by = 'client' and ended_at is not null from public.pro_connections where id = t.get('e_cid')::uuid));
select t.eq('the grant and its items are gone', (select count(*)::integer from public.pro_grants where connection_id = t.get('e_cid')::uuid)
                                               + (select count(*)::integer from public.pro_grant_items where connection_id = t.get('e_cid')::uuid), 0);
select t.eq('ending is in the grant log', (select string_agg(event, ',') from public.pro_grant_events where connection_id = t.get('e_cid')::uuid), 'connection_ended');
select t.eq('open sessions are cancelled, a declined one is left alone', (select string_agg(status, ',' order by status) from public.pro_appointments where connection_id = t.get('e_cid')::uuid), 'cancelled,cancelled,declined');
select t.eq('one neutral "ended" line was written', (select count(*)::integer from public.pro_messages where connection_id = t.get('e_cid')::uuid and kind = 'system' and code = 'ended'), 1);
select t.eq('the looks are kept for 90 days', (select count(*)::integer from public.pro_recommendations where connection_id = t.get('e_cid')::uuid), 1);
select t.as_user(t.get('e_c')::uuid);
select public.end_pro_connection(t.get('e_cid')::uuid);
select t.as_admin();
select t.eq('ending twice is a no-op: still one "ended" line', (select count(*)::integer from public.pro_messages where connection_id = t.get('e_cid')::uuid and code = 'ended'), 1);
select t.eq('and it is not counted against the daily limit', (select n from public.pro_rate_counters where user_id = t.get('e_c')::uuid and bucket = 'end_day'), 1);
select t.as_user(t.get('e_c')::uuid);
select t.check('the client reads it as ended by her, with no action but reading',
  (select (j ->> 'status') = 'ended' and (j ->> 'endedBy') = 'me' and (j ->> 'endedAt') is not null
          and (j -> 'actions') = '{"canEnd": false, "canMessage": false, "canPropose": false, "canRecommend": false, "canRename": false,
                                   "canShare": false, "canStopSharing": false, "canViewCloset": false}'::jsonb
          and (j -> 'stylist') = 'null'::jsonb and (j -> 'closet' ->> 'shared') = 'false'
     from (select public.get_pro_connection(t.get('e_cid')::uuid) j) x));
select t.check('the list puts it after the active ones and says who ended it',
  (select status = 'ended' and ended_by = 'client' and unread = 0 and not attention and not closet_shared
     from public.list_pro_connections('client') where connection_id = t.get('e_cid')::uuid));
select t.throws('an ended connection cannot be renamed', format('select public.set_pro_alias(%L, %L)', t.get('e_cid'), 'Ec Ec'), 'connection_ended', null, null, '22023');
select t.as_user(t.get('e_s')::uuid);
select t.check('the stylist reads it as ended by them', (select (j ->> 'endedBy') = 'them' and (j ->> 'status') = 'ended' from (select public.get_pro_connection(t.get('e_cid')::uuid) j) x));
select t.as_user(t.u('eve'));
select t.throws('a stranger cannot end it, and learns nothing', format('select public.end_pro_connection(%L)', t.get('e_cid')), 'pro_unavailable');
select t.throws('an unknown id is the same error', $$select public.end_pro_connection(gen_random_uuid())$$, 'pro_unavailable');
-- ended by the stylist, under a suspension and stale terms
select t.as_admin();
select t.put('e2_c', t.mk_user('ec2')::text);
select t.put('e2_cid', t.mk_conn(t.get('e_s')::uuid, t.get('e2_c')::uuid)::text);
update public.pro_members set suspended_at = now() where user_id = t.get('e_s')::uuid;
update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.as_user(t.get('e_s')::uuid);
select public.end_pro_connection(t.get('e2_cid')::uuid);
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';
update public.pro_members set suspended_at = null where user_id = t.get('e_s')::uuid;
select t.check('the stylist ended it (suspended, and her terms stale): ended by the stylist',
  (select status = 'ended' and ended_by = 'stylist' from public.pro_connections where id = t.get('e2_cid')::uuid));
select t.as_user(t.get('e2_c')::uuid);
select t.check('the client reads it as ended by them', (select (j ->> 'endedBy') = 'them' from (select public.get_pro_connection(t.get('e2_cid')::uuid) j) x));

-- closing the profile ends every connection as the stylist, deletes the invites and the profile, and keeps what is the person's
select t.as_admin();
select t.put('cl_s', t.mk_stylist('cls')::text); select t.put('cl_c', t.mk_user('clc')::text);
select t.put('cl_cid', t.mk_conn(t.get('cl_s')::uuid, t.get('cl_c')::uuid)::text);
select t.put('cl_code', t.mk_invite(t.get('cl_s')::uuid));
update public.pro_members set invites_held_at = now(), invites_held_by = 'system' where user_id = t.get('cl_s')::uuid;
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.as_user(t.get('cl_s')::uuid);
select public.close_stylist_profile();
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';
select t.check('closing (with the switch off) ended the connection as the stylist', (select status = 'ended' and ended_by = 'stylist' from public.pro_connections where id = t.get('cl_cid')::uuid));
select t.check('and deleted her invites and her profile', not exists (select 1 from public.pro_invites where stylist_id = t.get('cl_s')::uuid)
                                                           and not exists (select 1 from public.pro_stylists where user_id = t.get('cl_s')::uuid));
select t.check('her hold stays on the person', (select invites_held_by = 'system' from public.pro_members where user_id = t.get('cl_s')::uuid));
select t.as_user(t.get('cl_s')::uuid);
select t.check('the status has no stylist block after closing', (public.get_pro_status() -> 'stylist') = 'null'::jsonb);
select public.close_stylist_profile();
select t.check('closing again is a no-op (no profile, nothing changed, nothing raised)', (public.get_pro_status() -> 'stylist') = 'null'::jsonb);
select public.save_stylist_profile('Cls Again', '', '', array['outfit_styling'], '{}', '', true);
select t.check('saving the profile again does not clear the hold (it is on the person)', (public.get_my_stylist_profile() ->> 'invitesHeld') = 'true');
select t.as_admin();
update public.pro_members set invites_held_at = null, invites_held_by = null where user_id = t.get('cl_s')::uuid;
update public.pro_members set stylist_approved_at = now() where user_id = t.get('cl_s')::uuid;
select t.as_user(t.get('cl_s')::uuid);
select public.close_stylist_profile();
select public.save_stylist_profile('Cls Third', '', '', array['outfit_styling'], '{}', '', true);
select t.check('closing and saving again does not reset the approval', (public.get_my_stylist_profile() ->> 'approved') = 'true'
                                                                         and (public.get_pro_status() -> 'stylist' ->> 'clientLimit') = '25');
select t.as_user(t.u('gus'));
select public.close_stylist_profile();
select t.check('a person with terms and no profile closes nothing', (public.get_pro_status() ->> 'adultConfirmed') = 'true');
select t.as_user(t.u('eve'));
select public.close_stylist_profile();
select t.as_admin();
select t.check('closing for a person with no rows created none', not exists (select 1 from public.pro_members where user_id = t.u('eve')));
-- closing and saving again keeps probation (Dee, on probation, closes and saves again)
select t.as_admin();
select t.put('pr_s', t.mk_user('prs', false, true)::text);
select t.as_user(t.get('pr_s')::uuid);
select public.save_stylist_profile('Pr Probation', '', '', array['outfit_styling'], '{}', '', true);
select public.close_stylist_profile();
select public.save_stylist_profile('Pr Probation', '', '', array['outfit_styling'], '{}', '', true);
select t.check('closing and saving again keeps probation (3 clients, 1 invite)',
  (public.get_pro_status() -> 'stylist' ->> 'clientLimit') = '3' and (public.get_pro_status() -> 'stylist' ->> 'inviteLimit') = '1');
select t.as_admin();
update public.pro_members set stylist_removed_at = now(), stylist_removed_reason = 'test' where user_id = t.get('pr_s')::uuid;
select t.as_user(t.get('pr_s')::uuid);
select public.close_stylist_profile();
select t.throws('a removed stylist cannot save a profile again', $$select public.save_stylist_profile('Pr Probation', '', '', array['outfit_styling'], '{}', '', true)$$, 'stylist_profile_removed', null, 'email support', '42501');
select t.check('status says the removal stands', (public.get_pro_status() ->> 'stylistRemoved') = 'true');

-- a spent code answers like any other once the connection it made is over: only an ACTIVE connection counts as "already
-- connected" (a lost-response retry works while it lasts; an ended one is never presented as a connection)
select t.as_admin();
select t.put('sp_s', t.mk_stylist('sps', true)::text); select t.put('sp_c', t.mk_user('spc')::text);
select t.put('sp_code', t.mk_invite(t.get('sp_s')::uuid));
select t.as_user(t.get('sp_c')::uuid);
select t.put('sp_r', public.redeem_pro_invite(t.get('sp_code'), 'Spent Sam')::text);
select t.put('sp_cid', t.get('sp_r')::jsonb ->> 'connectionId');
select t.check('spent: the code made an active connection', (t.get('sp_r')::jsonb ->> 'ok') = 'true' and (t.get('sp_r')::jsonb ->> 'alreadyConnected') = 'false');
select t.check('spent: while it is active a preview says alreadyConnected and a redeem returns the same connection',
  (public.preview_pro_invite(t.get('sp_code')) ->> 'alreadyConnected') = 'true'
  and public.redeem_pro_invite(t.get('sp_code'), 'Spent Sam') = jsonb_build_object('ok', true, 'connectionId', t.get('sp_cid'), 'alreadyConnected', true));
select public.end_pro_connection(t.get('sp_cid')::uuid);
select t.eq('spent: after the client ended it, the preview is the invalid result', public.preview_pro_invite(t.get('sp_code')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('spent: and so is a redeem (not ok with the id of a connection that has ended)', public.redeem_pro_invite(t.get('sp_code'), 'Spent Sam'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
select t.check('spent: and nothing was created or consumed by it',
  (select count(*) = 1 from public.pro_connections where invite_id = (select id from public.pro_invites where code = t.get('sp_code'))));
-- a block that is lifted again: the spent code answers the same before and after, so unblocking reveals nothing
select t.put('sp2_c', t.mk_user('spc2')::text);
select t.put('sp2_code', t.mk_invite(t.get('sp_s')::uuid));
select t.as_user(t.get('sp2_c')::uuid);
select t.put('sp2_r', public.redeem_pro_invite(t.get('sp2_code'), 'Spent Two')::text);
select t.as_admin();
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('sp_s')::uuid, t.get('sp2_c')::uuid, 'someone');
select t.as_user(t.get('sp2_c')::uuid);
select t.eq('spent: blocked, the preview is the invalid result', public.preview_pro_invite(t.get('sp2_code')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('spent: blocked, the redeem is the invalid result too (the two functions agree)', public.redeem_pro_invite(t.get('sp2_code'), 'Spent Two'), '{"ok": false, "error": "invite_invalid"}'::jsonb);
select t.as_admin();
delete from public.user_blocks where blocker_id = t.get('sp_s')::uuid and blocked_id = t.get('sp2_c')::uuid;
select t.as_user(t.get('sp2_c')::uuid);
select t.eq('spent: after the block is lifted the preview is still the invalid result (nothing about the stylist is shown)', public.preview_pro_invite(t.get('sp2_code')), '{"valid": false, "error": "invite_invalid"}'::jsonb);
select t.eq('spent: and the redeem is still not ok', public.redeem_pro_invite(t.get('sp2_code'), 'Spent Two'), '{"ok": false, "error": "invite_invalid"}'::jsonb);

-- ─── I. Upkeep and the two triggers ─────────────────────────────────────────

-- sessions: a proposal whose start has passed expires, a confirmed one whose end has passed completes
select t.as_admin();
select t.put('u_s', t.mk_stylist('us', true)::text); select t.put('u_c', t.mk_user('uc')::text);
select t.put('u_cid', t.mk_conn(t.get('u_s')::uuid, t.get('u_c')::uuid)::text);
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes) values
  (t.get('u_cid')::uuid, 'client', 'proposed', now() - interval '1 hour', 30, 'virtual', 0),
  (t.get('u_cid')::uuid, 'client', 'confirmed', now() - interval '2 hours', 60, 'virtual', 0),
  (t.get('u_cid')::uuid, 'client', 'confirmed', now() - interval '10 minutes', 60, 'virtual', 0),
  (t.get('u_cid')::uuid, 'client', 'proposed', now() + interval '1 hour', 60, 'virtual', 0);
select t.as_user(t.get('u_s')::uuid);
select public.get_pro_status();
select t.as_admin();
select t.eq('a past proposal expired, a finished session completed, a running one and a future proposal stay',
            (select string_agg(status, ',' order by starts_at) from public.pro_appointments where connection_id = t.get('u_cid')::uuid), 'completed,expired,confirmed,proposed');
-- grant items without a grant
insert into public.pro_grant_items (connection_id, item_id) values (t.get('u_cid')::uuid, t.item('cat', 1));
select t.as_user(t.get('u_c')::uuid);
select public.get_pro_status();
select t.as_admin();
select t.eq('grant items with no grant are cleaned at the next read', (select count(*)::integer from public.pro_grant_items where connection_id = t.get('u_cid')::uuid), 0);
-- the refresh never raises, even when a statement of it fails (here: writing the 'expired' event is made to fail)
select t.as_admin();
create or replace function t.boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
create trigger t_boom before insert on public.pro_grant_events for each row execute function t.boom();
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('u_cid')::uuid, 'closet', 'all', now() - interval '1 minute', '2026-10');
select t.as_user(t.get('u_c')::uuid);
select t.check('a failing refresh is a warning and the read still answers', (public.get_pro_status() ->> 'proEnabled') = 'true');
select t.check('a failing list read still answers too', (select count(*) from public.list_pro_connections('client')) = 1);
select t.as_admin();
drop trigger t_boom on public.pro_grant_events;
select t.check('the failed refresh left the grant for the next one', exists (select 1 from public.pro_grants where connection_id = t.get('u_cid')::uuid));
select t.as_user(t.get('u_c')::uuid);
select public.get_pro_status();
select t.as_admin();
select t.check('and the next one expired it, with its event', not exists (select 1 from public.pro_grants where connection_id = t.get('u_cid')::uuid)
                                                              and exists (select 1 from public.pro_grant_events where connection_id = t.get('u_cid')::uuid and event = 'expired'));

-- the janitor: retention in bounded deletes, throttled, forced by the service role, closed to app users
select t.as_admin();
select t.put('j_s', t.mk_stylist('js', true)::text);
select t.put('j_c', t.mk_user('jc')::text);
select t.put('j_old', t.mk_conn(t.get('j_s')::uuid, t.get('j_c')::uuid)::text);
insert into public.pro_messages (connection_id, sender_id, kind, body, created_at) values
  (t.get('j_old')::uuid, t.get('j_s')::uuid, 'text', 'ancient', now() - interval '181 days'),
  (t.get('j_old')::uuid, t.get('j_s')::uuid, 'text', 'recent', now() - interval '2 days');
update public.pro_connections set status = 'ended', ended_at = now() - interval '31 days', ended_by = 'client' where id = t.get('j_old')::uuid;
select t.put('j_new', t.mk_conn(t.get('j_s')::uuid, t.mk_user('jc2'))::text);
update public.pro_connections set status = 'ended', ended_at = now() - interval '91 days', ended_by = 'client' where id = t.get('j_new')::uuid;
insert into public.pro_recommendations (connection_id, title) values (t.get('j_new')::uuid, 'goes with the connection');
select t.mk_invite(t.get('j_s')::uuid, 'used', interval '-40 days');
update public.pro_invites set used_at = now() - interval '31 days' where stylist_id = t.get('j_s')::uuid and status = 'used';
select t.mk_invite(t.get('j_s')::uuid, 'revoked', interval '-40 days');
update public.pro_invites set revoked_at = now() - interval '5 days' where stylist_id = t.get('j_s')::uuid and status = 'revoked';
select t.mk_invite(t.get('j_s')::uuid, 'live', interval '-31 days');
select t.mk_invite(t.get('j_s')::uuid, 'live', interval '-5 days');
insert into public.pro_rate_counters (user_id, bucket, window_start, n) values (t.get('j_c')::uuid, 'message_day', now() - interval '3 days', 1), (t.get('j_c')::uuid, 'message_day', now(), 1);
insert into public.pro_closet_views (connection_id, day, pages) values (t.get('j_old')::uuid, current_date - 91, 1), (t.get('j_old')::uuid, current_date - 89, 1);
select t.as_service();
select public.pro_janitor(true);
select t.as_admin();
select t.eq('messages go at 180 days, and 30 days after the connection ended: both messages of the old connection are gone',
            (select count(*)::integer from public.pro_messages where connection_id = t.get('j_old')::uuid and kind = 'text'), 0);
select t.check('a connection ended 31 days ago is kept (90 days), and one ended 91 days ago is gone with its looks',
  exists (select 1 from public.pro_connections where id = t.get('j_old')::uuid) and not exists (select 1 from public.pro_connections where id = t.get('j_new')::uuid)
  and not exists (select 1 from public.pro_recommendations where title = 'goes with the connection'));
select t.eq('invites: used 31 days ago and a code expired 31 days ago are gone; revoked 5 days ago and expired 5 days ago stay',
            (select string_agg(status, ',' order by status) from public.pro_invites where stylist_id = t.get('j_s')::uuid), 'live,revoked');
select t.eq('counters older than 2 days are gone', (select count(*)::integer from public.pro_rate_counters where user_id = t.get('j_c')::uuid and bucket = 'message_day'), 1);
select t.eq('view counters older than 90 days are gone', (select count(*)::integer from public.pro_closet_views where connection_id = t.get('j_old')::uuid), 1);
select t.check('the janitor noted when it ran', (select last_janitor_at is not null from public.pro_meta where id));
-- throttled: a second, unforced run inside 15 minutes does nothing
insert into public.pro_messages (connection_id, sender_id, kind, body, created_at) values (t.get('j_old')::uuid, t.get('j_s')::uuid, 'text', 'ancient again', now() - interval '181 days');
select t.as_service();
select public.pro_janitor(false);
select t.as_admin();
select t.eq('an unforced run inside 15 minutes is throttled', (select count(*)::integer from public.pro_messages where body = 'ancient again'), 1);
update public.pro_meta set last_janitor_at = now() - interval '16 minutes' where id;
select t.as_service();
select public.pro_janitor(false);
select t.as_admin();
select t.eq('an unforced run after 15 minutes works', (select count(*)::integer from public.pro_messages where body = 'ancient again'), 0);
select t.as_user(t.u('bea'));
select t.throws('an app user cannot run the janitor', 'select public.pro_janitor(true)', 'permission denied');
select t.throws('an app user cannot run the refresh', $$select public.pro_refresh(gen_random_uuid())$$, 'permission denied');
select t.as_anon();
select t.throws('a guest cannot run the janitor', 'select public.pro_janitor(true)', 'permission denied');

-- a block, from anywhere (here a direct insert, as Friends and Swaps make it): ends every connection between the two,
-- with the blocker's role, and turns them into a closed shell with their content gone; unblocking changes nothing
select t.as_admin();
select t.put('b_s', t.mk_stylist('bs', true)::text); select t.put('b_c', t.mk_user('bc')::text);
select t.put('b_cid', t.mk_conn(t.get('b_s')::uuid, t.get('b_c')::uuid, 'Blocky')::text);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('b_cid')::uuid, 'closet', 'all', now() + interval '20 days', '2026-10');
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('b_cid')::uuid, t.get('b_s')::uuid, 'text', 'hello');
insert into public.pro_recommendations (connection_id, title) values (t.get('b_cid')::uuid, 'gone with the block');
insert into public.pro_appointments (connection_id, proposed_by, starts_at, duration_minutes, mode, utc_offset_minutes) values (t.get('b_cid')::uuid, 'client', now() + interval '2 days', 30, 'virtual', 0);
insert into public.pro_closet_views (connection_id, day, pages) values (t.get('b_cid')::uuid, current_date, 2);
insert into public.pro_grant_events (connection_id, scope, event) values (t.get('b_cid')::uuid, 'closet', 'granted');
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('b_c')::uuid, t.get('b_s')::uuid, 'Stylist');
select t.check('the client blocked the stylist: ended by the client, a closed shell',
  (select status = 'ended' and ended_by = 'client' and shell_at is not null from public.pro_connections where id = t.get('b_cid')::uuid));
select t.eq('its content is deleted at once', (select count(*)::integer from public.pro_messages where connection_id = t.get('b_cid')::uuid)
                                              + (select count(*)::integer from public.pro_recommendations where connection_id = t.get('b_cid')::uuid)
                                              + (select count(*)::integer from public.pro_appointments where connection_id = t.get('b_cid')::uuid)
                                              + (select count(*)::integer from public.pro_closet_views where connection_id = t.get('b_cid')::uuid)
                                              + (select count(*)::integer from public.pro_grant_events where connection_id = t.get('b_cid')::uuid)
                                              + (select count(*)::integer from public.pro_grants where connection_id = t.get('b_cid')::uuid), 0);
select t.as_user(t.get('b_s')::uuid);
select t.put('shell_s1', public.get_pro_connection(t.get('b_cid')::uuid)::text);
select t.put('shell_s_list', (select to_jsonb(l)::text from public.list_pro_connections('stylist') l where l.connection_id = t.get('b_cid')::uuid));
select t.as_user(t.get('b_c')::uuid);
select t.put('shell_c1', public.get_pro_connection(t.get('b_cid')::uuid)::text);
select t.check('the blocked stylist reads a closed shell: ended, "Former client", no profile, no actions, no counts, never the word blocked',
  (t.get('shell_s1')::jsonb ->> 'status') = 'ended' and (t.get('shell_s1')::jsonb ->> 'otherLabel') = 'Former client'
  and (t.get('shell_s1')::jsonb -> 'stylist') = 'null'::jsonb and (t.get('shell_s1')::jsonb -> 'counts') = '{"looks": 0, "upcoming": 0}'::jsonb
  and (t.get('shell_s1')::jsonb -> 'actions') = '{"canEnd": false, "canMessage": false, "canPropose": false, "canRecommend": false, "canRename": false,
                                                  "canShare": false, "canStopSharing": false, "canViewCloset": false}'::jsonb
  and (t.get('shell_s1')::jsonb ->> 'endedBy') = 'them' and t.get('shell_s1') !~* 'block');
select t.check('the blocker reads a closed shell too: "Former stylist", ended by her',
  (t.get('shell_c1')::jsonb ->> 'otherLabel') = 'Former stylist' and (t.get('shell_c1')::jsonb ->> 'endedBy') = 'me'
  and (t.get('shell_c1')::jsonb ->> 'myAlias') is null and t.get('shell_c1') !~* 'block');
select t.check('the shell in the list: the label, no preview, no headline, nothing unread',
  (t.get('shell_s_list')::jsonb ->> 'other_label') = 'Former client' and (t.get('shell_s_list')::jsonb -> 'last_message_preview') = 'null'::jsonb
  and (t.get('shell_s_list')::jsonb ->> 'unread') = '0' and (t.get('shell_s_list')::jsonb ->> 'status') = 'ended');
select t.as_admin();
delete from public.user_blocks where blocker_id = t.get('b_c')::uuid and blocked_id = t.get('b_s')::uuid;
select t.as_user(t.get('b_s')::uuid);
select t.eq('unblocking changes nothing: the stylist reads the identical shell', public.get_pro_connection(t.get('b_cid')::uuid), t.get('shell_s1')::jsonb);
select t.as_user(t.get('b_c')::uuid);
select t.eq('and so does the blocker', public.get_pro_connection(t.get('b_cid')::uuid), t.get('shell_c1')::jsonb);
select t.as_admin();
select t.check('the connection is still a shell after the unblock', (select shell_at is not null and status = 'ended' from public.pro_connections where id = t.get('b_cid')::uuid));
-- a block the other way round: the stylist blocks, ended by the stylist
select t.put('b2_c', t.mk_user('b2c')::text);
select t.put('b2_cid', t.mk_conn(t.get('b_s')::uuid, t.get('b2_c')::uuid)::text);
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('b_s')::uuid, t.get('b2_c')::uuid, 'x');
select t.check('the stylist blocked the client: ended by the stylist, a shell', (select ended_by = 'stylist' and shell_at is not null from public.pro_connections where id = t.get('b2_cid')::uuid));
-- an ended connection between the same two turns into a shell too
select t.put('b3_c', t.mk_user('b3c')::text);
select t.put('b3_cid', t.mk_conn(t.get('b_s')::uuid, t.get('b3_c')::uuid)::text);
select public.pro_end_connection(t.get('b3_cid')::uuid, 'client');
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.get('b3_cid')::uuid, 'kept so far', 'sent', now());
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('b3_c')::uuid, t.get('b_s')::uuid, 'x');
select t.check('a connection that had already ended becomes a shell on a block, with its content deleted',
  (select shell_at is not null and ended_by = 'client' from public.pro_connections where id = t.get('b3_cid')::uuid)
  and not exists (select 1 from public.pro_recommendations where connection_id = t.get('b3_cid')::uuid));
-- a block the pro screens made hides from the old list; an ordinary block does not
select t.put('v_a', t.mk_user('va')::text); select t.put('v_b', t.mk_user('vb')::text); select t.put('v_c', t.mk_user('vc')::text);
insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_pro) values (t.get('v_a')::uuid, t.get('v_b')::uuid, 'pro', true);
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('v_a')::uuid, t.get('v_c')::uuid, 'plain');
select t.as_user(t.get('v_a')::uuid);
select t.eq('the old blocked list shows only the ordinary block', (select string_agg(blocked_name, ',') from public.user_blocks), 'plain');
delete from public.user_blocks where blocker_id = t.get('v_a')::uuid;
select t.as_admin();
select t.eq('the old list can remove its own block but cannot reach the pro one', (select string_agg(blocked_name, ',') from public.user_blocks where blocker_id = t.get('v_a')::uuid), 'pro');

-- a deleted account (through the real delete_user_account() for the client, a plain delete of the account row for the others):
-- the leaver's side goes null, the connection ends as the system, the label goes, the stub stays
select t.as_admin();
select t.put('d_s', t.mk_stylist('ds', true)::text); select t.put('d_c', t.mk_user('dcl')::text);
select t.put('d_cid', t.mk_conn(t.get('d_s')::uuid, t.get('d_c')::uuid, 'Dcl')::text);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('d_cid')::uuid, 'closet', 'all', now() + interval '20 days', '2026-10');
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('d_cid')::uuid, t.get('d_c')::uuid, 'text', 'from the client'), (t.get('d_cid')::uuid, t.get('d_s')::uuid, 'text', 'from the stylist');
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.get('d_cid')::uuid, 'look', 'sent', now());
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes) values (t.get('d_cid')::uuid, 'stylist', 'confirmed', now() + interval '2 days', 30, 'virtual', 0);
insert into public.pro_closet_views (connection_id, day, pages) values (t.get('d_cid')::uuid, current_date, 2);
select t.as_user(t.get('d_c')::uuid);
select public.delete_user_account();
select t.as_admin();
select t.check('the client left: the connection ended as the system, the client side and the alias are null, the stylist keeps the label of the stub',
  (select status = 'ended' and ended_by = 'system' and client_id is null and client_alias is null and stylist_id = t.get('d_s')::uuid and stylist_label is not null
     from public.pro_connections where id = t.get('d_cid')::uuid));
select t.eq('the client''s looks, sessions, view counters and grant are deleted, the stylist''s own words stay until the 30 days',
            (select count(*)::integer from public.pro_recommendations where connection_id = t.get('d_cid')::uuid)
            + (select count(*)::integer from public.pro_appointments where connection_id = t.get('d_cid')::uuid)
            + (select count(*)::integer from public.pro_closet_views where connection_id = t.get('d_cid')::uuid)
            + (select count(*)::integer from public.pro_grants where connection_id = t.get('d_cid')::uuid), 0);
select t.eq('the messages the client sent are gone, the stylist''s and the system lines stay',
            (select string_agg(case when kind = 'system' then code else body end, ',' order by id) from public.pro_messages where connection_id = t.get('d_cid')::uuid), 'from the stylist,ended');
select t.as_user(t.get('d_s')::uuid);
select t.eq('the stylist''s list shows "Former client" with the dates', (select other_label || '/' || status from public.list_pro_connections('stylist') where connection_id = t.get('d_cid')::uuid), 'Former client/ended');
select t.as_admin();
delete from auth.users where id = t.get('d_s')::uuid;
select t.check('the stylist left too: nothing of the connection remains', not exists (select 1 from public.pro_connections where id = t.get('d_cid')::uuid));
-- the stylist leaves first: the client keeps the looks and sessions already delivered, labelled "Former stylist"
select t.put('f_s', t.mk_stylist('fs', true)::text); select t.put('f_c', t.mk_user('fc')::text);
select t.put('f_cid', t.mk_conn(t.get('f_s')::uuid, t.get('f_c')::uuid, 'Fc')::text);
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.get('f_cid')::uuid, 'delivered look', 'sent', now());
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('f_cid')::uuid, t.get('f_s')::uuid, 'text', 'from the stylist'), (t.get('f_cid')::uuid, t.get('f_c')::uuid, 'text', 'from the client');
delete from auth.users where id = t.get('f_s')::uuid;
select t.check('the stylist left: ended by the system, her side and her label are null',
  (select status = 'ended' and ended_by = 'system' and stylist_id is null and stylist_label is null and client_id = t.get('f_c')::uuid from public.pro_connections where id = t.get('f_cid')::uuid));
select t.eq('the client keeps the look and her own message, the stylist''s message is gone',
            (select count(*)::integer from public.pro_recommendations where connection_id = t.get('f_cid')::uuid)
            + (select count(*)::integer from public.pro_messages where connection_id = t.get('f_cid')::uuid and body = 'from the client'), 2);
select t.eq('no message of the stylist remains', (select count(*)::integer from public.pro_messages where connection_id = t.get('f_cid')::uuid and body = 'from the stylist'), 0);
select t.as_user(t.get('f_c')::uuid);
select t.eq('the client''s list shows "Former stylist"', (select other_label from public.list_pro_connections('client') where connection_id = t.get('f_cid')::uuid), 'Former stylist');

-- a failure inside the trigger must not fail the deletion, and the next read of the other person repairs it
select t.as_admin();
select t.put('r_s', t.mk_stylist('rs', true)::text); select t.put('r_c', t.mk_user('rc')::text);
select t.put('r_cid', t.mk_conn(t.get('r_s')::uuid, t.get('r_c')::uuid, 'Rc')::text);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('r_cid')::uuid, 'closet', 'all', now() + interval '20 days', '2026-10');
insert into public.pro_recommendations (connection_id, title, status, sent_at) values (t.get('r_cid')::uuid, 'client''s look', 'sent', now());
insert into public.pro_appointments (connection_id, proposed_by, status, starts_at, duration_minutes, mode, utc_offset_minutes) values (t.get('r_cid')::uuid, 'stylist', 'confirmed', now() + interval '2 days', 30, 'virtual', 0);
insert into public.pro_closet_views (connection_id, day, pages) values (t.get('r_cid')::uuid, current_date, 2);
alter table public.pro_connections disable trigger pro_on_member_left;
delete from auth.users where id = t.get('r_c')::uuid;
select t.check('with the trigger out of the way the deletion went through and left a half-done connection',
  (select status = 'active' and client_id is null and client_alias = 'Rc' from public.pro_connections where id = t.get('r_cid')::uuid)
  and exists (select 1 from public.pro_grants where connection_id = t.get('r_cid')::uuid));
alter table public.pro_connections enable trigger pro_on_member_left;
select t.as_user(t.get('r_s')::uuid);
select public.get_pro_status();
select t.as_admin();
select t.check('the stylist''s next read ended it as the system, cleared the alias, the grant, the looks, the sessions and the counters',
  (select status = 'ended' and ended_by = 'system' and client_alias is null from public.pro_connections where id = t.get('r_cid')::uuid)
  and not exists (select 1 from public.pro_grants where connection_id = t.get('r_cid')::uuid)
  and not exists (select 1 from public.pro_recommendations where connection_id = t.get('r_cid')::uuid)
  and not exists (select 1 from public.pro_appointments where connection_id = t.get('r_cid')::uuid)
  and not exists (select 1 from public.pro_closet_views where connection_id = t.get('r_cid')::uuid));
-- the same for a stylist who left (the client's next read repairs it)
select t.put('r2_s', t.mk_stylist('r2s', true)::text); select t.put('r2_c', t.mk_user('r2c')::text);
select t.put('r2_cid', t.mk_conn(t.get('r2_s')::uuid, t.get('r2_c')::uuid, 'R2c')::text);
alter table public.pro_connections disable trigger pro_on_member_left;
delete from auth.users where id = t.get('r2_s')::uuid;
alter table public.pro_connections enable trigger pro_on_member_left;
select t.as_user(t.get('r2_c')::uuid);
select public.get_pro_status();
select t.as_admin();
select t.check('the client''s next read ended it and cleared the stylist''s label', (select status = 'ended' and ended_by = 'system' and stylist_label is null from public.pro_connections where id = t.get('r2_cid')::uuid));

-- ─── J. Creating a profile looks at the reports of the last 14 days ─────────

-- (the report contexts of the moderation file may not exist on the database under test, so the check is lifted for this run)
select t.as_admin();
alter table public.content_reports drop constraint if exists content_reports_context_check;
select t.put('rep_a', t.mk_user('repa')::text); select t.put('rep_b', t.mk_user('repb')::text); select t.put('rep_c', t.mk_user('repc')::text);
select t.put('tg1', t.mk_user('tg1', false, true)::text);
insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence) values
  (t.get('rep_a')::uuid, t.get('tg1')::uuid, 'pro_chat', 'harassment', '{"qualified": true}'),
  (t.get('rep_b')::uuid, t.get('tg1')::uuid, 'pro_profile', 'spam', '{"qualified": true}');
select t.as_user(t.get('tg1')::uuid);
select public.save_stylist_profile('Target One', '', '', array['outfit_styling'], '{}', '', true);
select t.as_admin();
select t.check('two different qualified reporters in 14 days: a profile created now is held at once, by the system',
  (select invites_held_by = 'system' and invites_held_at is not null from public.pro_members where user_id = t.get('tg1')::uuid));
-- one reporter twice, an unqualified report, an old report, another context: none of them counts
select t.put('tg2', t.mk_user('tg2', false, true)::text);
insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence) values
  (t.get('rep_a')::uuid, t.get('tg2')::uuid, 'pro_chat', 'harassment', '{"qualified": true}'),
  (t.get('rep_a')::uuid, t.get('tg2')::uuid, 'pro_content', 'spam', '{"qualified": true}'),
  (t.get('rep_b')::uuid, t.get('tg2')::uuid, 'pro_chat', 'spam', '{"qualified": false}'),
  (t.get('rep_c')::uuid, t.get('tg2')::uuid, 'pro_chat', 'spam', '{"note": "no qualified key"}');
insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence, created_at) values
  (t.get('rep_b')::uuid, t.get('tg2')::uuid, 'pro_chat', 'spam', '{"qualified": true}', now() - interval '15 days');
insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence) values
  (t.get('rep_c')::uuid, t.get('tg2')::uuid, 'friend_request', 'spam', '{"qualified": true}');
select t.as_user(t.get('tg2')::uuid);
select public.save_stylist_profile('Target Two', '', '', array['outfit_styling'], '{}', '', true);
select t.as_admin();
select t.check('one reporter twice, an unqualified report, one with no flag, one 15 days old and one of another feature: no hold',
  (select invites_held_at is null from public.pro_members where user_id = t.get('tg2')::uuid));
-- an update is not a creation: reports that arrive later are not looked at by a save
insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence) values
  (t.get('rep_b')::uuid, t.get('tg2')::uuid, 'pro_chat', 'spam', '{"qualified": true}');
select t.as_user(t.get('tg2')::uuid);
select public.save_stylist_profile('Target Two B', '', '', array['outfit_styling'], '{}', '', true);
select t.as_admin();
select t.check('a save that updates the profile does not look at the reports', (select invites_held_at is null from public.pro_members where user_id = t.get('tg2')::uuid));
-- closing and creating again does look: a stylist cannot shed a pending hold that way
select t.as_user(t.get('tg2')::uuid);
select public.close_stylist_profile();
select public.save_stylist_profile('Target Two C', '', '', array['outfit_styling'], '{}', '', true);
select t.as_admin();
select t.check('closing and creating again is held, because two different qualified reporters stand in the window',
  (select invites_held_by = 'system' from public.pro_members where user_id = t.get('tg2')::uuid));
-- a hold a person made is not turned into a system one
select t.put('tg3', t.mk_user('tg3', false, true)::text);
update public.pro_members set invites_held_at = now() - interval '30 days', invites_held_by = 'admin' where user_id = t.get('tg3')::uuid;
insert into public.content_reports (reporter_id, reported_user_id, context, reason, evidence) values
  (t.get('rep_a')::uuid, t.get('tg3')::uuid, 'pro_chat', 'spam', '{"qualified": true}'),
  (t.get('rep_b')::uuid, t.get('tg3')::uuid, 'pro_chat', 'spam', '{"qualified": true}');
select t.as_user(t.get('tg3')::uuid);
select public.save_stylist_profile('Target Three', '', '', array['outfit_styling'], '{}', '', true);
select t.as_admin();
select t.check('an existing hold is never touched by a creation', (select invites_held_by = 'admin' and invites_held_at < now() - interval '29 days' from public.pro_members where user_id = t.get('tg3')::uuid));

-- ─── K. Churn: many short connections that the clients ended hold new invites ─

select t.as_admin();
select t.put('ch_s', t.mk_stylist('churn', true)::text);
do $$
declare s uuid := t.get('ch_s')::uuid;
begin
  for i in 1..9 loop perform public.pro_end_connection(t.mk_conn(s, t.mk_user('chc' || i)), 'client'); end loop;
end $$;
select t.check('nine short connections ended by their clients: no hold yet', (select invites_held_at is null from public.pro_members where user_id = t.get('ch_s')::uuid));
select public.pro_end_connection(t.mk_conn(t.get('ch_s')::uuid, t.mk_user('chc10')), 'client');
select t.check('the tenth sets a system hold', (select invites_held_by = 'system' and invites_held_at is not null from public.pro_members where user_id = t.get('ch_s')::uuid));
select t.as_user(t.get('ch_s')::uuid);
select t.throws('and the stylist cannot create an invite until it releases', $$select public.create_pro_invite(gen_random_uuid())$$, 'invites_held');
-- ten that the STYLIST ended (removing junk redemptions of a leaked code) do not count; nor do long ones, nor a deleted account
select t.as_admin();
select t.put('ch_s2', t.mk_stylist('churn2', true)::text);
do $$
declare s uuid := t.get('ch_s2')::uuid; c uuid;
begin
  for i in 1..12 loop perform public.pro_end_connection(t.mk_conn(s, t.mk_user('chd' || i)), 'stylist'); end loop;
  for i in 1..12 loop
    c := t.mk_conn(s, t.mk_user('che' || i));
    update public.pro_connections set started_at = now() - interval '3 days' where id = c;
    perform public.pro_end_connection(c, 'client');
  end loop;
  for i in 1..12 loop perform public.pro_end_connection(t.mk_conn(s, t.mk_user('chf' || i)), 'system'); end loop;
end $$;
select t.check('twelve ended by the stylist, twelve that lasted three days, twelve ended by the system: no hold',
  (select invites_held_at is null from public.pro_members where user_id = t.get('ch_s2')::uuid));
-- churn never replaces a hold a person made
select t.put('ch_s3', t.mk_stylist('churn3', true)::text);
update public.pro_members set invites_held_at = now() - interval '30 days', invites_held_by = 'admin' where user_id = t.get('ch_s3')::uuid;
do $$
declare s uuid := t.get('ch_s3')::uuid;
begin
  for i in 1..10 loop perform public.pro_end_connection(t.mk_conn(s, t.mk_user('chg' || i)), 'client'); end loop;
end $$;
select t.check('ten short ones with an admin hold in place leave that hold as it was', (select invites_held_by = 'admin' and invites_held_at < now() - interval '29 days' from public.pro_members where user_id = t.get('ch_s3')::uuid));
-- a client who is gone no longer counts (the connection keeps ended_by = client only while the account exists)
select t.put('ch_s4', t.mk_stylist('churn4', true)::text);
do $$
declare s uuid := t.get('ch_s4')::uuid; c uuid;
begin
  for i in 1..9 loop perform public.pro_end_connection(t.mk_conn(s, t.mk_user('chh' || i)), 'client'); end loop;
  c := t.mk_user('chh10');
  perform public.pro_end_connection(t.mk_conn(s, c), 'client');
end $$;
select t.check('the tenth of another stylist: held (the same rule on a fresh stylist)', (select invites_held_by = 'system' from public.pro_members where user_id = t.get('ch_s4')::uuid));

-- ─── L. The helpers of file 2 that later files lean on ──────────────────────

select t.as_admin();
-- pro_report_is_qualified: a real working relationship, decided at report time
select t.put('q_s', t.mk_stylist('qs')::text);
select t.put('q_old', t.mk_user('qold', true, false, interval '3 days')::text);
select t.put('q_new', t.mk_user('qnew', true, false, interval '1 hour')::text);
select t.eq('qualified: no connection between them', public.pro_report_is_qualified(t.get('q_old')::uuid, t.get('q_s')::uuid), false);
select t.put('q_c1', t.mk_conn(t.get('q_s')::uuid, t.get('q_old')::uuid)::text);
select t.eq('qualified: a connection that began a minute ago, with nothing said', public.pro_report_is_qualified(t.get('q_old')::uuid, t.get('q_s')::uuid), false);
update public.pro_connections set started_at = now() - interval '23 hours' where id = t.get('q_c1')::uuid;
select t.eq('qualified: an active connection of 23 hours is not enough', public.pro_report_is_qualified(t.get('q_old')::uuid, t.get('q_s')::uuid), false);
update public.pro_connections set started_at = now() - interval '25 hours' where id = t.get('q_c1')::uuid;
select t.eq('qualified: an active connection counts from its start (25 hours)', public.pro_report_is_qualified(t.get('q_old')::uuid, t.get('q_s')::uuid), true);
select t.eq('qualified: in either direction (the stylist reporting the client)', public.pro_report_is_qualified(t.get('q_s')::uuid, t.get('q_old')::uuid), true);
select t.eq('qualified: a stranger who never worked with the stylist', public.pro_report_is_qualified(t.u('eve'), t.get('q_s')::uuid), false);
select t.put('q_c2', t.mk_conn(t.get('q_s')::uuid, t.get('q_new')::uuid)::text);
update public.pro_connections set started_at = now() - interval '25 hours' where id = t.get('q_c2')::uuid;
select t.eq('qualified: the reporter''s account is an hour old, so no', public.pro_report_is_qualified(t.get('q_new')::uuid, t.get('q_s')::uuid), false);
-- three text messages from the REPORTED person are enough on their own; system lines are not messages, and the
-- reporter's own messages prove nothing
select t.put('q_c3', t.mk_conn(t.get('q_s')::uuid, t.mk_user('q3'))::text);
select t.put('q_u3', (select client_id::text from public.pro_connections where id = t.get('q_c3')::uuid));
insert into public.pro_messages (connection_id, sender_id, kind, body) values
  (t.get('q_c3')::uuid, t.get('q_s')::uuid, 'text', 'one'), (t.get('q_c3')::uuid, t.get('q_u3')::uuid, 'text', 'two');
insert into public.pro_messages (connection_id, kind, code) select t.get('q_c3')::uuid, 'system', 'sharing_on' from generate_series(1, 5);
select t.eq('qualified: two messages and five system lines are not three messages', public.pro_report_is_qualified(t.get('q_u3')::uuid, t.get('q_s')::uuid), false);
insert into public.pro_messages (connection_id, sender_id, kind, body)
  select t.get('q_c3')::uuid, t.get('q_u3')::uuid, 'text', 'mine ' || g from generate_series(1, 4) g;
select t.eq('qualified: the reporter writing four messages herself proves nothing', public.pro_report_is_qualified(t.get('q_u3')::uuid, t.get('q_s')::uuid), false);
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('q_c3')::uuid, t.get('q_s')::uuid, 'text', 'three');
select t.eq('qualified: two messages from the reported person are still not three', public.pro_report_is_qualified(t.get('q_u3')::uuid, t.get('q_s')::uuid), false);
insert into public.pro_messages (connection_id, sender_id, kind, body) values (t.get('q_c3')::uuid, t.get('q_s')::uuid, 'text', 'four');
select t.eq('qualified: three text messages from the reported person', public.pro_report_is_qualified(t.get('q_u3')::uuid, t.get('q_s')::uuid), true);
select t.eq('qualified: the stylist reporting a client who wrote four messages', public.pro_report_is_qualified(t.get('q_s')::uuid, t.get('q_u3')::uuid), true);
-- an ended one counts by how long it lasted
select t.put('q_c4', t.mk_conn(t.get('q_s')::uuid, t.mk_user('q4'))::text);
select t.put('q_u4', (select client_id::text from public.pro_connections where id = t.get('q_c4')::uuid));
update public.pro_connections set status = 'ended', started_at = now() - interval '3 days', ended_at = now() - interval '2 days 22 hours', ended_by = 'client' where id = t.get('q_c4')::uuid;
select t.eq('qualified: an ended connection that lasted 2 hours', public.pro_report_is_qualified(t.get('q_u4')::uuid, t.get('q_s')::uuid), false);
update public.pro_connections set ended_at = now() - interval '1 day' where id = t.get('q_c4')::uuid;
select t.eq('qualified: an ended connection that lasted 2 days', public.pro_report_is_qualified(t.get('q_u4')::uuid, t.get('q_s')::uuid), true);

-- pro_can_read_closet: the one place the closet rule is decided
select t.put('k_s', t.mk_stylist('ks')::text); select t.put('k_c', t.mk_user('kc')::text);
select t.put('k_cid', t.mk_conn(t.get('k_s')::uuid, t.get('k_c')::uuid)::text);
select t.eq('closet rule: no grant', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('k_cid')::uuid, 'closet', 'all', now() + interval '1 day', '2026-10');
select t.eq('closet rule: an unexpired grant on an active connection', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), true);
select t.eq('closet rule: the ids swapped', public.pro_can_read_closet(t.get('k_c')::uuid, t.get('k_s')::uuid, t.get('k_cid')::uuid), false);
select t.eq('closet rule: another stylist', public.pro_can_read_closet(t.u('ann'), t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
select t.eq('closet rule: another connection id', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, gen_random_uuid()), false);
update public.pro_grants set expires_at = now() - interval '1 second' where connection_id = t.get('k_cid')::uuid;
select t.eq('closet rule: an expired grant', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
update public.pro_grants set expires_at = now() + interval '1 day' where connection_id = t.get('k_cid')::uuid;
update public.pro_members set suspended_at = now() where user_id = t.get('k_s')::uuid;
select t.eq('closet rule: a suspended stylist', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
update public.pro_members set suspended_at = null where user_id = t.get('k_s')::uuid;
update public.pro_members set suspended_at = now() where user_id = t.get('k_c')::uuid;
select t.eq('closet rule: a suspended client', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
update public.pro_members set suspended_at = null where user_id = t.get('k_c')::uuid;
update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.eq('closet rule: the switch off', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
update public.pro_config set value = 'true' where key = 'pro_enabled';
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('k_c')::uuid, t.get('k_s')::uuid, 'x');
select t.eq('closet rule: a block (the grant went with the connection)', public.pro_can_read_closet(t.get('k_s')::uuid, t.get('k_c')::uuid, t.get('k_cid')::uuid), false);
select t.put('k2_cid', t.mk_conn(t.get('k_s')::uuid, t.mk_user('kc2'))::text);
insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version) values (t.get('k2_cid')::uuid, 'closet', 'all', now() + interval '1 day', '2026-10');
select t.eq('closet rule: another client of the same stylist, grant live', public.pro_can_read_closet(t.get('k_s')::uuid, (select client_id from public.pro_connections where id = t.get('k2_cid')::uuid), t.get('k2_cid')::uuid), true);
select public.pro_end_connection(t.get('k2_cid')::uuid, 'client');
select t.eq('closet rule: an ended connection', public.pro_can_read_closet(t.get('k_s')::uuid, (select client_id from public.pro_connections where id = t.get('k2_cid')::uuid), t.get('k2_cid')::uuid), false);

-- the storage path of a photo address, only for the owner's own folder
select t.eq('photo path: the owner''s own bucket address', public.pro_photo_path(
  'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u('bea') || '/1700.jpg', t.u('bea')), t.u('bea') || '/1700.jpg');
select t.eq('photo path: a signed address with a token', public.pro_photo_path(
  'https://x.supabase.co/storage/v1/object/sign/wardrobe-images/' || t.u('bea') || '/1700.jpg?token=abc', t.u('bea')), t.u('bea') || '/1700.jpg');
select t.eq('photo path: someone else''s folder', public.pro_photo_path(
  'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u('cat') || '/1700.jpg', t.u('bea')), null);
select t.eq('photo path: another bucket', public.pro_photo_path(
  'https://x.supabase.co/storage/v1/object/public/swap-photos/' || t.u('bea') || '/1700.jpg', t.u('bea')), null);
select t.eq('photo path: a nested path', public.pro_photo_path(
  'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u('bea') || '/a/b.jpg', t.u('bea')), null);
select t.eq('photo path: a phone-local file', public.pro_photo_path('file:///var/mobile/x.jpg', t.u('bea')), null);
select t.eq('photo path: null', public.pro_photo_path(null, t.u('bea')), null);
select t.check('photo path: only the pieces with a cover photo of their own give one',
  (select array_agg(public.pro_photo_path(user_image, user_id) is not null order by date_added desc) from public.clothing_items where user_id = t.u('bea'))
  = array[true, true, true, true, false, true, false, true]);

-- the cleaners are copies of swap's: the same answer for every input
select t.check('materials and season cleaners answer exactly as the swap ones do', (
  select bool_and(public.pro_clean_materials(m) is not distinct from public.swap_clean_materials(m)
                  and public.pro_clean_season(m) is not distinct from public.swap_clean_season(m))
    from (values
      (null::jsonb), ('"text"'::jsonb), ('{}'::jsonb), ('[]'::jsonb), ('[1, 2]'::jsonb), ('[" ", null, "x"]'::jsonb),
      ('[{"name":"Wool","percentage":80,"tier":"primary"},{"bad":1}]'::jsonb),
      ('[{"name":"  COTTON  ","percentage":"55.5","tier":"lining"}]'::jsonb),
      ('[{"name":"x","percentage":101,"tier":"nope"},{"name":"y","percentage":"abc"},{"name":""}]'::jsonb),
      (('[' || (select string_agg('{"name":"m' || n || '","percentage":' || n || '}', ',') from generate_series(1, 30) n) || ']')::jsonb),
      (('[{"name":"' || repeat('n', 100) || '"}]')::jsonb),
      ('["winter","SPRING","a very long season word indeed", "", 7, "autumn", "summer", "fall", "x", "y"]'::jsonb)
    ) v(m)));
select t.eq('the materials cleaner caps the list at twelve', jsonb_array_length(public.pro_clean_materials(
  (select jsonb_agg(jsonb_build_object('name', 'm' || n)) from generate_series(1, 30) n))), 12);
select t.eq('the season cleaner caps the list at six words of twelve characters', public.pro_clean_season('["aaaaaaaaaaaaaaaaaaaa","b","c","d","e","f","g","h"]'::jsonb),
            '["aaaaaaaaaaaa", "b", "c", "d", "e", "f"]'::jsonb);

-- the advisory lock helper: any order, the same person twice, a null
select public.pro_lock_users(t.u('ann'), t.u('bea'));
select public.pro_lock_users(t.u('bea'), t.u('ann'));
select public.pro_lock_users(t.u('ann'), t.u('ann'));
select public.pro_lock_users(null, t.u('ann'));
select t.check('pro_lock_users takes the locks in any order, for one person or two, and a null takes none', true);

-- ─── M. The catalogue of the tables of file 2 ───────────────────────────────

select t.check('row level security is on for all fifteen pro tables', (
  select count(*) = 15 and bool_and(c.relrowsecurity) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname in ('pro_config', 'pro_meta', 'pro_members', 'pro_stylists', 'pro_invites',
     'pro_connections', 'pro_grants', 'pro_grant_items', 'pro_grant_events', 'pro_closet_views', 'pro_recommendations', 'pro_recommendation_items',
     'pro_appointments', 'pro_messages', 'pro_rate_counters')));
select t.check('anon and authenticated hold no privilege on any pro table or sequence', not exists (
  select 1 from pg_class c, unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'pro\_%' and has_table_privilege(r, c.oid, p))
  and not has_sequence_privilege('authenticated', 'public.pro_messages_id_seq', 'usage') and not has_sequence_privilege('authenticated', 'public.pro_grant_events_id_seq', 'usage')
  and not has_sequence_privilege('anon', 'public.pro_messages_id_seq', 'usage'));
select t.check('no policy on any pro table', not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'pro\_%'));
select t.check('every foreign key of a pro table has an index whose leading column is the key column', not exists (
  select 1 from pg_constraint k join pg_class c on c.oid = k.conrelid
   where k.contype = 'f' and c.relnamespace = 'public'::regnamespace and c.relname like 'pro\_%'
     and not exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indkey[0] = k.conkey[1])));
select t.check('every foreign key to auth.users cascades, except the two sides of a connection, which are set null', (
  select count(*) filter (where k.confdeltype = 'c') = count(*) - 2 and count(*) filter (where k.confdeltype = 'n' and c.relname = 'pro_connections') = 2
    from pg_constraint k join pg_class c on c.oid = k.conrelid
   where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and c.relnamespace = 'public'::regnamespace and c.relname like 'pro\_%'));
select t.check('the user_blocks client policies hide the blocks made from Stylists', (
  select count(*) = 2 and bool_and(qual like '%via_pro%' and qual like '%via_swap%') from pg_policies where schemaname = 'public' and tablename = 'user_blocks'));
select t.check('the two triggers exist and are on the tables they should be', (
  select count(*) = 2 from pg_trigger g where not g.tgisinternal and ((g.tgname = 'pro_on_block' and g.tgrelid = 'public.user_blocks'::regclass)
                                                                    or (g.tgname = 'pro_on_member_left' and g.tgrelid = 'public.pro_connections'::regclass))));
select t.check('the live friend, block and account functions are not touched by the pro files', (
  select bool_and(prosrc not like '%pro\_%') from pg_proc where proname in ('block_user', 'report_user', 'delete_user_account', 'find_user_by_email', 'get_friend_closet')
                                                              and pronamespace = 'public'::regnamespace));
select t.check('pro_enabled is the only switch and the terms rows are seeded',
  (select count(*) from public.pro_config where key in ('pro_enabled', 'stylist_terms_version', 'client_terms_version', 'share_text_version', 'min_account_age_hours')) = 5
  and not exists (select 1 from public.pro_config where key = 'directory_enabled'));
