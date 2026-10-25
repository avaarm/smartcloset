-- p7_catalog (files 1 to 8): structural checks. Nothing is reachable except through the intended functions, and every
-- function and table is classified. The lists below are the contract of pro-accounts.md 3.3, 4.1, 4.5, 4.6 and 4.7.
--   A  the fifteen tables: row level security, no privilege, no policy; the two sequences; the views
--   B  the seventy-four functions: the exact lists for authenticated, for the service role, and for nobody; search_path;
--      no overload; named arguments
--   C  foreign keys: cascades, indexes
--   D  what the feature changes in shared objects: user_blocks, content_reports, the triggers; what it leaves alone
--   E  the legacy tables
-- The seed of pro_enabled (false) cannot be read here: 00_lib.sql switches the feature on for the run. The migration text
-- test (proFoundationMigration.test.ts) asserts the seed, and the lead reads it on the real project (11.1, P3).

select t.as_admin();

create function t.tables() returns text[] language sql immutable as $$
  select array['pro_config', 'pro_meta', 'pro_members', 'pro_stylists', 'pro_invites', 'pro_connections', 'pro_grants',
               'pro_grant_items', 'pro_grant_events', 'pro_closet_views', 'pro_recommendations', 'pro_recommendation_items',
               'pro_appointments', 'pro_messages', 'pro_rate_counters'] $$;
-- 4.6: the 36 functions an app user may execute.
create function t.client_functions() returns text[] language sql immutable as $$
  select array['get_pro_status', 'get_pro_badge', 'accept_pro_terms', 'get_my_stylist_profile', 'save_stylist_profile',
               'set_stylist_accepting', 'close_stylist_profile', 'create_pro_invite', 'list_my_pro_invites', 'revoke_pro_invite',
               'preview_pro_invite', 'redeem_pro_invite', 'list_pro_connections', 'get_pro_connection', 'end_pro_connection',
               'set_pro_alias', 'get_pro_grant', 'set_pro_grant', 'get_client_closet', 'save_pro_recommendation',
               'send_pro_recommendation', 'delete_pro_recommendation', 'list_pro_recommendations', 'get_pro_recommendation',
               'give_recommendation_feedback', 'propose_pro_appointment', 'respond_pro_appointment', 'cancel_pro_appointment',
               'list_pro_appointments', 'send_pro_message', 'get_pro_thread', 'report_pro_content', 'block_pro_member',
               'list_pro_blocks', 'unblock_pro_member', 'export_my_pro_data'] $$;
-- 4.5: internal helpers and triggers, executable by nobody but the owner.
create function t.helper_functions() returns text[] language sql immutable as $$
  select array['pro_raise', 'pro_cfg', 'pro_limit', 'pro_rate_check', 'pro_text_ok', 'pro_require_text', 'pro_gate', 'pro_new_code',
               'pro_norm_code', 'pro_clean_name', 'pro_name_ok', 'pro_clean_list', 'pro_clean_materials', 'pro_clean_season',
               'pro_photo_path', 'pro_lock_users', 'pro_invites_held', 'pro_report_is_qualified', 'pro_can_read_closet',
               'pro_end_connection', 'pro_end_between', 'pro_shell_connection', 'pro_on_block', 'pro_on_member_left',
               'pro_refresh', 'pro_chat_evidence'] $$;
-- 4.7 and pro_photo_source: the service role only.
create function t.service_functions() returns text[] language sql immutable as $$
  select array['pro_janitor', 'pro_photo_source', 'pro_set_enabled', 'pro_admin_approve_stylist', 'pro_admin_hold_stylist',
               'pro_admin_release_stylist', 'pro_admin_suspend', 'pro_admin_unsuspend', 'pro_admin_remove_stylist',
               'pro_admin_restore_stylist', 'pro_report_backlog', 'pro_send_report_digest'] $$;
create function t.all_functions() returns text[] language sql immutable as $$
  select t.client_functions() || t.helper_functions() || t.service_functions() $$;
-- The functions of the feature as they are in the database (by name, schema public).
create view t.pro_procs as
  select p.oid, p.proname::text as name from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(t.all_functions());
grant select on t.pro_procs to public;

-- ─── A. Tables, sequences, views ────────────────────────────────────────────

select t.check('the three lists have 36, 26 and 12 names, and the 74 are all different',
  cardinality(t.client_functions()) = 36 and cardinality(t.helper_functions()) = 26 and cardinality(t.service_functions()) = 12
  and (select count(distinct n) from unnest(t.all_functions()) n) = 74);
select t.check('all fifteen tables exist, and there are no others named pro_*',
  (select count(*) = 15 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname = any(t.tables()))
  and not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'f', 'm') and c.relname like 'pro\_%' and c.relname <> all(t.tables())));
select t.check('row level security is on for every pro table',
  not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any(t.tables()) and not c.relrowsecurity));
select t.check('anon and authenticated hold no privilege on any pro table, or on any column of one',
  not exists (select 1 from pg_class c, unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
               where c.relnamespace = 'public'::regnamespace and c.relname = any(t.tables()) and has_table_privilege(r, c.oid, p))
  and not exists (select 1 from pg_class c, unnest(array['anon', 'authenticated']) r
               where c.relnamespace = 'public'::regnamespace and c.relname = any(t.tables()) and has_any_column_privilege(r, c.oid, 'select,insert,update,references')));
select t.check('and neither does PUBLIC (the ACL of no pro table names it)',
  not exists (select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               where c.relnamespace = 'public'::regnamespace and c.relname = any(t.tables()) and a.grantee = 0));
select t.check('the two identity sequences are closed to app users',
  not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['public.pro_messages_id_seq', 'public.pro_grant_events_id_seq']) s, unnest(array['usage', 'select', 'update']) p
               where has_sequence_privilege(r, s, p)));
select t.check('there is no policy on any pro table',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = any(t.tables())));
select t.check('and none on storage.objects that mentions a pro function or table',
  not exists (select 1 from pg_policies p, unnest(t.all_functions() || t.tables()) n
               where p.schemaname = 'storage' and p.tablename = 'objects' and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') like '%' || n || '%'));
select t.check('and none on any table at all that mentions one (policies on user_blocks name only via_pro)',
  not exists (select 1 from pg_policies p, unnest(t.all_functions() || t.tables()) n
               where coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') like '%' || n || '%'));
select t.check('pro_config holds the switch as a boolean and the versions as strings',
  (select jsonb_typeof(value) = 'boolean' from public.pro_config where key = 'pro_enabled')
  and (select bool_and(jsonb_typeof(value) = 'string') and count(*) = 3 from public.pro_config where key in ('stylist_terms_version', 'client_terms_version', 'share_text_version'))
  and (select jsonb_typeof(value) = 'number' from public.pro_config where key = 'min_account_age_hours')
  and not exists (select 1 from public.pro_config where key = 'directory_enabled'));
select t.check('the two views are closed to app users and readable by the service role',
  (select count(*) = 2 and bool_and(c.relkind = 'v' and not has_table_privilege('anon', c.oid, 'select') and not has_table_privilege('authenticated', c.oid, 'select')
                                   and has_table_privilege('service_role', c.oid, 'select'))
     from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('pro_moderation_queue', 'pro_review_queue')));
select t.check('and PUBLIC cannot read them either',
  not exists (select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               where c.relnamespace = 'public'::regnamespace and c.relname in ('pro_moderation_queue', 'pro_review_queue') and a.grantee = 0));

-- ─── B. Functions ───────────────────────────────────────────────────────────

select t.check('every one of the 74 functions exists exactly once (no overload, nothing renamed)',
  (select count(*) = 74 and count(distinct name) = 74 from t.pro_procs));
select t.check('and no other function in public is named pro_*',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'pro\_%' and p.proname <> all(t.all_functions())));
select t.eq('authenticated can execute exactly the 36 client functions',
  (select coalesce(array_agg(name order by name), '{}') from t.pro_procs where has_function_privilege('authenticated', oid, 'execute')),
  (select array_agg(n order by n) from unnest(t.client_functions()) n));
select t.check('no guest can execute any of the 74', not exists (select 1 from t.pro_procs where has_function_privilege('anon', oid, 'execute')));
select t.check('and no function of the feature is executable by PUBLIC',
  not exists (select 1 from t.pro_procs pp join pg_proc p on p.oid = pp.oid cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
select t.check('the service role can execute the 12 service functions',
  (select count(*) = 12 and bool_and(has_function_privilege('service_role', oid, 'execute')) from t.pro_procs where name = any(t.service_functions())));
select t.check('the service functions are executable by neither an app user nor a guest',
  not exists (select 1 from t.pro_procs where name = any(t.service_functions()) and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))));
select t.check('the 26 helpers are executable by neither an app user nor a guest',
  (select count(*) = 26 from t.pro_procs where name = any(t.helper_functions()))
  and not exists (select 1 from t.pro_procs where name = any(t.helper_functions()) and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))));
select t.check('every function of the feature pins search_path',
  not exists (select 1 from t.pro_procs pp join pg_proc p on p.oid = pp.oid
               where p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public')));
select t.check('every client and service function runs as its owner (security definer)',
  (select count(*) = 48 and bool_and(p.prosecdef) from t.pro_procs pp join pg_proc p on p.oid = pp.oid where pp.name = any(t.client_functions() || t.service_functions())));
select t.check('every client function takes only p_-prefixed, named arguments',
  not exists (select 1 from t.pro_procs pp join pg_proc p on p.oid = pp.oid, unnest(coalesce(p.proargnames, '{}'::text[])) a
               where pp.name = any(t.client_functions()) and a !~ '^p_[a-z_]+$' and a <> all(coalesce(p.proargnames[p.pronargs + 1:], '{}'::text[]))));
select t.check('and every one of them has all its arguments named',
  not exists (select 1 from t.pro_procs pp join pg_proc p on p.oid = pp.oid
               where pp.name = any(t.client_functions()) and p.pronargs > 0 and (p.proargnames is null or cardinality(p.proargnames) < p.pronargs)));
select t.check('the functions that return a table start with the column-wins pragma',
  not exists (select 1 from t.pro_procs pp join pg_proc p on p.oid = pp.oid
               where pp.name = any(t.client_functions()) and p.proretset and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
                 and p.prosrc not like '%#variable_conflict use_column%'));
select t.check('swap''s report function, which file 8 replaced, is still its own: client-executable, definer, pinned',
  (select count(*) = 1 and bool_and(p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
                                    and p.proconfig @> array['search_path=public'])
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'report_swap_content'));
select t.check('the functions of other features that the feature uses are not replaced: no mention of pro in them',
  (select count(*) = 8 and bool_and(p.prosrc !~ 'pro_')
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('block_user', 'report_user', 'delete_user_account', 'get_friend_closet', 'find_user_by_email', 'is_blocked_between', 'are_friends', 'swap_fold_text')));

-- ─── C. Foreign keys ────────────────────────────────────────────────────────

select t.check('there are seven foreign keys from the pro tables to auth.users',
  (select count(*) = 7 from pg_constraint k where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.conrelid::regclass::text = any(t.tables())));
select t.check('every one of them cascades, except the two on pro_connections, which set null (the other person keeps a labelled record)',
  (select count(*) filter (where k.confdeltype = 'c') = 5 and count(*) filter (where k.confdeltype = 'n') = 2
          and bool_and(k.confdeltype = 'c' or k.conrelid = 'public.pro_connections'::regclass)
     from pg_constraint k where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.conrelid::regclass::text = any(t.tables())));
select t.check('the two that set null are stylist_id and client_id of pro_connections',
  (select array_agg(a.attname::text order by a.attname) = array['client_id', 'stylist_id']
     from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'n' and k.conrelid::regclass::text = any(t.tables())));
select t.check('every foreign key from a pro table has an index whose leading column is the key column',
  not exists (select 1 from pg_constraint k
               where k.contype = 'f' and k.conrelid::regclass::text = any(t.tables())
                 and not exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indisvalid and i.indkey[0] = k.conkey[1])));
select t.check('and there are foreign keys to check (the test is not vacuous)',
  (select count(*) >= 14 from pg_constraint k where k.contype = 'f' and k.conrelid::regclass::text = any(t.tables())));
select t.check('a deleted closet piece leaves a grant (cascade) and keeps the copied name in a look (set null)',
  (select k.confdeltype = 'c' from pg_constraint k where k.conrelid = 'public.pro_grant_items'::regclass and k.confrelid = 'public.clothing_items'::regclass)
  and (select k.confdeltype = 'n' from pg_constraint k where k.conrelid = 'public.pro_recommendation_items'::regclass and k.confrelid = 'public.clothing_items'::regclass));

-- ─── D. Shared objects ──────────────────────────────────────────────────────

select t.check('both client policies on user_blocks keep out the rows of swaps and stylists',
  (select count(*) = 2 and bool_and(qual like '%via_pro%' and qual like '%via_swap%' and 'authenticated' = any(roles))
     from pg_policies where schemaname = 'public' and tablename = 'user_blocks'));
select t.check('user_blocks has the via_pro column, false by default',
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_blocks' and column_name = 'via_pro' and column_default = 'false' and is_nullable = 'NO'));
select t.check('the block trigger runs after every insert on user_blocks and is enabled',
  (select count(*) = 1 and bool_and(tgenabled = 'O') and bool_and(pg_get_triggerdef(oid) ~ 'AFTER INSERT ON public.user_blocks FOR EACH ROW EXECUTE FUNCTION pro_on_block\(\)')
     from pg_trigger where tgrelid = 'public.user_blocks'::regclass and tgname = 'pro_on_block' and not tgisinternal));
select t.check('the member-left trigger watches the two person columns of pro_connections, only when one goes null, and is enabled',
  (select count(*) = 1 and bool_and(tgenabled = 'O') and bool_and(pg_get_triggerdef(oid) ~ 'AFTER UPDATE OF stylist_id, client_id ON public.pro_connections FOR EACH ROW WHEN')
     from pg_trigger where tgrelid = 'public.pro_connections'::regclass and tgname = 'pro_on_member_left' and not tgisinternal));
select t.check('both trigger functions never raise: their bodies are guarded',
  (select count(*) = 2 and bool_and(prosrc like '%exception when others then%' and prosrc like '%raise warning%')
     from pg_proc where pronamespace = 'public'::regnamespace and proname in ('pro_on_block', 'pro_on_member_left')));
select t.check('content_reports accepts every context, reason and reference type of swaps, friends and stylists',
  (select bool_and(pg_get_constraintdef(oid) ~ 'friend_request' and pg_get_constraintdef(oid) ~ 'swap_chat' and pg_get_constraintdef(oid) ~ 'pro_profile' and pg_get_constraintdef(oid) ~ 'pro_chat' and pg_get_constraintdef(oid) ~ 'pro_content')
     from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_context_check')
  and (select pg_get_constraintdef(oid) ~ 'not_as_described' and pg_get_constraintdef(oid) ~ 'underage' and pg_get_constraintdef(oid) ~ 'false_credentials'
          and pg_get_constraintdef(oid) ~ 'data_misuse' and pg_get_constraintdef(oid) ~ 'unsafe_meeting' and pg_get_constraintdef(oid) ~ 'impersonation'
     from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_reason_check')
  and (select pg_get_constraintdef(oid) ~ 'listing' and pg_get_constraintdef(oid) ~ 'swap' and pg_get_constraintdef(oid) ~ 'message' and pg_get_constraintdef(oid) ~ 'connection'
          and pg_get_constraintdef(oid) ~ 'recommendation' and pg_get_constraintdef(oid) ~ 'appointment' and pg_get_constraintdef(oid) ~ 'invite'
     from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_ref_type_check')
  and exists (select 1 from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_evidence_check' and pg_get_constraintdef(oid) ~ '20000'));
select t.check('content_reports is still closed to app users (reports are write-only through functions)',
  not has_table_privilege('authenticated', 'public.content_reports', 'select') and not has_table_privilege('anon', 'public.content_reports', 'select')
  and not has_table_privilege('authenticated', 'public.content_reports', 'insert'));

-- ─── E. The legacy tables ───────────────────────────────────────────────────

select t.check('the nine legacy tables that exist hold no privilege for anon, authenticated or PUBLIC',
  (select count(*) >= 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname in ('stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations', 'message_threads', 'messages', 'booking_requests', 'stylist_reviews'))
  and not exists (select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                     and c.relname in ('stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations', 'message_threads', 'messages', 'booking_requests', 'stylist_reviews')
                     and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))));
select t.check('and nothing was dropped: delete_user_account still names them',
  (select prosrc ~ 'public\.stylist_clients' and prosrc ~ 'public\.message_threads' and prosrc ~ 'public\.booking_requests' from pg_proc where pronamespace = 'public'::regnamespace and proname = 'delete_user_account'));
