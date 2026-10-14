-- Shared foundations for features that need a recorded, server-side permission and a daily limit
-- (quality ratings now; a later feature adds its own purpose row and handler).
--
--   consent_purposes   what can be agreed to, the text version in force, whether the person must
--                      confirm they are an adult, whether a new text version needs a fresh answer.
--   consent_in_force() whether a person's agreement is currently valid (internal).
--   user_consents      one row per person and purpose: granted or not, which text version they saw,
--                      when they confirmed being an adult. Written only by set_consent().
--   usage_counters     per person, per UTC day, per named bucket: how many times something was done.
--   hit_quota()        counts one use and says whether it was within the limit (internal).
--
-- Nothing here changes an existing table. Every user column cascades from auth.users, so
-- delete_user_account() needs no edit. Safe to run twice.

-- ─── What can be agreed to ─────────────────────────────────────────────────

create table if not exists public.consent_purposes (
  purpose        text primary key check (purpose ~ '^[a-z][a-z_]{2,39}$'),
  requires_adult boolean not null default false,
  current_version text not null check (char_length(current_version) between 1 and 40),
  -- true: an answer recorded against an older current_version no longer counts (consent_in_force is
  -- false) until the person agrees again. Bump current_version and ship the new text together.
  reconsent      boolean not null default false,
  description    text
);
alter table public.consent_purposes enable row level security;
revoke all on public.consent_purposes from public, anon, authenticated;

insert into public.consent_purposes (purpose, requires_adult, current_version, reconsent, description)
values ('share_ratings', true, 'ratings-2026-10', true,
        'Combine my item and brand ratings into brand insights shown to other members')
on conflict (purpose) do nothing;

-- ─── Who agreed ────────────────────────────────────────────────────────────

create table if not exists public.user_consents (
  user_id            uuid not null references auth.users(id) on delete cascade,
  purpose            text not null references public.consent_purposes(purpose),
  granted            boolean not null,
  policy_version     text not null check (char_length(policy_version) between 1 and 40),
  adult_confirmed_at timestamptz,
  decided_at         timestamptz not null default now(),
  primary key (user_id, purpose)
);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from public, anon, authenticated;
grant select on public.user_consents to authenticated;

drop policy if exists "own consents" on public.user_consents;
create policy "own consents" on public.user_consents
  for select to authenticated
  using (auth.uid() = user_id);

-- Whether p_user's agreement to p_purpose is valid right now: granted, and (for a purpose flagged
-- reconsent) given against the text version currently in force. Internal: features call it from
-- their own definer functions, a client never needs it (get_my_consents says the same thing).
create or replace function public.consent_in_force(p_user uuid, p_purpose text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.user_consents c
      join public.consent_purposes p on p.purpose = c.purpose
     where c.user_id = p_user and c.purpose = p_purpose and c.granted
       and (not p.reconsent or c.policy_version = p.current_version));
$$;
revoke all on function public.consent_in_force(uuid, text) from public, anon, authenticated;

-- ─── Daily counters ────────────────────────────────────────────────────────

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'utc')::date),
  bucket  text not null check (bucket ~ '^[a-z][a-z_]{2,39}$'),
  count   integer not null default 0,
  primary key (user_id, day, bucket)
);
alter table public.usage_counters enable row level security;   -- no policies: only hit_quota() touches it
revoke all on public.usage_counters from public, anon, authenticated;

-- Counts one use for p_user and reports whether it is within p_limit. Also removes that person's
-- counters older than a week, so the table does not grow without bound. Internal: a client must
-- not be able to spend another person's allowance.
create or replace function public.hit_quota(p_user uuid, p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c integer;
begin
  if p_user is null then
    return false;
  end if;
  delete from public.usage_counters
   where user_id = p_user and day < ((now() at time zone 'utc')::date - 7);
  insert into public.usage_counters (user_id, day, bucket, count)
  values (p_user, (now() at time zone 'utc')::date, p_bucket, 1)
  on conflict (user_id, day, bucket)
  do update set count = public.usage_counters.count + 1
  returning count into c;
  return c <= p_limit;
end;
$$;
revoke all on function public.hit_quota(uuid, text, integer) from public, anon, authenticated;

-- ─── Reading and changing a consent ────────────────────────────────────────

-- One row per known purpose with the caller's answer (granted is null while undecided), plus
-- what the client needs to ask properly. needs_reconsent is true when the person agreed to an older
-- text of a purpose that requires a fresh answer for a new text: it counts as not agreed until they
-- agree again. Reads only the caller's own rows.
create or replace function public.get_my_consents()
returns table (
  purpose         text,
  granted         boolean,
  policy_version  text,
  decided_at      timestamptz,
  adult_confirmed_at timestamptz,
  requires_adult  boolean,
  current_version text,
  needs_reconsent boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
    select p.purpose, c.granted, c.policy_version, c.decided_at, c.adult_confirmed_at,
           p.requires_adult, p.current_version,
           coalesce(c.granted and p.reconsent and c.policy_version <> p.current_version, false)
      from public.consent_purposes p
      left join public.user_consents c on c.purpose = p.purpose and c.user_id = uid
     order by p.purpose;
end;
$$;
revoke all on function public.get_my_consents() from public, anon;
grant execute on function public.get_my_consents() to authenticated;

-- Records an answer. Agreeing must name the text version currently in force (consent_purposes.
-- current_version): a client built with older wording is refused with 'stale_consent_text' rather
-- than recorded as having seen text it did not show. Withdrawing needs no version. The stored
-- version is always the server's, never the caller's. Each feature supplies a handler named
-- on_consent_changed_<purpose>(uuid, boolean, boolean) for what turning it on or off does to its
-- own data; it is looked up by name so two features never have to replace the same function.
create or replace function public.set_consent(
  p_purpose          text,
  p_granted          boolean,
  p_policy_version   text,
  p_adult            boolean default false,
  p_include_existing boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  needs_adult boolean;
  v_current text;
  handler text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_granted is null or p_policy_version is null or btrim(p_policy_version) = ''
     or char_length(p_policy_version) > 40 then
    raise exception 'invalid_consent' using errcode = '22023';
  end if;
  select requires_adult, current_version into needs_adult, v_current
    from public.consent_purposes where purpose = p_purpose;
  if not found then
    raise exception 'invalid_purpose' using errcode = '22023';
  end if;
  if p_granted and btrim(p_policy_version) <> v_current then
    raise exception 'stale_consent_text' using errcode = '22023';
  end if;
  if p_granted and needs_adult and not coalesce(p_adult, false) then
    raise exception 'adult_required' using errcode = '22023';
  end if;
  if not public.hit_quota(uid, 'consent_change', 10) then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.user_consents (user_id, purpose, granted, policy_version, adult_confirmed_at, decided_at)
  values (uid, p_purpose, p_granted, v_current,
          case when p_granted and needs_adult then now() end, now())
  on conflict (user_id, purpose) do update
    set granted = excluded.granted,
        policy_version = excluded.policy_version,
        adult_confirmed_at = case
          when excluded.granted and needs_adult then now()
          when excluded.granted then public.user_consents.adult_confirmed_at
          else public.user_consents.adult_confirmed_at end,
        decided_at = now();

  handler := 'on_consent_changed_' || p_purpose;
  if to_regprocedure('public.' || handler || '(uuid,boolean,boolean)') is not null then
    execute format('select public.%I($1, $2, $3)', handler) using uid, p_granted, coalesce(p_include_existing, false);
  end if;
end;
$$;
revoke all on function public.set_consent(text, boolean, text, boolean, boolean) from public, anon;
grant execute on function public.set_consent(text, boolean, text, boolean, boolean) to authenticated;
