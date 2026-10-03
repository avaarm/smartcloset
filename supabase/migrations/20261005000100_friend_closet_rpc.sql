-- Friends currently get full-row SELECT on each other's clothing_items (cost,
-- purchase date, private notes, wear history, wishlist). This function returns
-- only what the friend-closet screen needs, and only for an accepted friend, so
-- the broad "Friends can view each other's wardrobe" table policy can be dropped
-- once clients use it (separate migration, applied after the new build ships).

create or replace function public.get_friend_closet(p_friend_id uuid)
returns table (
  id uuid, name text, category text, color text, brand text, season jsonb,
  tags jsonb, favorite boolean, retailer text, user_image text, retailer_image text,
  pattern text, material text, materials jsonb, date_added timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ci.id, ci.name, ci.category, ci.color, ci.brand, ci.season,
         ci.tags, ci.favorite, ci.retailer, ci.user_image, ci.retailer_image,
         ci.pattern, ci.material, ci.materials, ci.date_added, ci.created_at
    from public.clothing_items ci
   where ci.user_id = p_friend_id
     and ci.is_wishlist = false
     and exists (
       select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and ((fr.requester_id = auth.uid() and fr.recipient_id = p_friend_id)
            or (fr.recipient_id = auth.uid() and fr.requester_id = p_friend_id))
     )
   order by ci.date_added desc nulls last
   limit 500;
$$;
revoke all on function public.get_friend_closet(uuid) from public, anon;
grant execute on function public.get_friend_closet(uuid) to authenticated;
