-- Professional accounts, part 3 of 8: upkeep.
--
-- Two functions, both internal. The list and status functions of the later files call pro_refresh, so this file sits
-- with the foundation: the first scenarios run without the sharing, work and moderation files.
--
--   * pro_refresh(uid)   lazy upkeep for one member, run at the start of their reads: expires grants (one event each),
--                        clears grant items that have no grant, expires and completes sessions, and repairs what an
--                        account deletion left half done when pro_on_member_left failed, and what a block left
--                        half done when pro_on_block failed. NEVER RAISES: swap's upkeep
--                        once took every swap screen down with one bad statement, so its body and its call to the
--                        janitor are wrapped and a failure is a warning. Correctness never depends on a schedule.
--   * pro_janitor(force) global retention in bounded deletes (5,000 rows a statement, so one sweep cannot reach the
--                        statement timeout, which "exception when others" does not trap), throttled to 15 minutes.
--                        Started opportunistically by pro_refresh; granted to service_role so a daily call can be
--                        scheduled (optional).
--
-- Every UPDATE and DELETE has a WHERE (the API layer rejects a bare one; the swap janitor failed on phones for exactly
-- that, see 20261019000000_swap_janitor_where_clause.sql). Safe to run twice.

-- Retention (pro-accounts.md 3.7): a message goes 180 days after it was sent and 30 days after its connection ended;
-- an ended connection and everything under it goes 90 days after it ended; an invite goes 30 days after it was used,
-- revoked or (when it was never used) expired, each counted from its own date, so a code created long ago and revoked
-- just now is kept for 30 days; closet view counters 90 days after the day; rate counters 2 days.
create or replace function public.pro_janitor(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('pro_janitor', 0)) then
    return;
  end if;
  if not p_force and exists (select 1 from public.pro_meta where last_janitor_at > now() - interval '15 minutes') then
    return;
  end if;
  begin                                                  -- a sweep must never fail the read that triggered it
    update public.pro_meta set last_janitor_at = now() where id;          -- one row: WHERE id, or the API refuses it

    delete from public.pro_messages where ctid in (
      select m.ctid from public.pro_messages m join public.pro_connections c on c.id = m.connection_id
       where (c.status = 'ended' and c.ended_at < now() - make_interval(days => public.pro_limit('ended_message_retention_days')))
          or m.created_at < now() - make_interval(days => public.pro_limit('message_retention_days'))
       limit 5000);
    delete from public.pro_connections where ctid in (
      select ctid from public.pro_connections
       where status = 'ended' and ended_at < now() - make_interval(days => public.pro_limit('ended_connection_retention_days'))
       limit 5000);
    delete from public.pro_invites where ctid in (
      select ctid from public.pro_invites
       where (status = 'used' and used_at < now() - interval '30 days')
          or (status = 'revoked' and revoked_at < now() - interval '30 days')
          or (status = 'live' and expires_at < now() - interval '30 days')
       limit 5000);
    delete from public.pro_rate_counters where ctid in (
      select ctid from public.pro_rate_counters where window_start < now() - interval '2 days' limit 5000);
    delete from public.pro_closet_views where ctid in (
      select ctid from public.pro_closet_views where day < current_date - 90 limit 5000);
  exception when others then
    raise warning 'pro_janitor: %', sqlerrm;             -- bounded deletes, because query_canceled is not trapped here
  end;
end;
$$;

create or replace function public.pro_refresh(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_uid is null then
    return;
  end if;
  begin
    perform public.pro_janitor(false);
  exception when others then
    raise warning 'pro_refresh (janitor): %', sqlerrm;
  end;
  begin
    -- A grant that ran out is deleted and one 'expired' event is written, in one statement: two parallel refreshes
    -- cannot both delete the row, so they write one event between them.
    with gone as (
      delete from public.pro_grants
       where expires_at <= now()
         and connection_id in (select c.id from public.pro_connections c where c.stylist_id = p_uid or c.client_id = p_uid)
      returning connection_id, scope)
    insert into public.pro_grant_events (connection_id, scope, event)
      select g.connection_id, g.scope, 'expired' from gone g;

    delete from public.pro_grant_items
     where connection_id in (select c.id from public.pro_connections c where c.stylist_id = p_uid or c.client_id = p_uid)
       and not exists (select 1 from public.pro_grants g where g.connection_id = pro_grant_items.connection_id);

    -- Sessions: a proposal whose start has passed expires; a confirmed session whose end has passed is completed.
    update public.pro_appointments set status = 'expired', updated_at = now()
     where status = 'proposed' and starts_at <= now()
       and connection_id in (select c.id from public.pro_connections c where c.stylist_id = p_uid or c.client_id = p_uid);
    update public.pro_appointments set status = 'completed', updated_at = now()
     where status = 'confirmed' and starts_at + duration_minutes * interval '1 minute' < now()
       and connection_id in (select c.id from public.pro_connections c where c.stylist_id = p_uid or c.client_id = p_uid);

    -- Repairs, for what an account deletion left half done when pro_on_member_left failed (it swallows its errors so a
    -- deletion never fails): an active connection with a null side ends as 'system'; the leaver's label goes; a
    -- connection whose client side is null loses its looks, sessions, grant events and view counters; a connection
    -- whose stylist side is null loses its unsent drafts; a connection that is not active has no grant and no grant
    -- items.
    for r in
      select c.id from public.pro_connections c
       where c.status = 'active' and (c.stylist_id is null or c.client_id is null)
         and (c.stylist_id = p_uid or c.client_id = p_uid)
       order by c.id
    loop
      perform public.pro_end_connection(r.id, 'system');
    end loop;
    update public.pro_connections set client_alias = null, updated_at = now()
     where client_id is null and stylist_id = p_uid and client_alias is not null;
    update public.pro_connections set stylist_label = null, updated_at = now()
     where stylist_id is null and client_id = p_uid and stylist_label is not null;
    delete from public.pro_recommendations
     where connection_id in (select c.id from public.pro_connections c where c.client_id is null and c.stylist_id = p_uid);
    delete from public.pro_appointments
     where connection_id in (select c.id from public.pro_connections c where c.client_id is null and c.stylist_id = p_uid);
    delete from public.pro_grant_events
     where connection_id in (select c.id from public.pro_connections c where c.client_id is null and c.stylist_id = p_uid);
    delete from public.pro_closet_views
     where connection_id in (select c.id from public.pro_connections c where c.client_id is null and c.stylist_id = p_uid);
    delete from public.pro_recommendations
     where status = 'draft'
       and connection_id in (select c.id from public.pro_connections c where c.stylist_id is null and c.client_id = p_uid);
    delete from public.pro_grant_items
     where connection_id in (select c.id from public.pro_connections c
                              where c.status <> 'active' and (c.stylist_id = p_uid or c.client_id = p_uid));
    delete from public.pro_grants
     where connection_id in (select c.id from public.pro_connections c
                              where c.status <> 'active' and (c.stylist_id = p_uid or c.client_id = p_uid));

    -- A block that pro_on_block did not finish (it swallows its errors so a block never fails): a connection that is
    -- still active, or not yet a closed shell, between two accounts of which one blocks the other. Whoever blocked is
    -- the role the connection ends with. The pair lock is the one a redeem takes, so a redeem in flight finishes
    -- first and its connection is seen by the repair. A connection that is already a closed shell is left alone, so
    -- unblocking still changes nothing.
    for r in
      select distinct c.stylist_id, c.client_id,
             exists (select 1 from public.user_blocks b
                      where b.blocker_id = c.client_id and b.blocked_id = c.stylist_id)
               and not exists (select 1 from public.user_blocks b
                                where b.blocker_id = c.stylist_id and b.blocked_id = c.client_id) as client_blocked
        from public.pro_connections c
       where (c.stylist_id = p_uid or c.client_id = p_uid)
         and c.stylist_id is not null and c.client_id is not null
         and (c.status = 'active' or c.shell_at is null)
         and public.is_blocked_between(c.stylist_id, c.client_id)
    loop
      perform public.pro_lock_users(r.stylist_id, r.client_id);
      if r.client_blocked then
        perform public.pro_end_between(r.client_id, r.stylist_id);
      else
        perform public.pro_end_between(r.stylist_id, r.client_id);
      end if;
    end loop;
  exception when others then
    raise warning 'pro_refresh: %', sqlerrm;
  end;
end;
$$;

-- pro_refresh is internal. pro_janitor is granted to service_role so a daily call can be scheduled.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pro_refresh(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.pro_janitor(boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
