-- GATED. This file lives in supabase/held/, outside supabase/migrations, so `supabase db push` can
-- never apply it by accident. It is released by gate G0 of the swap design (documentation/design/swap.md,
-- section 11.1), and only after the checks there pass.
--
-- Why: migration 006 and the README tell whoever sets the project up to create the wardrobe-images bucket
-- by hand, and 006 says `--public`. A catalogue query on the linked project shows the bucket flagged
-- public, which means every original photo can be fetched by anyone who has its address
-- (.../storage/v1/object/public/wardrobe-images/<user id>/<file>.jpg). The app keeps that public-looking
-- address in the database only as a name for the file and shows photos through signed links
-- (src/services/imageUrls.ts). The privacy page may say photos are "kept in private storage" only after
-- this has run and the unauthenticated check in G0 has failed to fetch an existing photo.
--
-- Do not release before the oldest build still in use signs its photo links: a build that displays the
-- stored address directly would show no photos after this runs.
--
-- To release (after the G0 checks):
--   newest=$(ls supabase/migrations | grep -oE '^[0-9]{14}' | sort | tail -1)
--   now=$(date -u +%Y%m%d%H%M%S); v=$(( now > newest ? now : newest + 1 ))
--   mv supabase/held/wardrobe_images_private.sql supabase/migrations/${v}_wardrobe_images_private.sql
--   supabase db push --dry-run     # must list exactly this one file
--   supabase db push
-- Then, unauthenticated: curl -s -o /dev/null -w '%{http_code}' the public address of an existing photo; it must
-- not be 200. Signed links must still return 200.
--
-- Creates the bucket (private) when it does not exist, which also makes a fresh local database complete.
-- File size and type limits of an existing bucket are left as they are. Safe to run twice.

insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', false)
on conflict (id) do update set public = false;
