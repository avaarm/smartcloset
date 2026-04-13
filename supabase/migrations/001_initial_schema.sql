-- SmartCloset — Initial production schema
-- Run against your Supabase project via the SQL editor or CLI.
-- All tables use RLS so every row is scoped to the owning user.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. WARDROBE ITEMS
-- ============================================================================
create table if not exists clothing_items (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  category    text not null check (category in ('tops','bottoms','dresses','outerwear','shoes','accessories')),
  brand       text,
  color       text,
  season      jsonb default '[]'::jsonb,        -- e.g. ["spring","winter"]
  occasion    text,
  cost        numeric(10,2),
  purchase_date timestamptz,
  notes       text,
  tags        jsonb default '[]'::jsonb,         -- e.g. ["casual","favorite"]
  favorite    boolean default false,
  is_wishlist boolean default false,
  retailer    text,
  user_image  text,                               -- Supabase Storage path
  retailer_image text,
  wear_count  integer default 0,
  last_worn   timestamptz,
  date_added  timestamptz default now(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_clothing_items_user on clothing_items(user_id);
create index idx_clothing_items_category on clothing_items(user_id, category);

alter table clothing_items enable row level security;

create policy "Users can view their own items"
  on clothing_items for select using (auth.uid() = user_id);
create policy "Users can insert their own items"
  on clothing_items for insert with check (auth.uid() = user_id);
create policy "Users can update their own items"
  on clothing_items for update using (auth.uid() = user_id);
create policy "Users can delete their own items"
  on clothing_items for delete using (auth.uid() = user_id);

-- ============================================================================
-- 2. OUTFITS
-- ============================================================================
create table if not exists outfits (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  item_ids    jsonb default '[]'::jsonb,         -- array of wardrobe_item UUIDs
  season      jsonb default '[]'::jsonb,
  occasion    text,
  favorite    boolean default false,
  notes       text,
  wear_count  integer default 0,
  last_worn   timestamptz,
  date_created timestamptz default now(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_outfits_user on outfits(user_id);

alter table outfits enable row level security;

create policy "Users can view their own outfits"
  on outfits for select using (auth.uid() = user_id);
create policy "Users can insert their own outfits"
  on outfits for insert with check (auth.uid() = user_id);
create policy "Users can update their own outfits"
  on outfits for update using (auth.uid() = user_id);
create policy "Users can delete their own outfits"
  on outfits for delete using (auth.uid() = user_id);

-- ============================================================================
-- 3. OUTFIT HISTORY (wear tracking)
-- ============================================================================
create table if not exists outfit_history (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  outfit_id   uuid references outfits(id) on delete set null,
  date_worn   timestamptz not null,
  occasion    text,
  rating      smallint check (rating between 1 and 5),
  notes       text,
  created_at  timestamptz default now()
);

create index idx_outfit_history_user on outfit_history(user_id);
create index idx_outfit_history_date on outfit_history(user_id, date_worn);

alter table outfit_history enable row level security;

create policy "Users can view their own history"
  on outfit_history for select using (auth.uid() = user_id);
create policy "Users can insert their own history"
  on outfit_history for insert with check (auth.uid() = user_id);
create policy "Users can delete their own history"
  on outfit_history for delete using (auth.uid() = user_id);

-- ============================================================================
-- 4. BODY PROFILES
-- ============================================================================
create table if not exists body_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  skin_tone   text,
  undertone   text,
  body_type   text,
  recommended_palette jsonb default '[]'::jsonb,
  avoid_colors jsonb default '[]'::jsonb,
  recommended_fits jsonb default '{}'::jsonb,
  size_hints  jsonb default '{}'::jsonb,
  face_photo_uri text,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);

alter table body_profiles enable row level security;

create policy "Users can view their own profile"
  on body_profiles for select using (auth.uid() = user_id);
create policy "Users can upsert their own profile"
  on body_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update their own profile"
  on body_profiles for update using (auth.uid() = user_id);

-- ============================================================================
-- 5. STYLIST PROFILES
-- ============================================================================
create table if not exists stylist_profiles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  bio         text,
  specialties jsonb default '[]'::jsonb,
  certifications jsonb default '[]'::jsonb,
  years_experience integer default 0,
  profile_image text,
  business_name text,
  website     text,
  instagram   text,
  pricing     jsonb default '{}'::jsonb,
  availability jsonb default '{}'::jsonb,
  rating      numeric(2,1) default 0,
  total_clients integer default 0,
  is_active   boolean default true,
  joined_date timestamptz default now(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_stylist_profiles_user on stylist_profiles(user_id);

alter table stylist_profiles enable row level security;

-- Stylists can manage their own profile; clients can view active profiles
create policy "Stylists can manage their profile"
  on stylist_profiles for all using (auth.uid() = user_id);
create policy "Anyone authenticated can view active stylists"
  on stylist_profiles for select using (is_active = true);

-- ============================================================================
-- 6. STYLIST CLIENTS
-- ============================================================================
create table if not exists stylist_clients (
  id          uuid primary key default uuid_generate_v4(),
  stylist_id  uuid not null references stylist_profiles(id) on delete cascade,
  client_user_id uuid references auth.users(id) on delete set null,  -- linked app user
  name        text not null,
  email       text,
  phone       text,
  profile_image text,
  notes       text,
  preferences jsonb default '{}'::jsonb,
  goals       jsonb default '[]'::jsonb,
  wardrobe_access boolean default false,
  status      text default 'active' check (status in ('active','inactive','archived')),
  total_sessions integer default 0,
  last_session timestamptz,
  date_added  timestamptz default now(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_stylist_clients_stylist on stylist_clients(stylist_id);

alter table stylist_clients enable row level security;

create policy "Stylists can manage their clients"
  on stylist_clients for all
  using (stylist_id in (select id from stylist_profiles where user_id = auth.uid()));

-- Clients can view their own record
create policy "Clients can view their own client record"
  on stylist_clients for select
  using (client_user_id = auth.uid());

-- ============================================================================
-- 7. APPOINTMENTS
-- ============================================================================
create table if not exists appointments (
  id          uuid primary key default uuid_generate_v4(),
  stylist_id  uuid not null references stylist_profiles(id) on delete cascade,
  client_id   uuid not null references stylist_clients(id) on delete cascade,
  client_name text not null,
  type        text not null,
  date        date not null,
  start_time  text not null,   -- "HH:MM"
  end_time    text,
  duration    integer not null, -- minutes
  location    text,
  is_virtual  boolean default false,
  meeting_link text,
  status      text default 'scheduled'
              check (status in ('scheduled','confirmed','completed','cancelled','no-show')),
  notes       text,
  prep_notes  text,
  fee         numeric(10,2),
  paid        boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_appointments_stylist on appointments(stylist_id);
create index idx_appointments_client on appointments(client_id);
create index idx_appointments_date on appointments(date);

alter table appointments enable row level security;

create policy "Stylists can manage their appointments"
  on appointments for all
  using (stylist_id in (select id from stylist_profiles where user_id = auth.uid()));

create policy "Clients can view their appointments"
  on appointments for select
  using (client_id in (select id from stylist_clients where client_user_id = auth.uid()));

-- ============================================================================
-- 8. STYLING RECOMMENDATIONS
-- ============================================================================
create table if not exists recommendations (
  id          uuid primary key default uuid_generate_v4(),
  stylist_id  uuid not null references stylist_profiles(id) on delete cascade,
  client_id   uuid not null references stylist_clients(id) on delete cascade,
  title       text not null,
  description text,
  category    text default 'style-guide'
              check (category in ('outfit','purchase','wardrobe-tip','color-palette','style-guide')),
  items       jsonb default '[]'::jsonb,
  suggested_purchases jsonb default '[]'::jsonb,
  images      jsonb default '[]'::jsonb,
  occasion    text,
  season      jsonb default '[]'::jsonb,
  notes       text,
  status      text default 'draft'
              check (status in ('draft','sent','viewed','implemented')),
  sent_at     timestamptz,
  viewed_at   timestamptz,
  client_feedback jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_recommendations_stylist on recommendations(stylist_id);
create index idx_recommendations_client on recommendations(client_id);

alter table recommendations enable row level security;

create policy "Stylists can manage their recommendations"
  on recommendations for all
  using (stylist_id in (select id from stylist_profiles where user_id = auth.uid()));

create policy "Clients can view their recommendations"
  on recommendations for select
  using (client_id in (select id from stylist_clients where client_user_id = auth.uid()));

create policy "Clients can update feedback on their recommendations"
  on recommendations for update
  using (client_id in (select id from stylist_clients where client_user_id = auth.uid()));

-- ============================================================================
-- 9. MESSAGES
-- ============================================================================
create table if not exists message_threads (
  id          uuid primary key default uuid_generate_v4(),
  stylist_id  uuid not null references stylist_profiles(id) on delete cascade,
  client_id   uuid not null references stylist_clients(id) on delete cascade,
  last_message text,
  last_message_at timestamptz,
  unread_stylist integer default 0,
  unread_client integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table message_threads enable row level security;

create policy "Stylists can access their threads"
  on message_threads for all
  using (stylist_id in (select id from stylist_profiles where user_id = auth.uid()));

create policy "Clients can access their threads"
  on message_threads for select
  using (client_id in (select id from stylist_clients where client_user_id = auth.uid()));

create table if not exists messages (
  id          uuid primary key default uuid_generate_v4(),
  thread_id   uuid not null references message_threads(id) on delete cascade,
  sender_id   uuid not null references auth.users(id),
  sender_type text not null check (sender_type in ('stylist','client')),
  content     text not null,
  attachments jsonb default '[]'::jsonb,
  read        boolean default false,
  read_at     timestamptz,
  created_at  timestamptz default now()
);

create index idx_messages_thread on messages(thread_id, created_at);

alter table messages enable row level security;

create policy "Thread participants can view messages"
  on messages for select
  using (
    thread_id in (
      select id from message_threads
      where stylist_id in (select id from stylist_profiles where user_id = auth.uid())
         or client_id in (select id from stylist_clients where client_user_id = auth.uid())
    )
  );

create policy "Thread participants can send messages"
  on messages for insert
  with check (auth.uid() = sender_id);

-- ============================================================================
-- 10. BOOKING REQUESTS (marketplace)
-- ============================================================================
create table if not exists booking_requests (
  id              uuid primary key default uuid_generate_v4(),
  stylist_id      uuid not null references stylist_profiles(id) on delete cascade,
  client_user_id  uuid not null references auth.users(id) on delete cascade,
  client_name     text not null,
  client_email    text,
  requested_service text,
  preferred_date  date,
  preferred_time  text,
  message         text,
  status          text default 'pending'
                  check (status in ('pending','accepted','declined','converted')),
  appointment_id  uuid references appointments(id) on delete set null,
  created_at      timestamptz default now(),
  responded_at    timestamptz
);

alter table booking_requests enable row level security;

create policy "Stylists can manage booking requests"
  on booking_requests for all
  using (stylist_id in (select id from stylist_profiles where user_id = auth.uid()));

create policy "Clients can view/create their requests"
  on booking_requests for select
  using (client_user_id = auth.uid());

create policy "Clients can insert booking requests"
  on booking_requests for insert
  with check (client_user_id = auth.uid());

-- ============================================================================
-- 11. STYLIST REVIEWS
-- ============================================================================
create table if not exists stylist_reviews (
  id            uuid primary key default uuid_generate_v4(),
  stylist_id    uuid not null references stylist_profiles(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  client_name   text,
  rating        smallint not null check (rating between 1 and 5),
  title         text,
  comment       text,
  appointment_id uuid references appointments(id) on delete set null,
  helpful       integer default 0,
  response      jsonb,   -- { content, created_at }
  created_at    timestamptz default now()
);

create index idx_reviews_stylist on stylist_reviews(stylist_id);

alter table stylist_reviews enable row level security;

create policy "Anyone can view reviews"
  on stylist_reviews for select using (true);

create policy "Clients can create reviews"
  on stylist_reviews for insert
  with check (client_user_id = auth.uid());

create policy "Stylists can respond to their reviews"
  on stylist_reviews for update
  using (stylist_id in (select id from stylist_profiles where user_id = auth.uid()));

-- ============================================================================
-- 12. STORAGE BUCKETS (run via Supabase dashboard or storage API)
-- ============================================================================
-- Create a 'wardrobe-images' bucket in Supabase Storage dashboard.
-- Policy: users can upload/read/delete only in their own folder (user_id prefix).
--
-- Example storage policy (set in dashboard):
--   bucket: wardrobe-images
--   SELECT: (bucket_id = 'wardrobe-images') AND (auth.uid()::text = (storage.foldername(name))[1])
--   INSERT: (bucket_id = 'wardrobe-images') AND (auth.uid()::text = (storage.foldername(name))[1])
--   DELETE: (bucket_id = 'wardrobe-images') AND (auth.uid()::text = (storage.foldername(name))[1])

-- ============================================================================
-- HELPER: auto-update updated_at timestamp
-- ============================================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply the trigger to all tables with updated_at
do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.columns
    where column_name = 'updated_at'
      and table_schema = 'public'
  loop
    execute format(
      'create trigger set_updated_at before update on %I
       for each row execute function update_updated_at()',
      t
    );
  end loop;
end;
$$;
