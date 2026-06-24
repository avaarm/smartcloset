-- ============================================================================
-- 005_retail_cost.sql
--
-- Split cost into two numbers:
--   * cost        — what the user actually paid (sale, secondhand, gift)
--   * retail_cost — full retail / MSRP / "new" price
--
-- This lets us compute savings, accurate wardrobe value (using retail),
-- cost-per-wear (using paid), and separate "what did I spend" from "what is
-- this actually worth."
--
-- cost stays unchanged — existing rows carry forward; retail_cost is nullable
-- and opt-in per item.
-- ============================================================================

ALTER TABLE public.clothing_items
  ADD COLUMN IF NOT EXISTS retail_cost numeric(10, 2);

ALTER TABLE public.product_contributions
  ADD COLUMN IF NOT EXISTS retail_cost numeric(10, 2);
