-- Listings: A's blazer, B's shirt and hat (friends audience), published as the service role would.
create temp table pub (k text primary key, id uuid);
grant all on pub to public;
select t.as_service();
do $$
declare r jsonb; lid uuid;
begin
  r := public.swap_publish_precheck('a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'friends', 'Prefer tops');
  lid := (r->>'listingId')::uuid;
  perform t.check('precheck returns source path', r->>'sourcePath' = 'a0000000-0000-0000-0000-00000000000a/1700000000001.jpg', r::text);
  perform public.swap_publish_commit('a0000000-0000-0000-0000-00000000000a', lid, 'a1000000-0000-0000-0000-000000000001', 'friends', 'Prefer tops', 'stripped');
  insert into pub values ('a1', lid);
  r := public.swap_publish_precheck('a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('a0000000-0000-0000-0000-00000000000a', lid, 'a1000000-0000-0000-0000-000000000002', 'friends', null, 'stripped');
  insert into pub values ('a2', lid);
  r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', lid, 'b1000000-0000-0000-0000-000000000001', 'friends', null, 'stripped');
  insert into pub values ('b1', lid);
  r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000002', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', lid, 'b1000000-0000-0000-0000-000000000002', 'friends', null, 'stripped');
  insert into pub values ('b2', lid);
end $$;
select t.as_admin();
