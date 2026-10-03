-- Security fixes found in QA (2026-10-02).
--
-- 1. friend_requests: any signed-in user could INSERT a row already marked
--    'accepted' (or UPDATE their own pending request to 'accepted'), which the
--    "Friends can view each other's wardrobe" policy on clothing_items then
--    treated as a real friendship — exposing another user's closet.
--    Now: requests are created as 'pending' only, and only the recipient may
--    accept, changing only status/responded_at.
--
-- 2. delete_user_account(): referenced columns that do not exist
--    (e.g. recommendations.user_id), so it always errored and account deletion
--    never worked (App Store guideline 5.1.1(v)). Rewritten against the live
--    schema; messages.sender_id has no ON DELETE rule, so messages are removed
--    explicitly. Remaining user-linked tables cascade from auth.users.

-- ─── 1. friend_requests ──────────────────────────────────────────────────────

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

drop policy if exists "Users can respond to their requests" on public.friend_requests;
create policy "Only the recipient can accept a request" on public.friend_requests
  for update to authenticated
  using (auth.uid() = recipient_id and status = 'pending')
  with check (auth.uid() = recipient_id and status = 'accepted');

-- A recipient may only touch the response columns, never who the request is between.
revoke update on public.friend_requests from anon, authenticated;
grant update (status, responded_at) on public.friend_requests to authenticated;

-- ─── 2. delete_user_account ──────────────────────────────────────────────────

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  sprofiles uuid[];
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- stylist_id columns may hold either the auth uid or the stylist_profiles id.
  select coalesce(array_agg(id), '{}') into sprofiles
    from public.stylist_profiles where user_id = uid;

  delete from public.messages
    where sender_id = uid
       or thread_id in (
         select id from public.message_threads
          where client_id = uid or stylist_id = uid or stylist_id = any(sprofiles));
  delete from public.message_threads
    where client_id = uid or stylist_id = uid or stylist_id = any(sprofiles);
  delete from public.appointments
    where client_id = uid or stylist_id = uid or stylist_id = any(sprofiles);
  delete from public.recommendations
    where client_id = uid or stylist_id = uid or stylist_id = any(sprofiles);
  delete from public.styling_recommendations
    where client_id = uid or stylist_id = uid or stylist_id = any(sprofiles);
  delete from public.booking_requests
    where client_user_id = uid or stylist_id = uid or stylist_id = any(sprofiles);
  delete from public.stylist_reviews
    where client_user_id = uid or stylist_id = uid or stylist_id = any(sprofiles);
  delete from public.stylist_clients
    where stylist_id = uid or stylist_id = any(sprofiles);

  -- Cascades from auth.users: clothing_items, outfits, outfit_history,
  -- body_profiles, friend_requests, product_contributions, profiles,
  -- stylist_profiles. stylist_clients.client_user_id is set null.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;
