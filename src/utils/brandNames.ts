/**
 * Brand names, from the list the value estimate already uses (BRAND_TIERS):
 * finds a brand in a product title ("Bottega Veneta - Women - 'Andiamo' bag")
 * and spells one the way the brand does ("Bottegaveneta" -> "Bottega Veneta").
 */

import { BRAND_TIERS } from './itemValueTables';
import { brandKeyRaw } from './brandKey';
import { containsPhrase } from './wordMatch';

// The shared brand key, so "Hermes" and "Hermès" (or "Fjallraven" and "Fjällräven") reach one entry.
const compact = (s: string): string => brandKeyRaw(s) ?? '';

// Every known name once, longest first so "Christian Louboutin" wins over a shorter name inside it.
const KNOWN_BRANDS: string[] = Array.from(new Set(Object.values(BRAND_TIERS).flat()))
  .filter(name => compact(name).length >= 4)
  .sort((a, b) => b.length - a.length);

const BY_COMPACT = new Map<string, string>(KNOWN_BRANDS.map(name => [compact(name), name]));

/** A known brand named in `text` as whole words, or undefined. Short or common-word names are not searched for. */
export const brandFromText = (text: string | null | undefined): string | undefined => {
  if (!text) return undefined;
  return KNOWN_BRANDS.find(name => containsPhrase(text, name, false));
};

/** The brand spelled as its owner writes it when `raw` is one we know (ignoring case, spaces and punctuation); else `raw` as given. */
export const canonicalBrand = (raw: string | null | undefined): string => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return BY_COMPACT.get(compact(trimmed)) ?? trimmed;
};
