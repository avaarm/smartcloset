-- The specific kind of item inside its category: "Tote" in Bags, "Ankle boots"
-- in Shoes, "Belt" in Accessories. Free text (the app offers a menu per
-- category and lets the owner type their own), capped so one stray paste can't
-- fill a row. Null on every existing row; the app shows nothing for it then.
--
-- Safe to apply before the new app build ships: the column is nullable, so older
-- builds, which never send it, keep working. Safe to run twice.

alter table public.clothing_items
  add column if not exists subcategory text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clothing_items'::regclass
      and conname = 'clothing_items_subcategory_check'
  ) then
    alter table public.clothing_items
      add constraint clothing_items_subcategory_check
      check (subcategory is null or char_length(subcategory) <= 60);
  end if;
end
$$;
