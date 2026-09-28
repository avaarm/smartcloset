-- Migration 007: friends + closet sharing
--
-- Lets a personal-account user add another user as a friend (by email) and,
-- once accepted, view each other's wardrobe read-only. No public "users"
-- directory table is created — email lookup goes through a narrow
-- SECURITY DEFINER RPC so the friend_requests table itself never has to be
-- browsable by email.

-- ============================================================================
-- 1. FRIEND REQUESTS / FRIENDSHIPS
-- ============================================================================
-- A single row represents either a pending request or, once accepted, the
-- friendship itself (status = 'accepted'). Declined/cancelled requests are
-- deleted rather than kept around, so a user can re-request later.
create table if not exists friend_requests (
  id             uuid primary key default uuid_generate_v4(),
  requester_id   uuid not null references auth.users(id) on delete cascade,
  recipient_id   uuid not null references auth.users(id) on delete cascade,
  requester_name text,
  recipient_name text,
  status         text not null default 'pending' check (status in ('pending','accepted')),
  created_at     timestamptz default now(),
  responded_at   timestamptz,
  constraint no_self_friend_request check (requester_id <> recipient_id),
  constraint unique_friend_pair unique (requester_id, recipient_id)
);

create index idx_friend_requests_requester on friend_requests(requester_id);
create index idx_friend_requests_recipient on friend_requests(recipient_id);

alter table friend_requests enable row level security;

create policy "Users can view requests they sent or received"
  on friend_requests for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
create policy "Users can send friend requests"
  on friend_requests for insert
  with check (auth.uid() = requester_id);
create policy "Users can respond to their requests"
  on friend_requests for update
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
create policy "Users can delete requests they sent or received"
  on friend_requests for delete
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- ============================================================================
-- 2. EMAIL LOOKUP (SECURITY DEFINER — auth.users is not otherwise queryable)
-- ============================================================================
create or replace function find_user_by_email(target_email text)
returns table(id uuid, name text)
language sql
security definer
set search_path = public, auth
as $$
  select u.id, coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as name
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;
$$;

revoke all on function find_user_by_email(text) from public;
grant execute on function find_user_by_email(text) to authenticated;

-- ============================================================================
-- 3. CLOSET SHARING — additional read-only visibility for accepted friends
-- ============================================================================
-- Postgres OR's together all permissive policies for the same command, so
-- this adds to (never narrows) the existing owner-only select policy.
create policy "Friends can view each other's wardrobe"
  on clothing_items for select
  using (
    exists (
      select 1 from friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = auth.uid() and fr.recipient_id = clothing_items.user_id)
          or (fr.recipient_id = auth.uid() and fr.requester_id = clothing_items.user_id)
        )
    )
  );
