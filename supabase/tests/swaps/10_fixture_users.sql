-- Fixtures: A and B are friends, D is A's friend, C is a stranger to everyone.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'ann@example.test', '{"name":"Ann"}', now() - interval '10 days'),
  ('b0000000-0000-0000-0000-00000000000b', 'bea@example.test', '{"name":"Bea"}', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-00000000000c', 'cat@example.test', '{"name":"Cat"}', now() - interval '10 days'),
  ('d0000000-0000-0000-0000-00000000000d', 'dee@example.test', '{"name":"Dee"}', now() - interval '10 days');
insert into friend_requests (requester_id, recipient_id, status, responded_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now()),
  ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a', 'accepted', now());

insert into clothing_items (id, user_id, name, category, brand, color, size, condition, user_image, cost, notes, tag_text, estimated_value, wear_count, materials, care_instructions, origin_country, tags, retailer) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Blue blazer', 'outerwear', 'Zara', 'blue', 'M', 'good',
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/a0000000-0000-0000-0000-00000000000a/1700000000001.jpg',
     120, 'secret note about my ex', 'LAUNDRY MARK 555-123-4567', 80, 7,
     '[{"name":"Wool","percentage":80,"tier":"primary"},{"name":"Nylon","percentage":20,"tier":"primary"},{"bad":1}]',
     '{"Dry clean only"}', 'Italy', '["work","private tag"]', 'Zara store'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Red scarf', 'accessories', null, 'red', null, null,
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/a0000000-0000-0000-0000-00000000000a/1700000000002.jpg',
     null, null, null, null, 0, null, null, null, '[]', null),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Linen shirt', 'tops', 'Uniqlo', 'white', 'S', 'like_new',
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000003.jpg',
     30, 'bea private', null, null, 2, null, null, null, '[]', null),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'Wool hat', 'hats', null, 'grey', 'One size', 'good',
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000004.jpg',
     null, null, null, null, 0, null, null, null, '[]', null),
  ('b1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'No photo top', 'tops', null, null, null, null,
     'file:///var/mobile/Containers/x.jpg', null, null, null, null, 0, null, null, null, '[]', null);


select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.accept_swap_terms('2026-10');
select t.as_user('b0000000-0000-0000-0000-00000000000b'); select public.accept_swap_terms('2026-10');
select t.as_user('c0000000-0000-0000-0000-00000000000c'); select public.accept_swap_terms('2026-10');
select t.as_user('d0000000-0000-0000-0000-00000000000d'); select public.accept_swap_terms('2026-10');
select t.as_admin();
