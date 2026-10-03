-- Found in a post-fix sweep: Supabase grants EXECUTE on new functions directly to
-- `anon`, so earlier "revoke ... from public" did not stop signed-out callers.
-- find_user_by_email() let anyone holding the public anon key turn an email
-- address into a user id + display name (account enumeration).

revoke execute on function public.find_user_by_email(text) from public, anon;
revoke execute on function public.increment_wear_count(uuid) from public, anon;
revoke execute on function public.update_updated_at() from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;
grant execute on function public.increment_wear_count(uuid) to authenticated;

-- A SECURITY DEFINER function should always pin its search_path.
alter function public.increment_wear_count(uuid) set search_path = public;

-- These two SELECT policies did not depend on auth.uid(), so signed-out callers
-- could read them. Marketplace data is for signed-in users only.
drop policy if exists "Anyone authenticated can view active stylists" on public.stylist_profiles;
create policy "Anyone authenticated can view active stylists" on public.stylist_profiles
  for select to authenticated
  using (is_active = true);

drop policy if exists "Anyone can view reviews" on public.stylist_reviews;
create policy "Authenticated users can view reviews" on public.stylist_reviews
  for select to authenticated
  using (true);
