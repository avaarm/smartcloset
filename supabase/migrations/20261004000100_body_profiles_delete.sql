-- body_profiles had no DELETE policy, so "clear body profile" silently deleted
-- nothing on the server (RLS filters the delete to zero rows without an error).
create policy "Users can delete their own profile" on public.body_profiles
  for delete to authenticated
  using (auth.uid() = user_id);
