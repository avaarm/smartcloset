create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create or replace function t.propose(p_who uuid, p_req uuid, p_off uuid, p_note text default null) returns uuid language plpgsql as $$
begin
  perform t.as_user(p_who);
  return public.propose_swap(array[p_req], array[p_off], p_note, gen_random_uuid());
end $$;
-- Swap 1: completed (stub must survive B leaving). Swap 2: accepted. Swap 3 would be proposed.
insert into ids select 'done', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'), 'first');
select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.respond_to_swap((select id from ids where k='done'), 'accept');
select public.swap_complete_my_side((select id from ids where k='done'), false);
select t.as_user('b0000000-0000-0000-0000-00000000000b'); select public.swap_complete_my_side((select id from ids where k='done'), false);
select t.as_admin();
update swap_listings set status = 'active' where id in ((select id from pub where k='a2'));
insert into ids select 'open', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'), 'second');
select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.respond_to_swap((select id from ids where k='open'), 'accept');

-- B deletes their account.
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.delete_user_account();
select t.as_admin();
select t.check('B''s account is gone', not exists (select 1 from auth.users where id = 'b0000000-0000-0000-0000-00000000000b'));
select t.check('no swap table row references B', 
  not exists (select 1 from swaps where 'b0000000-0000-0000-0000-00000000000b' in (proposer_id, recipient_id))
  and not exists (select 1 from swap_listings where owner_id = 'b0000000-0000-0000-0000-00000000000b')
  and not exists (select 1 from swap_messages where sender_id = 'b0000000-0000-0000-0000-00000000000b')
  and not exists (select 1 from swap_members where user_id = 'b0000000-0000-0000-0000-00000000000b')
  and not exists (select 1 from swap_rate_counters where user_id = 'b0000000-0000-0000-0000-00000000000b'));
select t.check('B''s listing photos are queued for removal', (select count(*) from swap_photo_gc where path in ((select id::text || '.jpg' from pub where k='b1'), (select id::text || '.jpg' from pub where k='b2'))) = 2);
select t.check('open swap closed unavailable', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='open')) = 'cancelled/unavailable');
select t.check('A''s reserved listing is free again', (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');
select t.check('no reservations left', (select count(*) from swap_items where reserved) = 0);
select t.check('completed swap stub survives for A', (select status from swaps where id = (select id from ids where k='done')) = 'completed');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('A sees "Former member"', (select other_label from public.list_my_swaps() where swap_id = (select id from ids where k='done')) = 'Former member');
select t.check('A can still open the stub, without a counterpart id', public.get_swap((select id from ids where k='done'))::text !~ 'b0000000');
select t.check('A cannot message a former member', not (public.get_swap((select id from ids where k='open'))->'actions'->>'canMessage')::boolean);
select t.check('A keeps what they received', exists (select 1 from clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a' and name = 'Linen shirt'));

-- A deletes too: nothing is left of the swaps.
select public.delete_user_account();
select t.as_admin();
select t.check('both gone: no swaps left', (select count(*) from swaps) = 0 and (select count(*) from swap_items) = 0 and (select count(*) from swap_messages) = 0);
select t.check('both gone: no listings or members', (select count(*) from swap_listings) = 0 and (select count(*) from swap_members where user_id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b')) = 0);
select t.check('queue holds paths only', (select count(*) from swap_photo_gc) >= 4);
