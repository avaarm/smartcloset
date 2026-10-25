-- Professional accounts, part 1 of 8: lock the nine legacy stylist tables.
--
-- The tables behind the old Stylist and Client modes (switched off on 2026-10-04) are reachable by every
-- signed-in account today, hidden only by the missing screens: their policies let any member read every active
-- stylist's email and phone, let a stylist attach rows to any user id, let a client rewrite any column of a
-- recommendation, and let anyone post in any thread. This file removes every privilege that anon, authenticated and
-- public hold on them. Nothing else changes:
--   * the tables, their rows, their policies and their row level security flag stay as they are, so
--     supabase/audit.sql (which lists four of them) and delete_user_account() (which deletes from eight of them by
--     name, and reaches stylist_profiles through the auth.users cascade) keep working and nothing is lost;
--   * nothing reachable by an installed build calls these tables, so installed builds are unaffected;
--   * service_role keeps its privileges.
-- The tables are not dropped here: dropping first would make every account deletion fail (the lesson of
-- 20261015000000_styling_recommendations_if_missing.sql). The drop is a later clean-up, in the same file that
-- redefines delete_user_account() without them.
--
-- Each table is guarded by to_regclass, so one that does not exist on a given database (styling_recommendations
-- and profiles were made by hand on the live project) is skipped. Can ship alone, ahead of the other seven files.
-- Never rolled back: it only removes access nothing legitimate uses. Safe to run twice.

do $$
declare
  t text;
begin
  foreach t in array array['stylist_profiles', 'stylist_clients', 'appointments', 'recommendations',
                           'styling_recommendations', 'message_threads', 'messages', 'booking_requests',
                           'stylist_reviews']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from public, anon, authenticated', t);
    end if;
  end loop;
end
$$;
