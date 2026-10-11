/**
 * The specific kind of item inside a category: a "Tote" or a "Crossbody" in
 * Bags, "Ankle boots" or "Sneakers" in Shoes, "Belt" or "Scarf" in Accessories.
 *
 * An item's type is stored as the label shown here ("Ankle boots"). The list is
 * a menu, not a rule: an owner can also type a type of their own, and old items
 * simply have none. Free text the AI or a search result gives ("knee-high
 * boots", "structured tote") is matched to a label by whole words, the same way
 * categories are (see clothingCategories.ts).
 */

import type { ClothingCategory } from '../types/clothing';
import { tokenize } from './wordMatch';

export interface ClothingType {
  /** What is saved and shown: "Ankle boots". */
  label: string;
  /** Words that name it. A term with several words ("tank top") must appear as that phrase. */
  terms: string[];
}

const t = (label: string, ...terms: string[]): ClothingType => ({ label, terms: terms.length > 0 ? terms : [label.toLowerCase()] });

export const CLOTHING_TYPES: Record<ClothingCategory, ClothingType[]> = {
  tops: [
    t('T-shirt', 't-shirt', 'tee', 'tshirt'),
    t('Shirt', 'shirt', 'button-down', 'button down', 'oxford shirt', 'henley'),
    t('Blouse', 'blouse'),
    t('Sweater', 'sweater', 'jumper', 'pullover', 'knitwear', 'cable knit'),
    t('Cardigan', 'cardigan'),
    t('Hoodie', 'hoodie', 'sweatshirt', 'hooded sweatshirt'),
    t('Tank top', 'tank top', 'tank', 'camisole', 'cami'),
    t('Crop top', 'crop top', 'bralette'),
    t('Polo', 'polo'),
    t('Turtleneck', 'turtleneck', 'mock neck'),
    t('Bodysuit', 'bodysuit'),
    t('Tunic', 'tunic'),
  ],
  bottoms: [
    t('Jeans', 'jeans', 'denim pants'),
    t('Pants', 'pants', 'trousers', 'slacks', 'chinos', 'cargo pants'),
    t('Shorts', 'shorts', 'bike shorts'),
    t('Skirt', 'skirt', 'miniskirt', 'midi skirt', 'maxi skirt'),
    t('Joggers', 'joggers', 'sweatpants'),
    t('Wide-leg pants', 'wide-leg', 'palazzo', 'culottes'),
    t('Capris', 'capris', 'cropped pants'),
  ],
  dresses: [
    t('Casual dress', 'sundress', 'shirt dress', 't-shirt dress', 'day dress', 'shift dress', 'sleeveless dress', 'a-line dress', 'skater dress', 'sheath dress', 'bodycon dress', 'pinafore'),
    t('Mini dress', 'mini dress'),
    t('Midi dress', 'midi dress'),
    t('Maxi dress', 'maxi dress'),
    t('Cocktail dress', 'cocktail dress', 'party dress'),
    t('Evening gown', 'gown', 'evening dress', 'ball gown', 'wedding dress', 'prom dress', 'formal dress'),
    t('Wrap dress', 'wrap dress'),
    t('Jumpsuit', 'jumpsuit'),
    t('Romper', 'romper', 'playsuit'),
    t('Overalls', 'overalls', 'dungarees'),
  ],
  outerwear: [
    t('Jacket', 'jacket', 'windbreaker', 'fleece jacket'),
    t('Coat', 'coat', 'overcoat', 'peacoat', 'duster coat'),
    t('Blazer', 'blazer', 'sport coat'),
    t('Puffer', 'puffer', 'puffer jacket', 'down jacket'),
    t('Trench coat', 'trench coat', 'trench'),
    t('Parka', 'parka', 'anorak'),
    t('Raincoat', 'raincoat', 'rain jacket'),
    t('Bomber jacket', 'bomber jacket', 'bomber'),
    t('Denim jacket', 'denim jacket', 'jean jacket'),
    t('Leather jacket', 'leather jacket', 'biker jacket'),
    t('Vest', 'vest', 'gilet', 'waistcoat'),
    t('Cape', 'cape', 'poncho', 'cloak'),
  ],
  shoes: [
    t('Sneakers', 'sneaker', 'trainer', 'running shoe', 'athletic shoe', 'tennis shoe', 'walking shoe', 'high-top', 'high top', 'hi-top'),
    t('Boots', 'boot', 'combat boot', 'cowboy boot', 'rain boot', 'chelsea boot', 'hiking boot', 'work boot', 'chukka'),
    t('Ankle boots', 'ankle boot', 'bootie'),
    t('Knee-high boots', 'knee-high boot', 'knee high boot', 'tall boot', 'riding boot', 'over-the-knee boot', 'thigh-high boot'),
    t('Heels', 'heel', 'stiletto', 'slingback', 'sling back', 'mary jane', 'high-heeled shoe', 'high heeled shoe', 'high-heeled'),
    t('Pumps', 'pump', 'court shoe'),
    t('Flats', 'flats', 'ballet flat', 'ballerina'),
    t('Sandals', 'sandal', 'flip-flop', 'flip flop'),
    t('Loafers', 'loafer', 'moccasin', 'penny loafer'),
    t('Mules', 'mule'),
    t('Slides', 'slides', 'slide', 'slipper'),
    t('Wedges', 'wedge', 'espadrille'),
    t('Platforms', 'platform shoe', 'platform'),
    t('Oxfords', 'oxford shoe', 'derby', 'brogue', 'dress shoe'),
    t('Clogs', 'clog'),
  ],
  bags: [
    t('Handbag', 'handbag', 'purse', 'top handle', 'top-handle', 'satchel'),
    t('Tote', 'tote', 'tote bag', 'shopper', 'shopping bag'),
    t('Crossbody', 'crossbody', 'cross-body', 'messenger bag', 'messenger', 'saddle bag', 'sling bag', 'camera bag'),
    t('Shoulder bag', 'shoulder bag', 'hobo bag', 'hobo', 'baguette bag', 'baguette'),
    t('Clutch', 'clutch', 'evening bag', 'minaudiere', 'wristlet', 'pochette'),
    t('Backpack', 'backpack', 'rucksack'),
    t('Bucket bag', 'bucket bag'),
    t('Belt bag', 'belt bag', 'fanny pack', 'bum bag'),
    t('Duffel', 'duffel', 'duffle bag', 'weekender', 'travel bag'),
    t('Pouch', 'pouch', 'cosmetic bag', 'makeup bag'),
  ],
  jewelry: [
    t('Necklace', 'necklace', 'pendant', 'choker', 'locket'),
    t('Earrings', 'earring', 'stud', 'hoop'),
    t('Ring', 'ring'),
    t('Bracelet', 'bracelet', 'bangle', 'cuff'),
    t('Watch', 'watch', 'wristwatch', 'smartwatch'),
    t('Brooch', 'brooch'),
    t('Anklet', 'anklet'),
  ],
  hats: [
    t('Baseball cap', 'baseball cap', 'cap'),
    t('Beanie', 'beanie', 'knit hat', 'winter hat'),
    t('Bucket hat', 'bucket hat'),
    t('Sun hat', 'sun hat', 'straw hat', 'wide-brim'),
    t('Fedora', 'fedora', 'panama hat', 'trilby'),
    t('Beret', 'beret'),
    t('Visor', 'visor'),
    t('Hat', 'hat', 'cowboy hat', 'newsboy cap', 'flat cap'),
  ],
  activewear: [
    t('Leggings', 'legging', 'yoga pants', 'running tights'),
    t('Sports bra', 'sports bra', 'sport bra'),
    t('Athletic top', 'athletic top', 'workout top', 'running top', 'performance tee'),
    t('Athletic shorts', 'athletic shorts', 'running shorts', 'bike shorts'),
    t('Track jacket', 'track jacket', 'warm-up jacket', 'tracksuit'),
    t('Track pants', 'track pants', 'training pants'),
    t('Unitard', 'unitard'),
  ],
  swimwear: [
    t('Bikini', 'bikini', 'bikini top', 'bikini bottom', 'tankini'),
    t('One-piece', 'one-piece', 'one piece swimsuit', 'swimsuit', 'bathing suit', 'monokini'),
    t('Swim trunks', 'swim trunks', 'swimming trunks', 'board shorts', 'swim shorts', 'trunks'),
    t('Cover-up', 'cover-up', 'cover up', 'sarong', 'kaftan', 'caftan'),
    t('Rash guard', 'rash guard'),
  ],
  accessories: [
    t('Belt', 'belt'),
    t('Scarf', 'scarf', 'scarves', 'shawl', 'stole', 'pashmina', 'bandana', 'neckerchief'),
    t('Sunglasses', 'sunglasses', 'glasses', 'eyewear', 'goggles'),
    t('Gloves', 'glove', 'mitten'),
    t('Tie', 'tie', 'necktie', 'bow tie', 'cravat'),
    t('Socks', 'sock', 'tights', 'stockings'),
    t('Wallet', 'wallet', 'cardholder', 'card holder', 'coin purse'),
    t('Hair accessory', 'headband', 'hair clip', 'scrunchie', 'barrette', 'hair tie'),
    t('Umbrella', 'umbrella'),
    t('Keychain', 'keychain', 'key ring', 'key chain'),
  ],
};

/** The labels offered for a category, in the order they are shown. */
export const typeLabelsFor = (category: ClothingCategory | string | null | undefined): string[] =>
  category && category in CLOTHING_TYPES ? CLOTHING_TYPES[category as ClothingCategory].map(x => x.label) : [];

/** True when `label` is one of the menu choices for `category` (ignoring case). */
export const isKnownType = (category: ClothingCategory | string | null | undefined, label: string | null | undefined): boolean => {
  if (!label) return false;
  const lower = label.trim().toLowerCase();
  return typeLabelsFor(category).some(l => l.toLowerCase() === lower);
};

// "boot" matches the label word "boots"; "boots" never matches "boot".
const wordMatches = (labelWord: string, termWord: string): boolean =>
  labelWord === termWord ||
  labelWord === `${termWord}s` ||
  labelWord === `${termWord}es` ||
  (termWord.endsWith('y') && labelWord === `${termWord.slice(0, -1)}ies`);

interface FlatType {
  category: ClothingCategory;
  label: string;
  words: string[];
}

const FLAT_TYPES: FlatType[] = (Object.keys(CLOTHING_TYPES) as ClothingCategory[]).flatMap(category =>
  CLOTHING_TYPES[category].flatMap(type =>
    // A type's own label is a term of it too, so "Evening gown" and "Hair accessory" read back to themselves.
    Array.from(new Set([type.label.toLowerCase(), ...type.terms])).map(term => ({
      category,
      label: type.label,
      words: tokenize(term),
    })),
  ),
);

export interface TypeMatch {
  category: ClothingCategory;
  label: string;
}

/**
 * The type a piece of text names, e.g. "knee-high boots" -> Knee-high boots,
 * "Women's Andiamo shopper bag" -> Tote. Within `category` when given, else
 * across all of them. When the text names several things the LAST noun wins
 * ("leather jacket" is a jacket made of leather; "boot cut jeans" are jeans);
 * a longer phrase beats a shorter one that ends at the same word.
 */
export const matchTypeTerm = (text: string, category?: ClothingCategory | null): TypeMatch | null => {
  const tokens = tokenize(text || '');
  if (tokens.length === 0) return null;
  let best: { type: FlatType; end: number } | null = null;
  for (const type of FLAT_TYPES) {
    if (category && type.category !== category) continue;
    const n = type.words.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (!type.words.every((w, j) => wordMatches(tokens[i + j], w))) continue;
      const end = i + n - 1;
      if (!best || end > best.end || (end === best.end && n > best.type.words.length)) best = { type, end };
    }
  }
  return best ? { category: best.type.category, label: best.type.label } : null;
};

/**
 * The type to store for an item: what the AI called it ("subtype"), else the
 * title, matched to the menu for the item's category. undefined when nothing
 * in the menu fits: better no type than a wrong one.
 */
export const inferType = (
  category: ClothingCategory | null | undefined,
  ...texts: Array<string | null | undefined>
): string | undefined => {
  if (!category) return undefined;
  for (const text of texts) {
    if (!text) continue;
    const match = matchTypeTerm(text, category);
    if (match) return match.label;
  }
  return undefined;
};
