-- Account deletion RPC.
-- Required by Apple guideline 5.1.1(v): users must be able to initiate deletion
-- of their account from within the app.
--
-- Strategy: SECURITY DEFINER function that runs as the function owner (which
-- must have privileges on auth.users — Supabase grants this when the owner is
-- a postgres-role user). Every DELETE scopes to auth.uid() so we cannot
-- accidentally delete another user's data even if the function is invoked
-- without RLS.
--
-- Tables this deletes from were derived from src/ grep of supabase.from(...).
-- Add new tables to this list when you add them.
--
-- Run:   supabase db push     (or apply via dashboard SQL editor)

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- User-owned content. Order matters if you have FKs without ON DELETE CASCADE.
  delete from public.outfit_history    where user_id = uid;
  delete from public.recommendations   where user_id = uid or client_id = uid or stylist_id = uid;
  delete from public.appointments      where user_id = uid or stylist_id = uid or client_id = uid;
  delete from public.stylist_clients   where stylist_id = uid or client_id = uid;
  delete from public.stylist_profiles  where user_id = uid;
  delete from public.outfits           where user_id = uid;
  delete from public.clothing_items    where user_id = uid;

  -- Finally remove the auth record. Requires the function owner to have
  -- privileges on auth.users — postgres role has this in Supabase by default.
  delete from auth.users where id = uid;
end;
$$;

-- Only authenticated users may call. Anonymous clients get permission denied.
revoke all on function public.delete_user_account() from public;
grant execute on function public.delete_user_account() to authenticated;

comment on function public.delete_user_account() is
  'Permanently deletes the calling user and all data they own. Apple 5.1.1(v) compliance.';
