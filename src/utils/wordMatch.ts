/**
 * Whole-word text matching for AI labels.
 *
 * `label.includes('ring')` is true for "Flooring", "top" for "Desktop" and "hat"
 * for "Chat", which is how a photo of boots on a hardwood floor came back as a
 * 97%-confident accessory. Everything that looks keywords up in free text goes
 * through here instead.
 */

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lowercase words of `text`; punctuation and hyphens split words ("T-Shirt" -> ["t", "shirt"]). */
export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/**
 * True when `phrase` appears in `haystack` as whole words. A plural "s" or "es"
 * on the end is allowed unless `plural` is false (brand names: "gap" is not "gaps").
 * Phrases may hold punctuation, e.g. "h&m" or "a.p.c.".
 */
export const containsPhrase = (haystack: string, phrase: string, plural = true): boolean => {
  if (!haystack || !phrase) return false;
  const re = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(phrase.toLowerCase())}${plural ? '(e?s)?' : ''}($|[^a-z0-9])`,
  );
  return re.test(haystack.toLowerCase());
};
