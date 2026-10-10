/**
 * Lookup tables behind the item value estimate (see itemValue.ts).
 *
 * These are rough, deliberately round numbers: the estimate only has to be in
 * the right neighbourhood so a wardrobe total means something, and the owner
 * can correct any single item.
 */
import type { ClothingCategory } from '../types';

export type BrandTier =
  | 'luxury'
  | 'designer'
  | 'premium'
  | 'contemporary'
  | 'mid-market'
  | 'fast-fashion'
  | 'athletic'
  | 'outdoor';

/**
 * What a typical unbranded item of each category is worth today, in dollars
 * (a secondhand price, not a shop price). Typed as a Record so a new category
 * cannot be added without a price.
 */
export const CATEGORY_BASE_PRICE: Record<ClothingCategory, number> = {
  tops: 35,
  bottoms: 45,
  dresses: 60,
  outerwear: 90,
  shoes: 70,
  bags: 80,
  jewelry: 60,
  hats: 25,
  activewear: 40,
  swimwear: 35,
  accessories: 25,
};

/** Base price for a category the table does not know (old data). */
export const FALLBACK_BASE_PRICE = 40;

/** How much more (or less) than an unbranded item a brand tier is worth. */
export const TIER_MULTIPLIER: Record<BrandTier, number> = {
  luxury: 9,
  designer: 4,
  premium: 2.2,
  contemporary: 1.6,
  outdoor: 1.5,
  athletic: 1.3,
  'mid-market': 1.2,
  'fast-fashion': 0.7,
};

/**
 * Share of the new price an item still fetches second hand. These brands keep
 * their value; everything else, and items of unknown brand, use the default.
 */
export const DEFAULT_RESALE_FACTOR = 0.6;
export const HOLDS_VALUE_RESALE_FACTOR = 0.8;
export const HOLDS_VALUE_TIERS: readonly BrandTier[] = ['luxury', 'designer', 'premium'];

/** Known brands by tier. Matching ignores case, accents and punctuation (see itemValue.ts). */
export const BRAND_TIERS: Record<BrandTier, string[]> = {
  luxury: [
    'Gucci', 'Prada', 'Louis Vuitton', 'Chanel', 'Hermès', 'Dior', 'Christian Dior', 'Saint Laurent',
    'Yves Saint Laurent', 'YSL', 'Balenciaga', 'Bottega Veneta', 'Celine', 'Fendi', 'Burberry', 'Givenchy',
    'Valentino', 'Loewe', 'Cartier', 'Tiffany', 'Tiffany & Co', 'Van Cleef & Arpels', 'Miu Miu', 'Moncler',
    'Brunello Cucinelli', 'Loro Piana', 'Alexander McQueen', 'Tom Ford', 'Versace', 'Goyard', 'Chloé',
    'Bulgari', 'Balmain', 'Jimmy Choo', 'Christian Louboutin', 'Manolo Blahnik', 'Max Mara',
    'Salvatore Ferragamo', 'Ferragamo', 'Stella McCartney', 'Off-White', 'Maison Margiela', 'Rick Owens',
    'The Row', 'Dolce & Gabbana',
  ],
  designer: [
    'Michael Kors', 'Kate Spade', 'Coach', 'Tory Burch', 'Marc Jacobs', 'Diane von Furstenberg', 'DVF',
    'Vivienne Westwood', 'Paul Smith', 'Hugo Boss', 'Boss', 'Armani', 'Emporio Armani', 'Giorgio Armani',
    'Isabel Marant', 'Acne Studios', 'Maje', 'Sandro', 'Ganni', 'Rag & Bone', 'Theory', 'Vince', 'Ted Baker',
    'Longchamp', 'Mulberry', 'Furla', 'Stuart Weitzman', 'Alexander Wang', 'Zimmermann', 'Proenza Schouler',
    'Jil Sander', 'Marni', 'Kenzo', 'Lanvin', 'Etro', 'Missoni', 'Pinko', 'Self-Portrait', 'Cult Gaia',
    'Staud', 'Jacquemus', 'Mansur Gavriel', 'Rebecca Minkoff', 'Anya Hindmarch', 'Aquazzura',
  ],
  premium: [
    'Ralph Lauren', 'Polo Ralph Lauren', 'Polo', 'Tommy Hilfiger', 'Calvin Klein', 'Lacoste', 'Fred Perry',
    'Barbour', 'Canada Goose', 'UGG', 'Birkenstock', 'Dr. Martens', 'Hunter', 'Ray-Ban', 'Oakley', 'Diesel',
    'Cole Haan', 'Frye', 'Sam Edelman', 'Kurt Geiger', '7 For All Mankind', 'AG Jeans',
    'Citizens of Humanity', 'Paige', 'Frame', 'J Brand', 'Brooks Brothers', 'Bonobos', 'Johnston & Murphy',
    'Allen Edmonds', 'Tumi', 'Faherty', 'Todd Snyder', 'Hugo', 'Armani Exchange',
  ],
  contemporary: [
    'Madewell', 'Anthropologie', 'J.Crew', 'Banana Republic', 'Everlane', 'COS', '& Other Stories', 'Aritzia',
    'Free People', 'Urban Outfitters', 'Club Monaco', 'AllSaints', 'Whistles', 'Massimo Dutti', 'Reformation',
    'Sézane', 'Ba&sh', 'Arket', 'Mejuri', 'Reiss', 'Eileen Fisher', 'Vince Camuto', 'Anne Klein', 'Cuyana',
    'Quince', 'Jenni Kayne',
  ],
  'mid-market': [
    "Levi's", 'Levi Strauss', 'Gap', 'Old Navy', 'American Eagle', 'Abercrombie & Fitch', 'Hollister', 'Aerie',
    'Express', 'Uniqlo', 'Mango', 'Dockers', 'Wrangler', 'Lee', 'Steve Madden', 'Aldo', 'Nine West', 'Clarks',
    'Sperry', 'Target', 'A New Day', 'Universal Thread', 'Goodfellow', 'LOFT', 'Ann Taylor', 'Talbots',
    "Chico's", 'J.Jill', "Kohl's", 'Nordstrom', 'Guess', 'Lucky Brand', 'Jack & Jones', 'Vero Moda', 'Next',
    'Marks & Spencer', 'Esprit', 'Benetton', 'United Colors of Benetton', 'Hanes', 'Fruit of the Loom',
    'Bebe', 'Torrid', 'Lane Bryant', 'Tommy Jeans',
  ],
  'fast-fashion': [
    'Zara', 'H&M', 'HM', 'Forever 21', 'Shein', 'Temu', 'Primark', 'Boohoo', 'PrettyLittleThing',
    'Fashion Nova', 'Missguided', 'ASOS', 'Nasty Gal', 'Romwe', 'Cider', 'Brandy Melville', 'Pull & Bear',
    'Bershka', 'Stradivarius', 'Topshop', 'New Look', 'Zaful', 'George', 'Joe Fresh', 'Cotton On', 'Rue21',
    'Charlotte Russe', 'Princess Polly', 'Edikted', 'Garage', 'Wild Fable', 'Lulus', 'Windsor', 'Papaya',
    'Oh Polly', 'Meshki', 'White Fox', 'Time and Tru', 'No Boundaries', 'Cupshe',
  ],
  athletic: [
    'Nike', 'Adidas', 'Puma', 'Reebok', 'Under Armour', 'New Balance', 'Asics', 'Lululemon', 'Gymshark', 'Fila',
    'Champion', 'Converse', 'Vans', 'Skechers', 'Brooks', 'Hoka', 'Alo Yoga', 'Fabletics', 'On Running', 'Umbro',
    'Athleta', 'Vuori', 'Jordan', 'Saucony', 'Mizuno', 'Speedo', 'Sweaty Betty', 'Outdoor Voices',
    'Beyond Yoga', 'Kappa', 'Ellesse', 'Diadora', 'Hurley', 'Billabong', 'Roxy', 'Quiksilver', 'Tracksmith',
    'Summersalt', 'Triangl',
  ],
  outdoor: [
    'The North Face', 'North Face', 'Patagonia', 'Columbia', "Arc'teryx", 'Marmot', 'REI', 'Mountain Hardwear',
    'Carhartt', 'Timberland', 'Merrell', 'Keen', 'Helly Hansen', 'Eddie Bauer', 'L.L.Bean', 'LL Bean', 'Cotopaxi',
    'Outdoor Research', 'Fjällräven', 'Berghaus', 'Salomon', 'Teva', 'Sorel', 'Blundstone', 'Danner', 'Filson',
    'Pendleton', 'Kuhl', 'Prana', 'Mammut', 'Black Diamond', 'Rab', 'Smartwool', 'Wolverine',
  ],
};

/**
 * Fabric multipliers, by word or phrase. A longer phrase beats a shorter one
 * inside it ("faux leather" is not "leather").
 */
export const MATERIAL_MULTIPLIER: Record<string, number> = {
  cashmere: 2,
  shearling: 1.8,
  silk: 1.7,
  leather: 1.7,
  alpaca: 1.4,
  merino: 1.4,
  suede: 1.5,
  mohair: 1.3,
  wool: 1.3,
  velvet: 1.15,
  linen: 1.1,
  denim: 1,
  cotton: 1,
  canvas: 0.95,
  viscose: 0.9,
  rayon: 0.9,
  nylon: 0.9,
  elastane: 0.9,
  spandex: 0.9,
  'faux leather': 0.9,
  'vegan leather': 0.9,
  pleather: 0.9,
  polyester: 0.85,
  synthetic: 0.85,
  acrylic: 0.8,
};
