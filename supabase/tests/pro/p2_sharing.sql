-- p2_sharing (files 1 to 6; no file of the work or moderation streams is needed)
--   A  privileges and who may call what
--   B  nothing is shared by connecting: closet_not_shared, the shape of get_pro_grant for both sides
--   C  set_pro_grant, enabling: arguments, pieces, consent text, the first grant, the one system line
--   D  get_client_closet: the whitelist, no leaks, cleaned and capped text, paging, counters, limits
--   E  changing, renewing, expiry kept; events; the 24-hour rule of the system line
--   F  turning sharing off, from any build; expiry and the lazy event
--   G  every way a read stops at once: end, block, suspension, switch, terms
--   H  pro_photo_source: the matrix, the service role only, the counter

-- People, once: Ann (approved stylist) works with Bea and with Cat; Dee (stylist on probation) works with nobody.
select t.as_admin();
create function t.c(p_name text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_name $$;
select t.put('c_ab', t.mk_conn(t.u('ann'), t.u('bea'), 'Bea B')::text);
select t.put('c_ac', t.mk_conn(t.u('ann'), t.u('cat'), 'Cat C')::text);
-- now() is fixed for a whole transaction, so "unchanged" is only visible against an older value.
update public.pro_connections set last_activity_at = now() - interval '1 day' where id in (t.c('c_ab'), t.c('c_ac'));
create function t.client_keys() returns text language sql immutable as $$
  select string_agg(k, ',' order by k collate "C")
    from unnest(array['scope', 'enabled', 'itemMode', 'itemIds', 'itemCount', 'grantedAt', 'expiresAt', 'expiresSoon',
                      'textVersion', 'lastViewedAt', 'views30d', 'events']) k $$;
create function t.stylist_keys() returns text language sql immutable as $$
  select string_agg(k, ',' order by k collate "C") from unnest(array['scope', 'enabled', 'itemMode', 'itemCount', 'expiresAt']) k $$;
create function t.closet_keys() returns text language sql immutable as $$
  select string_agg(k, ',' order by k collate "C")
    from unnest(array['item_id', 'name', 'category', 'subcategory', 'color', 'brand', 'season', 'pattern', 'material',
                      'materials', 'size', 'condition', 'has_photo', 'total_count']) k $$;

-- ─── A. Privileges and who may call what ────────────────────────────────────

select t.check('the 3 client functions of file 6 are executable by authenticated and by no guest', (
  select count(*) = 3 and bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
         and not bool_or(has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('get_pro_grant', 'set_pro_grant', 'get_client_closet')));
select t.check('pro_photo_source is for the service role only',
               has_function_privilege('service_role', 'public.pro_photo_source(uuid, uuid, uuid)', 'execute')
               and not has_function_privilege('authenticated', 'public.pro_photo_source(uuid, uuid, uuid)', 'execute')
               and not has_function_privilege('anon', 'public.pro_photo_source(uuid, uuid, uuid)', 'execute'));
select t.check('every function of file 6 pins search_path', (
  select count(*) = 4 and bool_and(p.proconfig is not null and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('get_pro_grant', 'set_pro_grant', 'get_client_closet', 'pro_photo_source')));
select t.check('every function of file 6 is security definer', (
  select count(*) = 4 and bool_and(p.prosecdef)
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('get_pro_grant', 'set_pro_grant', 'get_client_closet', 'pro_photo_source')));
select t.check('get_client_closet returns exactly the fourteen columns of 4.6, in order',
  (select pg_get_function_result(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'get_client_closet')
  = 'TABLE(item_id uuid, name text, category text, subcategory text, color text, brand text, season jsonb, pattern text, material text, materials jsonb, size text, condition text, has_photo boolean, total_count integer)');
select t.check('no pro table or sequence is granted to anon or authenticated',
  not exists (select 1 from information_schema.role_table_grants g
               where g.table_schema = 'public' and g.table_name like 'pro\_%' and g.grantee in ('anon', 'authenticated')));

select t.as_anon();
select t.throws('a guest cannot call get_pro_grant', $$select public.get_pro_grant(gen_random_uuid())$$, 'permission denied');
select t.throws('a guest cannot call set_pro_grant', $$select public.set_pro_grant(gen_random_uuid(), 'closet', false)$$, 'permission denied');
select t.throws('a guest cannot call get_client_closet', $$select * from public.get_client_closet(gen_random_uuid())$$, 'permission denied');
select t.throws('a guest cannot call pro_photo_source', $$select public.pro_photo_source(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$$, 'permission denied');
select t.as_user(t.u('ann'));
select t.throws('a signed-in person cannot call pro_photo_source (it would hand out a storage path)',
                format($$select public.pro_photo_source(%L, %L, %L)$$, t.u('ann'), t.c('c_ab'), t.item('bea', 2)), 'permission denied');

select t.as_no_subject();
select t.throws('no subject: get_pro_grant', $$select public.get_pro_grant(gen_random_uuid())$$, 'not_authenticated', null, null, '28000');
select t.throws('no subject: set_pro_grant', $$select public.set_pro_grant(gen_random_uuid(), 'closet', false)$$, 'not_authenticated');
select t.throws('no subject: get_client_closet', $$select * from public.get_client_closet(gen_random_uuid())$$, 'not_authenticated');
select t.as_anonymous_user(t.u('ivy'));
select t.throws('anonymous token: get_pro_grant (a way out)', $$select public.get_pro_grant(gen_random_uuid())$$, 'not_authenticated', null, null, '28000');
select t.throws('anonymous token: set_pro_grant, off (a way out)', $$select public.set_pro_grant(gen_random_uuid(), 'closet', false)$$, 'not_authenticated');
select t.throws('anonymous token: set_pro_grant, on', $$select public.set_pro_grant(gen_random_uuid(), 'closet', true, 'all', null, '2026-10')$$, 'not_authenticated');
select t.throws('anonymous token: get_client_closet', $$select * from public.get_client_closet(gen_random_uuid())$$, 'not_authenticated');

select t.as_user(t.u('gus'));
select t.throws('nothing accepted: enabling needs the attestation', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.c('c_ab')), 'adult_required');
select t.throws('nothing accepted: reading a closet needs the attestation', format($$select * from public.get_client_closet(%L)$$, t.c('c_ab')), 'adult_required');
select t.as_user(t.u('cat'));
select t.throws('a client with no stylist terms cannot read a closet', format($$select * from public.get_client_closet(%L)$$, t.c('c_ac')), 'pro_terms_required', 'stylist', null, '42501');
select t.as_user(t.u('dee'));
select t.throws('a stylist who is not on the connection: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.c('c_ab')), 'pro_unavailable', null, null, '22023');
select t.throws('a stylist who is not on the connection: get_pro_grant', format($$select public.get_pro_grant(%L)$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('an unknown connection: get_client_closet', $$select * from public.get_client_closet(gen_random_uuid())$$, 'pro_unavailable');
select t.throws('a null connection: get_client_closet', $$select * from public.get_client_closet(null)$$, 'pro_unavailable');
select t.as_user(t.u('eve'));
select t.throws('a stranger cannot read a grant', format($$select public.get_pro_grant(%L)$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('a stranger cannot switch a grant off (way out gate, still not hers)', format($$select public.set_pro_grant(%L, 'closet', false)$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('a stranger cannot switch a grant on', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.c('c_ab')), 'adult_required');
select t.as_user(t.u('cat'));
select t.throws('another client cannot read Bea''s grant', format($$select public.get_pro_grant(%L)$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('another client cannot switch Bea''s grant on', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('another client cannot switch Bea''s grant off', format($$select public.set_pro_grant(%L, 'closet', false)$$, t.c('c_ab')), 'pro_unavailable');

-- ─── B. Nothing is shared by connecting ─────────────────────────────────────

select t.as_user(t.u('ann'));
select t.throws('connected, nothing shared: closet_not_shared', format($$select * from public.get_client_closet(%L)$$, t.c('c_ab')), 'closet_not_shared', null, null, '42501');
select t.check('the stylist''s grant has exactly five keys and says not shared',
               t.keys(public.get_pro_grant(t.c('c_ab'))) = t.stylist_keys()
               and (public.get_pro_grant(t.c('c_ab')) ->> 'enabled') = 'false'
               and (public.get_pro_grant(t.c('c_ab')) -> 'itemMode') = 'null'::jsonb);
select t.as_user(t.u('bea'));
select t.check('the client''s grant has exactly the twelve keys, off, with an empty log',
               t.keys(public.get_pro_grant(t.c('c_ab'))) = t.client_keys()
               and (public.get_pro_grant(t.c('c_ab')) ->> 'enabled') = 'false'
               and (public.get_pro_grant(t.c('c_ab')) -> 'events') = '[]'::jsonb
               and (public.get_pro_grant(t.c('c_ab')) -> 'itemIds') = 'null'::jsonb
               and (public.get_pro_grant(t.c('c_ab')) ->> 'views30d') = '0');
select t.as_admin();
select t.check('connecting wrote no grant and no grant event', not exists (select 1 from public.pro_grants) and not exists (select 1 from public.pro_grant_events));

-- ─── C. Enabling ────────────────────────────────────────────────────────────

select t.as_user(t.u('bea'));
select t.throws('the choice is required: no item mode', format($$select public.set_pro_grant(%L, 'closet', true, null, null, '2026-10')$$, t.c('c_ab')), 'invalid_request', 'item_mode', null, '22023');
select t.throws('the choice is required: an unknown item mode', format($$select public.set_pro_grant(%L, 'closet', true, 'some', null, '2026-10')$$, t.c('c_ab')), 'invalid_request', 'item_mode');
select t.throws('the scope must be closet', format($$select public.set_pro_grant(%L, 'wishlist', true, 'all', null, '2026-10')$$, t.c('c_ab')), 'invalid_request', 'scope');
select t.throws('the scope is required', format($$select public.set_pro_grant(%L, null, true, 'all', null, '2026-10')$$, t.c('c_ab')), 'invalid_request', 'scope');
select t.throws('the switch is required', format($$select public.set_pro_grant(%L, 'closet', null, 'all', null, '2026-10')$$, t.c('c_ab')), 'invalid_request', 'enabled');
select t.throws('selected needs pieces', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', null, '2026-10')$$, t.c('c_ab')), 'invalid_request', 'item_ids');
select t.throws('selected needs at least one piece', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', '{}', '2026-10')$$, t.c('c_ab')), 'invalid_request', 'item_ids');
select t.throws('selected refuses a null entry', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array[%L::uuid, null], '2026-10')$$, t.c('c_ab'), t.item('bea', 2)), 'invalid_request', 'item_ids');
select t.throws('selected takes at most 500 pieces', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array(select gen_random_uuid() from generate_series(1, 501)), '2026-10')$$, t.c('c_ab')), 'invalid_request', 'item_ids');
select t.throws('500 pieces that are not hers are all counted', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array(select gen_random_uuid() from generate_series(1, 500)), '2026-10')$$, t.c('c_ab')), 'item_not_found', '500', null, '22023');
select t.throws('another person''s piece is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array[%L::uuid], '2026-10')$$, t.c('c_ab'), t.item('cat', 2)), 'item_not_found', '1');
select t.throws('a wishlist piece is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array[%L::uuid], '2026-10')$$, t.c('c_ab'), t.item('bea', 6)), 'item_not_found', '1');
select t.throws('an unknown piece is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array[gen_random_uuid()], '2026-10')$$, t.c('c_ab')), 'item_not_found', '1');
select t.throws('the number that failed is reported', format($$select public.set_pro_grant(%L, 'closet', true, 'selected', array[%L::uuid, %L::uuid, %L::uuid], '2026-10')$$, t.c('c_ab'), t.item('bea', 2), t.item('cat', 2), t.item('bea', 6)), 'item_not_found', '2');
select t.throws('a stale or missing consent text is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-09')$$, t.c('c_ab')), 'stale_consent_text', null, null, '22023');
select t.throws('a missing consent text is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'all')$$, t.c('c_ab')), 'stale_consent_text');
select t.as_admin();
select t.check('none of the refused calls left anything behind',
               not exists (select 1 from public.pro_grants) and not exists (select 1 from public.pro_grant_items)
               and not exists (select 1 from public.pro_grant_events)
               and not exists (select 1 from public.pro_messages where code = 'sharing_on'));
-- Ann is also a client (she accepted the client terms), but she is the stylist of this connection.
update public.pro_members set client_terms_version = '2026-10', client_terms_accepted_at = now() where user_id = t.u('ann');
select t.as_user(t.u('ann'));
select t.throws('the stylist of the connection cannot switch sharing on', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.c('c_ab')), 'pro_unavailable');
select t.throws('the stylist of the connection cannot switch sharing off', format($$select public.set_pro_grant(%L, 'closet', false)$$, t.c('c_ab')), 'pro_unavailable');

-- The first grant: three chosen pieces, piece 1 being the one built to leak (price, notes, tag text, wear data, gallery).
select t.as_user(t.u('bea'));
select t.put('g1', public.set_pro_grant(t.c('c_ab'), 'closet', true, 'selected',
              array[t.item('bea', 1), t.item('bea', 2), t.item('bea', 3), t.item('bea', 2)], '2026-10')::text);
select t.check('enabling returns the client shape', t.keys(t.get('g1')::jsonb) = t.client_keys());
select t.check('enabled, selected, the three distinct pieces in a stable order, no more',
               (t.get('g1')::jsonb ->> 'enabled') = 'true' and (t.get('g1')::jsonb ->> 'itemMode') = 'selected'
               and (t.get('g1')::jsonb ->> 'itemCount') = '3'
               and (t.get('g1')::jsonb -> 'itemIds') = (select jsonb_agg(x order by x) from unnest(array[t.item('bea', 1), t.item('bea', 2), t.item('bea', 3)]) x));
select t.check('the consent text the client saw is recorded, and the log has one granted event',
               (t.get('g1')::jsonb ->> 'textVersion') = '2026-10'
               and jsonb_array_length(t.get('g1')::jsonb -> 'events') = 1
               and (t.get('g1')::jsonb -> 'events' -> 0 ->> 'event') = 'granted'
               and (t.get('g1')::jsonb -> 'events' -> 0 ->> 'itemMode') = 'selected'
               and (t.get('g1')::jsonb -> 'events' -> 0 ->> 'itemCount') = '3');
select t.check('a new grant lasts 90 days and does not warn yet',
               (t.get('g1')::jsonb ->> 'expiresAt')::timestamptz between now() + interval '89 days 23 hours' and now() + interval '90 days 1 hour'
               and (t.get('g1')::jsonb ->> 'expiresSoon') = 'false');
select t.as_admin();
select t.eq('exactly one neutral system line was written, with no sender and no body', (select count(*)::integer from public.pro_messages
   where connection_id = t.c('c_ab') and kind = 'system' and code = 'sharing_on' and sender_id is null and body = ''), 1);
select t.check('the connection did not move in the stylist''s list', (select last_activity_at = now() - interval '1 day' from public.pro_connections where id = t.c('c_ab')));
select t.eq('three grant items rows, one grant row', (select count(*)::integer from public.pro_grant_items where connection_id = t.c('c_ab'))
                                                  + (select count(*)::integer * 100 from public.pro_grants where connection_id = t.c('c_ab')), 103);
select t.as_user(t.u('ann'));
select t.check('Ann sees only: enabled, selected, three, when it ends',
               t.keys(public.get_pro_grant(t.c('c_ab'))) = t.stylist_keys()
               and (public.get_pro_grant(t.c('c_ab')) ->> 'enabled') = 'true'
               and (public.get_pro_grant(t.c('c_ab')) ->> 'itemMode') = 'selected'
               and (public.get_pro_grant(t.c('c_ab')) ->> 'itemCount') = '3'
               and (public.get_pro_grant(t.c('c_ab')) ->> 'expiresAt') is not null);
select t.check('turning sharing on is not unread, not a badge and not attention for the stylist', (
  select l.unread = 0 and not l.attention and l.last_activity_at = now() - interval '1 day'
    from public.list_pro_connections('stylist') l where l.connection_id = t.c('c_ab')) and public.get_pro_badge() = 0);

-- ─── D. get_client_closet ───────────────────────────────────────────────────

select t.put('page1', (select jsonb_agg(to_jsonb(r) order by r.name)::text from public.get_client_closet(t.c('c_ab')) r));
select t.eq('three pieces are returned', jsonb_array_length(t.get('page1')::jsonb), 3);
select t.check('every row has exactly the fourteen columns', (select bool_and(t.keys(e) = t.closet_keys()) from jsonb_array_elements(t.get('page1')::jsonb) e));
select t.check('total_count is repeated on every row', (select bool_and((e ->> 'total_count') = '3') from jsonb_array_elements(t.get('page1')::jsonb) e));
select t.check('nothing the fixtures use to leak is in the answer: price, notes, tag text, wear data, gallery, retailer, ids, addresses', (
  select t.get('page1') !~* '(private note|ex bea|laundry|555-123|zara store|retailer|gallery|wardrobe-images|supabase|http|file:|storage|date_added|wear_count|last_worn|favorite|estimated|care_|origin_)'
         and position(t.u('bea')::text in t.get('page1')) = 0
         and position(t.u('ann')::text in t.get('page1')) = 0
         and t.get('page1') !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'));
select t.check('no key of a row is a path, a link or an account id', (select not bool_or(k in ('user_image', 'retailer_image', 'photo_path', 'path', 'url', 'user_id', 'images'))
  from jsonb_array_elements(t.get('page1')::jsonb) e, jsonb_object_keys(e) k));
select t.check('the whole-piece row: the permitted fields are there, cleaned', (
  select e ->> 'name' = 'Blue blazer' and e ->> 'category' = 'outerwear' and e ->> 'subcategory' = 'blazer'
         and e ->> 'color' = 'blue' and e ->> 'brand' = 'Zara' and e -> 'season' = '["winter","autumn"]'::jsonb
         and e ->> 'pattern' = 'solid' and e ->> 'material' = 'wool' and e ->> 'size' = 'M' and e ->> 'condition' = 'good'
         and (e ->> 'has_photo') = 'true'
         and e -> 'materials' = '[{"name":"wool","percentage":80,"tier":"primary"},{"name":"nylon","percentage":20,"tier":"primary"}]'::jsonb
    from jsonb_array_elements(t.get('page1')::jsonb) e where e ->> 'name' = 'Blue blazer'));
select t.check('a piece without details returns nulls, not empty text, for what was never set', (
  select e ->> 'name' = 'Red scarf' and e -> 'brand' = 'null'::jsonb and e -> 'size' = 'null'::jsonb and (e ->> 'has_photo') = 'true'
    from jsonb_array_elements(t.get('page1')::jsonb) e where e ->> 'name' = 'Red scarf'));

-- Only the chosen pieces: switch to all, then the whole closet minus the wishlist.
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'all', null, '2026-10');
select t.check('all: the grant says so and lists no pieces', (public.get_pro_grant(t.c('c_ab')) ->> 'itemMode') = 'all'
               and (public.get_pro_grant(t.c('c_ab')) -> 'itemIds') = 'null'::jsonb and (public.get_pro_grant(t.c('c_ab')) ->> 'itemCount') = '7');
select t.as_admin();
select t.eq('all: no chosen-pieces rows remain', (select count(*)::integer from public.pro_grant_items where connection_id = t.c('c_ab')), 0);
select t.as_user(t.u('ann'));
select t.put('all1', (select jsonb_agg(to_jsonb(r))::text from public.get_client_closet(t.c('c_ab')) r));
select t.eq('all: seven pieces, the wishlist piece is not one of them', jsonb_array_length(t.get('all1')::jsonb), 7);
select t.check('all: the wishlist coat is absent and the order is newest first',
               t.get('all1') !~ 'Wishlist coat'
               and (select string_agg(e ->> 'name', '|' order by o) from jsonb_array_elements(t.get('all1')::jsonb) with ordinality x(e, o))
                   = 'Blue blazer|Red scarf|Linen shirt|Wool hat|Retailer-only top|Phone-local top|' || repeat('Very long name ', 8));
select t.check('all: a retailer-only image and a phone-local file give no photo', (
  select bool_and((e ->> 'has_photo') = 'false') from jsonb_array_elements(t.get('all1')::jsonb) e
   where e ->> 'name' in ('Retailer-only top', 'Phone-local top')));
select t.check('all: a long name is cut to 120 characters and a long brand to 60', (
  select max(char_length(e ->> 'name')) = 120 and max(char_length(e ->> 'brand')) = 60 from jsonb_array_elements(t.get('all1')::jsonb) e));
select t.check('all: the leak scan on the whole closet', t.get('all1') !~* '(private note|laundry|555-123|zara store|retailer\.test|gallery|wardrobe-images|supabase|file:)'
               and position(t.u('bea')::text in t.get('all1')) = 0);

-- Hostile text is capped: a 5,000-character name, a 30-entry materials list with long names and bad numbers, 50 season words.
select t.as_admin();
update public.clothing_items set name = repeat('x', 5000),
       materials = (select jsonb_agg(jsonb_build_object('name', repeat('m', 200) || n, 'percentage', case when n % 2 = 0 then '250' else 'abc' end,
                                                         'tier', 'evil')) from generate_series(1, 30) n),
       season = (select jsonb_agg(repeat('s', 40) || n) from generate_series(1, 50) n)
 where id = t.item('bea', 3);
update public.clothing_items set materials = '"just text"'::jsonb, season = '{"a":1}'::jsonb where id = t.item('bea', 4);
select t.as_user(t.u('ann'));
select t.put('hostile', (select jsonb_agg(to_jsonb(r))::text from public.get_client_closet(t.c('c_ab')) r));
select t.check('a 5,000-character name is 120 characters', (select max(char_length(e ->> 'name')) = 120 from jsonb_array_elements(t.get('hostile')::jsonb) e));
select t.check('a hostile materials list is at most 12 entries of names of at most 40 characters, with no out-of-range percentage or unknown tier', (
  select jsonb_array_length(e -> 'materials') <= 12
         and (select bool_and(char_length(m ->> 'name') <= 40 and (m -> 'percentage' is null or (m ->> 'percentage')::numeric <= 100) and m -> 'tier' is null)
                from jsonb_array_elements(e -> 'materials') m)
    from jsonb_array_elements(t.get('hostile')::jsonb) e where e ->> 'material' is null and e ->> 'category' = 'tops' and e ->> 'name' like 'xxx%'));
select t.check('a hostile season list is at most 6 words of at most 12 characters', (
  select jsonb_array_length(e -> 'season') = 6 and (select bool_and(char_length(s #>> '{}') <= 12) from jsonb_array_elements(e -> 'season') s)
    from jsonb_array_elements(t.get('hostile')::jsonb) e where e ->> 'name' like 'xxx%'));
select t.check('materials and season that are not lists come back as null, not as the text', (
  select e -> 'materials' = 'null'::jsonb and e -> 'season' = 'null'::jsonb
    from jsonb_array_elements(t.get('hostile')::jsonb) e where e ->> 'name' = 'Wool hat'));

-- Paging.
select t.eq('limit 3 offset 0: three rows', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), 0, 3)), 3);
select t.eq('limit 3 offset 3: three more', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), 3, 3)), 3);
select t.eq('limit 3 offset 6: the last one', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), 6, 3)), 1);
select t.check('the pages do not overlap and together are the whole closet', (
  select count(distinct item_id) = 7 from (select item_id from public.get_client_closet(t.c('c_ab'), 0, 3)
                                           union all select item_id from public.get_client_closet(t.c('c_ab'), 3, 3)
                                           union all select item_id from public.get_client_closet(t.c('c_ab'), 6, 3)) s));
select t.check('an offset past the end returns the last page with total_count', (
  select count(*) = 1 and bool_and(total_count = 7) from public.get_client_closet(t.c('c_ab'), 100, 3)));
select t.check('an offset exactly at the end also returns the last page', (
  select count(*) = 1 and bool_and(total_count = 7) from public.get_client_closet(t.c('c_ab'), 7, 3)));
select t.check('a last page that is a whole page is returned whole', (
  select count(*) = 7 from public.get_client_closet(t.c('c_ab'), 70, 7)));
select t.eq('limit 0 is clamped to 1', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), 0, 0)), 1);
select t.eq('a negative limit is clamped to 1', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), 0, -5)), 1);
select t.eq('a limit of 1,000 is clamped to the page size (60)', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), 0, 1000)), 7);
select t.eq('a negative offset is 0', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), -4, 3)), 3);
select t.eq('null offset and limit are the defaults', (select count(*)::integer from public.get_client_closet(t.c('c_ab'), null, null)), 7);

-- A grant of chosen pieces that are all gone returns no rows and no total.
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'selected', array[t.item('bea', 4)], '2026-10');
select t.as_admin();
delete from public.clothing_items where id = t.item('bea', 4);
select t.eq('a deleted piece leaves a selected grant (by cascade)', (select count(*)::integer from public.pro_grant_items where connection_id = t.c('c_ab')), 0);
select t.as_user(t.u('ann'));
select t.eq('the grant is still on and shows nothing', (select count(*)::integer from public.get_client_closet(t.c('c_ab'))), 0);
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'selected', array[t.item('bea', 1), t.item('bea', 2), t.item('bea', 3)], '2026-10');
select t.as_admin();
delete from public.clothing_items where id = t.item('bea', 2);
select t.as_user(t.u('ann'));
select t.eq('a deleted chosen piece drops out of the closet and the count', (select count(*)::integer from public.get_client_closet(t.c('c_ab'))), 2);
select t.check('and the total says so', (select bool_and(total_count = 2) from public.get_client_closet(t.c('c_ab'))));

-- Counters: the client sees them, the stylist does not.
select t.as_admin();
select t.check('the page views were counted for today, per connection', (select pages >= 10 from public.pro_closet_views where connection_id = t.c('c_ab') and day = current_date));
select t.check('and for no other connection', not exists (select 1 from public.pro_closet_views where connection_id = t.c('c_ac')));
select t.as_user(t.u('bea'));
select t.check('Bea sees when it was last viewed and how many pages in 30 days',
               (public.get_pro_grant(t.c('c_ab')) ->> 'lastViewedAt') is not null and (public.get_pro_grant(t.c('c_ab')) ->> 'views30d')::integer >= 10
               and (public.get_pro_connection(t.c('c_ab')) -> 'closet' ->> 'views30d')::integer >= 10);
select t.as_user(t.u('ann'));
select t.check('Ann sees neither', (public.get_pro_connection(t.c('c_ab')) -> 'closet' -> 'lastViewedAt') = 'null'::jsonb
               and (public.get_pro_connection(t.c('c_ab')) -> 'closet' ->> 'views30d') = '0'
               and not (public.get_pro_grant(t.c('c_ab')) ? 'views30d') and not (public.get_pro_grant(t.c('c_ab')) ? 'lastViewedAt'));

-- Limits: 200 pages a day per connection, 600 a day per person.
select t.as_admin();
update public.pro_closet_views set pages = 199 where connection_id = t.c('c_ab') and day = current_date;
select t.as_user(t.u('ann'));
select count(*) from public.get_client_closet(t.c('c_ab'));
select t.throws('the 201st page of a connection in a day is refused', format($$select * from public.get_client_closet(%L)$$, t.c('c_ab')), 'closet_page_limit', null, null, '54000');
select t.as_admin();
select t.eq('a refused page is not counted', (select pages from public.pro_closet_views where connection_id = t.c('c_ab') and day = current_date), 200);
update public.pro_closet_views set pages = 3 where connection_id = t.c('c_ab') and day = current_date;
delete from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'closet_page_day';
do $$ begin for i in 1..600 loop perform public.pro_rate_check(t.u('ann'), 'closet_page_day'); end loop; end $$;
select t.as_user(t.u('ann'));
select t.throws('the 601st page of a person in a day is refused', format($$select * from public.get_client_closet(%L)$$, t.c('c_ab')), 'pro_rate_limited', 'closet_page_day', null, '54000');
select t.as_admin();
delete from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'closet_page_day';
select t.check('a refused page is not counted either', (select pages = 3 from public.pro_closet_views where connection_id = t.c('c_ab') and day = current_date));

-- The log is checked exactly on Cat's connection, which nothing above touched.
select t.check('so far the log of Bea''s connection starts with the first grant',
               (select event from public.pro_grant_events where connection_id = t.c('c_ab') order by id limit 1) = 'granted');
select t.as_user(t.u('cat'));
select t.put('cat1', public.set_pro_grant(t.c('c_ac'), 'closet', true, 'selected', array[t.item('cat', 2), t.item('cat', 3)], '2026-10')::text);
select t.as_admin();
update public.pro_grants set expires_at = now() + interval '10 days' where connection_id = t.c('c_ac');
select t.as_user(t.u('cat'));
select t.put('r', public.set_pro_grant(t.c('c_ac'), 'closet', true, 'selected', array[t.item('cat', 2), t.item('cat', 4)], '2026-10')::text);
select t.check('changing the pieces keeps the original expiry',
               (t.get('r')::jsonb ->> 'expiresAt')::timestamptz between now() + interval '9 days 23 hours' and now() + interval '10 days 1 hour');
select t.put('r', public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10')::text);
select t.check('changing the mode keeps it too, and at 10 days there is no warning',
               (t.get('r')::jsonb ->> 'expiresAt')::timestamptz between now() + interval '9 days 23 hours' and now() + interval '10 days 1 hour'
               and (t.get('r')::jsonb ->> 'expiresSoon') = 'false');
select t.as_admin();
update public.pro_grants set expires_at = now() + interval '3 days' where connection_id = t.c('c_ac');
select t.as_user(t.u('cat'));
select t.check('three days left: expiresSoon, in the grant and in the connection', (public.get_pro_grant(t.c('c_ac')) ->> 'expiresSoon') = 'true'
               and (public.get_pro_connection(t.c('c_ac')) -> 'closet' ->> 'expiresSoon') = 'true');
select t.put('r', public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10')::text);
select t.check('saying the same thing again does not renew',
               (t.get('r')::jsonb ->> 'expiresAt')::timestamptz between now() + interval '2 days 23 hours' and now() + interval '3 days 1 hour');
select t.throws('renewing needs the current consent text', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-09', true)$$, t.c('c_ac')), 'stale_consent_text');
select t.put('r', public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10', true)::text);
select t.check('only p_renew sets a new 90 days, and the warning goes',
               (t.get('r')::jsonb ->> 'expiresAt')::timestamptz between now() + interval '89 days 23 hours' and now() + interval '90 days 1 hour'
               and (t.get('r')::jsonb ->> 'expiresSoon') = 'false');
select t.as_admin();
select t.eq('the log: granted, changed (pieces), changed (mode), renewed; the repeat wrote nothing',
  (select string_agg(event, ',' order by id) from public.pro_grant_events where connection_id = t.c('c_ac')),
  'granted,changed,changed,renewed');
select t.eq('the renewal records the mode it was made in', (select item_mode from public.pro_grant_events where connection_id = t.c('c_ac') and event = 'renewed'), 'all');
select t.eq('the first event counts the pieces', (select item_count from public.pro_grant_events where connection_id = t.c('c_ac') and event = 'granted'), 2);
select t.eq('sharing_on was written once, at the start, and for no change and no renewal',
            (select count(*)::integer from public.pro_messages where connection_id = t.c('c_ac') and code = 'sharing_on'), 1);
select t.check('Cat''s changes did not move the connection in Ann''s list', (select last_activity_at = now() - interval '1 day' from public.pro_connections where id = t.c('c_ac')));
select t.as_user(t.u('cat'));
select t.check('the client reads the log newest first', (public.get_pro_grant(t.c('c_ac')) -> 'events' -> 0 ->> 'event') = 'renewed'
               and (public.get_pro_grant(t.c('c_ac')) -> 'events' -> 3 ->> 'event') = 'granted');
select t.as_user(t.u('ann'));
select t.check('Ann''s grant record carries no history', not (public.get_pro_grant(t.c('c_ac')) ? 'events') and not (public.get_pro_grant(t.c('c_ac')) ? 'textVersion'));

-- ─── F. Turning sharing off; expiry ─────────────────────────────────────────

-- From any build: under the kill switch, a suspension, stale terms and a stale consent text, with no text version.
select t.as_admin();
update public.pro_config set value = 'false' where key = 'pro_enabled';
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
update public.pro_config set value = '"2026-11"' where key = 'share_text_version';
update public.pro_members set suspended_at = now(), suspended_reason = 'test' where user_id = t.u('cat');
select t.as_user(t.u('cat'));
select t.throws('paused, suspended and out of date: switching ON is refused (the kill switch first)', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-11')$$, t.c('c_ac')), 'pro_disabled');
select t.check('the grant is still readable by the client under all of that', (public.get_pro_grant(t.c('c_ac')) ->> 'enabled') = 'true');
select t.check('switching OFF works, with no text version, and returns the client shape off', (
  public.set_pro_grant(t.c('c_ac'), 'closet', false) ->> 'enabled') = 'false');
select t.as_admin();
select t.eq('the log gained one revoked event', (select string_agg(event, ',' order by id) from public.pro_grant_events where connection_id = t.c('c_ac')),
            'granted,changed,changed,renewed,revoked');
select t.eq('no row of the grant or of its pieces is left', (select count(*)::integer from public.pro_grants where connection_id = t.c('c_ac'))
          + (select count(*)::integer from public.pro_grant_items where connection_id = t.c('c_ac')), 0);
select t.eq('revoking wrote no message (sharing_on is still the only system line besides connected)',
            (select count(*)::integer from public.pro_messages where connection_id = t.c('c_ac') and code <> 'connected'), 1);
select t.check('revoking did not move the connection in the stylist''s list', (select last_activity_at = now() - interval '1 day' from public.pro_connections where id = t.c('c_ac')));
select t.as_user(t.u('cat'));
select t.check('switching off again changes nothing and logs nothing', (public.set_pro_grant(t.c('c_ac'), 'closet', false) ->> 'enabled') = 'false');
select t.as_admin();
select t.eq('still one revoked event', (select count(*)::integer from public.pro_grant_events where connection_id = t.c('c_ac') and event = 'revoked'), 1);
update public.pro_config set value = 'true' where key = 'pro_enabled';
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';
update public.pro_config set value = '"2026-10"' where key = 'share_text_version';
update public.pro_members set suspended_at = null, suspended_reason = null where user_id = t.u('cat');
select t.as_user(t.u('ann'));
select t.throws('after the revocation the stylist''s next read says closet_not_shared', format($$select * from public.get_client_closet(%L)$$, t.c('c_ac')), 'closet_not_shared');
select t.check('and the stylist''s grant says only "not shared": the same as if it had never been on', (public.get_pro_grant(t.c('c_ac')) ->> 'enabled') = 'false'
               and t.keys(public.get_pro_grant(t.c('c_ac'))) = t.stylist_keys() and (public.get_pro_grant(t.c('c_ac')) -> 'expiresAt') = 'null'::jsonb);

-- It is not rate limited: 70 calls in a row (the cap for switching on is 60 a day), and none is counted.
select t.as_admin();
select t.put('n_before', (select n::text from public.pro_rate_counters where user_id = t.u('cat') and bucket = 'grant_day'));
select t.as_user(t.u('cat'));
do $$ begin for i in 1..70 loop perform public.set_pro_grant(t.c('c_ac'), 'closet', false); end loop; end $$;
select t.as_admin();
select t.eq('switching off is not counted', (select n::text from public.pro_rate_counters where user_id = t.u('cat') and bucket = 'grant_day'), t.get('n_before'));

-- Switching on is: 60 a day.
delete from public.pro_rate_counters where user_id = t.u('cat') and bucket = 'grant_day';
do $$ begin for i in 1..60 loop perform public.pro_rate_check(t.u('cat'), 'grant_day'); end loop; end $$;
select t.as_user(t.u('cat'));
select t.throws('the 61st switching-on of a day is rate limited', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.c('c_ac')), 'pro_rate_limited', 'grant_day', null, '54000');
select t.as_admin();
delete from public.pro_rate_counters where user_id = t.u('cat') and bucket = 'grant_day';

-- A second sharing_on within 24 hours is not written; after a day it is.
select t.as_user(t.u('cat'));
select public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10');
select t.as_admin();
select t.eq('off and on again within a day: still one sharing_on line', (select count(*)::integer from public.pro_messages where connection_id = t.c('c_ac') and code = 'sharing_on'), 1);
select t.as_user(t.u('cat'));
select public.set_pro_grant(t.c('c_ac'), 'closet', false);
select t.as_admin();
update public.pro_messages set created_at = now() - interval '2 days' where connection_id = t.c('c_ac') and code = 'sharing_on';
select t.as_user(t.u('cat'));
select public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10');
select t.as_admin();
select t.eq('a day later it is written again', (select count(*)::integer from public.pro_messages where connection_id = t.c('c_ac') and code = 'sharing_on'), 2);
select t.as_user(t.u('ann'));
select t.check('and system lines still do not count as unread or as attention for the stylist', (
  select l.unread = 0 and not l.attention from public.list_pro_connections('stylist') l where l.connection_id = t.c('c_ac')) and public.get_pro_badge() = 0);

-- Expiry: a grant that has run out stops reads at once (the row may still be there), and the next read of either
-- person sweeps it with one 'expired' event, however many times they read afterwards.
select t.as_admin();
select t.check('before: Bea''s grant is on and has no expired event',
               exists (select 1 from public.pro_grants where connection_id = t.c('c_ab'))
               and not exists (select 1 from public.pro_grant_events where connection_id = t.c('c_ab') and event = 'expired'));
update public.pro_grants set expires_at = now() - interval '1 hour' where connection_id = t.c('c_ab');
select t.as_user(t.u('ann'));
select t.throws('an expired grant is not readable even before it is swept', format($$select * from public.get_client_closet(%L)$$, t.c('c_ab')), 'closet_not_shared');
select t.as_admin();
select t.check('(the row was still there: the read did not depend on the sweep)', exists (select 1 from public.pro_grants where connection_id = t.c('c_ab')));
select t.as_user(t.u('ann'));
select t.check('the stylist''s record says not shared', (public.get_pro_grant(t.c('c_ab')) ->> 'enabled') = 'false');
select t.as_user(t.u('bea'));
select t.check('the client''s record says off and logs the expiry', (public.get_pro_grant(t.c('c_ab')) ->> 'enabled') = 'false'
               and (public.get_pro_grant(t.c('c_ab')) -> 'events' -> 0 ->> 'event') = 'expired');
select public.get_pro_grant(t.c('c_ab'));
select public.get_pro_connection(t.c('c_ab'));
select t.as_admin();
select t.eq('one expired event after four reads by both people', (select count(*)::integer from public.pro_grant_events where connection_id = t.c('c_ab') and event = 'expired'), 1);
select t.eq('no revoked event for an expiry', (select count(*)::integer from public.pro_grant_events where connection_id = t.c('c_ab') and event = 'revoked'), 0);
select t.eq('the grant and its pieces are gone', (select count(*)::integer from public.pro_grants where connection_id = t.c('c_ab'))
          + (select count(*)::integer from public.pro_grant_items where connection_id = t.c('c_ab')), 0);
select t.eq('an expiry writes no message', (select count(*)::integer from public.pro_messages where connection_id = t.c('c_ab') and code <> 'connected'), 1);

-- Switching on over a stale row that nobody swept: it is cleared with its event and a new grant starts.
select t.as_admin();
update public.pro_grants set expires_at = now() - interval '1 hour' where connection_id = t.c('c_ac');
select t.put('revoked_before', (select count(*)::text from public.pro_grant_events where connection_id = t.c('c_ac') and event = 'revoked'));
select t.as_user(t.u('cat'));
select public.set_pro_grant(t.c('c_ac'), 'closet', false);
select t.as_admin();
select t.check('switching off over a stale row logs the expiry, not a revocation', (select event from public.pro_grant_events where connection_id = t.c('c_ac') order by id desc limit 1) = 'expired'
               and (select count(*)::text from public.pro_grant_events where connection_id = t.c('c_ac') and event = 'revoked') = t.get('revoked_before'));
select t.as_user(t.u('cat'));
select public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10');
select t.as_admin();
update public.pro_grants set expires_at = now() - interval '1 hour' where connection_id = t.c('c_ac');
select t.as_user(t.u('cat'));
select t.put('r', public.set_pro_grant(t.c('c_ac'), 'closet', true, 'all', null, '2026-10')::text);
select t.check('switching on over a stale row starts a new grant of 90 days',
               (t.get('r')::jsonb ->> 'expiresAt')::timestamptz between now() + interval '89 days 23 hours' and now() + interval '90 days 1 hour'
               and (t.get('r')::jsonb -> 'events' -> 0 ->> 'event') = 'granted' and (t.get('r')::jsonb -> 'events' -> 1 ->> 'event') = 'expired');

-- ─── G. Every way a read stops, at once ─────────────────────────────────────

-- A client with one photographed piece, an "all" grant and a connection to a stylist, made directly (as the owner).
select t.as_admin();
create function t.mk_shared(p_stylist uuid, p_tag text) returns uuid language plpgsql as $$
declare
  cl  uuid := t.mk_user(p_tag, true, false);
  itm uuid;
  cid uuid;
begin
  insert into public.clothing_items (user_id, name, category, user_image)
  values (cl, 'Item of ' || p_tag, 'tops', 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || cl::text || '/1700000000001.jpg')
  returning id into itm;
  cid := t.mk_conn(p_stylist, cl, initcap(p_tag));
  insert into public.pro_grants (connection_id, scope, item_mode, expires_at, text_version)
  values (cid, 'closet', 'all', now() + interval '90 days', '2026-10');
  perform t.put('cl_' || p_tag, cl::text);
  perform t.put('it_' || p_tag, itm::text);
  perform t.put('cx_' || p_tag, cid::text);
  return cid;
end $$;
select t.mk_shared(t.u('ann'), 'live') is not null;
select t.as_user(t.u('ann'));
select t.eq('control: the shared piece is readable', (select count(*)::integer from public.get_client_closet(t.get('cx_live')::uuid)), 1);
select t.as_service();
select t.eq('control: and its photo is served', public.pro_photo_source(t.u('ann'), t.get('cx_live')::uuid, t.get('it_live')::uuid), t.get('cl_live') || '/1700000000001.jpg');

-- 1. the client ends the connection (a real call)
select t.as_admin();
select t.mk_shared(t.u('ann'), 'ended') is not null;
select t.as_user(t.get('cl_ended')::uuid);
select public.end_pro_connection(t.get('cx_ended')::uuid);
select t.as_user(t.u('ann'));
select t.throws('ended: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_ended')), 'pro_unavailable');
select t.check('ended: the stylist''s grant says not shared', (public.get_pro_grant(t.get('cx_ended')::uuid) ->> 'enabled') = 'false');
select t.as_service();
select t.check('ended: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_ended')::uuid, t.get('it_ended')::uuid) is null);
select t.as_user(t.get('cl_ended')::uuid);
select t.check('ended: the client keeps the log, with the end in it, and the grant is off', (public.get_pro_grant(t.get('cx_ended')::uuid) ->> 'enabled') = 'false'
               and (public.get_pro_grant(t.get('cx_ended')::uuid) -> 'events' -> 0 ->> 'event') = 'connection_ended');
select t.check('ended: switching off an ended connection is a no-op', (public.set_pro_grant(t.get('cx_ended')::uuid, 'closet', false) ->> 'enabled') = 'false');
select t.throws('ended: switching on is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.get('cx_ended')), 'connection_ended', null, null, '22023');
select t.as_admin();
select t.eq('ended: still one connection_ended event and nothing after it', (select string_agg(event, ',' order by id) from public.pro_grant_events where connection_id = t.get('cx_ended')::uuid), 'connection_ended');

-- 2. a block made anywhere (the trigger of file 2): the connection becomes a closed shell
select t.mk_shared(t.u('ann'), 'blocked') is not null;
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('cl_blocked')::uuid, t.u('ann'), 'Ann');
select t.as_user(t.u('ann'));
select t.throws('blocked: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_blocked')), 'pro_unavailable');
select t.check('blocked: the stylist''s grant says not shared', (public.get_pro_grant(t.get('cx_blocked')::uuid) ->> 'enabled') = 'false');
select t.as_service();
select t.check('blocked: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_blocked')::uuid, t.get('it_blocked')::uuid) is null);
select t.as_user(t.get('cl_blocked')::uuid);
select t.check('blocked: the client''s record is off, with no log and no counters (a closed shell)',
               (public.get_pro_grant(t.get('cx_blocked')::uuid) ->> 'enabled') = 'false'
               and (public.get_pro_grant(t.get('cx_blocked')::uuid) -> 'events') = '[]'::jsonb
               and (public.get_pro_grant(t.get('cx_blocked')::uuid) ->> 'views30d') = '0'
               and (public.get_pro_grant(t.get('cx_blocked')::uuid) -> 'lastViewedAt') = 'null'::jsonb);
select t.check('blocked: switching off is a no-op and switching on says ended', (public.set_pro_grant(t.get('cx_blocked')::uuid, 'closet', false) ->> 'enabled') = 'false');
select t.throws('blocked: switching on says the connection ended, never "blocked"', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.get('cx_blocked')), 'connection_ended');

-- 3. a block that the trigger did not handle (it swallows its errors): the read itself refuses
select t.as_admin();
select t.mk_shared(t.u('ann'), 'untrig') is not null;
alter table public.user_blocks disable trigger pro_on_block;
insert into public.user_blocks (blocker_id, blocked_id, blocked_name) values (t.get('cl_untrig')::uuid, t.u('ann'), 'Ann');
alter table public.user_blocks enable trigger pro_on_block;
select t.check('untriggered: the connection and the grant are still there', exists (select 1 from public.pro_connections where id = t.get('cx_untrig')::uuid and status = 'active')
               and exists (select 1 from public.pro_grants where connection_id = t.get('cx_untrig')::uuid));
select t.as_user(t.u('ann'));
select t.throws('untriggered: get_client_closet refuses a blocked pair', format($$select * from public.get_client_closet(%L)$$, t.get('cx_untrig')), 'pro_unavailable');
select t.check('untriggered: the stylist''s grant says not shared', (public.get_pro_grant(t.get('cx_untrig')::uuid) ->> 'enabled') = 'false');
select t.as_service();
select t.check('untriggered: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_untrig')::uuid, t.get('it_untrig')::uuid) is null);

-- 4. suspension of the stylist and of the client; 5. the switch; 6. the terms
select t.as_admin();
update public.pro_members set suspended_at = now() where user_id = t.u('ann');
select t.as_user(t.u('ann'));
select t.throws('stylist suspended: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_live')), 'pro_suspended', null, null, '42501');
select t.as_service();
select t.check('stylist suspended: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_live')::uuid, t.get('it_live')::uuid) is null);
select t.as_admin();
update public.pro_members set suspended_at = null where user_id = t.u('ann');
update public.pro_members set suspended_at = now() where user_id = t.get('cl_live')::uuid;
select t.as_user(t.u('ann'));
select t.throws('client suspended: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_live')), 'pro_unavailable');
select t.as_service();
select t.check('client suspended: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_live')::uuid, t.get('it_live')::uuid) is null);
select t.as_user(t.get('cl_live')::uuid);
select t.check('client suspended: can still read the record and switch it off', (public.get_pro_grant(t.get('cx_live')::uuid) ->> 'enabled') = 'true');
select t.as_admin();
update public.pro_members set suspended_at = null where user_id = t.get('cl_live')::uuid;

update public.pro_config set value = 'false' where key = 'pro_enabled';
select t.as_user(t.u('ann'));
select t.throws('switch off: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_live')), 'pro_disabled', null, null, '42501');
select t.check('switch off: the stylist''s record says not shared, with no error', (public.get_pro_grant(t.get('cx_live')::uuid) ->> 'enabled') = 'false');
select t.as_service();
select t.check('switch off: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_live')::uuid, t.get('it_live')::uuid) is null);
select t.as_user(t.get('cl_live')::uuid);
select t.check('switch off: the client still sees that it is on', (public.get_pro_grant(t.get('cx_live')::uuid) ->> 'enabled') = 'true');
select t.throws('switch off: switching on is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.get('cx_live')), 'pro_disabled');
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';

update public.pro_config set value = '"2026-11"' where key = 'stylist_terms_version';
select t.as_user(t.u('ann'));
select t.throws('stylist terms bumped: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_live')), 'pro_terms_required', 'stylist', null, '42501');
select t.as_service();
select t.check('stylist terms bumped: no photo', public.pro_photo_source(t.u('ann'), t.get('cx_live')::uuid, t.get('it_live')::uuid) is null);
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'stylist_terms_version';

-- The client terms bumped: every way out still works for the client, and the stylist's next read fails because the grant is gone.
select t.mk_shared(t.u('ann'), 'terms') is not null;
select t.mk_shared(t.u('ann'), 'terms2') is not null;
update public.pro_config set value = '"2026-11"' where key = 'client_terms_version';
select t.as_user(t.get('cl_terms')::uuid);
select t.throws('client terms bumped: switching on is refused', format($$select public.set_pro_grant(%L, 'closet', true, 'all', null, '2026-10')$$, t.get('cx_terms')), 'pro_terms_required', 'client');
select t.check('client terms bumped: she can still see the grant', (public.get_pro_grant(t.get('cx_terms')::uuid) ->> 'enabled') = 'true');
select t.check('client terms bumped: switching off works', (public.set_pro_grant(t.get('cx_terms')::uuid, 'closet', false) ->> 'enabled') = 'false');
select t.as_user(t.u('ann'));
select t.throws('client terms bumped, then switched off: the stylist''s next read fails', format($$select * from public.get_client_closet(%L)$$, t.get('cx_terms')), 'closet_not_shared');
select t.eq('client terms bumped: the stylist''s other, still shared client is still readable (the client terms do not gate the stylist)',
            (select count(*)::integer from public.get_client_closet(t.get('cx_terms2')::uuid)), 1);
select t.as_user(t.get('cl_terms2')::uuid);
select public.end_pro_connection(t.get('cx_terms2')::uuid);
select t.as_admin();
select t.check('client terms bumped: ending works (a way out)', (select status = 'ended' from public.pro_connections where id = t.get('cx_terms2')::uuid));
select t.mk_shared(t.u('ann'), 'terms3') is not null;
do $$
begin
  if to_regprocedure('public.block_pro_member(uuid, uuid)') is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', t.get('cl_terms3'), 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.block_pro_member(t.get('cx_terms3')::uuid, null);
    reset role;
    perform t.check('client terms bumped: block_pro_member works (a way out)', (select status = 'ended' and shell_at is not null from public.pro_connections where id = t.get('cx_terms3')::uuid));
  else
    perform t.check('client terms bumped: block_pro_member (skipped: file 8 is not applied)', true);
  end if;
end $$;
select t.as_admin();
update public.pro_config set value = '"2026-10"' where key = 'client_terms_version';

-- Ways out under a pause and a suspension together: ending (a real call), and switching sharing off on another connection.
select t.mk_shared(t.u('ann'), 'pause') is not null;
select t.mk_shared(t.u('ann'), 'pause2') is not null;
update public.pro_config set value = 'false' where key = 'pro_enabled';
update public.pro_members set suspended_at = now() where user_id in (t.get('cl_pause')::uuid, t.get('cl_pause2')::uuid);
select t.as_user(t.get('cl_pause')::uuid);
select public.end_pro_connection(t.get('cx_pause')::uuid);
select t.as_user(t.get('cl_pause2')::uuid);
select t.check('paused and suspended: switching off still works', (public.set_pro_grant(t.get('cx_pause2')::uuid, 'closet', false) ->> 'enabled') = 'false');
select t.as_admin();
update public.pro_config set value = 'true' where key = 'pro_enabled';
update public.pro_members set suspended_at = null where user_id in (t.get('cl_pause')::uuid, t.get('cl_pause2')::uuid);
select t.check('paused and suspended: ending worked and took the grant with it', (select status = 'ended' from public.pro_connections where id = t.get('cx_pause')::uuid)
               and not exists (select 1 from public.pro_grants where connection_id in (t.get('cx_pause')::uuid, t.get('cx_pause2')::uuid)));

-- The stylist closes the profile: the connections end with their grants, and a closed profile reads nothing.
select t.as_admin();
select t.put('fay', t.mk_stylist('fay', true)::text);
select t.mk_shared(t.get('fay')::uuid, 'fayc') is not null;
select t.as_user(t.get('fay')::uuid);
select count(*) from public.get_client_closet(t.get('cx_fayc')::uuid);
select public.close_stylist_profile();
select t.throws('profile closed: get_client_closet', format($$select * from public.get_client_closet(%L)$$, t.get('cx_fayc')), 'stylist_profile_required');
select t.check('profile closed: the grant is off', (public.get_pro_grant(t.get('cx_fayc')::uuid) ->> 'enabled') = 'false');
select t.as_service();
select t.check('profile closed: no photo', public.pro_photo_source(t.get('fay')::uuid, t.get('cx_fayc')::uuid, t.get('it_fayc')::uuid) is null);

-- ─── H. pro_photo_source ────────────────────────────────────────────────────

-- Bea chooses pieces 1, 3, 5 and 7 (5 has only a retailer image and 7 only a phone-local file).
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'selected', array[t.item('bea', 1), t.item('bea', 3), t.item('bea', 5), t.item('bea', 7)], '2026-10');
select t.as_service();
select t.eq('a granted cover photo returns its path (piece 1)', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 1)), t.u('bea')::text || '/170000000001.jpg');
select t.eq('a granted cover photo returns its path (piece 3)', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 3)), t.u('bea')::text || '/170000000003.jpg');
select t.check('a piece that is not chosen gets nothing (piece 8 has a photo)', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 8)) is null);
select t.check('a chosen piece with only a retailer image gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 5)) is null);
select t.check('a chosen piece whose image is a phone-local file gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 7)) is null);
select t.check('a deleted piece gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 2)) is null);
select t.check('another client''s piece gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('cat', 1)) is null);
select t.check('an unknown piece gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), gen_random_uuid()) is null);
select t.check('an unknown connection gets nothing', public.pro_photo_source(t.u('ann'), gen_random_uuid(), t.item('bea', 1)) is null);
select t.check('a null connection, piece or person gets nothing',
               public.pro_photo_source(t.u('ann'), null, t.item('bea', 1)) is null and public.pro_photo_source(t.u('ann'), t.c('c_ab'), null) is null
               and public.pro_photo_source(null, t.c('c_ab'), t.item('bea', 1)) is null);
select t.check('a stylist with another client''s connection gets nothing for Bea''s piece', public.pro_photo_source(t.u('ann'), t.c('c_ac'), t.item('bea', 1)) is null);
select t.check('a stylist who is not on the connection gets nothing', public.pro_photo_source(t.u('dee'), t.c('c_ab'), t.item('bea', 1)) is null);
select t.check('a stranger gets nothing', public.pro_photo_source(t.u('eve'), t.c('c_ab'), t.item('bea', 1)) is null);
select t.check('the client herself gets nothing (this door is for stylists)', public.pro_photo_source(t.u('bea'), t.c('c_ab'), t.item('bea', 1)) is null);
select t.check('Cat''s connection serves Cat''s piece to Ann (control: it is a real grant)', public.pro_photo_source(t.u('ann'), t.c('c_ac'), t.item('cat', 1)) is not null);

-- All pieces: the wishlist piece is still not served, a piece added now is.
select t.as_user(t.u('bea'));
select public.set_pro_grant(t.c('c_ab'), 'closet', true, 'all', null, '2026-10');
select t.as_service();
select t.check('all: the wishlist piece (with a photo) gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 6)) is null);
select t.check('all: a piece that was not chosen before is served', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 8)) is not null);
select t.check('all: Cat''s piece is still not served on Bea''s connection', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('cat', 1)) is null);
select t.as_admin();
insert into public.clothing_items (id, user_id, name, category, user_image)
values ('b1000000-0000-0000-0000-000000000099', t.u('bea'), 'Added later', 'tops',
        'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u('bea')::text || '/170000000099.jpg');
select t.as_service();
select t.eq('all: a piece added while sharing is on is served', public.pro_photo_source(t.u('ann'), t.c('c_ab'), 'b1000000-0000-0000-0000-000000000099'), t.u('bea')::text || '/170000000099.jpg');
select t.as_admin();
update public.clothing_items set is_wishlist = true where id = 'b1000000-0000-0000-0000-000000000099';
select t.as_service();
select t.check('all: a piece moved to the wishlist is no longer served', public.pro_photo_source(t.u('ann'), t.c('c_ab'), 'b1000000-0000-0000-0000-000000000099') is null);
select t.as_admin();
update public.clothing_items set user_image = 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u('cat')::text || '/170000000008.jpg' where id = t.item('bea', 8);
select t.as_service();
select t.check('a piece whose image address names someone else''s folder gets nothing', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 8)) is null);

-- The counter: only a success counts, and the 3,001st is refused.
select t.as_admin();
delete from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'photo_day';
select t.as_service();
select public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 1));
select public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 3));
select public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 5));
select public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('cat', 1));
select public.pro_photo_source(t.u('ann'), gen_random_uuid(), t.item('bea', 1));
select t.as_admin();
select t.eq('two successes and three refusals counted two', (select n from public.pro_rate_counters where user_id = t.u('ann') and bucket = 'photo_day'), 2);
update public.pro_rate_counters set n = 2999 where user_id = t.u('ann') and bucket = 'photo_day';
select t.as_service();
select t.check('the 3,000th photo of a day is served (3,000 is the cap)', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('bea', 1)) is not null);
select t.throws('the 3,001st is refused with the rate error (the function answers 429)', format($$select public.pro_photo_source(%L, %L, %L)$$, t.u('ann'), t.c('c_ab'), t.item('bea', 1)), 'pro_rate_limited', 'photo_day', null, '54000');
select t.check('a refusal does not use the rate (still null, no error, even at the cap)', public.pro_photo_source(t.u('ann'), t.c('c_ab'), t.item('cat', 1)) is null);
select t.as_admin();
