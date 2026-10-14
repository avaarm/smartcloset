-- Structural checks: nothing is reachable except through the intended functions.
select t.check('RLS is on for every swap table',
  not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
              and c.relname in ('swap_config','swap_meta','swap_members','swap_listings','swaps','swap_items','swap_messages','swap_rate_counters','swap_blocked_terms','swap_photo_gc')
              and not c.relrowsecurity));
select t.check('anon and authenticated hold no table privileges on swap tables',
  not exists (select 1 from pg_class c, unnest(array['anon','authenticated']) r, unnest(array['select','insert','update','delete','truncate','references','trigger']) p
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                and c.relname in ('swap_config','swap_meta','swap_members','swap_listings','swaps','swap_items','swap_messages','swap_rate_counters','swap_blocked_terms','swap_photo_gc')
                and has_table_privilege(r, c.oid, p)));
select t.check('no policies on swap tables',
  not exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('swap_config','swap_meta','swap_members','swap_listings','swaps','swap_items','swap_messages','swap_rate_counters','swap_blocked_terms','swap_photo_gc')));
select t.check('message id sequence is closed to clients', not has_sequence_privilege('authenticated', 'public.swap_messages_id_seq', 'usage'));
select t.check('moderation queue is service-only', not has_table_privilege('authenticated', 'public.swap_moderation_queue', 'select') and has_table_privilege('service_role', 'public.swap_moderation_queue', 'select'));
select t.check('anon can execute no swap function',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and (p.proname like 'swap\_%' or p.proname in ('are_friends','can_view_swap_photo','get_swap','get_swap_settings','get_swap_badge','get_swap_listing','accept_swap_terms','list_my_swap_listings','update_swap_listing','withdraw_swap_listing','renew_swap_listing','browse_swap_listings','propose_swap','list_my_swaps','respond_to_swap','cancel_swap','send_swap_message','report_swap_content','block_swap_member','list_swap_blocks','unblock_swap_member','export_my_swap_data','join_swap_community','leave_swap_community','narrow_swap_listing'))
              and has_function_privilege('anon', p.oid, 'execute')));
select t.check('authenticated can execute exactly the client functions',
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}'::text[]) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'swap\_%' or p.proname in ('are_friends','can_view_swap_photo','get_swap','get_swap_settings','get_swap_badge','get_swap_listing','accept_swap_terms','list_my_swap_listings','update_swap_listing','withdraw_swap_listing','renew_swap_listing','browse_swap_listings','propose_swap','list_my_swaps','respond_to_swap','cancel_swap','send_swap_message','report_swap_content','block_swap_member','list_swap_blocks','unblock_swap_member','export_my_swap_data','join_swap_community','leave_swap_community','narrow_swap_listing'))
      and has_function_privilege('authenticated', p.oid, 'execute'))
  = array['accept_swap_terms','block_swap_member','browse_swap_listings','can_view_swap_photo','cancel_swap','export_my_swap_data','get_swap','get_swap_badge','get_swap_listing','get_swap_settings','join_swap_community','leave_swap_community','list_my_swap_listings','list_my_swaps','list_swap_blocks','narrow_swap_listing','propose_swap','renew_swap_listing','report_swap_content','respond_to_swap','send_swap_message','swap_ack_photo','swap_complete_my_side','unblock_swap_member','update_swap_listing','withdraw_swap_listing'],
  (select array_agg(p.proname order by p.proname)::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(swap_|are_friends|can_view)' and has_function_privilege('authenticated', p.oid, 'execute')));
select t.check('every swap function pins search_path',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and (p.proname like 'swap\_%' or p.proname in ('are_friends','can_view_swap_photo','get_swap','get_swap_settings','get_swap_badge','get_swap_listing','accept_swap_terms','list_my_swap_listings','update_swap_listing','withdraw_swap_listing','renew_swap_listing','browse_swap_listings','propose_swap','list_my_swaps','respond_to_swap','cancel_swap','send_swap_message','report_swap_content','block_swap_member','list_swap_blocks','unblock_swap_member','export_my_swap_data','join_swap_community','leave_swap_community','narrow_swap_listing'))
              and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))));
select t.check('every FK to auth.users cascades, except swap participants',
  not exists (select 1 from pg_constraint k where k.contype = 'f' and k.confrelid = 'auth.users'::regclass
              and k.conrelid::regclass::text in ('swap_members','swap_listings','swap_messages','swap_rate_counters')
              and k.confdeltype <> 'c')
  and (select count(*) from pg_constraint k where k.contype = 'f' and k.confrelid = 'auth.users'::regclass
       and k.conrelid = 'public.swaps'::regclass and k.confdeltype = 'n') = 2);
select t.check('swap-photos bucket is private with limits (JPEG and PNG)',
  exists (select 1 from storage.buckets where id = 'swap-photos' and not public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg', 'image/png']));
select t.check('the only swap-photos policy is the viewer predicate',
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'swap photos%') = 1
  and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd <> 'SELECT' and qual like '%swap-photos%') = 0);
select t.check('content_reports accepts swap contexts', exists (select 1 from pg_constraint where conname = 'content_reports_context_check' and pg_get_constraintdef(oid) like '%swap_chat%'));
select t.check('report_user keeps its narrow lists (old builds unchanged)', (select prosrc from pg_proc where proname = 'report_user') not like '%swap_chat%');
select t.check('block_user and delete_user_account are untouched',
  (select prosrc from pg_proc where proname = 'block_user') not like '%swap%'
  and (select prosrc from pg_proc where proname = 'delete_user_account') not like '%swap%');
select t.check('limits function is in step with the documented table',
  public.swap_limit('message_min') = 6 and public.swap_limit('propose_day') = 15 and public.swap_limit('open_outbound') = 5);
