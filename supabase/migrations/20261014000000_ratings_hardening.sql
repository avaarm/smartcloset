-- Ratings groundwork, part 1: close a data exposure that the rating feature would otherwise sit next to.
--
-- material_usage_stats counts how many members use each material, grouped by brand, category and
-- tier, with no minimum group size, so a group of one is one person's closet. Every signed-in member
-- can read it, and the app never does (nothing in src reads the view). Brand-by-fabric insight now
-- comes only from the thresholded rating aggregates (get_brand_insight), so the view is closed.
--
-- Only this view is touched. Safe to run twice; does nothing if the view does not exist.

do $$
begin
  if to_regclass('public.material_usage_stats') is not null then
    revoke all on public.material_usage_stats from public, anon, authenticated;
  end if;
end
$$;
