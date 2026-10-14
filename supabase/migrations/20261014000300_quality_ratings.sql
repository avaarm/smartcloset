-- Quality ratings: how an item feels and wears, how a brand measures up, and brand insight built
-- from members who chose to contribute.
--
-- Principles (see documentation/design/quality-ratings.md):
--   * A rating is private to the person who made it. Contributing it to brand insight is a separate,
--     recorded permission (user_consents, purpose 'share_ratings') plus a per-rating switch.
--   * Other members only ever see the output of get_brand_insight(): rounded, bucketed, and only
--     when enough different members contributed. No table or view of other people's ratings is
--     readable by a client. No free text from a member is ever returned to anyone else.
--   * Nothing is added to clothing_items (the older friends policy on that table exposes every
--     column; it must be dropped before tag_text is written, see 8.1 of the design) and nothing
--     watches it with a trigger. The only triggers are on this feature's own two rating tables.
--   * Every user column cascades from auth.users, so delete_user_account() needs no change.
--
-- Depends on 20261014000200_consents_and_quota.sql (user_consents, hit_quota, set_consent).
-- Safe on top of existing data and old app builds: only new objects. Safe to run twice.

-- ─── Settings and break-glass controls (one row, edited from the dashboard) ──

create table if not exists public.rating_settings (
  id                 boolean primary key default true check (id),
  insights_enabled   boolean not null default true,      -- false: get_brand_insight answers 'unavailable'
  k_brand            integer not null default 10  check (k_brand >= 3),   -- members needed for a headline or a dimension
  k_slice            integer not null default 10  check (k_slice >= 5),   -- members needed for fit split, slices, "rebuy"
  k_chip             integer not null default 5   check (k_chip >= 3),    -- members who must pick a descriptor
  -- Established (older than old_account_days) members needed. The rule that applies is the larger of
  -- this and k_brand, so lowering k_brand alone can never leave a score resting on young accounts.
  min_old_voters     integer not null default 10  check (min_old_voters >= 1),
  min_account_days   integer not null default 7   check (min_account_days >= 0),
  old_account_days   integer not null default 30  check (old_account_days >= 0),
  min_owned_items    integer not null default 5   check (min_owned_items >= 0),
  settle_hours       integer not null default 24  check (settle_hours >= 0), -- a new or edited contribution counts after this long
  cache_ttl_hours    integer not null default 6   check (cache_ttl_hours >= 0),
  prior_mean         numeric not null default 3.5 check (prior_mean between 1 and 5),
  prior_weight       numeric not null default 5   check (prior_weight >= 0),
  young_weight       numeric not null default 0.5 check (young_weight between 0 and 1),
  trim_from          integer not null default 20  check (trim_from >= 10),   -- drop the top and bottom 5% of votes from this many voters
  burst_min          integer not null default 5   check (burst_min >= 2),
  hold_days          integer not null default 7   check (hold_days >= 1),
  -- A member who has contributed at least this many item ratings whose standard deviation is below
  -- straight_max_sd (everything the same, or nearly) is left out of every score.
  straight_min_ratings integer not null default 8 check (straight_min_ratings >= 3),
  straight_max_sd    numeric not null default 0.3 check (straight_max_sd >= 0),
  read_limit_per_day  integer not null default 150 check (read_limit_per_day >= 1),
  write_limit_per_day integer not null default 60  check (write_limit_per_day >= 1)
);
alter table public.rating_settings enable row level security;
revoke all on public.rating_settings from public, anon, authenticated;
insert into public.rating_settings (id) values (true) on conflict (id) do nothing;

-- A member the developer has excluded from every aggregate (insert a row; delete it to restore).
create table if not exists public.rating_suppressions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now()
);
alter table public.rating_suppressions enable row level security;
revoke all on public.rating_suppressions from public, anon, authenticated;

-- ─── Brand identity ─────────────────────────────────────────────────────────

-- "Bottega Veneta", "bottegaveneta" and "BOTTEGA VENETA" are one key; "Hermes" and "Hermès" too.
-- Must stay identical to brandKeyRaw() in src/utils/brandKey.ts (a shared fixture checks both).
create or replace function public.brand_key_raw(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(left(regexp_replace(lower(replace(
           replace(replace(replace(replace(replace(replace(replace(
             translate(left(coalesce(p_text, ''), 256), 'ÀÁÂÃÄÅĀĂĄàáâãäåāăąÇĆČçćčĎĐÐďđðÈÉÊËĒĖĘĚèéêëēėęěĞğÌÍÎÏĪĮİìíîïīįıŁłÑŃŇñńňÒÓÔÕÖØŌŐòóôõöøōőŔŘŕřŚŠŞȘśšşșŤŢȚťţțÙÚÛÜŪŮŰŲùúûüūůűųÝŸýÿŹŻŽźżž', 'AAAAAAAAAaaaaaaaaaCCCcccDDDdddEEEEEEEEeeeeeeeeGgIIIIIIIiiiiiiiLlNNNnnnOOOOOOOOooooooooRRrrSSSSssssTTTtttUUUUUUUUuuuuuuuuYYyyZZZzzz'),
             'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE'), 'þ', 'th'), 'Þ', 'TH'),
           '&', 'and')), '[^a-z0-9]', '', 'g'), 40), '');
$$;
revoke all on function public.brand_key_raw(text) from public, anon, authenticated;

-- Short forms and spellings that mean the same company. Reviewed by hand; no fuzzy matching.
-- alias_key and brand_key are both brand_key_raw() outputs; an alias never points at another alias.
-- Ratings are filed under the key an alias resolved to when they were saved, so every migration that
-- inserts here must end with: select public.rebuild_brand_keys();  (defined under "Small internal helpers").
create table if not exists public.brand_aliases (
  alias_key text primary key check (alias_key ~ '^[a-z0-9]{2,40}$'),
  brand_key text not null check (brand_key ~ '^[a-z0-9]{2,40}$'),
  check (alias_key <> brand_key)
);
alter table public.brand_aliases enable row level security;
revoke all on public.brand_aliases from public, anon, authenticated;

insert into public.brand_aliases (alias_key, brand_key) values
  ('bottega', 'bottegaveneta'),
  ('hm', 'handm'),
  ('northface', 'thenorthface'),
  ('tnf', 'thenorthface'),
  ('ysl', 'saintlaurent'),
  ('yvessaintlaurent', 'saintlaurent'),
  ('lv', 'louisvuitton'),
  ('ck', 'calvinklein'),
  ('dg', 'dolceandgabbana'),
  ('dandg', 'dolceandgabbana'),
  ('dolcegabbana', 'dolceandgabbana'),
  ('christiandior', 'dior'),
  ('levistrauss', 'levis'),
  ('levistraussco', 'levis'),
  ('levistraussandco', 'levis'),
  ('poloralphlauren', 'ralphlauren'),
  ('dvf', 'dianevonfurstenberg'),
  ('mands', 'marksandspencer'),
  ('marksspencer', 'marksandspencer'),
  ('hugoboss', 'boss'),
  ('ferragamo', 'salvatoreferragamo'),
  ('louboutin', 'christianlouboutin'),
  ('abercrombie', 'abercrombieandfitch'),
  ('abercrombiefitch', 'abercrombieandfitch'),
  ('americaneagleoutfitters', 'americaneagle'),
  ('katespadenewyork', 'katespade'),
  ('michaelmichaelkors', 'michaelkors'),
  ('uggaustralia', 'ugg'),
  ('doctormartens', 'drmartens'),
  ('lululemonathletica', 'lululemon'),
  ('thereformation', 'reformation')
on conflict (alias_key) do nothing;

-- The key a brand string is filed under: its alias target, else its own key. Null when too short.
create or replace function public.resolve_brand_key(p_text text)
returns text
language sql
stable
set search_path = public
as $$
  select case when k is null or char_length(k) < 2 then null
              else coalesce((select a.brand_key from public.brand_aliases a where a.alias_key = k), k) end
    from (select public.brand_key_raw(p_text) as k) s;
$$;
revoke all on function public.resolve_brand_key(text) from public, anon, authenticated;

-- ─── Fibre names (for "by fabric" insight) ──────────────────────────────────

create table if not exists public.material_aliases (
  alias  text primary key check (alias = lower(alias) and char_length(alias) between 2 and 40),
  fibre  text not null check (fibre ~ '^[a-z]{3,20}$')
);
alter table public.material_aliases enable row level security;
revoke all on public.material_aliases from public, anon, authenticated;

-- Keep in step with FIBRES / FIBER_SYNONYMS in src/utils/materialNames.ts (a test compares them).
-- The qualifiers canonical_fibre() strips are only ones that do not change what the material is
-- (organic, recycled, regenerated, virgin, egyptian, supima). 'vegan' and 'faux' are never stripped.
insert into public.material_aliases (alias, fibre) values
  ('cotton','cotton'), ('denim','cotton'), ('canvas','cotton'), ('pima cotton','cotton'),
  ('polyester','polyester'), ('poly','polyester'),
  ('nylon','nylon'), ('polyamide','nylon'),
  ('elastane','elastane'), ('spandex','elastane'), ('lycra','elastane'), ('elastan','elastane'),
  ('wool','wool'), ('merino','wool'), ('merino wool','wool'), ('lambswool','wool'),
  ('viscose','viscose'), ('rayon','viscose'),
  ('linen','linen'), ('flax','linen'),
  ('silk','silk'),
  ('acrylic','acrylic'),
  ('cashmere','cashmere'),
  ('lyocell','lyocell'), ('tencel','lyocell'),
  ('modal','modal'),
  ('cupro','cupro'),
  ('hemp','hemp'),
  ('alpaca','alpaca'), ('mohair','mohair'), ('angora','angora'),
  ('acetate','acetate'), ('polypropylene','polypropylene'),
  ('leather','leather'), ('suede','suede'),
  ('down','down'), ('feathers','feathers'),
  ('rubber','rubber'),
  ('polyurethane','polyurethane'), ('pu','polyurethane'),
  -- Imitation leather is not leather: it files under polyurethane, never under 'leather'.
  ('vegan leather','polyurethane'), ('faux leather','polyurethane'), ('pleather','polyurethane'),
  ('synthetic leather','polyurethane'), ('pu leather','polyurethane'),
  ('metal','metal'),
  ('textile','textile'),
  ('synthetic','synthetic'), ('man made','synthetic'), ('manmade','synthetic')
on conflict (alias) do nothing;

create or replace function public.canonical_fibre(p_name text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select m.fibre from public.material_aliases m
      where m.alias = regexp_replace(lower(btrim(coalesce(p_name, ''))),
                                     '^(organic|recycled|regenerated|virgin|egyptian|supima)\s+', '')),
    'other');
$$;
revoke all on function public.canonical_fibre(text) from public, anon, authenticated;

-- The main shell fibre of a materials list (largest percentage among shell tiers), or null.
-- Tolerates anything in the jsonb column: wrong types, huge arrays, missing keys.
create or replace function public.primary_material_key(p_materials jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  e jsonb;
  tier text;
  pct numeric;
  best_name text;
  best_pct numeric := -1;
  nm text;
begin
  if p_materials is null or jsonb_typeof(p_materials) <> 'array' or jsonb_array_length(p_materials) > 20 then
    return null;
  end if;
  for e in select value from jsonb_array_elements(p_materials) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'name') <> 'string' then
      continue;
    end if;
    tier := coalesce(e ->> 'tier', 'primary');
    if tier not in ('primary', 'secondary', 'upper') then
      continue;
    end if;
    pct := case when (e ->> 'percentage') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (e ->> 'percentage')::numeric else 0 end;
    nm := public.canonical_fibre(e ->> 'name');
    if pct > best_pct then
      best_pct := pct;
      best_name := nm;
    end if;
  end loop;
  return best_name;
end;
$$;
revoke all on function public.primary_material_key(jsonb) from public, anon, authenticated;

-- ─── The ratings themselves (owner-only) ────────────────────────────────────

create table if not exists public.item_ratings (
  item_id          uuid primary key references public.clothing_items(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  overall          smallint not null check (overall between 1 and 5),
  touch            smallint check (touch between 1 and 5),
  touch_tags       text[] not null default '{}',
  comfort          smallint check (comfort between 1 and 5),
  comfort_tags     text[] not null default '{}',
  holds_up         smallint check (holds_up between 1 and 5),
  holds_up_tags    text[] not null default '{}',
  fit              text check (fit in ('runs_small', 'true_to_size', 'runs_large')),
  would_buy_again  text check (would_buy_again in ('yes', 'maybe', 'no')),
  note             text check (note is null or char_length(note) <= 500),       -- only ever read by its author
  contributed      boolean not null default false,
  contributed_at   timestamptz,
  -- Filed under this brand when the rating was saved (server-derived from the item, never from the
  -- client). Aggregation re-checks it against the item's current brand, so a brand edited later
  -- only removes the rating from the old brand's numbers until it is saved again.
  brand_key        text check (brand_key is null or brand_key ~ '^[a-z0-9]{2,40}$'),
  wears_at_rating  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint item_ratings_touch_tags_check check (
    cardinality(touch_tags) <= 4 and touch_tags <@ array['soft','silky','buttery','smooth','crisp','structured','stretchy','thick','lightweight','fuzzy','scratchy','stiff']::text[]),
  constraint item_ratings_comfort_tags_check check (
    cardinality(comfort_tags) <= 4 and comfort_tags <@ array['breathable','warm','cooling','cozy','easy_to_move_in','restrictive','clingy','itchy','sweaty','heavy']::text[]),
  constraint item_ratings_holds_up_tags_check check (
    cardinality(holds_up_tags) <= 4 and holds_up_tags <@ array['washes_well','seams_hold','color_stays','keeps_shape','pills','fades','shrinks','loses_shape','snags','wrinkles_easily']::text[]),
  constraint item_ratings_contributed_check check (not contributed or (brand_key is not null and contributed_at is not null))
);
create index if not exists item_ratings_user_idx on public.item_ratings (user_id);
create index if not exists item_ratings_brand_contrib_idx on public.item_ratings (brand_key) where contributed;

create table if not exists public.brand_ratings (
  user_id          uuid not null references auth.users(id) on delete cascade,
  brand_key        text not null check (brand_key ~ '^[a-z0-9]{2,40}$'),
  brand_label      text not null check (char_length(brand_label) between 1 and 60),  -- the author's own spelling, never returned to anyone else
  overall          smallint not null check (overall between 1 and 5),
  quality          smallint check (quality between 1 and 5),
  fit_consistency  smallint check (fit_consistency between 1 and 5),
  value            smallint check (value between 1 and 5),
  contributed      boolean not null default false,
  contributed_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, brand_key),
  constraint brand_ratings_contributed_check check (not contributed or contributed_at is not null)
);
create index if not exists brand_ratings_brand_contrib_idx on public.brand_ratings (brand_key) where contributed;

-- Computed brand insight, keyed by brand. Holds only thresholded, rounded output (never anything
-- per member) and exists only for brands that have at least one contributed rating.
create table if not exists public.brand_stats (
  brand_key   text primary key check (brand_key ~ '^[a-z0-9]{2,40}$'),
  status      text not null check (status in ('ok', 'insufficient')),
  payload     jsonb not null,
  computed_at timestamptz not null default now(),
  held_until  timestamptz
);

-- Reports about a brand score ("this looks wrong"). Read in the dashboard; no automation.
create table if not exists public.insight_reports (
  user_id    uuid not null references auth.users(id) on delete cascade,
  brand_key  text not null check (brand_key ~ '^[a-z0-9]{2,40}$'),
  reason     text not null check (reason in ('looks_manipulated', 'inaccurate', 'other')),
  created_at timestamptz not null default now(),
  primary key (user_id, brand_key)
);

alter table public.item_ratings enable row level security;
alter table public.brand_ratings enable row level security;
alter table public.brand_stats enable row level security;
alter table public.insight_reports enable row level security;

revoke all on public.item_ratings, public.brand_ratings, public.brand_stats, public.insight_reports
  from public, anon, authenticated;
-- A person may read (not write) their own ratings; every write goes through the functions below.
grant select on public.item_ratings, public.brand_ratings to authenticated;

drop policy if exists "own item ratings" on public.item_ratings;
create policy "own item ratings" on public.item_ratings
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own brand ratings" on public.brand_ratings;
create policy "own brand ratings" on public.brand_ratings
  for select to authenticated
  using (auth.uid() = user_id);

-- ─── Small internal helpers ─────────────────────────────────────────────────

create or replace function public.invalidate_brand_stats(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.brand_stats where brand_key = p_key;
$$;
revoke all on function public.invalidate_brand_stats(text) from public, anon, authenticated;

-- A contributed rating that disappears (deleted by its owner, by cascade from a deleted item, or by
-- cascade from a deleted account) takes the brand's cached numbers with it at once, whatever the
-- cache age and even while the brand is held after a surge: a stored score must never outlive a
-- removal. Fires only for contributed rows. Runs for cascades too, which is why it is a trigger
-- on this feature's two tables and not code inside the delete functions. (The rule against
-- triggers applies to clothing_items only.)
create or replace function public.on_rating_row_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.brand_key is not null then
    delete from public.brand_stats where brand_key = old.brand_key;
  end if;
  return old;
end;
$$;
revoke all on function public.on_rating_row_deleted() from public, anon, authenticated;

create or replace trigger item_ratings_deleted
  after delete on public.item_ratings
  for each row when (old.contributed)
  execute function public.on_rating_row_deleted();

create or replace trigger brand_ratings_deleted
  after delete on public.brand_ratings
  for each row when (old.contributed)
  execute function public.on_rating_row_deleted();

-- Re-files every stored rating under today's alias table. Call it from any migration that adds or
-- changes aliases (ratings keep the key they were saved under, so without this a new alias leaves
-- the brand's earlier contributions under the old spelling, counted by neither).
--   * item ratings take the key of their item's current brand;
--   * brand ratings take the alias target of their stored key, and when that gives one member two
--     ratings of the same brand the newer one is kept;
--   * contributed_at is left alone (nothing about the contribution changed);
--   * cached numbers for every key involved are dropped, held or not.
-- Returns how many rows were re-filed. Internal.
create or replace function public.rebuild_brand_keys()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
  moved integer;
  keys text[] := '{}';
begin
  with s as (
    select i.item_id, public.resolve_brand_key(ci.brand) as nk, i.brand_key as ok
      from public.item_ratings i
      join public.clothing_items ci on ci.id = i.item_id
     where public.resolve_brand_key(ci.brand) is distinct from i.brand_key),
  u as (
    update public.item_ratings t
       set brand_key = s.nk,
           contributed = t.contributed and s.nk is not null,
           contributed_at = case when t.contributed and s.nk is not null then t.contributed_at end
      from s
     where t.item_id = s.item_id
    returning s.ok, s.nk)
  select count(*)::integer,
         coalesce(array_agg(u.ok) filter (where u.ok is not null), '{}') || coalesce(array_agg(u.nk) filter (where u.nk is not null), '{}')
    into moved, keys
    from u;
  n := n + moved;

  for r in
    select b.user_id, b.brand_key as ok, public.resolve_brand_key(b.brand_key) as nk, b.updated_at
      from public.brand_ratings b
     where public.resolve_brand_key(b.brand_key) is not null
       and public.resolve_brand_key(b.brand_key) <> b.brand_key
  loop
    keys := keys || r.ok || r.nk;
    if exists (select 1 from public.brand_ratings x where x.user_id = r.user_id and x.brand_key = r.nk) then
      if r.updated_at > (select x.updated_at from public.brand_ratings x where x.user_id = r.user_id and x.brand_key = r.nk) then
        delete from public.brand_ratings where user_id = r.user_id and brand_key = r.nk;
        update public.brand_ratings set brand_key = r.nk where user_id = r.user_id and brand_key = r.ok;
      else
        delete from public.brand_ratings where user_id = r.user_id and brand_key = r.ok;
      end if;
    else
      update public.brand_ratings set brand_key = r.nk where user_id = r.user_id and brand_key = r.ok;
    end if;
    n := n + 1;
  end loop;

  delete from public.brand_stats where brand_key = any(keys);
  return n;
end;
$$;
revoke all on function public.rebuild_brand_keys() from public, anon, authenticated;

-- Member counts are shown as a range, never exactly.
create or replace function public.count_bucket(p_n integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_n < 10 then 'under_10' when p_n < 25 then '10-24' when p_n < 100 then '25-99' else '100+' end;
$$;
revoke all on function public.count_bucket(integer) from public, anon, authenticated;

-- Three shares (any scale) as whole multiples of 5 that add up to exactly 100.
create or replace function public.round_shares_5(p_a numeric, p_b numeric, p_c numeric)
returns integer[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v numeric[] := array[coalesce(p_a, 0), coalesce(p_b, 0), coalesce(p_c, 0)];
  units integer[] := array[0, 0, 0];
  rem numeric[] := array[0, 0, 0];
  total numeric := coalesce(p_a, 0) + coalesce(p_b, 0) + coalesce(p_c, 0);
  spare integer;
  best integer;
  i integer;
begin
  if total <= 0 then
    return null;
  end if;
  for i in 1..3 loop
    v[i] := v[i] / total * 20;
    units[i] := floor(v[i]);
    rem[i] := v[i] - units[i];
  end loop;
  spare := 20 - (units[1] + units[2] + units[3]);
  while spare > 0 loop
    best := 1;
    for i in 2..3 loop
      if rem[i] > rem[best] then best := i; end if;
    end loop;
    units[best] := units[best] + 1;
    rem[best] := -1;
    spare := spare - 1;
  end loop;
  return array[units[1] * 5, units[2] * 5, units[3] * 5];
end;
$$;
revoke all on function public.round_shares_5(numeric, numeric, numeric) from public, anon, authenticated;

-- ─── Saving and removing a rating ───────────────────────────────────────────

-- Saves (or replaces) the caller's rating of one of their own, non-wishlist items.
-- The brand, wear count and everything else about the item is read here, never taken from the client.
--
-- A rating is always saved. Asking to contribute never makes the save fail: when contributing is not
-- possible (no agreement in force, no brand, not worn yet) the rating is saved privately and
-- contribution_blocked says why ('no_consent', 'no_brand' or 'not_worn').
--   p_contribute  true: contribute if allowed; false: stop contributing; null: keep what is stored
--                 (private for a first save).
--   p_only_if_new true: do nothing when a rating already exists and return the stored one. Used by
--                 the one-tap star so a stale screen can never overwrite a fuller rating.
-- Every other field replaces the stored one, so a full edit sends everything it has.
create or replace function public.save_item_rating(
  p_item_id         uuid,
  p_overall         integer,
  p_touch           integer default null,
  p_touch_tags      text[] default '{}',
  p_comfort         integer default null,
  p_comfort_tags    text[] default '{}',
  p_holds_up        integer default null,
  p_holds_up_tags   text[] default '{}',
  p_fit             text default null,
  p_would_buy_again text default null,
  p_note            text default null,
  p_contribute      boolean default null,
  p_only_if_new     boolean default false
)
returns table (contributed boolean, contribution_blocked text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.rating_settings%rowtype;
  v_brand text;
  v_wears integer;
  v_key text;
  v_prev public.item_ratings%rowtype;
  v_had boolean;
  v_contrib boolean := false;
  v_blocked text;
  v_note text;
  v_young boolean;
  v_touch_tags text[] := coalesce(p_touch_tags, '{}');
  v_comfort_tags text[] := coalesce(p_comfort_tags, '{}');
  v_holds_tags text[] := coalesce(p_holds_up_tags, '{}');
  v_holds integer := p_holds_up;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into cfg from public.rating_settings where id;

  select ci.brand, coalesce(ci.wear_count, 0) into v_brand, v_wears
    from public.clothing_items ci
   where ci.id = p_item_id and ci.user_id = uid and not coalesce(ci.is_wishlist, false);
  if not found then
    raise exception 'item_not_found' using errcode = '22023';
  end if;

  if p_overall is null or p_overall not between 1 and 5
     or (p_touch is not null and p_touch not between 1 and 5)
     or (p_comfort is not null and p_comfort not between 1 and 5)
     or (p_holds_up is not null and p_holds_up not between 1 and 5)
     or (p_fit is not null and p_fit not in ('runs_small', 'true_to_size', 'runs_large'))
     or (p_would_buy_again is not null and p_would_buy_again not in ('yes', 'maybe', 'no'))
     or cardinality(v_touch_tags) > 4 or cardinality(v_comfort_tags) > 4 or cardinality(v_holds_tags) > 4
     or not (v_touch_tags <@ array['soft','silky','buttery','smooth','crisp','structured','stretchy','thick','lightweight','fuzzy','scratchy','stiff']::text[])
     or not (v_comfort_tags <@ array['breathable','warm','cooling','cozy','easy_to_move_in','restrictive','clingy','itchy','sweaty','heavy']::text[])
     or not (v_holds_tags <@ array['washes_well','seams_hold','color_stays','keeps_shape','pills','fades','shrinks','loses_shape','snags','wrinkles_easily']::text[])
  then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  select * into v_prev from public.item_ratings r where r.item_id = p_item_id and r.user_id = uid;
  v_had := found;
  if v_had and coalesce(p_only_if_new, false) then
    return query select v_prev.contributed, null::text, v_prev.updated_at;
    return;
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 500);
  end if;

  -- How it holds up only means something after some wear; the app never offers it sooner.
  if v_wears < 3 then
    v_holds := null;
    v_holds_tags := '{}';
  end if;

  if not public.hit_quota(uid, 'rating_write', cfg.write_limit_per_day) then
    raise exception 'rating_rate_limited' using errcode = '54000';
  end if;

  v_key := public.resolve_brand_key(v_brand);

  if p_contribute is null then
    -- keep what is stored (a rating that was not contributing stays private)
    v_contrib := v_had and v_prev.contributed and v_key is not null;
    if v_had and v_prev.contributed and not v_contrib then
      v_blocked := 'no_brand';
    end if;
  elsif p_contribute then
    if not public.consent_in_force(uid, 'share_ratings') then
      v_blocked := 'no_consent';
    elsif v_key is null then
      v_blocked := 'no_brand';
    elsif v_wears < 1 then
      v_blocked := 'not_worn';
    else
      v_contrib := true;
    end if;
  end if;

  if v_contrib then
    select u.created_at > now() - make_interval(days => cfg.old_account_days) into v_young from auth.users u where u.id = uid;
    if coalesce(v_young, true) and not public.hit_quota(uid, 'rating_contribute_young', 5) then
      raise exception 'rating_rate_limited' using errcode = '54000';
    end if;
  end if;

  insert into public.item_ratings as r (
    item_id, user_id, overall, touch, touch_tags, comfort, comfort_tags, holds_up, holds_up_tags,
    fit, would_buy_again, note, contributed, contributed_at, brand_key, wears_at_rating)
  values (
    p_item_id, uid, p_overall, p_touch, v_touch_tags, p_comfort, v_comfort_tags, v_holds, v_holds_tags,
    p_fit, p_would_buy_again, v_note, v_contrib, case when v_contrib then now() end, v_key, v_wears)
  on conflict (item_id) do update set
    overall = excluded.overall, touch = excluded.touch, touch_tags = excluded.touch_tags,
    comfort = excluded.comfort, comfort_tags = excluded.comfort_tags,
    holds_up = excluded.holds_up, holds_up_tags = excluded.holds_up_tags,
    fit = excluded.fit, would_buy_again = excluded.would_buy_again, note = excluded.note,
    contributed = excluded.contributed, contributed_at = excluded.contributed_at,
    brand_key = excluded.brand_key, wears_at_rating = excluded.wears_at_rating,
    updated_at = now();

  -- Anything that stops counting for a brand takes effect at once; new numbers appear after the settle time.
  if v_had and v_prev.contributed and v_prev.brand_key is not null
     and (not v_contrib or v_prev.brand_key is distinct from v_key) then
    perform public.invalidate_brand_stats(v_prev.brand_key);
  end if;

  return query select v_contrib, v_blocked, now();
end;
$$;
revoke all on function public.save_item_rating(uuid, integer, integer, text[], integer, text[], integer, text[], text, text, text, boolean, boolean) from public, anon;
grant execute on function public.save_item_rating(uuid, integer, integer, text[], integer, text[], integer, text[], text, text, text, boolean, boolean) to authenticated;

-- The caller's rating of an item as one json object (null when none). Re-files the rating under the
-- item's current brand first, so editing an item's brand does not leave a stale filing behind.
create or replace function public.get_my_item_rating(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.item_ratings%rowtype;
  v_brand text;
  v_key text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into r from public.item_ratings where item_id = p_item_id and user_id = uid;
  if not found then
    return null;
  end if;
  select ci.brand into v_brand from public.clothing_items ci where ci.id = p_item_id and ci.user_id = uid;
  v_key := public.resolve_brand_key(v_brand);
  if v_key is distinct from r.brand_key then
    -- The re-file only touches the caller's own row, so it is never refused; wiping the old brand's
    -- numbers is what costs a recompute, so that part is paid for from the daily write bucket.
    if r.contributed and r.brand_key is not null
       and public.hit_quota(uid, 'rating_write', (select s.write_limit_per_day from public.rating_settings s where s.id)) then
      perform public.invalidate_brand_stats(r.brand_key);
    end if;
    update public.item_ratings
       set brand_key = v_key,
           contributed = contributed and v_key is not null,
           contributed_at = case when contributed and v_key is not null then now() end
     where item_id = p_item_id;
    select * into r from public.item_ratings where item_id = p_item_id;
  end if;
  return to_jsonb(r) - 'user_id';
end;
$$;
revoke all on function public.get_my_item_rating(uuid) from public, anon;
grant execute on function public.get_my_item_rating(uuid) to authenticated;

-- (The brand's cached numbers go with a contributed rating: see on_rating_row_deleted.)
create or replace function public.delete_item_rating(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.item_ratings where item_id = p_item_id and user_id = uid;
end;
$$;
revoke all on function public.delete_item_rating(uuid) from public, anon;
grant execute on function public.delete_item_rating(uuid) to authenticated;

-- Rates a brand directly. Needs an owned (non-wishlist) item of that brand, unless the caller is
-- editing a rating they already made. Like save_item_rating, it always saves: asking to contribute
-- never fails the call, it saves privately and says why in contribution_blocked ('no_consent', or
-- 'not_worn' when the caller owns nothing of the brand that they have worn). p_contribute: true asks,
-- false stops, null keeps what is stored (private for a first save).
create or replace function public.save_brand_rating(
  p_brand           text,
  p_overall         integer,
  p_quality         integer default null,
  p_fit_consistency integer default null,
  p_value           integer default null,
  p_contribute      boolean default null
)
returns table (contributed boolean, contribution_blocked text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.rating_settings%rowtype;
  v_key text := public.resolve_brand_key(p_brand);
  v_label text := left(btrim(coalesce(p_brand, '')), 60);
  v_prev public.brand_ratings%rowtype;
  v_had boolean;
  v_contrib boolean := false;
  v_blocked text;
  v_young boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into cfg from public.rating_settings where id;
  if v_key is null or v_label = '' then
    raise exception 'invalid_brand' using errcode = '22023';
  end if;
  if p_overall is null or p_overall not between 1 and 5
     or (p_quality is not null and p_quality not between 1 and 5)
     or (p_fit_consistency is not null and p_fit_consistency not between 1 and 5)
     or (p_value is not null and p_value not between 1 and 5) then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  select * into v_prev from public.brand_ratings b where b.user_id = uid and b.brand_key = v_key;
  v_had := found;
  if not v_had and not exists (
       select 1 from public.clothing_items ci
        where ci.user_id = uid and not coalesce(ci.is_wishlist, false)
          and public.resolve_brand_key(ci.brand) = v_key) then
    raise exception 'not_a_brand_owner' using errcode = '42501';
  end if;

  if not public.hit_quota(uid, 'rating_write', cfg.write_limit_per_day) then
    raise exception 'rating_rate_limited' using errcode = '54000';
  end if;

  if p_contribute is null then
    v_contrib := v_had and v_prev.contributed;
  elsif p_contribute then
    if not public.consent_in_force(uid, 'share_ratings') then
      v_blocked := 'no_consent';
    elsif not exists (
         select 1 from public.clothing_items ci
          where ci.user_id = uid and not coalesce(ci.is_wishlist, false)
            and coalesce(ci.wear_count, 0) >= 1
            and public.resolve_brand_key(ci.brand) = v_key) then
      v_blocked := 'not_worn';
    else
      v_contrib := true;
    end if;
  end if;

  if v_contrib then
    select u.created_at > now() - make_interval(days => cfg.old_account_days) into v_young from auth.users u where u.id = uid;
    if coalesce(v_young, true) and not public.hit_quota(uid, 'rating_contribute_young', 5) then
      raise exception 'rating_rate_limited' using errcode = '54000';
    end if;
  end if;

  insert into public.brand_ratings as b (user_id, brand_key, brand_label, overall, quality, fit_consistency, value, contributed, contributed_at)
  values (uid, v_key, v_label, p_overall, p_quality, p_fit_consistency, p_value, v_contrib, case when v_contrib then now() end)
  on conflict (user_id, brand_key) do update set
    brand_label = excluded.brand_label, overall = excluded.overall, quality = excluded.quality,
    fit_consistency = excluded.fit_consistency, value = excluded.value,
    contributed = excluded.contributed, contributed_at = excluded.contributed_at, updated_at = now();

  if v_had and v_prev.contributed and not v_contrib then
    perform public.invalidate_brand_stats(v_key);
  end if;
  return query select v_contrib, v_blocked;
end;
$$;
revoke all on function public.save_brand_rating(text, integer, integer, integer, integer, boolean) from public, anon;
grant execute on function public.save_brand_rating(text, integer, integer, integer, integer, boolean) to authenticated;

create or replace function public.delete_brand_rating(p_brand text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_key text := public.resolve_brand_key(p_brand);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_key is null then
    return;
  end if;
  delete from public.brand_ratings where user_id = uid and brand_key = v_key;
end;
$$;
revoke all on function public.delete_brand_rating(text) from public, anon;
grant execute on function public.delete_brand_rating(text) to authenticated;

-- Stops every contribution of the caller at once (their ratings stay, privately).
create or replace function public.withdraw_contributions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.brand_stats where brand_key in (
    select r.brand_key from public.item_ratings r where r.user_id = uid and r.contributed and r.brand_key is not null
    union
    select b.brand_key from public.brand_ratings b where b.user_id = uid and b.contributed);
  update public.item_ratings set contributed = false, contributed_at = null where user_id = uid and contributed;
  update public.brand_ratings set contributed = false, contributed_at = null where user_id = uid and contributed;
end;
$$;
revoke all on function public.withdraw_contributions() from public, anon;
grant execute on function public.withdraw_contributions() to authenticated;

-- Deletes every rating the caller made (and stops contributing). Their answer to the consent question is kept.
create or replace function public.delete_all_my_ratings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.withdraw_contributions();
  delete from public.item_ratings where user_id = uid;
  delete from public.brand_ratings where user_id = uid;
end;
$$;
revoke all on function public.delete_all_my_ratings() from public, anon;
grant execute on function public.delete_all_my_ratings() to authenticated;

-- What turning contribution on or off does to the caller's ratings (called by set_consent()).
create or replace function public.on_consent_changed_share_ratings(p_user uuid, p_granted boolean, p_include_existing boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not p_granted then
    delete from public.brand_stats where brand_key in (
      select r.brand_key from public.item_ratings r where r.user_id = p_user and r.contributed and r.brand_key is not null
      union
      select b.brand_key from public.brand_ratings b where b.user_id = p_user and b.contributed);
    update public.item_ratings set contributed = false, contributed_at = null where user_id = p_user and contributed;
    update public.brand_ratings set contributed = false, contributed_at = null where user_id = p_user and contributed;
  elsif p_include_existing then
    update public.item_ratings r
       set contributed = true, contributed_at = now()
      from public.clothing_items ci
     where r.user_id = p_user and not r.contributed and r.brand_key is not null
       and ci.id = r.item_id and ci.user_id = p_user
       and not coalesce(ci.is_wishlist, false) and coalesce(ci.wear_count, 0) >= 1
       and public.resolve_brand_key(ci.brand) = r.brand_key;
    update public.brand_ratings b
       set contributed = true, contributed_at = now()
     where b.user_id = p_user and not b.contributed
       and exists (select 1 from public.clothing_items ci
                    where ci.user_id = p_user and not coalesce(ci.is_wishlist, false)
                      and coalesce(ci.wear_count, 0) >= 1
                      and public.resolve_brand_key(ci.brand) = b.brand_key);
  end if;
end;
$$;
revoke all on function public.on_consent_changed_share_ratings(uuid, boolean, boolean) from public, anon, authenticated;

-- The caller's own picture of one brand: how many pieces they rated, their average, their brand
-- rating, and whether they may rate the brand. Only their own rows are read.
create or replace function public.get_my_brand_summary(p_brand text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_key text := public.resolve_brand_key(p_brand);
  v_rated integer;
  v_avg numeric;
  v_brand jsonb;
  v_owns boolean;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_key is null then
    return jsonb_build_object('items_rated', 0, 'avg_overall', null, 'brand_rating', null, 'can_rate_brand', false);
  end if;
  select count(*), round(avg(r.overall), 1) into v_rated, v_avg
    from public.item_ratings r
    join public.clothing_items ci on ci.id = r.item_id and ci.user_id = uid
   where r.user_id = uid and public.resolve_brand_key(ci.brand) = v_key;
  select to_jsonb(b) - 'user_id' - 'brand_key' into v_brand
    from public.brand_ratings b where b.user_id = uid and b.brand_key = v_key;
  select exists (
    select 1 from public.clothing_items ci
     where ci.user_id = uid and not coalesce(ci.is_wishlist, false) and public.resolve_brand_key(ci.brand) = v_key
  ) into v_owns;
  return jsonb_build_object(
    'items_rated', v_rated,
    'avg_overall', v_avg,
    'brand_rating', v_brand,
    'can_rate_brand', v_owns or v_brand is not null);
end;
$$;
revoke all on function public.get_my_brand_summary(text) from public, anon;
grant execute on function public.get_my_brand_summary(text) to authenticated;

-- ─── Who counts (evaluated every time the numbers are computed) ──────────────

-- Members whose contributed ratings of this brand may count right now: permission in force (granted
-- and, where the purpose requires it, given against the current text), account old enough with a
-- confirmed email, enough real items, not excluded, not rating everything (nearly) the same, and the
-- contribution has settled.
create or replace function public.rating_voters(p_key text)
returns table (user_id uuid, is_old boolean)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (select * from public.rating_settings where id),
  cand as (
    select r.user_id from public.item_ratings r, cfg
     where r.contributed and r.brand_key = p_key
       and r.contributed_at <= now() - make_interval(hours => cfg.settle_hours)
    union
    select b.user_id from public.brand_ratings b, cfg
     where b.contributed and b.brand_key = p_key
       and b.contributed_at <= now() - make_interval(hours => cfg.settle_hours)
  )
  select u.id, (u.created_at <= now() - make_interval(days => cfg.old_account_days))
    from cand
    join auth.users u on u.id = cand.user_id
    cross join cfg
   where public.consent_in_force(u.id, 'share_ratings')
     and u.created_at <= now() - make_interval(days => cfg.min_account_days)
     and u.email_confirmed_at is not null
     and not exists (select 1 from public.rating_suppressions x where x.user_id = u.id)
     and (select count(*) from public.clothing_items ci
           where ci.user_id = u.id and not coalesce(ci.is_wishlist, false)) >= cfg.min_owned_items
     and not exists (
       select 1 from public.item_ratings r2
        where r2.user_id = u.id and r2.contributed
        group by r2.user_id
       having count(*) >= cfg.straight_min_ratings
          and coalesce(stddev_samp(r2.overall), 0) < cfg.straight_max_sd);
$$;
revoke all on function public.rating_voters(text) from public, anon, authenticated;

create or replace function public.rating_item_rows(p_key text)
returns table (
  user_id uuid, is_old boolean, overall smallint, touch smallint, comfort smallint, holds_up smallint,
  wears_at_rating integer, fit text, would_buy_again text,
  touch_tags text[], comfort_tags text[], holds_up_tags text[],
  category text, material_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id, v.is_old, r.overall, r.touch, r.comfort, r.holds_up, r.wears_at_rating, r.fit, r.would_buy_again,
         r.touch_tags, r.comfort_tags, r.holds_up_tags,
         ci.category::text,
         -- A fabric slice only counts compositions read off a tag (tag_text is only ever set by a tag scan).
         case when ci.tag_text is not null then public.primary_material_key(ci.materials) end
    from public.item_ratings r
    join public.rating_voters(p_key) v on v.user_id = r.user_id
    join public.clothing_items ci on ci.id = r.item_id and ci.user_id = r.user_id
    cross join (select * from public.rating_settings where id) cfg
   where r.contributed and r.brand_key = p_key
     and r.contributed_at <= now() - make_interval(hours => cfg.settle_hours)
     and not coalesce(ci.is_wishlist, false)
     and coalesce(ci.wear_count, 0) >= 1
     and public.resolve_brand_key(ci.brand) = p_key;      -- still the item's brand today
$$;
revoke all on function public.rating_item_rows(text) from public, anon, authenticated;

create or replace function public.rating_brand_rows(p_key text)
returns table (user_id uuid, is_old boolean, overall smallint, quality smallint, fit_consistency smallint, value smallint)
language sql
stable
security definer
set search_path = public
as $$
  select b.user_id, v.is_old, b.overall, b.quality, b.fit_consistency, b.value
    from public.brand_ratings b
    join public.rating_voters(p_key) v on v.user_id = b.user_id
    cross join (select * from public.rating_settings where id) cfg
   where b.brand_key = p_key and b.contributed
     and b.contributed_at <= now() - make_interval(hours => cfg.settle_hours)
     and exists (select 1 from public.clothing_items ci          -- still owns and has worn something of the brand
                  where ci.user_id = b.user_id and not coalesce(ci.is_wishlist, false)
                    and coalesce(ci.wear_count, 0) >= 1
                    and public.resolve_brand_key(ci.brand) = p_key);
$$;
revoke all on function public.rating_brand_rows(text) from public, anon, authenticated;

-- ─── Computing the numbers for one brand ────────────────────────────────────

create or replace function public.compute_brand_stats(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.rating_settings%rowtype;
  v_n_all integer; v_n_old integer; v_n_items integer;
  v_recent_total integer; v_recent_young integer;
  v_prev public.brand_stats%rowtype;
  v_status text;
  payload jsonb;
  shares integer[];
  s jsonb;
begin
  select * into cfg from public.rating_settings where id;

  with
  ir as (select * from public.rating_item_rows(p_key)),
  br as (select * from public.rating_brand_rows(p_key)),
  iu as (
    select user_id,
           avg(overall)::numeric as o,
           avg(touch)::numeric as feel,
           avg(comfort)::numeric as comfort,
           (avg(holds_up) filter (where wears_at_rating >= 3))::numeric as holds_up,
           (count(*) filter (where fit = 'runs_small'))::numeric / nullif(count(fit), 0) as f_small,
           (count(*) filter (where fit = 'true_to_size'))::numeric / nullif(count(fit), 0) as f_true,
           (count(*) filter (where fit = 'runs_large'))::numeric / nullif(count(fit), 0) as f_large,
           (count(*) filter (where would_buy_again = 'yes'))::numeric / nullif(count(would_buy_again), 0) as rebuy
      from ir group by user_id),
  uv as (
    select u.user_id, u.is_old,
           case when u.is_old then 1::numeric else cfg.young_weight end as w,
           case when iu.o is not null and br.overall is not null then (iu.o + br.overall) / 2.0
                else coalesce(iu.o, br.overall::numeric) end as overall,
           iu.feel, iu.comfort, iu.holds_up, iu.f_small, iu.f_true, iu.f_large, iu.rebuy,
           br.quality::numeric as quality, br.fit_consistency::numeric as fit_consistency, br.value::numeric as value,
           (iu.user_id is not null) as has_items
      from (select user_id, is_old from ir union select user_id, is_old from br) u
      left join iu on iu.user_id = u.user_id
      left join br on br.user_id = u.user_id),
  tot as (
    select count(*)::integer as n_all,
           (count(*) filter (where is_old))::integer as n_old,
           (count(*) filter (where has_items))::integer as n_items
      from uv),
  ranked as (
    select uv.*, row_number() over (order by overall, user_id) as rn, count(*) over () as cnt from uv),
  trimmed as (
    select * from ranked
     where cfg.trim_from > cnt
        or (rn > floor(0.05 * cnt) and rn <= cnt - floor(0.05 * cnt))),
  head as (
    select (sum(w * overall) + cfg.prior_weight * cfg.prior_mean) / (sum(w) + cfg.prior_weight) as score
      from trimmed),
  dims as (
    select
      count(feel) as n_feel, sum(w * feel) / nullif(sum(w) filter (where feel is not null), 0) as feel,
      count(comfort) as n_comfort, sum(w * comfort) / nullif(sum(w) filter (where comfort is not null), 0) as comfort,
      count(holds_up) as n_holds, sum(w * holds_up) / nullif(sum(w) filter (where holds_up is not null), 0) as holds_up,
      count(quality) as n_quality, sum(w * quality) / nullif(sum(w) filter (where quality is not null), 0) as quality,
      count(fit_consistency) as n_fitc, sum(w * fit_consistency) / nullif(sum(w) filter (where fit_consistency is not null), 0) as fit_consistency,
      count(value) as n_value, sum(w * value) / nullif(sum(w) filter (where value is not null), 0) as value,
      count(f_small) as n_fit,
      sum(w * f_small) / nullif(sum(w) filter (where f_small is not null), 0) as f_small,
      sum(w * f_true) / nullif(sum(w) filter (where f_true is not null), 0) as f_true,
      sum(w * f_large) / nullif(sum(w) filter (where f_large is not null), 0) as f_large,
      count(rebuy) as n_rebuy, sum(w * rebuy) / nullif(sum(w) filter (where rebuy is not null), 0) as rebuy
      from uv),
  tag_rows as (
    select 'touch'::text as grp, t as tag, ir.user_id from ir, unnest(ir.touch_tags) t
    union all select 'comfort', t, ir.user_id from ir, unnest(ir.comfort_tags) t
    union all select 'holds_up', t, ir.user_id from ir, unnest(ir.holds_up_tags) t),
  tag_counts as (
    select grp, tag, count(distinct user_id) as c from tag_rows group by grp, tag),
  traits as (
    select grp, tag, (round(c::numeric / nullif((select n_items from tot), 0) * 100 / 5) * 5)::integer as pct, c
      from tag_counts
     where c >= cfg.k_chip and (select n_items from tot) >= cfg.k_slice
     order by c desc, tag
     limit 4),
  sl_rows as (
    select 'category'::text as kind, category as key, user_id, overall, touch, holds_up, wears_at_rating
      from ir where category is not null
    union all
    select 'material', material_key, user_id, overall, touch, holds_up, wears_at_rating
      from ir where material_key is not null and material_key <> 'other'),
  sl_user as (
    select kind, key, user_id, avg(overall)::numeric as o, avg(touch)::numeric as feel,
           (avg(holds_up) filter (where wears_at_rating >= 3))::numeric as hu
      from sl_rows group by kind, key, user_id),
  sl as (
    select s.kind, s.key, count(*)::integer as n,
           (sum(uv.w * s.o) + cfg.prior_weight * cfg.prior_mean) / (sum(uv.w) + cfg.prior_weight) as overall,
           count(s.feel)::integer as n_feel, sum(uv.w * s.feel) / nullif(sum(uv.w) filter (where s.feel is not null), 0) as feel,
           count(s.hu)::integer as n_hu, sum(uv.w * s.hu) / nullif(sum(uv.w) filter (where s.hu is not null), 0) as hu
      from sl_user s join uv on uv.user_id = s.user_id
     group by s.kind, s.key),
  sl_ok as (
    select *, row_number() over (partition by kind order by n desc, key) as rk
      from sl
     where n >= cfg.k_slice
       and ((select n_items from tot) - n = 0 or (select n_items from tot) - n >= cfg.k_brand)),
  recent as (
    select count(*)::integer as total, (count(*) filter (where not v.is_old))::integer as young
      from public.rating_voters(p_key) v
     where exists (select 1 from public.item_ratings r where r.user_id = v.user_id and r.brand_key = p_key and r.contributed
                      and r.contributed_at > now() - interval '72 hours')
        or exists (select 1 from public.brand_ratings b where b.user_id = v.user_id and b.brand_key = p_key and b.contributed
                      and b.contributed_at > now() - interval '72 hours'))
  select
    tot.n_all, tot.n_old, tot.n_items, recent.total, recent.young,
    jsonb_build_object(
      'score', round(head.score, 1),
      'n_bucket', public.count_bucket(tot.n_all),
      'dims', to_jsonb(dims),
      'traits', coalesce((select jsonb_agg(jsonb_build_object('group', grp, 'tag', tag, 'pct', pct) order by c desc, tag) from traits), '[]'::jsonb),
      'slices', coalesce((select jsonb_agg(jsonb_build_object(
          'kind', kind, 'key', key, 'n_bucket', public.count_bucket(n), 'overall', round(overall, 1),
          'feel', case when n_feel >= cfg.k_slice then round(feel, 1) end,
          'holds_up', case when n_hu >= cfg.k_slice then round(hu, 1) end) order by kind, rk) from sl_ok where rk <= 6), '[]'::jsonb))
  into v_n_all, v_n_old, v_n_items, v_recent_total, v_recent_young, s
  from tot, head, dims, recent;

  -- Not enough different, established members: say nothing numeric. At least k_brand members must be
  -- older than old_account_days (young accounts add weight 0.5 on top, they never make up the number).
  if coalesce(v_n_all, 0) < cfg.k_brand or coalesce(v_n_old, 0) < greatest(cfg.min_old_voters, cfg.k_brand) or s is null then
    payload := jsonb_build_object('status', 'insufficient');
    v_status := 'insufficient';
  else
    declare
      d jsonb := s -> 'dims';
      item jsonb := '{}'::jsonb;
      brand jsonb := '{}'::jsonb;
      fit_ok boolean := coalesce((d ->> 'n_fit')::integer, 0) >= cfg.k_slice;
    begin
      if public.count_bucket(v_n_all) = 'under_10' then
        -- Fewer than 10 members (only possible when k_brand has been lowered below 10): a one-point
        -- change by one member must not be readable, so only a headline in half-point steps is
        -- published, with no dimension, trait or slice.
        payload := jsonb_build_object('status', 'ok', 'n_bucket', s ->> 'n_bucket',
                                      'score', round((s ->> 'score')::numeric * 2) / 2);
        v_status := 'ok';
      else
        if coalesce((d ->> 'n_feel')::integer, 0) >= cfg.k_brand then item := item || jsonb_build_object('feel', round((d ->> 'feel')::numeric, 1)); end if;
        if coalesce((d ->> 'n_comfort')::integer, 0) >= cfg.k_brand then item := item || jsonb_build_object('comfort', round((d ->> 'comfort')::numeric, 1)); end if;
        if coalesce((d ->> 'n_holds')::integer, 0) >= cfg.k_brand then item := item || jsonb_build_object('holds_up', round((d ->> 'holds_up')::numeric, 1)); end if;
        if coalesce((d ->> 'n_rebuy')::integer, 0) >= cfg.k_slice then
          item := item || jsonb_build_object('would_buy_again_pct', (round((d ->> 'rebuy')::numeric * 100 / 5) * 5)::integer);
        end if;
        if fit_ok then
          shares := public.round_shares_5((d ->> 'f_small')::numeric, (d ->> 'f_true')::numeric, (d ->> 'f_large')::numeric);
          if shares is not null then
            item := item || jsonb_build_object('fit', jsonb_build_object('runs_small', shares[1], 'true_to_size', shares[2], 'runs_large', shares[3]));
          end if;
        end if;
        if coalesce((d ->> 'n_quality')::integer, 0) >= cfg.k_brand then brand := brand || jsonb_build_object('quality', round((d ->> 'quality')::numeric, 1)); end if;
        if coalesce((d ->> 'n_fitc')::integer, 0) >= cfg.k_brand then brand := brand || jsonb_build_object('fit_consistency', round((d ->> 'fit_consistency')::numeric, 1)); end if;
        if coalesce((d ->> 'n_value')::integer, 0) >= cfg.k_brand then brand := brand || jsonb_build_object('value', round((d ->> 'value')::numeric, 1)); end if;
        payload := jsonb_strip_nulls(jsonb_build_object(
          'status', 'ok', 'n_bucket', s ->> 'n_bucket', 'score', (s ->> 'score')::numeric,
          'item', item, 'brand', brand, 'traits', s -> 'traits', 'slices', s -> 'slices'));
        v_status := 'ok';
      end if;
    end;
  end if;

  -- A sudden wave of new accounts: keep serving what was there before until it has been looked at.
  select * into v_prev from public.brand_stats where brand_key = p_key;
  if coalesce(v_recent_young, 0) >= cfg.burst_min and coalesce(v_recent_young, 0) * 10 > coalesce(v_recent_total, 0) * 4 then
    if found then
      update public.brand_stats set held_until = now() + make_interval(days => cfg.hold_days) where brand_key = p_key;
      return v_prev.payload;
    end if;
    insert into public.brand_stats (brand_key, status, payload, computed_at, held_until)
    values (p_key, 'insufficient', jsonb_build_object('status', 'insufficient'), now(), now() + make_interval(days => cfg.hold_days))
    on conflict (brand_key) do nothing;
    return jsonb_build_object('status', 'insufficient');
  end if;

  insert into public.brand_stats (brand_key, status, payload, computed_at, held_until)
  values (p_key, v_status, payload, now(), null)
  on conflict (brand_key) do update
    set status = excluded.status, payload = excluded.payload, computed_at = excluded.computed_at, held_until = null;
  return payload;
end;
$$;
revoke all on function public.compute_brand_stats(text) from public, anon, authenticated;

-- ─── The only way another member's numbers reach a client ───────────────────

create or replace function public.get_brand_insight(p_brand text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.rating_settings%rowtype;
  v_key text;
  v_row public.brand_stats%rowtype;
  v_payload jsonb;
  v_as_of timestamptz := now();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into cfg from public.rating_settings where id;
  if not cfg.insights_enabled then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if not public.hit_quota(uid, 'insight_read', cfg.read_limit_per_day) then
    raise exception 'rating_rate_limited' using errcode = '54000';
  end if;

  v_key := public.resolve_brand_key(p_brand);
  -- Unknown brands and brands nobody has contributed to look exactly like brands below the
  -- threshold, and cost nothing to look up (no row is written for them).
  if v_key is null
     or not (exists (select 1 from public.item_ratings r where r.brand_key = v_key and r.contributed)
          or exists (select 1 from public.brand_ratings b where b.brand_key = v_key and b.contributed)) then
    return jsonb_build_object('status', 'insufficient');
  end if;

  select * into v_row from public.brand_stats where brand_key = v_key;
  if found and (coalesce(v_row.held_until, '-infinity') > now()
                or v_row.computed_at > now() - make_interval(hours => cfg.cache_ttl_hours)) then
    v_payload := v_row.payload;
    v_as_of := v_row.computed_at;
  else
    -- One reader computes; the others wait for it and use its row. (Giving a waiting reader an
    -- empty answer would be wrong: the client remembers "not enough ratings" for hours.)
    perform pg_advisory_xact_lock(hashtextextended('brand_stats:' || v_key, 0));
    select * into v_row from public.brand_stats where brand_key = v_key;
    if found and (coalesce(v_row.held_until, '-infinity') > now()
                  or v_row.computed_at > now() - make_interval(hours => cfg.cache_ttl_hours)) then
      v_payload := v_row.payload;
      v_as_of := v_row.computed_at;
    else
      v_payload := public.compute_brand_stats(v_key);
    end if;
  end if;

  if v_payload ->> 'status' = 'ok' then
    v_payload := v_payload || jsonb_build_object('as_of', to_char(v_as_of at time zone 'utc', 'YYYY-MM-DD'));
  end if;
  return v_payload;
end;
$$;
revoke all on function public.get_brand_insight(text) from public, anon;
grant execute on function public.get_brand_insight(text) to authenticated;

create or replace function public.report_brand_insight(p_brand text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_key text := public.resolve_brand_key(p_brand);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_key is null or p_reason is null or p_reason not in ('looks_manipulated', 'inaccurate', 'other') then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  if not public.hit_quota(uid, 'insight_report', 10) then
    raise exception 'rating_rate_limited' using errcode = '54000';
  end if;
  insert into public.insight_reports (user_id, brand_key, reason)
  values (uid, v_key, p_reason)
  on conflict (user_id, brand_key) do update set reason = excluded.reason, created_at = now();
end;
$$;
revoke all on function public.report_brand_insight(text, text) from public, anon;
grant execute on function public.report_brand_insight(text, text) to authenticated;
