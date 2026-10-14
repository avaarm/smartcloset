#!/usr/bin/env bash
# Runs the swap behaviour scripts in supabase/tests/swaps. Every scenario is one transaction that
# ends in ROLLBACK, so nothing it creates (users, items, swaps) is left behind. A failed check
# raises an error that lists the failing checks, and this script exits non-zero.
#
#   scripts/run-swap-sql-tests.sh                       the linked Supabase project (supabase db query --linked)
#   SWAP_TEST_DB_URL=postgresql://... scripts/run-swap-sql-tests.sh     a database you reach with psql
#   scripts/run-swap-sql-tests.sh s2_lifecycle s6_catalog               only these scenarios
#
# s7_legacy_policy.sql only makes sense while the legacy friends policy is still in place, that is before
# supabase/held/drop_legacy_friend_wardrobe_policy.sql has been released; it is not in the default list.
#
# The database must have every file in supabase/migrations applied (supabase db reset does that), including
# 20261015000000_styling_recommendations_if_missing.sql, without which s4_deletion cannot pass. Files in
# supabase/held are never applied.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=supabase/tests/swaps

scenarios=("$@")
if [ ${#scenarios[@]} -eq 0 ]; then
  scenarios=(s1_publish_browse s2_lifecycle s3_edges s4_deletion s5_moderation_community s6_catalog)
fi

failed=0
for s in "${scenarios[@]}"; do
  file="$(mktemp)"
  { echo "begin;"; cat "$dir/00_lib.sql" "$dir/10_fixture_users.sql" "$dir/20_fixture_listings.sql" "$dir/$s.sql" "$dir/99_tail.sql"; } > "$file"
  echo "== $s"
  if [ -n "${SWAP_TEST_DB_URL:-}" ]; then
    # psql prints every select; only the last line (the count of checks that passed) matters.
    if out="$(psql "$SWAP_TEST_DB_URL" -X -q -v ON_ERROR_STOP=1 -At -f "$file" 2>&1)"; then
      echo "$out" | tail -n 1
    else
      echo "$out" | grep -v '^$' | tail -n 25
      failed=1
    fi
  else
    supabase db query --linked -f "$file" || failed=1
  fi
  rm -f "$file"
done
exit $failed
