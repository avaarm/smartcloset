-- What a swap or a review needs to know about a piece of clothing beyond what it is:
--
--   size              the size on the label ("M", "8", "EU 38", "One size"). Free text.
--   condition         how worn it is, from a short list.
--   care_instructions the care words read off the tag ("Machine wash cold", "Do not bleach").
--   origin_country    the "Made in ..." country.
--   tag_text          the text read from a photo of the material/care tag, kept as read.
--
-- All nullable and length-capped, so older app builds (which never send them) keep working
-- and one stray paste cannot fill a row. Safe to run twice.

alter table public.clothing_items
  add column if not exists size text,
  add column if not exists condition text,
  add column if not exists care_instructions text[],
  add column if not exists origin_country text,
  add column if not exists tag_text text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.clothing_items'::regclass and conname = 'clothing_items_size_check') then
    alter table public.clothing_items add constraint clothing_items_size_check
      check (size is null or char_length(size) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.clothing_items'::regclass and conname = 'clothing_items_condition_check') then
    alter table public.clothing_items add constraint clothing_items_condition_check
      check (condition is null or condition in ('new_with_tags', 'like_new', 'good', 'well_loved'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.clothing_items'::regclass and conname = 'clothing_items_care_check') then
    alter table public.clothing_items add constraint clothing_items_care_check
      check (care_instructions is null or cardinality(care_instructions) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.clothing_items'::regclass and conname = 'clothing_items_origin_check') then
    alter table public.clothing_items add constraint clothing_items_origin_check
      check (origin_country is null or char_length(origin_country) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.clothing_items'::regclass and conname = 'clothing_items_tag_text_check') then
    alter table public.clothing_items add constraint clothing_items_tag_text_check
      check (tag_text is null or char_length(tag_text) <= 2000);
  end if;
end
$$;
