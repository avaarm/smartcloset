-- Migration 006: wear tracking RPC + wardrobe-images storage bucket

-- RPC: increment wear count for a clothing item owned by the calling user
create or replace function public.increment_wear_count(item_id uuid)
returns void
language sql
security definer
as $$
  update clothing_items
  set
    wear_count = coalesce(wear_count, 0) + 1,
    last_worn  = now()
  where id = item_id
    and user_id = auth.uid();
$$;

grant execute on function public.increment_wear_count(uuid) to authenticated;

-- Ensure occasion, pattern, material columns exist on clothing_items
alter table public.clothing_items
  add column if not exists occasion text,
  add column if not exists pattern  text,
  add column if not exists material text;

-- Storage: wardrobe-images bucket (run once manually in Supabase dashboard
-- if this migration doesn't auto-create it, or use the CLI:
--   supabase storage create-bucket wardrobe-images --public
-- RLS policy for the bucket:
--   CREATE POLICY "Users manage own images"
--   ON storage.objects FOR ALL
--   USING (bucket_id = 'wardrobe-images' AND auth.uid()::text = (storage.foldername(name))[1]);
