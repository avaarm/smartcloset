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

const LOCAL_KEY = '@smartcloset_product_contributions';
const SUPABASE_TABLE = 'product_contributions';

export type ContributionSource =
  | 'lens_match' // User picked from Vision shopping results
  | 'kb_match'   // User picked from the knowledge base (previous contributions)
  | 'manual';    // User typed everything themselves

export interface ProductContribution {
  id: string;
  /** Composite fingerprint (image hash + top labels) — the KB lookup key. */
  fingerprint: string;
  /** Which flow recorded this. */
  source: ContributionSource;
  /** Product metadata the user confirmed. */
  name: string;
  category: ClothingCategory;
  brand?: string;
  retailer?: string;
  color?: string;
  material?: string;
  cost?: number;
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
  cost?: number;
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
      image_hash: contribution.imageHash,
      source: contribution.source,
      name: contribution.name,
      category: contribution.category,
      brand: contribution.brand,
      retailer: contribution.retailer,
      color: contribution.color,
      material: contribution.material,
      cost: contribution.cost,
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
 * Look up KB matches for a given fingerprint. Returns an aggregated list
 * ordered by confidence.
 *
 * Tries Supabase first (crowd knowledge), falls back to local history
 * (own contributions) for guests / offline.
 */
export const lookupKnowledgeBase = async (
  fingerprint: string,
): Promise<KBMatch[]> => {
  // ── Remote lookup ──
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .eq('fingerprint', fingerprint)
        .limit(50);
      if (!error && data && data.length > 0) {
        return aggregate(data);
      }
    }
  } catch {
    // ignore and fall through
  }

  // ── Local lookup ──
  const local = await getLocalContributions();
  const matches = local.filter(c => c.fingerprint === fingerprint);
  if (matches.length === 0) return [];
  return aggregate(
    matches.map(m => ({
      name: m.name,
      category: m.category,
      brand: m.brand,
      retailer: m.retailer,
      color: m.color,
      material: m.material,
      cost: m.cost,
      source_url: m.sourceUrl,
    })),
  );
};

/**
 * Group contributions by (name + brand) and compute confidence.
 */
const aggregate = (rows: any[]): KBMatch[] => {
  const buckets = new Map<string, { rows: any[]; count: number }>();
  for (const row of rows) {
    const key = `${(row.name || '').toLowerCase().trim()}|${(row.brand || '').toLowerCase().trim()}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.rows.push(row);
      existing.count++;
    } else {
      buckets.set(key, { rows: [row], count: 1 });
    }
  }

  const matches: KBMatch[] = [];
  for (const [, bucket] of buckets) {
    const first = bucket.rows[0];
    // Confidence rises fast for first few confirmations then plateaus
    const confidence = Math.min(0.5 + (bucket.count - 1) * 0.15, 0.98);
    matches.push({
      name: first.name,
      category: first.category,
      brand: first.brand || undefined,
      retailer: first.retailer || undefined,
      color: first.color || undefined,
      material: first.material || undefined,
      cost: first.cost ? Number(first.cost) : undefined,
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
