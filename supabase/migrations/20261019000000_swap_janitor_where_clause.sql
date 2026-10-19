-- The swap upkeep function (swap_janitor) updated its one-row table with no WHERE clause. A direct SQL session
-- allows that, but the API layer rejects every UPDATE and DELETE without a WHERE ("UPDATE requires a WHERE
-- clause"), so each swap read that starts the upkeep failed through the app (get_swap_settings, browse), and the
-- swap screens showed "can't load". The same function with `where id` (swap_meta has one row, id = true).
-- Nothing else changes: same arguments, same grants (create or replace keeps them), same behaviour.

create or replace function public.swap_janitor(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('swap_janitor', 0)) then
    return;
  end if;
  if not p_force and exists (
       select 1 from public.swap_meta where last_janitor_at > now() - interval '15 minutes') then
    return;
  end if;
  update public.swap_meta set last_janitor_at = now() where id;

  -- Half-done swaps (one side tapped "We swapped!" more than 14 days ago) finish before anything expires.
  for r in
    select id from public.swaps
     where status = 'accepted' and (proposer_done_at is null) <> (recipient_done_at is null)
       and greatest(coalesce(proposer_done_at, '-infinity'), coalesce(recipient_done_at, '-infinity')) < now() - interval '14 days'
     order by id limit 200
  loop
    perform public.swap_finish(r.id, true);
  end loop;

  for r in
    select id, status from public.swaps
     where status in ('proposed', 'accepted') and expires_at <= now()
     order by expires_at limit 200
  loop
    perform public.swap_close(r.id, 'expired', 'expired');
  end loop;

  -- Only listings on the rack expire. A held listing stays held until a person decides, however old it is.
  update public.swap_listings
     set status = 'expired', status_changed_at = now()
   where status = 'active' and expires_at <= now();

  delete from public.swap_messages m
   using public.swaps s
   where s.id = m.swap_id and s.closed_at is not null and s.closed_at < now() - interval '30 days';

  delete from public.swaps
   where closed_at is not null and closed_at < now() - interval '90 days';

  -- Ended listings go 30 days after they ended (their photo is queued for deletion by the
  -- delete trigger). A swap keeps only the piece's name, size and condition from then on.
  -- A listing someone reported in the last 90 days is kept as evidence. A removed listing is kept while
  -- its piece still exists, so the piece cannot simply be listed again; it goes 30 days after the piece
  -- does. A held listing is never deleted here.
  delete from public.swap_listings l
   where (l.status in ('completed', 'withdrawn', 'expired') or (l.status = 'removed' and l.item_id is null))
     and l.status_changed_at < now() - interval '30 days'
     and not exists (select 1 from public.content_reports cr
                      where cr.ref_id = l.id and cr.created_at > now() - interval '90 days');

  delete from public.swap_rate_counters where window_start < now() - interval '2 days';
end;
$$;
