select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('before: a friend can read the raw row (the leak)', (select count(*) from public.clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a') = 2);
select t.check('before: including what they paid', (select max(cost) from public.clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a') = 120);
select t.as_admin();
drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('after: the raw rows are not readable by a friend', (select count(*) from public.clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a') = 0);
select t.check('after: the friend closet function still works', (select count(*) from public.get_friend_closet('a0000000-0000-0000-0000-00000000000a')) = 2);
select t.check('after: the owner still reads their own', (select count(*) from public.clothing_items where user_id = 'b0000000-0000-0000-0000-00000000000b') >= 2);
