/**
 * Which wardrobe category a label like "Boot", "Tote bag" or "Fashion
 * accessory" belongs to.
 *
 * Matching is by whole words, and when a label names several things the LAST
 * noun decides ("leather jacket" is a jacket, "boot cut jeans" are jeans,
 * "dress shoe" is a shoe). Each term also carries how specific it is, so a
 * generic "Fashion accessory" label can never outvote "Boot".
 */

import type { ClothingCategory } from '../types/clothing';
import { tokenize } from './wordMatch';

/** 3 = names the item ("boot"), 2 = names a group ("footwear", "bag"), 1 = barely says anything ("accessory"). */
export type TermSpecificity = 1 | 2 | 3;

/** How much a term's label counts as evidence, by specificity. */
export const SPECIFICITY_WEIGHT: Record<TermSpecificity, number> = { 3: 1, 2: 0.8, 1: 0.25 };

/** The categories the Vision-era 6-value prompt could not name; GPT lumps these into "accessories" or "tops". */
export const EXTENDED_CATEGORIES: ReadonlySet<ClothingCategory> = new Set<ClothingCategory>([
  'bags', 'jewelry', 'hats', 'activewear', 'swimwear',
]);

// category, specificity, terms. Order is irrelevant: the matcher picks by position and length.
const TERMS: Array<[ClothingCategory | null, TermSpecificity, string[]]> = [
  ['tops', 3, [
    'shirt', 't-shirt', 'tee', 'blouse', 'sweater', 'polo', 'tank top', 'camisole', 'hoodie',
    'cardigan', 'turtleneck', 'crop top', 'sweatshirt', 'button-down', 'henley', 'tunic',
    'bodysuit', 'jersey', 'thermal', 'pullover', 'knitwear', 'bralette', 'jumper', 'halter top', 'tube top',
  ]],
  ['tops', 2, ['top']],
  ['tops', 1, ['short sleeve', 'long sleeve', 'cap sleeve']],
  ['bottoms', 3, [
    'pants', 'jeans', 'trousers', 'shorts', 'skirt', 'miniskirt', 'chinos', 'joggers', 'sweatpants',
    'cargo pants', 'culottes', 'palazzo', 'midi skirt', 'maxi skirt', 'bike shorts', 'capris', 'slacks',
  ]],
  ['dresses', 3, [
    'dress', 'gown', 'jumpsuit', 'romper', 'maxi dress', 'mini dress', 'wrap dress', 'sheath dress',
    'overalls', 'overall', 'dungarees', 'sundress', 'pinafore',
  ]],
  ['outerwear', 3, [
    'jacket', 'coat', 'blazer', 'parka', 'vest', 'windbreaker', 'puffer jacket', 'puffer', 'down jacket',
    'trench coat', 'peacoat', 'overcoat', 'raincoat', 'anorak', 'fleece jacket', 'bomber jacket',
    'denim jacket', 'leather jacket', 'poncho', 'cape', 'cloak', 'gilet', 'waistcoat', 'duster coat',
  ]],
  ['outerwear', 2, ['outerwear']],
  ['shoes', 3, [
    'sneaker', 'boot', 'sandal', 'heel', 'loafer', 'slipper', 'flats', 'ballet flat', 'pump', 'mule',
    'derby', 'oxford shoe', 'chelsea boot', 'ankle boot', 'knee-high boot', 'combat boot', 'stiletto',
    'wedge', 'espadrille', 'clog', 'slides', 'trainer', 'moccasin', 'brogue', 'platform shoe', 'cowboy boot',
    'rain boot', 'running shoe', 'flip-flop', 'bootie', 'mary jane', 'slingback', 'sling back',
    'high-heeled shoe', 'court shoe', 'tennis shoe', 'walking shoe', 'riding boot', 'hiking boot', 'high-top',
  ]],
  ['shoes', 2, ['shoe', 'footwear']],
  ['bags', 3, [
    'handbag', 'purse', 'tote', 'tote bag', 'clutch', 'crossbody', 'crossbody bag', 'satchel',
    'shoulder bag', 'backpack', 'duffel', 'duffle bag', 'bucket bag', 'hobo bag', 'messenger bag',
    'wristlet', 'belt bag', 'fanny pack', 'bum bag', 'baguette bag', 'saddle bag', 'briefcase', 'pouch',
  ]],
  ['bags', 3, ['rucksack', 'sling bag', 'camera bag', 'pochette']],
  ['bags', 2, ['bag', 'baggage']],
  ['jewelry', 3, [
    'necklace', 'pendant', 'earring', 'ring', 'bracelet', 'bangle', 'watch', 'wristwatch', 'anklet',
    'brooch', 'choker', 'locket', 'cufflinks', 'smartwatch', 'smart watch',
  ]],
  ['jewelry', 2, ['jewelry', 'jewellery']],
  ['hats', 3, [
    'hat', 'cap', 'baseball cap', 'beanie', 'beret', 'fedora', 'bucket hat', 'sun hat', 'cowboy hat',
    'straw hat', 'panama hat', 'newsboy cap', 'flat cap', 'top hat', 'visor', 'bonnet',
  ]],
  ['hats', 2, ['headwear', 'headgear']],
  ['activewear', 3, [
    'legging', 'sports bra', 'sport bra', 'yoga pants', 'tracksuit', 'running tights', 'unitard',
  ]],
  ['activewear', 2, ['activewear', 'sportswear', 'active wear', 'yoga', 'athletic wear']],
  ['swimwear', 3, [
    'bikini', 'swimsuit', 'swim trunks', 'swimming trunks', 'board shorts', 'bathing suit', 'rash guard',
    'one-piece swimsuit', 'swim shorts', 'bikini top', 'bikini bottom', 'swim top', 'swim bottom', 'trunks',
    'tankini', 'monokini',
  ]],
  ['swimwear', 2, ['swimwear']],
  ['accessories', 3, [
    'belt', 'scarf', 'scarves', 'glove', 'mitten', 'sunglasses', 'glasses', 'eyewear', 'goggles', 'tie',
    'necktie', 'bow tie', 'sock', 'wallet', 'headband', 'hair clip', 'tie bar', 'shawl', 'stole', 'bandana',
    'pashmina', 'neckerchief', 'cravat', 'umbrella',
  ]],
  ['accessories', 1, ['fashion accessory', 'accessory', 'accessories']],
  // Phrases that contain a clothing word without being clothing of that kind.
  [null, 3, ['tie dye', 'key ring', 'boot cut', 'bootcut', 'cap toe', 'ring light']],
];

interface Term {
  category: ClothingCategory | null;
  specificity: TermSpecificity;
  /** The term as written in the table, e.g. "knee-high boot". */
  phrase: string;
  words: string[];
}

const ALL_TERMS: Term[] = TERMS.flatMap(([category, specificity, phrases]) =>
  phrases.map(phrase => ({ category, specificity, phrase, words: tokenize(phrase) })),
);

// "boot" matches the label word "boots", but "boots" does not match "boot": plural-only terms
// (jeans, flats, slides) must not fire on a stray singular like "Slide" or "Flat".
const wordMatches = (labelWord: string, termWord: string): boolean =>
  labelWord === termWord ||
  labelWord === `${termWord}s` ||
  labelWord === `${termWord}es` ||
  (termWord.endsWith('y') && labelWord === `${termWord.slice(0, -1)}ies`);

export interface CategoryMatch {
  category: ClothingCategory;
  specificity: TermSpecificity;
  /** The matched term, e.g. "boot", "tote bag". */
  phrase: string;
  /** Reads well as the item's type in a name ("boot", "shoe"), unlike "footwear" or "fashion accessory". */
  nameable: boolean;
}

/**
 * The category a label names, or null when it names none (or names something
 * that only looks like clothing, like "tie dye"). A label that holds several
 * terms is decided by its last noun.
 */
export const matchCategoryTerm = (text: string): CategoryMatch | null => {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  let best: { term: Term; end: number } | null = null;
  for (const term of ALL_TERMS) {
    const n = term.words.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (!term.words.every((w, j) => wordMatches(tokens[i + j], w))) continue;
      const end = i + n - 1;
      const better =
        !best ||
        end > best.end ||
        (end === best.end &&
          (n > best.term.words.length ||
            (n === best.term.words.length && term.specificity > best.term.specificity)));
      if (better) best = { term, end };
    }
  }
  if (!best || !best.term.category) return null;
  const { category, specificity, phrase } = best.term;
  return { category, specificity, phrase, nameable: specificity === 3 || phrase === 'shoe' || phrase === 'bag' };
};

/** Shorthand for callers that only want the category. */
export const categoryFromText = (text: string): ClothingCategory | undefined =>
  matchCategoryTerm(text)?.category;

// Garment categories whose edges blur: a model that files "knit sweater" under outerwear has not confused
// a sweater with a shoe, it has put a top in the next bucket along.
const NEIGHBOURS: ReadonlyArray<readonly [ClothingCategory, ClothingCategory]> = [
  ['tops', 'outerwear'], ['tops', 'dresses'], ['bottoms', 'dresses'], ['outerwear', 'dresses'],
];
const areNeighbours = (a: ClothingCategory, b: ClothingCategory): boolean =>
  NEIGHBOURS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

/**
 * The category to trust when a model gave a coarse category and a more
 * specific sub-category ("accessories" + "structured tote" = bags,
 * "outerwear" + "knit sweater" = tops). The sub-category names the item; the
 * category is the bucket the model chose first. They disagree about once in
 * thirty photos, and when they do the sub-category is the one that is right:
 * a sweater or hoodie filed under outerwear, a cardigan under tops. So the
 * coarse answer yields to a sub-category that names an item outright when the
 * coarse answer is the catch-all "accessories", is missing, the sub-category
 * belongs to one of the newer categories, or the two are neighbouring garment
 * categories. Any other disagreement (an "outerwear" that is a "sock") is
 * nonsense from one side or the other and the coarse answer stands.
 */
export const refineCategory = (
  category: ClothingCategory | undefined,
  subtype: string | undefined,
  item?: string,
): ClothingCategory | undefined => {
  const named = (text: string | undefined) => {
    const m = text ? matchCategoryTerm(text) : null;
    return m && m.specificity === 3 ? m.category : undefined;
  };
  // No category at all: any category word in the text will do.
  if (!category) return (subtype ? categoryFromText(subtype) : undefined) ?? (item ? categoryFromText(item) : undefined);
  const fromSubtype = named(subtype);
  const fromItem = named(item);
  // Both texts name an item and disagree: the model is unsure, so its own category stands when it matches either.
  const fromText =
    fromSubtype && fromItem && fromSubtype !== fromItem
      ? category === fromSubtype || category === fromItem
        ? category
        : fromSubtype
      : fromSubtype ?? fromItem;
  if (!fromText) return category;
  if (category === 'accessories' || EXTENDED_CATEGORIES.has(fromText) || areNeighbours(category, fromText)) return fromText;
  return category;
};

/** Default item name noun when all we know is the category. */
export const CATEGORY_NOUN: Record<ClothingCategory, string> = {
  tops: 'Top',
  bottoms: 'Bottoms',
  dresses: 'Dress',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bags: 'Bag',
  jewelry: 'Jewelry',
  hats: 'Hat',
  activewear: 'Activewear',
  swimwear: 'Swimwear',
  accessories: 'Accessory',
};
