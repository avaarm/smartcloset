-- Local stand-in for the parts of a Supabase project the migrations rely on (test only).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text, category text, subcategory text, brand text, materials jsonb,
  wear_count integer default 0, is_wishlist boolean default false, tag_text text,
  size text, created_at timestamptz default now());
alter table public.clothing_items enable row level security;
create view public.material_usage_stats as select 1 as x;

-- The friend policies as they stand on the live project (migrations 007, 20261005000100, 20261007000100).
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')));
alter table public.friend_requests enable row level security;
create policy "Users can view requests they sent or received" on public.friend_requests
  for select using (auth.uid() = requester_id or auth.uid() = recipient_id);
create policy "Users can view their own items" on public.clothing_items for select using (auth.uid() = user_id);
create policy "Friends can view each other's wardrobe" on public.clothing_items for select using (
  coalesce(clothing_items.is_wishlist, false) = false
  and exists (select 1 from public.friend_requests fr
               where fr.status = 'accepted'
                 and ((fr.requester_id = auth.uid() and fr.recipient_id = clothing_items.user_id)
                   or (fr.recipient_id = auth.uid() and fr.requester_id = clothing_items.user_id))));
create function public.get_friend_closet(p_friend_id uuid)
returns table (id uuid, name text, category text, brand text, materials jsonb)
language sql stable security definer set search_path = public as $$
  select ci.id, ci.name, ci.category, ci.brand, ci.materials
    from public.clothing_items ci
   where ci.user_id = p_friend_id and ci.is_wishlist = false
     and exists (select 1 from public.friend_requests fr
                  where fr.status = 'accepted'
                    and ((fr.requester_id = auth.uid() and fr.recipient_id = p_friend_id)
                      or (fr.recipient_id = auth.uid() and fr.requester_id = p_friend_id)))
   limit 500;
$$;
revoke all on function public.get_friend_closet(uuid) from public, anon;
grant execute on function public.get_friend_closet(uuid) to authenticated;
