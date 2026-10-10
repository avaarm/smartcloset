-- More clothing categories: bags, jewelry, hats, activewear, swimwear.
--
-- clothing_items.category was created with an inline CHECK that allows only the
-- original six values, so saving a purse or a necklace would be rejected. This
-- widens it to the eleven categories the app now offers (kept in step with
-- ClothingCategory in src/types/clothing.ts).
--
-- Safe to apply before the new app build ships: the new list is a superset, so
-- every existing row still satisfies it and older builds, which only send the
-- original six, keep working. Safe to run twice.
--
-- The constraint is found by what it checks (a CHECK on the category column
-- alone) rather than by name, so it is replaced whatever Postgres or the
-- dashboard called it.

do $$
declare
  existing record;
begin
  for existing in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.clothing_items'::regclass
      and c.contype = 'c'
      and c.conkey = array[(
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.clothing_items'::regclass
          and a.attname = 'category'
      )]
  loop
    execute format('alter table public.clothing_items drop constraint %I', existing.conname);
  end loop;

  alter table public.clothing_items
    add constraint clothing_items_category_check
    check (category in (
      'tops', 'bottoms', 'dresses', 'outerwear', 'shoes',
      'bags', 'jewelry', 'hats', 'activewear', 'swimwear',
      'accessories'
    ));
end
$$;
