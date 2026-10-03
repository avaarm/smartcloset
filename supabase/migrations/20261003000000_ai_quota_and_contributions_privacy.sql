-- 1. Per-user daily quota for the ai-proxy edge function (cost-abuse protection).
--    The in-memory per-minute limiter in the function resets on cold start and
--    is per-instance; signups are open, so a persistent per-user daily cap is
--    the real guard on the OpenAI / Vision / Brave bills.

create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default ((now() at time zone 'utc')::date),
  provider text not null,
  count    integer not null default 0,
  primary key (user_id, day, provider)
);
alter table public.ai_usage enable row level security;   -- no policies: only the function below touches it
revoke all on public.ai_usage from anon, authenticated;

-- Counts one call for the signed-in user and reports whether it is within the
-- caller-supplied limit. A user can only ever affect their own counter.
create or replace function public.ai_usage_check(p_provider text, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c integer;
begin
  if uid is null then
    return false;
  end if;
  insert into public.ai_usage (user_id, day, provider, count)
  values (uid, (now() at time zone 'utc')::date, p_provider, 1)
  on conflict (user_id, day, provider)
  do update set count = public.ai_usage.count + 1
  returning count into c;
  return c <= p_daily_limit;
end;
$$;
revoke all on function public.ai_usage_check(text, integer) from public, anon;
grant execute on function public.ai_usage_check(text, integer) to authenticated;

-- 2. product_contributions: stop exposing who contributed what.
--    Previously every signed-in user could SELECT every row, including user_id.
--    Cross-user lookups now go through a function that returns the product
--    details WITHOUT user_id; direct table reads are limited to your own rows.

drop policy if exists "users can read all contributions" on public.product_contributions;
create policy "users can read own contributions" on public.product_contributions
  for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.lookup_product_contributions(
  p_fingerprint text default null,
  p_semantic_prefix text default null,
  p_limit integer default 50
)
returns table (
  id text, fingerprint text, image_hash text, semantic_fp text, source text,
  name text, category text, brand text, retailer text, color text, material text,
  materials jsonb, cost numeric, retail_cost numeric, source_url text,
  vision_labels text[], created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pc.id, pc.fingerprint, pc.image_hash, pc.semantic_fp, pc.source,
         pc.name, pc.category, pc.brand, pc.retailer, pc.color, pc.material,
         pc.materials, pc.cost, pc.retail_cost, pc.source_url,
         pc.vision_labels, pc.created_at
    from public.product_contributions pc
   where auth.uid() is not null
     and (
       (p_fingerprint is not null and pc.fingerprint = p_fingerprint)
       or (p_semantic_prefix is not null and starts_with(pc.semantic_fp, p_semantic_prefix))
     )
   order by pc.created_at desc
   limit least(coalesce(p_limit, 50), 100);
$$;
revoke all on function public.lookup_product_contributions(text, text, integer) from public, anon;
grant execute on function public.lookup_product_contributions(text, text, integer) to authenticated;

-- 3. The aggregate views run as their owner (bypassing RLS) and were readable
--    by anon, i.e. by anyone holding the public anon key without signing in.
revoke all on public.product_contributions_aggregated from anon, public;
revoke all on public.material_usage_stats from anon, public;
grant select on public.product_contributions_aggregated to authenticated;
grant select on public.material_usage_stats to authenticated;
