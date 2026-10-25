-- Fixtures: the closets of Bea and Cat, eight pieces each, built so that a leak shows (numbers 1 to 8, t.item('bea', n)).
--   1 a piece with everything: price, notes, tag text with a phone number, wear data, a gallery, a retailer, a bad
--     materials entry, an estimated value, a favourite flag
--   2 3 4 plain pieces with a cover photo in the owner's folder
--   5 a piece with only a retailer image (no cover photo of the owner's)
--   6 a wishlist piece, with a photo
--   7 a piece whose image is a phone-local file, not a storage address (no cover photo)
--   8 a piece with a long name and a long brand (for the length caps)
-- The photo addresses have the shape of the app's: https://<host>/storage/v1/object/public/wardrobe-images/<owner id>/<file>.
insert into public.clothing_items (id, user_id, name, category, subcategory, brand, color, season, pattern, material, materials,
                                   size, condition, user_image, retailer_image, cost, notes, tag_text, estimated_value,
                                   wear_count, last_worn, favorite, retailer, tags, images, is_wishlist, care_instructions,
                                   origin_country, date_added)
select t.item(o.who, n.n), t.u(o.who),
       case n.n when 1 then 'Blue blazer' when 2 then 'Red scarf' when 3 then 'Linen shirt' when 4 then 'Wool hat'
                when 5 then 'Retailer-only top' when 6 then 'Wishlist coat' when 7 then 'Phone-local top'
                else repeat('Very long name ', 12) end,
       case n.n when 1 then 'outerwear' when 2 then 'accessories' when 3 then 'tops' when 4 then 'accessories'
                when 5 then 'tops' when 6 then 'outerwear' when 7 then 'tops' else 'bottoms' end,
       case when n.n = 1 then 'blazer' end,
       case n.n when 1 then 'Zara' when 3 then 'Uniqlo' when 8 then repeat('Brand ', 20) end,
       case n.n when 1 then 'blue' when 2 then 'red' when 3 then 'white' when 4 then 'grey' end,
       case when n.n = 1 then '["winter","autumn"]'::jsonb else '[]'::jsonb end,
       case when n.n = 1 then 'solid' end,
       case when n.n = 1 then 'wool' end,
       case when n.n = 1 then '[{"name":"Wool","percentage":80,"tier":"primary"},{"name":"Nylon","percentage":20,"tier":"primary"},{"bad":1}]'::jsonb end,
       case n.n when 1 then 'M' when 3 then 'S' when 4 then 'One size' end,
       case n.n when 1 then 'good' when 3 then 'like_new' when 4 then 'good' end,
       case when n.n in (5, 7) then case when n.n = 7 then 'file:///var/mobile/Containers/x.jpg' end
            else 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u(o.who)::text || '/17000000000' || n.n || '.jpg' end,
       case when n.n = 5 then 'https://shop.example.test/img/retailer.jpg' end,
       case when n.n in (1, 3) then 120 end,
       case when n.n in (1, 3) then 'private note about my ex ' || o.who end,
       case when n.n = 1 then 'LAUNDRY MARK 555-123-4567' end,
       case when n.n = 1 then 80 end,
       case when n.n = 1 then 7 else 0 end,
       case when n.n = 1 then now() - interval '3 days' end,
       n.n = 1,
       case when n.n = 1 then 'Zara store' end,
       case when n.n = 1 then '["work","private tag"]'::jsonb else '[]'::jsonb end,
       case when n.n = 1 then array['https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u(o.who)::text || '/gallery1.jpg',
                                    'https://x.supabase.co/storage/v1/object/public/wardrobe-images/' || t.u(o.who)::text || '/gallery2.jpg']
            else '{}'::text[] end,
       n.n = 6,
       case when n.n = 1 then array['Dry clean only'] end,
       case when n.n = 1 then 'Italy' end,
       now() - make_interval(days => n.n)
  from (values ('bea'), ('cat')) o(who) cross join generate_series(1, 8) n(n);
