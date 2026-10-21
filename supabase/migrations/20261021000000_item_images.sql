-- Several photos per item.
--
--   images   every photo of the piece, cover first. user_image and retailer_image keep holding the
--            cover (the first entry), so everything that shows one picture is unchanged and an older
--            app build keeps working. A row with no list ('{}') is an item saved before this column
--            existed: the app builds its gallery from the cover.
--
-- Not null with an empty default, so no row ever has a null list and older builds (which never send
-- the column) keep inserting. At most 8 photos per item, which is what the app lets a person add.
-- Nothing is copied from the single-photo columns: the app reads an empty list as "just the cover".
--
-- Not exposed to friends or to swaps: get_friend_closet returns a fixed list of columns (user_image and
-- retailer_image, not this one) and the swap listing reads user_image only, so the extra photos stay
-- with their owner. Deleting an account removes the whole <user id>/ folder of the wardrobe-images
-- bucket (functions/delete-account), so every uploaded photo is covered.
-- Safe to run twice.

alter table public.clothing_items
  add column if not exists images text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.clothing_items'::regclass and conname = 'clothing_items_images_check') then
    alter table public.clothing_items add constraint clothing_items_images_check
      check (cardinality(images) <= 8);
  end if;
end
$$;
