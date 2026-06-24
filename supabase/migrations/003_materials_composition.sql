-- ============================================================================
-- 003_materials_composition.sql
--
-- Add multi-tier material composition to the knowledge base + the user's
-- wardrobe. Stored as JSONB for flexibility; example shape:
--
--   [
--     { "name": "cotton", "percentage": 70, "tier": "primary" },
--     { "name": "polyester", "percentage": 30, "tier": "primary" },
--     { "name": "polyester", "tier": "lining" }
--   ]
-- ============================================================================

-- ── Product contributions (knowledge base) ──
ALTER TABLE public.product_contributions
  ADD COLUMN IF NOT EXISTS materials jsonb;

-- GIN index for querying by material composition ("show me all leather items",
-- "all items with >50% cotton", etc.)
CREATE INDEX IF NOT EXISTS idx_contrib_materials
  ON public.product_contributions USING GIN (materials);

-- ── User wardrobe items ──
ALTER TABLE public.clothing_items
  ADD COLUMN IF NOT EXISTS materials jsonb;

CREATE INDEX IF NOT EXISTS idx_clothing_items_materials
  ON public.clothing_items USING GIN (materials);

-- ============================================================================
-- View: material usage frequency across the KB
--
-- Powers future analytics — "what are the most common fabrics in our DB?",
-- "what fabrics does brand X use?", per-category breakdowns, etc.
-- ============================================================================

CREATE OR REPLACE VIEW public.material_usage_stats AS
SELECT
  LOWER((m->>'name'))                AS material_name,
  (m->>'tier')                        AS tier,
  category,
  brand,
  COUNT(*)                            AS occurrences,
  AVG(NULLIF((m->>'percentage')::int, 0)) AS avg_percentage
FROM public.product_contributions,
     LATERAL jsonb_array_elements(COALESCE(materials, '[]'::jsonb)) AS m
WHERE m->>'name' IS NOT NULL
GROUP BY LOWER((m->>'name')), (m->>'tier'), category, brand;
