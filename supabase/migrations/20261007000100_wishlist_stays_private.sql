-- A wishlist is a private shopping list, not part of the closet you share.
--
-- 1. The friends read policy on clothing_items let an accepted friend select every
--    row, including wishlist rows (and prices paid, notes, wear history) when the
--    table API is called directly. The app reads friends' closets through
--    get_friend_closet(), which already excludes wishlist items; make the table
--    policy agree. Older app builds that still read the table keep working: they
--    just no longer receive wishlist rows.
-- 2. increment_wear_count() could be pointed at a wishlist row (you cannot wear
--    something you do not own), so it now only counts items that are owned.

drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;
create policy "Friends can view each other's wardrobe"
  on public.clothing_items for select
  using (
    coalesce(clothing_items.is_wishlist, false) = false
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = auth.uid() and fr.recipient_id = clothing_items.user_id)
          or (fr.recipient_id = auth.uid() and fr.requester_id = clothing_items.user_id)
        )
    )
  );

create or replace function public.increment_wear_count(item_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.clothing_items
  set
    wear_count = coalesce(wear_count, 0) + 1,
    last_worn  = now()
  where id = item_id
    and user_id = auth.uid()
    and coalesce(is_wishlist, false) = false;
$$;

revoke execute on function public.increment_wear_count(uuid) from public, anon;
grant execute on function public.increment_wear_count(uuid) to authenticated;
