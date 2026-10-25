-- GATED. This file lives in supabase/held/, outside supabase/migrations, so `supabase db push` can never apply it by
-- accident. It deletes EVERY ROW of the nine legacy stylist tables. It is for one case only: the read-only check before
-- the professional-accounts migrations (pro-accounts.md 3.2 step 1, release step P0) found rows in those tables that
-- hold a third party's name, email or phone (rows a tester typed in on a build from before 2026-10-04). The tables
-- are believed to be empty, and the lockdown file (20261023000000_pro_lockdown_legacy_tables.sql) already closes them
-- to every app user, so rows that hold nothing personal can simply stay. Release it only after the owner has answered
-- question 3 of the design's section 11.2 with a yes.
--
-- To release (the same recipe as the other held files):
--   newest=$(ls supabase/migrations | grep -oE '^[0-9]{14}' | sort | tail -1)
--   now=$(date -u +%Y%m%d%H%M%S); v=$(( now > newest ? now : newest + 1 ))
--   mv supabase/held/purge_legacy_pro_tables.sql \
--      supabase/migrations/${v}_purge_legacy_pro_tables.sql
--   supabase db push --dry-run     # must list exactly this one file
--   supabase db push
-- The new version is later than every migration already applied; a version older than the newest applied one is
-- skipped by `supabase db push` unless --include-all is passed. Afterwards re-run the read-only checks of P0 and expect
-- a count of zero in every table.
--
-- One statement per table, children first (the order of the foreign keys), each guarded by to_regclass so a table that
-- does not exist on the database (styling_recommendations was made by hand on the live project) is skipped, and each
-- with a WHERE (the API layer refuses a bare DELETE; direct SQL does not, so this is for the habit and for the scanner
-- of __tests__/migrationSafeUpdate.test.ts). The tables themselves, their policies and their privileges are not
-- touched; the drop of the tables is a later clean-up, in the same file that redefines delete_user_account().
-- Safe to run twice.

do $$
begin
  if to_regclass('public.messages') is not null then
    delete from public.messages where id is not null;
  end if;
  if to_regclass('public.message_threads') is not null then
    delete from public.message_threads where id is not null;
  end if;
  if to_regclass('public.booking_requests') is not null then
    delete from public.booking_requests where id is not null;
  end if;
  if to_regclass('public.stylist_reviews') is not null then
    delete from public.stylist_reviews where id is not null;
  end if;
  if to_regclass('public.styling_recommendations') is not null then
    delete from public.styling_recommendations where id is not null;
  end if;
  if to_regclass('public.recommendations') is not null then
    delete from public.recommendations where id is not null;
  end if;
  if to_regclass('public.appointments') is not null then
    delete from public.appointments where id is not null;
  end if;
  if to_regclass('public.stylist_clients') is not null then
    delete from public.stylist_clients where id is not null;
  end if;
  if to_regclass('public.stylist_profiles') is not null then
    delete from public.stylist_profiles where id is not null;
  end if;
end
$$;
