-- Behaviour checks for the quality-ratings migrations. Run inside one transaction that is rolled back,
-- against a scratch database or a Supabase branch that has all the migrations applied, including the
-- released friends-policy drop:
--   supabase db query --db-url '<percent-encoded url of that database>' -f supabase/checks/quality_ratings_scenarios.sql
-- (or psql -q -d <db> -f ...). Ends with ONE result set: every assertion as name/ok, then the rollback.
-- Afterwards run supabase/checks/quality_ratings_leak_check.sql.
--
-- Use a scratch database or a Supabase branch, not the live project: the script creates fixture
-- members and rewrites rating_settings (all rolled back) and takes locks while it runs. It is safe
-- on a database that already holds real members and real ratings: it uses brands no real member has
-- (the "Zz..." names below), counts only its own fixture ids (a0000000-..., b0000000-...), asserts
-- no table-wide count, and sets every threshold it depends on itself. supabase/checks/populated_seed.sql
-- adds real-looking contributors so that independence can be shown.
begin;

create temp table res (name text, ok boolean);
grant all on res to authenticated, anon;

-- helpers --------------------------------------------------------------------------------------
create function pg_temp.uid(n int) returns uuid language sql immutable as
  $$ select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.iid(u int, k int) returns uuid language sql immutable as
  $$ select ('b0000000-0000-0000-0000-' || lpad((u * 100 + k)::text, 12, '0'))::uuid $$;
create function pg_temp.act(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.fails_with(p_sql text, p_state text) returns boolean language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlstate = p_state; end $$;
create function pg_temp.fails_with_msg(p_sql text, p_state text, p_msg text) returns boolean language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlstate = p_state and sqlerrm like '%' || p_msg || '%'; end $$;
create function pg_temp.works(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return true; exception when others then return false; end $$;
create function pg_temp.check_(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into res values (p_name, coalesce(p_ok, false)); end $$;
-- The published payload may carry only these keys, at these levels, whatever they are called: a count
-- or a name added to it under a new key must fail here, not slip past a list of forbidden words.
create function pg_temp.keys_within(j jsonb, allowed text[]) returns boolean language sql immutable as
  $$ select case coalesce(jsonb_typeof(j), 'absent')
       when 'object' then not exists (select 1 from jsonb_object_keys(j) k where k <> all (allowed))
       when 'absent' then true
       else false end $$;
create function pg_temp.elements_within(j jsonb, allowed text[]) returns boolean language sql immutable as
  $$ select case coalesce(jsonb_typeof(j), 'absent')
       when 'array' then not exists (select 1 from jsonb_array_elements(j) e where not pg_temp.keys_within(e, allowed))
       when 'absent' then true
       else false end $$;
create function pg_temp.payload_keys_ok(j jsonb) returns boolean language sql immutable as
  $$ select pg_temp.keys_within(j, array['status', 'n_bucket', 'score', 'item', 'brand', 'traits', 'slices', 'as_of'])
        and pg_temp.keys_within(j -> 'item', array['feel', 'comfort', 'holds_up', 'would_buy_again_pct', 'fit'])
        and pg_temp.keys_within(j -> 'item' -> 'fit', array['runs_small', 'true_to_size', 'runs_large'])
        and pg_temp.keys_within(j -> 'brand', array['quality', 'fit_consistency', 'value'])
        and pg_temp.elements_within(j -> 'traits', array['group', 'tag', 'pct'])
        and pg_temp.elements_within(j -> 'slices', array['kind', 'key', 'n_bucket', 'overall', 'feel', 'holds_up']) $$;
-- the fixture brand keys: zzfixtureco (the main brand), zzcrowdco (a brand with eleven voters)
create function pg_temp.voters(p_key text) returns bigint language sql as
  $$ select count(*) from public.rating_voters(p_key) $$;

-- the settings the shipped defaults give (read from the column defaults, not from the live row) ------------
select pg_temp.check_('settings: shipped defaults are 10 / 10 / 5 / 10 / 7 / 5 / 30 / 24 / 6',
  (select string_agg(column_name || '=' || column_default, ',' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'rating_settings'
      and column_name in ('k_brand','k_slice','k_chip','min_old_voters','min_account_days','min_owned_items','old_account_days','settle_hours','cache_ttl_hours'))
  = 'cache_ttl_hours=6,k_brand=10,k_chip=5,k_slice=10,min_account_days=7,min_old_voters=10,min_owned_items=5,old_account_days=30,settle_hours=24');

-- fixtures: 1-6 established members, 7 reader (and friend of 1), 8 rates everything the same, 9 young
-- account, 10 unconfirmed, 11-16 more established members
insert into auth.users (id, email, created_at, email_confirmed_at)
select pg_temp.uid(n), 'u' || n || '@example.test',
       case n when 9 then now() - interval '3 days' else now() - interval '40 days' end,
       case n when 10 then null else now() - interval '39 days' end
  from generate_series(1, 16) n;

-- every member owns 6 items; item 1 is a worn Zzfixture Co cotton top read from a tag; item 2 is an unworn
-- Zzfixture Co item; item 3 has no brand; item 4 is a wishlist item; item 5 is a worn Zzcrowd Co cotton top
-- read from a tag; item 6 is another brand. Member 1 also owns an unworn Zzunworn Co item.
insert into public.clothing_items (id, user_id, name, category, brand, materials, wear_count, is_wishlist, tag_text)
select pg_temp.iid(u, k), pg_temp.uid(u), 'item ' || u || '-' || k, 'tops',
       case k when 1 then 'Zzfixture Co' when 2 then 'zzfixture co' when 3 then null when 4 then 'Zzfixture Co'
              when 5 then 'Zzcrowd Co' else 'Zzother ' || k end,
       case when k in (1, 5) then '[{"name":"cotton","percentage":100,"tier":"primary"}]'::jsonb end,
       case k when 2 then 0 else 4 end,
       (k = 4),
       case when k in (1, 5) then 'COTTON 100%' end
  from generate_series(1, 16) u, generate_series(1, 6) k;
insert into public.clothing_items (id, user_id, name, category, brand, wear_count)
values (pg_temp.iid(1, 7), pg_temp.uid(1), 'unworn', 'tops', 'Zzunworn Co', 0);
-- member 8 owns 16 more worn items of different brands (for the "rates everything the same" rule);
-- member 11 has 8 more (rated with a little spread), member 12 has 6 more (rated all 5, but fewer than 8 in all)
insert into public.clothing_items (id, user_id, name, category, brand, wear_count)
select pg_temp.iid(8, 20 + k), pg_temp.uid(8), 'extra ' || k, 'tops', 'Zzbrand ' || k, 2 from generate_series(1, 16) k;
insert into public.clothing_items (id, user_id, name, category, brand, wear_count)
select pg_temp.iid(11, 20 + k), pg_temp.uid(11), 'extra ' || k, 'tops', 'Zzspread ' || k, 2 from generate_series(1, 8) k;
insert into public.clothing_items (id, user_id, name, category, brand, wear_count)
select pg_temp.iid(12, 20 + k), pg_temp.uid(12), 'extra ' || k, 'tops', 'Zzspread ' || k, 2 from generate_series(1, 6) k;
-- member 7 is an accepted friend of member 1
insert into public.friend_requests (requester_id, recipient_id, status) values (pg_temp.uid(7), pg_temp.uid(1), 'accepted');

-- the thresholds this script is written for, set explicitly so it never depends on what the live row holds
update public.rating_settings set
  insights_enabled = true, k_brand = 5, k_slice = 10, k_chip = 5, min_old_voters = 3, min_account_days = 7,
  old_account_days = 30, min_owned_items = 5, settle_hours = 0, cache_ttl_hours = 0, prior_mean = 3.5,
  prior_weight = 5, young_weight = 0.5, trim_from = 20, burst_min = 5, hold_days = 7,
  straight_min_ratings = 8, straight_max_sd = 0.3, read_limit_per_day = 150, write_limit_per_day = 60;

-- brand keys, fibre names, aliases -----------------------------------------------------------------
select pg_temp.check_('key: accents and case fold', public.brand_key_raw('Hermès') = 'hermes' and public.brand_key_raw('HERMES') = 'hermes');
select pg_temp.check_('key: ampersand and punctuation', public.brand_key_raw('H&M') = 'handm' and public.brand_key_raw('Levi''s') = 'levis' and public.brand_key_raw('Dr. Martens') = 'drmartens');
select pg_temp.check_('key: ligatures', public.brand_key_raw('Sézane') = 'sezane' and public.brand_key_raw('Fjällräven') = 'fjallraven' and public.brand_key_raw('Strauß') = 'strauss');
select pg_temp.check_('key: aliases', public.resolve_brand_key('Bottega') = 'bottegaveneta' and public.resolve_brand_key('Bottega Veneta') = 'bottegaveneta' and public.resolve_brand_key('bottegaveneta') = 'bottegaveneta' and public.resolve_brand_key('YSL') = 'saintlaurent');
select pg_temp.check_('key: both spellings of Dolce & Gabbana meet', public.resolve_brand_key('D&G') = 'dolceandgabbana' and public.resolve_brand_key('DG') = 'dolceandgabbana' and public.resolve_brand_key('Dolce & Gabbana') = 'dolceandgabbana');
select pg_temp.check_('key: too short or empty is null', public.resolve_brand_key('A') is null and public.resolve_brand_key('  ') is null and public.resolve_brand_key(null) is null);
select pg_temp.check_('fibre: aliases and qualifiers', public.canonical_fibre('Polyamide') = 'nylon' and public.canonical_fibre('organic cotton') = 'cotton' and public.canonical_fibre('unobtainium') = 'other');
select pg_temp.check_('fibre: imitation leather is never leather',
  public.canonical_fibre('vegan leather') = 'polyurethane' and public.canonical_fibre('Faux Leather') = 'polyurethane'
  and public.canonical_fibre('pleather') = 'polyurethane' and public.canonical_fibre('synthetic leather') = 'polyurethane'
  and public.canonical_fibre('PU leather') = 'polyurethane' and public.canonical_fibre('leather') = 'leather'
  and public.canonical_fibre('recycled polyester') = 'polyester');
select pg_temp.check_('primary material: largest shell share, junk tolerated',
  public.primary_material_key('[{"name":"polyester","percentage":30,"tier":"primary"},{"name":"cotton","percentage":70,"tier":"primary"},{"name":"nylon","percentage":100,"tier":"lining"}]') = 'cotton'
  and public.primary_material_key('"not an array"') is null and public.primary_material_key('[1,{"name":5}]') is null);
select pg_temp.check_('shares round to 100 in steps of 5', (select (a[1] + a[2] + a[3] = 100 and a[1] % 5 = 0 and a[2] % 5 = 0) from (select public.round_shares_5(0.33, 0.33, 0.34) a) s));

-- consent --------------------------------------------------------------------------------------
select pg_temp.act(1);
select pg_temp.check_('consent: adult confirmation required', pg_temp.fails_with($q$select public.set_consent('share_ratings', true, 'ratings-2026-10', false)$q$, '22023'));
select pg_temp.check_('consent: unknown purpose refused', pg_temp.fails_with($q$select public.set_consent('nope', true, 'v1', true)$q$, '22023'));
select pg_temp.check_('consent: text the caller names must be the text in force',
  pg_temp.fails_with_msg($q$select public.set_consent('share_ratings', true, 'ratings-2099-01', true)$q$, '22023', 'stale_consent_text')
  and not exists (select 1 from public.user_consents where user_id = pg_temp.uid(1)));
select pg_temp.check_('rating without agreement is not refused, it says no_consent',
  (select contribution_blocked from public.save_item_rating(pg_temp.iid(1, 1), 5, null, '{}', null, '{}', null, '{}', null, null, null, true)) = 'no_consent');
select pg_temp.check_('rating without agreement is saved privately',
  exists (select 1 from public.item_ratings where item_id = pg_temp.iid(1, 1) and not contributed));
select pg_temp.check_('brand rating without agreement is not refused, it says no_consent',
  (select contribution_blocked from public.save_brand_rating('Zzfixture Co', 3, p_contribute => true)) = 'no_consent');
select pg_temp.check_('brand rating without agreement is saved privately',
  exists (select 1 from public.brand_ratings where user_id = pg_temp.uid(1) and brand_key = 'zzfixtureco' and not contributed));
select public.delete_brand_rating('Zzfixture Co');
select pg_temp.back();

do $$
declare n int;
begin
  for n in 1..5 loop
    perform pg_temp.act(n);
    perform public.set_consent('share_ratings', true, 'ratings-2026-10', true, false);
    perform pg_temp.back();
  end loop;
  -- member 6 never opts in yet; 8, 9 and 10 do
  for n in 8..10 loop
    perform pg_temp.act(n);
    perform public.set_consent('share_ratings', true, 'ratings-2026-10', true, false);
    perform pg_temp.back();
  end loop;
end $$;
select pg_temp.check_('consent: a row per fixture member who agreed, carrying the server''s text version',
  (select count(*) from public.user_consents where user_id::text like 'a0000000-%') = 8
  and (select bool_and(policy_version = (select current_version from public.consent_purposes where purpose = 'share_ratings'))
         from public.user_consents where user_id::text like 'a0000000-%'));

-- saving ratings ---------------------------------------------------------------------------------
select pg_temp.act(1);
select pg_temp.check_('save: wishlist item refused', pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 5)$q$, pg_temp.iid(1, 4)), '22023'));
select pg_temp.check_('save: someone else''s item refused', pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 5)$q$, pg_temp.iid(2, 1)), '22023'));
select pg_temp.check_('save: bad score refused', pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 6)$q$, pg_temp.iid(1, 1)), '22023'));
select pg_temp.check_('save: unknown descriptor refused', pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 5, 4, '{sparkly}')$q$, pg_temp.iid(1, 1)), '22023'));
select pg_temp.check_('save: more than four descriptors refused', pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 5, 4, '{soft,silky,buttery,smooth,crisp}')$q$, pg_temp.iid(1, 1)), '22023'));
select pg_temp.check_('save: unworn item stays private',
  (select contribution_blocked from public.save_item_rating(pg_temp.iid(1, 2), 4, p_contribute => true)) = 'not_worn');
select pg_temp.check_('save: item without a brand stays private',
  (select contribution_blocked from public.save_item_rating(pg_temp.iid(1, 3), 4, p_contribute => true)) = 'no_brand');
select pg_temp.check_('brand rating needs an owned item of that brand',
  pg_temp.fails_with($q$select * from public.save_brand_rating('Hermès', 5)$q$, '42501'));
select pg_temp.check_('brand rating: contributing needs a worn item of the brand',
  (select contribution_blocked from public.save_brand_rating('Zzunworn Co', 4, p_contribute => true)) = 'not_worn');
select pg_temp.check_('brand rating: and is then saved privately',
  exists (select 1 from public.brand_ratings where user_id = pg_temp.uid(1) and brand_key = 'zzunwornco' and not contributed));
select public.delete_brand_rating('Zzunworn Co');
select pg_temp.back();

-- members 1-4 contribute the Zzfixture Co top (item 1); member 8 rates everything 5 and contributes
do $$
declare n int;
begin
  for n in 1..4 loop
    perform pg_temp.act(n);
    perform * from public.save_item_rating(pg_temp.iid(n, 1), 4 + (n % 2), 4, '{soft,smooth}', 4, '{breathable}', null, '{}', 'true_to_size', 'yes', 'private note ' || n, true);
    perform pg_temp.back();
  end loop;
  perform pg_temp.act(8);
  for n in 1..6 loop
    if n <> 4 then perform * from public.save_item_rating(pg_temp.iid(8, n), 5, p_contribute => true); end if;
  end loop;
  for n in 1..16 loop
    perform * from public.save_item_rating(pg_temp.iid(8, 20 + n), 5, p_contribute => true);
  end loop;
  perform pg_temp.back();
end $$;

-- members 9 (young) and 10 (unconfirmed) contribute too; member 6 rates but does not contribute
do $$
declare n int;
begin
  for n in 9..10 loop
    perform pg_temp.act(n);
    perform * from public.save_item_rating(pg_temp.iid(n, 1), 1, 1, '{scratchy}', 1, '{itchy}', null, '{}', 'runs_small', 'no', null, true);
    perform pg_temp.back();
  end loop;
  perform pg_temp.act(6);
  perform * from public.save_item_rating(pg_temp.iid(6, 1), 1, p_contribute => false);
  perform pg_temp.back();
end $$;

-- p_contribute is tri-state, and the one-tap call never overwrites a fuller rating (member 9, ineligible to count)
select pg_temp.act(9);
select pg_temp.check_('save: leaving p_contribute out keeps a contributing rating contributing',
  (select contributed from public.save_item_rating(pg_temp.iid(9, 1), 2, 1, '{scratchy}', 1, '{itchy}', null, '{}', 'runs_small', 'no', null))
  and (select contributed from public.item_ratings where item_id = pg_temp.iid(9, 1)));
select pg_temp.check_('save: false stops contributing, and leaving it out then keeps it stopped',
  not (select contributed from public.save_item_rating(pg_temp.iid(9, 1), 2, p_contribute => false))
  and not (select contributed from public.save_item_rating(pg_temp.iid(9, 1), 2)));
select pg_temp.check_('save: a first save that leaves p_contribute out is private',
  not (select contributed from public.save_item_rating(pg_temp.iid(9, 6), 3)));
select pg_temp.check_('save: the one-tap call does not overwrite an existing rating',
  (select contribution_blocked is null from public.save_item_rating(pg_temp.iid(9, 6), 1, p_only_if_new => true))
  and (select overall from public.item_ratings where item_id = pg_temp.iid(9, 6)) = 3);
select pg_temp.check_('save: the one-tap call saves a private rating when there is none',
  (select contribution_blocked is null and not contributed from public.save_item_rating(pg_temp.iid(9, 5), 2, p_only_if_new => true)));
select pg_temp.check_('save: and the rating is there', (select overall from public.item_ratings where item_id = pg_temp.iid(9, 5)) = 2);
select pg_temp.back();

select pg_temp.check_('voters: not enough established members yet', pg_temp.voters('zzfixtureco') = 4);
select pg_temp.act(7);
select pg_temp.check_('insight: four members is not enough', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'insufficient');
select pg_temp.check_('insight: unknown brand looks identical', public.get_brand_insight('Zznobody Rated This') = public.get_brand_insight('Zzfixture Co'));
select pg_temp.back();
select pg_temp.check_('insight: no row is written for an unknown brand', not exists (select 1 from public.brand_stats where brand_key = 'zznobodyratedthis'));

-- the fifth established member
select pg_temp.act(5);
select pg_temp.check_('save: contributes', (select contributed from public.save_item_rating(pg_temp.iid(5, 1), 5, 4, '{soft,smooth}', 4, '{breathable}', null, '{}', 'true_to_size', 'yes', null, true)));
select pg_temp.back();

select pg_temp.check_('voters: youngest, unconfirmed, suppressed-by-rule and straight-liner members do not count',
  pg_temp.voters('zzfixtureco') = 5
  and not exists (select 1 from public.rating_voters('zzfixtureco') where user_id in (pg_temp.uid(6), pg_temp.uid(8), pg_temp.uid(9), pg_temp.uid(10))));

select pg_temp.act(7);
select pg_temp.check_('insight: five members (threshold lowered to 5) gives a headline only, in half points',
  (select j ->> 'status' = 'ok' and j ->> 'n_bucket' = 'under_10' and (j ->> 'score')::numeric * 2 = round((j ->> 'score')::numeric * 2)
          and (j ->> 'score')::numeric between 1 and 5
          and not (j ? 'item') and not (j ? 'brand') and not (j ? 'traits') and not (j ? 'slices')
     from (select public.get_brand_insight('ZZFIXTURE co') as j) s));
select pg_temp.check_('insight: output has no ids, notes, names or exact counts',
  (select j::text !~* '(private note|a0000000|b0000000|user_id|item_id|brand_label|@example)' and not (j ? 'n') and not (j ? 'voters')
          and pg_temp.payload_keys_ok(j) and not pg_temp.payload_keys_ok(j || '{"members": 5}')
     from (select public.get_brand_insight('Zzfixture Co') as j) s));
select pg_temp.back();
update public.rating_settings set k_brand = 10, min_old_voters = 10;
select pg_temp.act(7);
select pg_temp.check_('insight: at the shipped thresholds five members publish nothing', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'insufficient');
select pg_temp.back();
update public.rating_settings set k_brand = 5, min_old_voters = 3;

-- privacy of the tables ---------------------------------------------------------------------------------
select pg_temp.act(7);
select pg_temp.check_('rls: a stranger reads none of the ratings', (select count(*) from public.item_ratings) = 0 and (select count(*) from public.brand_ratings) = 0 and (select count(*) from public.user_consents) = 0);
select pg_temp.check_('rls: no direct writes', pg_temp.fails_with($q$insert into public.item_ratings (item_id, user_id, overall) values (gen_random_uuid(), gen_random_uuid(), 5)$q$, '42501')
  and pg_temp.fails_with($q$update public.item_ratings set overall = 1$q$, '42501') and pg_temp.fails_with($q$delete from public.item_ratings$q$, '42501'));
select pg_temp.check_('rls: aggregates and settings unreadable', pg_temp.fails_with($q$select * from public.brand_stats$q$, '42501') and pg_temp.fails_with($q$select * from public.rating_settings$q$, '42501') and pg_temp.fails_with($q$select * from public.rating_suppressions$q$, '42501'));
select pg_temp.check_('rls: internal functions not callable', pg_temp.fails_with($q$select public.hit_quota(gen_random_uuid(), 'x_x_x', 5)$q$, '42501')
  and pg_temp.fails_with($q$select * from public.rating_voters('zzfixtureco')$q$, '42501') and pg_temp.fails_with($q$select public.compute_brand_stats('zzfixtureco')$q$, '42501')
  and pg_temp.fails_with($q$select public.rebuild_brand_keys()$q$, '42501') and pg_temp.fails_with($q$select public.consent_in_force(gen_random_uuid(), 'share_ratings')$q$, '42501'));
select pg_temp.back();
select pg_temp.act(1);
select pg_temp.check_('rls: a member reads their own rating and note', (select note from public.item_ratings where item_id = pg_temp.iid(1, 1)) = 'private note 1' and (select count(*) from public.item_ratings) = 3);
select pg_temp.check_('get_my_item_rating returns the row without the user id', (select public.get_my_item_rating(pg_temp.iid(1, 1)) ->> 'note') = 'private note 1' and not (public.get_my_item_rating(pg_temp.iid(1, 1)) ? 'user_id'));
select pg_temp.back();
select pg_temp.act_anon();
select pg_temp.check_('anon cannot call the public functions',
  pg_temp.fails_with($q$select public.get_brand_insight('Zzfixture Co')$q$, '42501') and pg_temp.fails_with($q$select * from public.get_my_consents()$q$, '42501')
  and pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 5)$q$, pg_temp.iid(1, 1)), '42501'));
select pg_temp.back();

-- friends cannot read tag text through the table (the held migration must be applied) -----------------------
select pg_temp.act(7);
select pg_temp.check_('friends: an accepted friend reads no row of the other person''s closet through the table',
  (select count(*) from public.clothing_items where user_id = pg_temp.uid(1)) = 0
  and (select count(*) from public.clothing_items where user_id <> pg_temp.uid(7) and tag_text is not null) = 0);
select pg_temp.check_('friends: the closet still loads through get_friend_closet()',
  (select count(*) from public.get_friend_closet(pg_temp.uid(1))) = 6);
select pg_temp.back();

-- withdrawing --------------------------------------------------------------------------------------
select pg_temp.act(1);
select public.set_consent('share_ratings', false, 'ratings-2026-10', false);
select pg_temp.back();
select pg_temp.check_('withdraw: the member leaves the count at once, the rating stays', pg_temp.voters('zzfixtureco') = 4
  and (select contributed from public.item_ratings where item_id = pg_temp.iid(1, 1)) = false
  and exists (select 1 from public.item_ratings where item_id = pg_temp.iid(1, 1)));
select pg_temp.act(7);
select pg_temp.check_('withdraw: back below the threshold', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'insufficient');
select pg_temp.back();
select pg_temp.act(1);
select public.set_consent('share_ratings', true, 'ratings-2026-10', true, false);
select pg_temp.check_('re-enabling does not silently contribute old ratings', (select contributed from public.item_ratings where item_id = pg_temp.iid(1, 1)) = false);
select public.set_consent('share_ratings', true, 'ratings-2026-10', true, true);
select pg_temp.check_('re-enabling with "include existing" does', (select contributed from public.item_ratings where item_id = pg_temp.iid(1, 1)));
select pg_temp.back();

-- brand edited after rating -----------------------------------------------------------------------------
update public.clothing_items set brand = 'Zzmango Co' where id = pg_temp.iid(2, 1);
select pg_temp.check_('edited brand: the rating no longer counts for the old brand', pg_temp.voters('zzfixtureco') = 5
  and not exists (select 1 from public.rating_item_rows('zzfixtureco') where user_id = pg_temp.uid(2)));
select pg_temp.act(2);
select pg_temp.check_('edited brand: reading the rating re-files it', (public.get_my_item_rating(pg_temp.iid(2, 1)) ->> 'brand_key') = 'zzmangoco');
select pg_temp.back();
update public.clothing_items set brand = 'Zzfixture Co' where id = pg_temp.iid(2, 1);
select pg_temp.act(2);
select pg_temp.check_('edited brand: changing it back re-files it again', (public.get_my_item_rating(pg_temp.iid(2, 1)) ->> 'brand_key') = 'zzfixtureco');
select pg_temp.back();

-- suppression, kill switch, holds, limits --------------------------------------------------------------
insert into public.rating_suppressions (user_id, reason) values (pg_temp.uid(3), 'test');
select pg_temp.check_('suppression removes a member', not exists (select 1 from public.rating_voters('zzfixtureco') where user_id = pg_temp.uid(3)));
delete from public.rating_suppressions where user_id::text like 'a0000000-%';

update public.rating_settings set insights_enabled = false;
select pg_temp.act(7);
select pg_temp.check_('kill switch', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'unavailable');
select pg_temp.back();
update public.rating_settings set insights_enabled = true;

update public.rating_settings set min_old_voters = 6;
select pg_temp.act(7);
select pg_temp.check_('needs enough established members', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'insufficient');
select pg_temp.back();
update public.rating_settings set min_old_voters = 3;

update public.rating_settings set read_limit_per_day = 3;
select pg_temp.act(7);
select pg_temp.check_('read limit', pg_temp.fails_with($q$select public.get_brand_insight('Zzfixture Co')$q$, '54000'));
select pg_temp.back();
update public.rating_settings set read_limit_per_day = 150;

delete from public.usage_counters where user_id = pg_temp.uid(2);
update public.rating_settings set write_limit_per_day = 2;
select pg_temp.act(2);
select * from public.save_item_rating(pg_temp.iid(2, 5), 3);
select * from public.save_item_rating(pg_temp.iid(2, 6), 3);
select pg_temp.check_('write limit', pg_temp.fails_with(format($q$select * from public.save_item_rating(%L, 3)$q$, pg_temp.iid(2, 5)), '54000'));
select pg_temp.back();
update public.rating_settings set write_limit_per_day = 60;

-- settling ----------------------------------------------------------------------------------------------
update public.rating_settings set settle_hours = 24;
select pg_temp.check_('settle: a fresh contribution does not count yet', pg_temp.voters('zzfixtureco') = 0);
update public.rating_settings set settle_hours = 0;

-- a sixth member agrees and contributes ----------------------------------------------------------------------
select pg_temp.act(6);
select pg_temp.check_('sixth member contributes after agreeing',
  (select contribution_blocked from public.save_item_rating(pg_temp.iid(6, 1), 4, 4, '{soft}', 4, '{breathable}', null, '{}', 'true_to_size', 'yes', null, true)) = 'no_consent');
select public.set_consent('share_ratings', true, 'ratings-2026-10', true, false);
select pg_temp.check_('sixth member contributes after agreeing (second try)',
  (select contributed from public.save_item_rating(pg_temp.iid(6, 1), 4, 4, '{soft}', 4, '{breathable}', null, '{}', 'true_to_size', 'yes', null, true)));
select pg_temp.back();

-- a wave of new accounts is held ---------------------------------------------------------------------------
select pg_temp.act(7);
select pg_temp.check_('hold: before the wave there is a published score', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'ok');
select pg_temp.back();
update public.rating_settings set old_account_days = 365;    -- every voter now counts as a new account
select pg_temp.act(7);
select pg_temp.check_('hold: the wave keeps the previous numbers', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'ok');
select pg_temp.back();
select pg_temp.check_('hold: and records the hold', (select held_until > now() from public.brand_stats where brand_key = 'zzfixtureco'));
delete from public.brand_stats where brand_key like 'zz%';
select pg_temp.act(7);
select pg_temp.check_('hold: with nothing to keep, nothing numeric is served', (select public.get_brand_insight('Zzfixture Co') ->> 'status') = 'insufficient');
select pg_temp.back();
update public.rating_settings set old_account_days = 30;
delete from public.brand_stats where brand_key like 'zz%';

-- brand rating ----------------------------------------------------------------------------------------------
select pg_temp.act(2);
select pg_temp.check_('brand rating: owned brand accepted', (select contributed from public.save_brand_rating('ZZFIXTURE CO', 4, 4, 3, 5, true)));
select pg_temp.check_('brand rating: summary is the caller''s own', (select (public.get_my_brand_summary('zzfixture co') ->> 'items_rated')::int from (select 1) s) >= 1
  and (public.get_my_brand_summary('zzfixture co') -> 'brand_rating' ->> 'quality')::int = 4 and (public.get_my_brand_summary('zzfixture co') ->> 'can_rate_brand')::boolean);
select pg_temp.back();
-- a brand vote needs a worn piece of the brand today: unwear it and the vote stops counting
select pg_temp.check_('brand rating: counts while a worn piece of the brand is owned', exists (select 1 from public.rating_brand_rows('zzfixtureco') where user_id = pg_temp.uid(2)));
update public.clothing_items set wear_count = 0 where user_id = pg_temp.uid(2) and public.resolve_brand_key(brand) = 'zzfixtureco';
select pg_temp.check_('brand rating: stops counting when nothing of the brand is worn', not exists (select 1 from public.rating_brand_rows('zzfixtureco') where user_id = pg_temp.uid(2)));
update public.clothing_items set wear_count = 4 where user_id = pg_temp.uid(2) and public.resolve_brand_key(brand) = 'zzfixtureco' and id <> pg_temp.iid(2, 2);

-- eleven established members, a brand of their own, the shipped thresholds --------------------------------------
-- members 1-5 and 11-16 contribute the Zzcrowd Co top (item 5); member 8 already did and is a straight-liner.
do $$
declare n int;
begin
  for n in 11..16 loop
    perform pg_temp.act(n);
    perform public.set_consent('share_ratings', true, 'ratings-2026-10', true, false);
    perform pg_temp.back();
  end loop;
  foreach n in array array[1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16] loop
    perform pg_temp.act(n);
    perform * from public.save_item_rating(pg_temp.iid(n, 5), case when n = 11 then 4 else 5 end, 4, '{soft,smooth}', 4, '{breathable}', null, '{}', 'true_to_size', 'yes', null, true);
    perform pg_temp.back();
  end loop;
  -- member 11 adds eight more contributed ratings (seven 5s and a 4); member 12 adds six (all 5): seven in all
  perform pg_temp.act(11);
  for n in 1..8 loop
    perform * from public.save_item_rating(pg_temp.iid(11, 20 + n), case when n = 8 then 4 else 5 end, p_contribute => true);
  end loop;
  perform pg_temp.back();
  perform pg_temp.act(12);
  for n in 1..6 loop
    perform * from public.save_item_rating(pg_temp.iid(12, 20 + n), 5, p_contribute => true);
  end loop;
  perform pg_temp.back();
end $$;
update public.rating_settings set k_brand = 10, k_slice = 10, min_old_voters = 10;    -- the shipped defaults

select pg_temp.check_('straight-liners: eight identical ratings leave the count, seven and a spread do not',
  pg_temp.voters('zzcrowdco') = 11
  and not exists (select 1 from public.rating_voters('zzcrowdco') where user_id = pg_temp.uid(8))
  and exists (select 1 from public.rating_voters('zzcrowdco') where user_id = pg_temp.uid(11))
  and exists (select 1 from public.rating_voters('zzcrowdco') where user_id = pg_temp.uid(12)));
select pg_temp.act(7);
select pg_temp.check_('crowd: eleven established members publish dimensions, fit, descriptors and slices at the shipped thresholds',
  (select j ->> 'status' = 'ok' and j ->> 'n_bucket' = '10-24'
          and (j -> 'item') ? 'feel' and (j -> 'item') ? 'comfort' and (j -> 'item' -> 'fit' ->> 'true_to_size')::int = 100
          and (j -> 'item' ->> 'would_buy_again_pct')::int = 100 and jsonb_array_length(j -> 'traits') >= 2
          and exists (select 1 from jsonb_array_elements(j -> 'slices') e where e ->> 'kind' = 'material' and e ->> 'key' = 'cotton')
          and exists (select 1 from jsonb_array_elements(j -> 'slices') e where e ->> 'kind' = 'category' and e ->> 'key' = 'tops')
     from (select public.get_brand_insight('Zzcrowd Co') as j) s));
select pg_temp.check_('crowd: output has no ids, notes, names or exact counts',
  (select j::text !~* '(private note|a0000000|b0000000|user_id|item_id|brand_label|@example)' and not (j ? 'n') and not (j ? 'voters')
          and pg_temp.payload_keys_ok(j)
          -- the key check itself must bite: an extra key at any level of the real payload is refused
          and not pg_temp.payload_keys_ok(j || '{"members": 11}')
          and not pg_temp.payload_keys_ok(jsonb_set(j, '{item,old_members}', '12'))
          and not pg_temp.payload_keys_ok(jsonb_set(j, '{item,fit,voters}', '12'))
          and not pg_temp.payload_keys_ok(jsonb_set(j, '{traits,0,n}', '12'))
          and not pg_temp.payload_keys_ok(jsonb_set(j, '{slices,0,members}', '12'))
     from (select public.get_brand_insight('Zzcrowd Co') as j) s));
select pg_temp.back();

-- a slice that leaves 1 to 9 members out is not published (the differencing guard)
update public.clothing_items set category = 'bottoms' where id = pg_temp.iid(16, 5);
select pg_temp.act(7);
select pg_temp.check_('complement: a slice that leaves a few members out is not published',
  (select not exists (select 1 from jsonb_array_elements(j -> 'slices') e where e ->> 'kind' = 'category')
          and exists (select 1 from jsonb_array_elements(j -> 'slices') e where e ->> 'kind' = 'material')
     from (select public.get_brand_insight('Zzcrowd Co') as j) s));
select pg_temp.back();
update public.clothing_items set category = 'tops' where id = pg_temp.iid(16, 5);

-- a stored score never outlives a removal -----------------------------------------------------------------------
select pg_temp.act(7);
select pg_temp.check_('removal: the brand has a score', (select public.get_brand_insight('Zzcrowd Co') ->> 'status') = 'ok');
select pg_temp.back();
select pg_temp.check_('removal: and it is stored', exists (select 1 from public.brand_stats where brand_key = 'zzcrowdco'));
delete from public.clothing_items where id = pg_temp.iid(16, 5);
select pg_temp.check_('removal: deleting a contributing item removes the stored score at once', not exists (select 1 from public.brand_stats where brand_key = 'zzcrowdco')
  and not exists (select 1 from public.item_ratings where item_id = pg_temp.iid(16, 5)));
select pg_temp.act(7);
select pg_temp.check_('removal: the next read no longer counts that member', (select public.get_brand_insight('Zzcrowd Co') ->> 'status') = 'ok');
select pg_temp.back();
select pg_temp.check_('removal: ten members are left', pg_temp.voters('zzcrowdco') = 10);
update public.brand_stats set held_until = now() + interval '7 days' where brand_key = 'zzcrowdco';
delete from auth.users where id = pg_temp.uid(15);
select pg_temp.check_('removal: deleting an account removes the stored score at once, even while it is held', not exists (select 1 from public.brand_stats where brand_key = 'zzcrowdco')
  and not exists (select 1 from public.item_ratings where user_id = pg_temp.uid(15)));
select pg_temp.act(7);
select pg_temp.check_('removal: with nine members left the brand is below the threshold', (select public.get_brand_insight('Zzcrowd Co') ->> 'status') = 'insufficient');
select pg_temp.back();
select pg_temp.check_('removal: nine members are left', pg_temp.voters('zzcrowdco') = 9);
update public.brand_stats set held_until = now() + interval '7 days' where brand_key = 'zzcrowdco';
select pg_temp.act(14);
select public.delete_item_rating(pg_temp.iid(14, 5));
select pg_temp.back();
select pg_temp.check_('removal: deleting a rating through the function does the same', not exists (select 1 from public.brand_stats where brand_key = 'zzcrowdco'));

-- adding an alias later re-files the earlier contributions ------------------------------------------------------
update public.rating_settings set k_brand = 5, min_old_voters = 3;
-- member 13 spells the brand differently on the item and has two brand ratings under the two spellings
update public.clothing_items set brand = 'Zzcrowd Company', wear_count = 4 where id = pg_temp.iid(13, 5);
update public.clothing_items set brand = 'Zzcrowd Co', wear_count = 4 where id = pg_temp.iid(13, 6);
select pg_temp.act(13);
select * from public.save_item_rating(pg_temp.iid(13, 5), 4, 4, '{soft}', 4, '{breathable}', null, '{}', 'true_to_size', 'yes', null, true);
select * from public.save_brand_rating('Zzcrowd Co', 2, p_contribute => true);
select * from public.save_brand_rating('Zzcrowd Company', 5, p_contribute => true);
select pg_temp.back();
update public.brand_ratings set updated_at = now() + interval '1 minute' where user_id = pg_temp.uid(13) and brand_key = 'zzcrowdcompany';
select pg_temp.check_('alias: before the alias the two spellings are two brands',
  exists (select 1 from public.rating_voters('zzcrowdcompany') where user_id = pg_temp.uid(13))
  and not exists (select 1 from public.rating_item_rows('zzcrowdco') where user_id = pg_temp.uid(13)));
insert into public.brand_aliases (alias_key, brand_key) values ('zzcrowdcompany', 'zzcrowdco');
select pg_temp.check_('alias: without a rebuild the earlier contribution stays under the old key',
  exists (select 1 from public.item_ratings where item_id = pg_temp.iid(13, 5) and brand_key = 'zzcrowdcompany'));
select pg_temp.check_('alias: rebuild_brand_keys re-files the earlier contributions', public.rebuild_brand_keys() >= 2);
select pg_temp.check_('alias: the item rating and the voter now sit under the target brand',
  (select brand_key from public.item_ratings where item_id = pg_temp.iid(13, 5)) = 'zzcrowdco'
  and exists (select 1 from public.rating_item_rows('zzcrowdco') where user_id = pg_temp.uid(13))
  and not exists (select 1 from public.rating_voters('zzcrowdcompany')));
select pg_temp.check_('alias: two brand ratings of one brand merge, keeping the newer',
  (select count(*) from public.brand_ratings where user_id = pg_temp.uid(13) and brand_key in ('zzcrowdco', 'zzcrowdcompany')) = 1
  and (select overall from public.brand_ratings where user_id = pg_temp.uid(13) and brand_key = 'zzcrowdco') = 5);
select pg_temp.check_('alias: running the rebuild again changes nothing', public.rebuild_brand_keys() = 0);

-- a new consent text needs a fresh answer ------------------------------------------------------------------------
select pg_temp.check_('text version: before the change the crowd counts', pg_temp.voters('zzcrowdco') >= 8);
update public.consent_purposes set current_version = 'ratings-2026-11' where purpose = 'share_ratings';
select pg_temp.check_('text version: after a new version nobody counts until they agree again', pg_temp.voters('zzcrowdco') = 0 and pg_temp.voters('zzfixtureco') = 0);
select pg_temp.act(1);
select pg_temp.check_('text version: the member is told to agree again',
  (select needs_reconsent and granted from public.get_my_consents() where purpose = 'share_ratings'));
select pg_temp.check_('text version: the old text is refused', pg_temp.fails_with_msg($q$select public.set_consent('share_ratings', true, 'ratings-2026-10', true)$q$, '22023', 'stale_consent_text'));
select pg_temp.check_('text version: a rating saved meanwhile is private',
  (select contribution_blocked from public.save_item_rating(pg_temp.iid(1, 5), 4, p_contribute => true)) = 'no_consent');
select public.set_consent('share_ratings', true, 'ratings-2026-11', true, true);
select pg_temp.check_('text version: the member no longer needs to agree again', not (select needs_reconsent from public.get_my_consents() where purpose = 'share_ratings'));
select pg_temp.back();
select pg_temp.check_('text version: agreeing to the new text counts again', exists (select 1 from public.rating_voters('zzcrowdco') where user_id = pg_temp.uid(1)));
select pg_temp.act(2);
select pg_temp.check_('text version: withdrawing needs no current text', pg_temp.works($q$select public.set_consent('share_ratings', false, 'ratings-1999-01', false)$q$));
select pg_temp.back();
update public.consent_purposes set current_version = 'ratings-2026-10' where purpose = 'share_ratings';

-- deleting ------------------------------------------------------------------------------------------------------
select pg_temp.act(5);
select public.delete_item_rating(pg_temp.iid(5, 1));
select pg_temp.back();
select pg_temp.check_('delete rating', not exists (select 1 from public.item_ratings where item_id = pg_temp.iid(5, 1)));
delete from public.clothing_items where id = pg_temp.iid(4, 1);
select pg_temp.check_('deleting an item deletes its rating', not exists (select 1 from public.item_ratings where item_id = pg_temp.iid(4, 1)));
select pg_temp.act(3);
select public.delete_all_my_ratings();
select pg_temp.back();
select pg_temp.check_('delete all', not exists (select 1 from public.item_ratings where user_id = pg_temp.uid(3)));
delete from auth.users where id = pg_temp.uid(2);
select pg_temp.check_('deleting an account leaves nothing behind',
  not exists (select 1 from public.item_ratings where user_id = pg_temp.uid(2))
  and not exists (select 1 from public.brand_ratings where user_id = pg_temp.uid(2))
  and not exists (select 1 from public.user_consents where user_id = pg_temp.uid(2))
  and not exists (select 1 from public.usage_counters where user_id = pg_temp.uid(2)));

select name, ok from (
  select name, ok, 0 as o from res
  union all select 'ALL PASSED', bool_and(ok), 1 from res
) s order by o, ok, name;
rollback;
