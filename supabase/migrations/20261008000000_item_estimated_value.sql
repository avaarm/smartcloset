-- What an item is worth today, in dollars.
--
-- estimated_value  the value shown on the item and added up for the wardrobe total.
--                  Null on every existing row: the app works a value out when it
--                  is missing, so totals are right without a backfill.
-- value_source     'user' once the owner typed the value, 'estimate' when the app
--                  worked it out.
--
-- The app never shows them to friends: get_friend_closet() lists its columns by
-- name and is not changed. (The older table-level friends read policy still
-- exposes every column of a friend's non-wishlist rows to direct table calls; it
-- stays only for old app builds and goes away once they are retired.)
--
-- Safe to apply before the new app build ships: both columns are nullable, so
-- older builds, which never send them, keep working. Safe to run twice.

alter table public.clothing_items
  add column if not exists estimated_value numeric(12, 2),
  add column if not exists value_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clothing_items'::regclass
      and conname = 'clothing_items_estimated_value_check'
  ) then
    alter table public.clothing_items
      add constraint clothing_items_estimated_value_check
      check (estimated_value is null or estimated_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clothing_items'::regclass
      and conname = 'clothing_items_value_source_check'
  ) then
    alter table public.clothing_items
      add constraint clothing_items_value_source_check
      check (value_source is null or value_source in ('user', 'estimate'));
  end if;
end
$$;
