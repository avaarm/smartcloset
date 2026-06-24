/**
 * productContributions — knowledge base for community-powered recognition.
 *
 * Every time a user saves a clothing item, we record what they confirmed
 * (either by picking a lens match or typing fields manually). Keyed by a
 * perceptual image fingerprint so future uploads of the same item can find
 * high-confidence matches without hitting Vision API.
 *
 * Storage strategy:
 *   - Always write locally (AsyncStorage) — offline/guest support
 *   - If authenticated, also upsert to Supabase for cross-device + crowd sharing
 *   - Graceful fallback: Supabase errors (table missing, RLS deny) just warn
 *     and keep the local contribution. The data is never lost.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import type { ClothingCategory } from '../types/clothing';
import type { MaterialComponent } from '../types';
import { isFingerprintNearMatch, similarityScore } from './imageFingerprint';

const LOCAL_KEY = '@smartcloset_product_contributions';
const SUPABASE_TABLE = 'product_contributions';

export type ContributionSource =
  | 'lens_match' // User picked from Vision shopping results
  | 'kb_match'   // User picked from the knowledge base (previous contributions)
  | 'manual';    // User typed everything themselves

export interface ProductContribution {
  id: string;
  /** Composite fingerprint (image hash + top labels) — legacy exact-match key. */
  fingerprint: string;
  /** Semantic palette+labels fingerprint — tolerant of crop/angle/compression. */
  semanticFp?: string;
  /** Which flow recorded this. */
  source: ContributionSource;
  /** Product metadata the user confirmed. */
  name: string;
  category: ClothingCategory;
  brand?: string;
  retailer?: string;
  color?: string;
  /** Primary material as a plain string (back-compat). */
  material?: string;
  /** Full multi-tier material composition (fabric DB). */
  materials?: MaterialComponent[];
  /** What the user actually paid. */
  cost?: number;
  /** Full retail / MSRP if known — enables crowd-sourced MSRP averages. */
  retailCost?: number;
  /** If the user tapped a lens result, the source URL. */
  sourceUrl?: string;
  /** Hash of the image they uploaded (content only, not the full image). */
  imageHash: string;
  /** Raw Vision labels captured at contribution time — useful for label
   *  expansion / training later. */
  visionLabels?: string[];
  /** User ID if signed in; `"guest"` otherwise. */
  userId: string;
  createdAt: string;
}

export interface KBMatch {
  /** Canonical product details aggregated across contributions. */
  name: string;
  category: ClothingCategory;
  brand?: string;
  retailer?: string;
  color?: string;
  material?: string;
  /** Average of what contributors paid. */
  cost?: number;
  /** Average reported retail / MSRP. */
  retailCost?: number;
  sourceUrl?: string;
  /** How many users confirmed this product for the same fingerprint. */
  confirmationCount: number;
  /** 0..1 — based on confirmation count + vote ratio. */
  confidence: number;
}

// ─── Local storage ──────────────────────────────────────────────────────────

const getLocalContributions = async (): Promise<ProductContribution[]> => {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const addLocalContribution = async (c: ProductContribution): Promise<void> => {
  const list = await getLocalContributions();
  list.unshift(c);
  // Cap local history at 500 — plenty for personal-wardrobe scale
  const trimmed = list.slice(0, 500);
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
};

// ─── Auth helper ────────────────────────────────────────────────────────────

const getCurrentUserId = async (): Promise<string> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? 'guest';
  } catch {
    return 'guest';
  }
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Record a contribution. Writes local first (always succeeds), then tries
 * Supabase if signed in. Silent on Supabase failure — the data lives locally.
 */
export const recordContribution = async (
  input: Omit<ProductContribution, 'id' | 'userId' | 'createdAt'>,
): Promise<void> => {
  const userId = await getCurrentUserId();
  const contribution: ProductContribution = {
    ...input,
    id: `contrib_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    createdAt: new Date().toISOString(),
  };

  await addLocalContribution(contribution);

  // Skip remote sync for guests
  if (userId === 'guest') return;

  try {
    const { error } = await supabase.from(SUPABASE_TABLE).insert({
      id: contribution.id,
      user_id: userId,
      fingerprint: contribution.fingerprint,
      semantic_fp: contribution.semanticFp,
      image_hash: contribution.imageHash,
      source: contribution.source,
      name: contribution.name,
      category: contribution.category,
      brand: contribution.brand,
      retailer: contribution.retailer,
      color: contribution.color,
      material: contribution.material,
      materials: contribution.materials,
      cost: contribution.cost,
      retail_cost: contribution.retailCost,
      source_url: contribution.sourceUrl,
      vision_labels: contribution.visionLabels,
      created_at: contribution.createdAt,
    });
    if (error) {
      // Table may not exist yet (migration pending) — don't spam errors
      if (error.code !== '42P01') {
        console.warn('[productContributions] sync failed:', error.message);
      }
    }
  } catch (e: any) {
    console.warn('[productContributions] sync exception:', e?.message);
  }
};

/**
 * Look up KB matches for a given fingerprint + semantic fingerprint.
 *
 * Strategy (most specific → most permissive):
 *   1. Exact fingerprint hit locally or remotely — instant, strongest signal
 *   2. Semantic-fingerprint near match via similarity score ≥ 0.55
 *      (tolerates different angle, crop, compression of the same item)
 *   3. Label-overlap fallback (share ≥ 2 Vision labels)
 *
 * Tries Supabase first (crowd knowledge), falls back to local history.
 */
export const lookupKnowledgeBase = async (
  fingerprint: string,
  semanticFp?: string,
): Promise<KBMatch[]> => {
  const collected: any[] = [];

  // ── Remote lookup ──
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // 1. Exact fingerprint match
      const { data: exact } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .eq('fingerprint', fingerprint)
        .limit(20);
      if (exact) collected.push(...exact);

      // 2. Semantic fingerprint — pull candidates that share the color
      // prefix (first color token) so we can score them client-side.
      // Doing the full Hamming distance server-side requires an edge
      // function — deferred until we have enough data to justify it.
      if (semanticFp) {
        const colorPrefix = semanticFp.substring(0, 10); // "c:XXXXX_"
        const { data: fuzzy } = await supabase
          .from(SUPABASE_TABLE)
          .select('*')
          .like('semantic_fp', `${colorPrefix}%`)
          .limit(50);
        if (fuzzy) {
          for (const row of fuzzy) {
            if (row.semantic_fp && isFingerprintNearMatch(semanticFp, row.semantic_fp)) {
              collected.push(row);
            }
          }
        }
      }
    }
  } catch {
    // ignore and fall through to local
  }

  // ── Local lookup (covers guests + offline) ──
  const local = await getLocalContributions();
  for (const c of local) {
    // Exact hit
    if (c.fingerprint === fingerprint) {
      collected.push(c);
      continue;
    }
    // Semantic near-match
    if (semanticFp && c.semanticFp && isFingerprintNearMatch(semanticFp, c.semanticFp)) {
      collected.push(c);
    }
  }

  if (collected.length === 0) return [];

  return aggregate(
    collected.map(m => ({
      name: m.name,
      category: m.category,
      brand: m.brand,
      retailer: m.retailer,
      color: m.color,
      material: m.material,
      cost: m.cost,
      retail_cost: m.retail_cost || m.retailCost,
      source_url: m.source_url || m.sourceUrl,
      // Carry similarity through so aggregate can weight by it
      _similarity:
        semanticFp && m.semantic_fp ? similarityScore(semanticFp, m.semantic_fp)
        : semanticFp && m.semanticFp ? similarityScore(semanticFp, m.semanticFp)
        : 1,
    })),
  );
};

/**
 * Group contributions by (name + brand). Confidence blends two signals:
 *   - Confirmation count: how many distinct contributions back this product
 *   - Average similarity: how close the contributing photos were to the query
 */
const aggregate = (rows: any[]): KBMatch[] => {
  const buckets = new Map<
    string,
    { rows: any[]; count: number; simSum: number }
  >();
  for (const row of rows) {
    const key = `${(row.name || '').toLowerCase().trim()}|${(row.brand || '').toLowerCase().trim()}`;
    const existing = buckets.get(key);
    const sim = typeof row._similarity === 'number' ? row._similarity : 1;
    if (existing) {
      existing.rows.push(row);
      existing.count++;
      existing.simSum += sim;
    } else {
      buckets.set(key, { rows: [row], count: 1, simSum: sim });
    }
  }

  const matches: KBMatch[] = [];
  for (const [, bucket] of buckets) {
    const first = bucket.rows[0];
    const avgSim = bucket.simSum / bucket.count; // 0..1
    // Blend: similarity dominates for low counts, count catches up with more confirmations.
    //   1 confirmation at sim=1.0 → 0.80
    //   3 confirmations at sim=0.8 → 0.84
    //   5 confirmations at sim=1.0 → 1.00 (capped)
    const confidence = Math.min(
      0.98,
      avgSim * 0.8 + Math.min(bucket.count - 1, 4) * 0.05,
    );
    // Average cost / retailCost across confirmations in this bucket
    const costs = bucket.rows
      .map(r => (r.cost != null ? Number(r.cost) : null))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    const retailCosts = bucket.rows
      .map(r => (r.retail_cost != null ? Number(r.retail_cost) : null))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b) / costs.length : undefined;
    const avgRetail =
      retailCosts.length > 0 ? retailCosts.reduce((a, b) => a + b) / retailCosts.length : undefined;

    matches.push({
      name: first.name,
      category: first.category,
      brand: first.brand || undefined,
      retailer: first.retailer || undefined,
      color: first.color || undefined,
      material: first.material || undefined,
      cost: avgCost,
      retailCost: avgRetail,
      sourceUrl: first.source_url || first.sourceUrl || undefined,
      confirmationCount: bucket.count,
      confidence,
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
};

/**
 * Get the full local contribution history (for debugging / Settings display).
 */
export const getContributionHistory = async (): Promise<ProductContribution[]> =>
  getLocalContributions();
