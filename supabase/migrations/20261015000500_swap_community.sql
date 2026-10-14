-- Clothing swaps, part 5 of 5: the community tier (members who are not friends).
--
-- Applying this migration changes nothing for anyone until the server switch is turned on:
-- swap_config community_enabled stays false (see swap_set_community_enabled) and every
-- stranger-facing path checks it. It only adds the way in and out:
--   join_swap_community, leave_swap_community, narrow_swap_listing.
-- Everything else a stranger can do (browse, propose, message, report, block) is already
-- implemented in the earlier migrations and gated by swap_gate(..., 'community').
--
-- Safe to run twice. Depends on migrations 1-4.

create or replace function public.join_swap_community(
  p_alias text,
  p_adult boolean,
  p_photo_scan_ok boolean,
  p_terms_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a text := btrim(coalesce(p_alias, ''));
  cur text := public.swap_cfg('terms_version') #>> '{}';
begin
  perform public.swap_gate(uid, 'friends');
  if not coalesce((public.swap_cfg('community_enabled'))::boolean, false) then
    perform public.swap_raise('community_unavailable', '42501');
  end if;
  if p_terms_version is distinct from cur then
    perform public.swap_raise('terms_version_mismatch', '22023');
  end if;
  if not coalesce(p_adult, false) then
    perform public.swap_raise('adult_required', '22023');
  end if;
  if not coalesce(p_photo_scan_ok, false) then
    perform public.swap_raise('scan_ack_required', '22023');
  end if;
  if (select u.created_at from auth.users u where u.id = uid)
       > now() - make_interval(hours => coalesce((public.swap_cfg('min_account_age_hours'))::integer, 48)) then
    perform public.swap_raise('account_too_new', '42501');
  end if;
  if a !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$'
     or lower(a) ~ '(smart ?closet|support|admin|moderator|staff|official|swap member|former member|^team$|^help$)'
     or a ~ '  ' then
    perform public.swap_raise('alias_invalid', '22023');
  end if;
  perform public.swap_require_text(a, 'alias', 'strict');
  begin
    update public.swap_members
       set alias = a, adult_confirmed_at = coalesce(adult_confirmed_at, now()),
           photo_scan_ack_at = now(), community_joined_at = now(), community_terms_version = cur,
           updated_at = now()
     where user_id = uid;
  exception when unique_violation then
    perform public.swap_raise('alias_taken', '23505');
  end;
end;
$$;

-- Leaves the community: community listings go back to friends only, strangers' swaps end,
-- and the alias is released. Friends' swaps carry on.
create or replace function public.leave_swap_community()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  for r in
    select id from public.swaps
     where status in ('proposed', 'accepted') and pair_kind = 'community' and uid in (proposer_id, recipient_id)
     order by id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable', uid);
  end loop;
  update public.swap_listings set audience = 'friends', status_changed_at = now()
   where owner_id = uid and audience = 'community';
  update public.swap_members
     set alias = null, community_joined_at = null, community_terms_version = null, updated_at = now()
   where user_id = uid;
end;
$$;

-- Community -> friends for one listing. Open proposals from members who are not friends end.
create or replace function public.narrow_swap_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  select * into l from public.swap_listings where id = p_listing_id and owner_id = uid for update;
  if not found or l.status not in ('active', 'held') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = l.id and s.status = 'proposed' and s.pair_kind = 'community' order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable', uid);
  end loop;
  update public.swap_listings set audience = 'friends', status_changed_at = now() where id = l.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.join_swap_community(text, boolean, boolean, text)',
    'public.leave_swap_community()',
    'public.narrow_swap_listing(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
