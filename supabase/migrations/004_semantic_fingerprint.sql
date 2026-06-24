-- ============================================================================
-- 004_semantic_fingerprint.sql
--
-- Add a crop/angle-tolerant perceptual fingerprint to product_contributions.
-- Format: "c:RRGGBB_RRGGBB_RRGGBB|l:label1_label2_label3"
--   * Top 3 palette colors quantized to 6 bits/channel (64 levels)
--   * Top 3 non-stopword Vision labels, sorted alphabetically
--
-- The client computes this from Vision output. Similarity is scored in JS
-- (Manhattan distance on colors, Jaccard on labels). This migration adds
-- the column + a prefix-match index so KB lookups can narrow candidates by
-- dominant color before client-side fuzzy scoring.
-- ============================================================================

ALTER TABLE public.product_contributions
  ADD COLUMN IF NOT EXISTS semantic_fp text;

-- Prefix-match index — enables `semantic_fp LIKE 'c:XXXXX_%'` queries that
-- narrow to candidates with a matching dominant color without scanning the
-- whole table.
CREATE INDEX IF NOT EXISTS idx_contrib_semantic_fp
  ON public.product_contributions (semantic_fp text_pattern_ops);

-- Backfill not needed — existing rows stay on the exact-fingerprint path.
-- New rows carry both. Over time the KB grows on semantic_fp as primary.

-- ============================================================================
-- Update the aggregated view to surface semantic_fp alongside the legacy
-- fingerprint. Useful for future server-side similarity queries.
-- ============================================================================

CREATE OR REPLACE VIEW public.product_contributions_aggregated AS
SELECT
  fingerprint,
  MIN(semantic_fp)     AS semantic_fp,
  LOWER(TRIM(name))    AS name_key,
  LOWER(TRIM(COALESCE(brand, ''))) AS brand_key,
  MIN(name)            AS name,
  MIN(brand)           AS brand,
  MIN(retailer)        AS retailer,
  MIN(category)        AS category,
  MIN(color)           AS color,
  MIN(material)        AS material,
  AVG(cost)::numeric(10, 2) AS cost,
  MIN(source_url)      AS source_url,
  COUNT(*)             AS confirmation_count,
  MIN(created_at)      AS first_seen_at,
  MAX(created_at)      AS last_seen_at
FROM public.product_contributions
GROUP BY fingerprint, LOWER(TRIM(name)), LOWER(TRIM(COALESCE(brand, '')));
