-- ============================================================================
-- 002_product_contributions.sql
--
-- Community-powered clothing recognition knowledge base.
--
-- Every save in AddClothing writes a contribution keyed by an image
-- fingerprint (content hash + top Vision labels). When the same fingerprint
-- is confirmed by multiple users, we have strong signal that they're all
-- uploading the same product — and can serve a canonical record without
-- hitting Vision API.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_contributions (
  id              text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint     text NOT NULL,
  image_hash      text NOT NULL,
  source          text NOT NULL CHECK (source IN ('lens_match', 'kb_match', 'manual')),

  name            text NOT NULL,
  category        text NOT NULL,
  brand           text,
  retailer        text,
  color           text,
  material        text,
  cost            numeric(10, 2),
  source_url      text,
  vision_labels   text[],

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Primary lookup: by fingerprint (used for KB match queries)
CREATE INDEX IF NOT EXISTS idx_contrib_fingerprint
  ON public.product_contributions (fingerprint);

-- Secondary: by image hash alone for fuzzy matching across labels
CREATE INDEX IF NOT EXISTS idx_contrib_image_hash
  ON public.product_contributions (image_hash);

-- User's own contribution history
CREATE INDEX IF NOT EXISTS idx_contrib_user
  ON public.product_contributions (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.product_contributions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own contributions
DROP POLICY IF EXISTS "users can insert own contributions" ON public.product_contributions;
CREATE POLICY "users can insert own contributions"
  ON public.product_contributions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read any contribution (so the KB is actually a shared KB).
-- Privacy note: we never store the raw image, just a hash + the metadata the
-- user chose to attach. That's intentional — the KB needs cross-user reads to
-- be useful.
DROP POLICY IF EXISTS "users can read all contributions" ON public.product_contributions;
CREATE POLICY "users can read all contributions"
  ON public.product_contributions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can update/delete only their own
DROP POLICY IF EXISTS "users can update own contributions" ON public.product_contributions;
CREATE POLICY "users can update own contributions"
  ON public.product_contributions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can delete own contributions" ON public.product_contributions;
CREATE POLICY "users can delete own contributions"
  ON public.product_contributions
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================================
-- Convenience view: aggregated canonical records
--
-- Groups contributions by (fingerprint, lowercased name, lowercased brand)
-- and exposes confirmation counts + first-seen metadata. The app can query
-- this view directly for fast "what do we know about this image?" lookups.
-- ============================================================================

CREATE OR REPLACE VIEW public.product_contributions_aggregated AS
SELECT
  fingerprint,
  LOWER(TRIM(name))   AS name_key,
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
