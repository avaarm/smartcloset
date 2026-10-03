-- Once wardrobe-images is private, a photo link only works for someone allowed to
-- SELECT the object. Owners already can (select-wardrobe-images); this lets an
-- accepted friend request partner read the other person's photos too, so the
-- friend-closet screen can show them via signed links.

create policy "friends can read wardrobe images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wardrobe-images'
    and exists (
      select 1
        from public.friend_requests fr
       where fr.status = 'accepted'
         and (
           (fr.requester_id = auth.uid() and fr.recipient_id::text = (storage.foldername(name))[1])
           or (fr.recipient_id = auth.uid() and fr.requester_id::text = (storage.foldername(name))[1])
         )
    )
  );
