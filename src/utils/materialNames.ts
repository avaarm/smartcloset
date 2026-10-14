/**
 * Fibre, part and garment words for reading a clothing tag, and the canonical fibre of a stored material name.
 *
 * Every key is in the folded form of textFold (lowercase, accents removed); other scripts are kept as printed.
 * The English aliases in CANONICAL_ALIASES are the rows of the server table material_aliases and are compared
 * with its seed by a test, so a material name files under the same fibre in the app and in the database.
 */
import type { TagPart } from '../types/tag';

/** A lookup table with no prototype, so a printed word such as "constructor" is never found by accident. */
const table = <V>(entries: ReadonlyArray<readonly [string, V]>): Record<string, V> => {
  const out: Record<string, V> = Object.create(null);
  for (const [key, value] of entries) out[key] = value;
  return out;
};

/** The word in a table, or undefined; safe for any text. */
export const lookup = <V>(map: Record<string, V>, key: string): V | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

// ─── Fibres ─────────────────────────────────────────────────────────────────

export const FIBRES: readonly string[] = [
  'cotton', 'polyester', 'nylon', 'elastane', 'wool', 'viscose', 'linen', 'silk', 'acrylic', 'cashmere',
  'lyocell', 'modal', 'cupro', 'hemp', 'alpaca', 'mohair', 'angora', 'acetate', 'polypropylene', 'leather',
  'suede', 'down', 'feathers', 'rubber', 'polyurethane', 'metal', 'textile', 'synthetic',
];

/** Words in front of a fibre that do not change what the material is. The server strips exactly these six. */
export const STRIPPED_QUALIFIERS: readonly string[] = ['organic', 'recycled', 'regenerated', 'virgin', 'egyptian', 'supima'];

/** The two of those that are kept, because the person may want to see them. */
export const RECORDED_QUALIFIERS: readonly string[] = ['organic', 'recycled'];

/** Words that do change what a material is: never removed, never turned into the plain fibre. */
export const CHANGER_WORDS: readonly string[] = ['vegan', 'faux', 'synthetic', 'imitation'];

/** Imitation leather: files under polyurethane, and the material keeps the printed phrase as its name. */
export const IMITATION_LEATHER_PHRASES: readonly string[] = ['vegan leather', 'faux leather', 'pleather', 'synthetic leather', 'pu leather'];

/**
 * The rows of material_aliases in supabase/migrations/20261014000300_quality_ratings.sql, word for word.
 * Keep in step with that seed (a test compares them).
 */
export const CANONICAL_ALIASES: Record<string, string> = table<string>([
  ['cotton', 'cotton'], ['denim', 'cotton'], ['canvas', 'cotton'], ['pima cotton', 'cotton'],
  ['polyester', 'polyester'], ['poly', 'polyester'],
  ['nylon', 'nylon'], ['polyamide', 'nylon'],
  ['elastane', 'elastane'], ['spandex', 'elastane'], ['lycra', 'elastane'], ['elastan', 'elastane'],
  ['wool', 'wool'], ['merino', 'wool'], ['merino wool', 'wool'], ['lambswool', 'wool'],
  ['viscose', 'viscose'], ['rayon', 'viscose'],
  ['linen', 'linen'], ['flax', 'linen'],
  ['silk', 'silk'],
  ['acrylic', 'acrylic'],
  ['cashmere', 'cashmere'],
  ['lyocell', 'lyocell'], ['tencel', 'lyocell'],
  ['modal', 'modal'],
  ['cupro', 'cupro'],
  ['hemp', 'hemp'],
  ['alpaca', 'alpaca'], ['mohair', 'mohair'], ['angora', 'angora'],
  ['acetate', 'acetate'], ['polypropylene', 'polypropylene'],
  ['leather', 'leather'], ['suede', 'suede'],
  ['down', 'down'], ['feathers', 'feathers'],
  ['rubber', 'rubber'],
  ['polyurethane', 'polyurethane'], ['pu', 'polyurethane'],
  ['vegan leather', 'polyurethane'], ['faux leather', 'polyurethane'], ['pleather', 'polyurethane'],
  ['synthetic leather', 'polyurethane'], ['pu leather', 'polyurethane'],
  ['metal', 'metal'],
  ['textile', 'textile'],
  ['synthetic', 'synthetic'], ['man made', 'synthetic'], ['manmade', 'synthetic'],
]);

/**
 * The fibre of a stored material name, the way the server's canonical_fibre() reads it: lowercased and trimmed,
 * one leading qualifier (organic, recycled, regenerated, virgin, egyptian, supima) stripped, 'other' when unknown.
 * "vegan" and "faux" are never stripped, so "vegan leather" is polyurethane and never leather.
 */
export const canonicalFibre = (name: string): string => {
  if (typeof name !== 'string') return 'other';
  const key = name.trim().toLowerCase().replace(/^(organic|recycled|regenerated|virgin|egyptian|supima)\s+/, '');
  return lookup(CANONICAL_ALIASES, key) ?? 'other';
};

/** Fibre words by language, beyond the English aliases above. */
const EXTRA_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['cotton', ['baumwolle', 'coton', 'algodon', 'algodao', 'cotone', 'katoen', 'pamuk', '綿', '棉', 'コットン', '木綿']],
  ['polyester', ['poliester', 'poliestere', 'polyestere', 'ポリエステル', '涤纶', '滌綸']],
  ['nylon', ['polyamid', 'poliamida', 'poliammide', 'poliamide', 'poliamid', 'ナイロン', 'ポリアミド', '锦纶', '錦綸', '尼龙', '尼龍']],
  ['elastane', ['elastano', 'elasthanne', 'elasthane', 'elastaan', 'ポリウレタン', 'スパンデックス', '氨纶', '氨綸']],
  ['wool', ['wolle', 'schurwolle', 'laine', 'lana', 'wol', 'yun', 'new wool', 'lana vergine', 'lana merino', "lamb's wool", 'lambs wool', 'ウール', '羊毛', '毛']],
  ['viscose', ['viskose', 'viscosa', 'viskon', 'rayonne', 'viscose rayon', 'レーヨン', '粘纤', '粘胶']],
  ['linen', ['leinen', 'lin', 'lino', 'linho', 'linnen', 'keten', 'リネン', '亚麻', '亞麻']],
  ['silk', ['seide', 'soie', 'seda', 'seta', 'zijde', 'ipek', 'シルク', '絹', '蚕丝', '蠶絲', '真丝', '真絲']],
  ['acrylic', ['acryl', 'polyacryl', 'acrylique', 'acrilico', 'akrilik', 'アクリル', '腈纶', '腈綸']],
  ['cashmere', ['kaschmir', 'cachemire', 'cachemira', 'kasjmier', 'kasmir', 'caxemira', 'カシミヤ', 'カシミア', '羊绒', '山羊绒']],
  ['lyocell', ['liocel', 'tencel lyocell', 'lenzing lyocell', 'リヨセル', '莱赛尔']],
  ['modal', ['micro modal', 'micromodal', 'tencel modal', 'lenzing modal', 'モダール', '莫代尔']],
  ['cupro', ['kupro', 'bemberg', 'キュプラ', '铜氨']],
  ['hemp', ['hanf', 'chanvre', 'canamo', 'canhamo', 'canapa', 'hennep', 'kenevir', 'ヘンプ', '大麻']],
  ['alpaca', ['alpaka', 'alpaga']],
  ['acetate', ['acetat', 'azetat', 'acetato', 'acetaat', 'asetat']],
  ['polypropylene', ['polypropylen', 'polipropileno', 'polipropilene', 'polipropileen', 'polipropilen']],
  ['leather', ['leder', 'cuir', 'piel', 'cuoio', 'cuero', 'leer', 'deri', 'couro', 'pelle', 'genuine leather', 'real leather', '革', '本革', '皮革', '真皮']],
  ['suede', ['wildleder', 'daim', 'ante', 'camoscio', 'camurca', 'suede leather', 'suet', 'スエード']],
  ['down', ['daunen', 'duvet', 'plumon', 'piumino', 'penugem', 'dons', 'duck down', 'goose down', 'ダウン', '羽绒', '鸭绒', '鹅绒']],
  ['feathers', ['feather', 'federn', 'plumes', 'plume', 'plumas', 'pluma', 'piume', 'penas', 'veren', 'tuy', 'duck feathers', 'goose feathers', 'フェザー', '羽毛']],
  ['rubber', ['gummi', 'caoutchouc', 'caucho', 'gomma', 'borracha', 'kaucuk', 'ゴム', '橡胶']],
  [
    'polyurethane',
    ['polyurethan', 'polyurethane', 'poliuretano', 'poliuretaan', 'poliuretan', 'kunstleder', 'cuir synthetique', 'similicuir',
      'piel sintetica', 'cuero sintetico', 'similpelle', 'pelle sintetica', 'couro sintetico', 'kunstleer', 'suni deri'],
  ],
  ['metal', ['metall', 'metallo', 'metaal']],
  ['textile', ['textil', 'tessile', 'textiel', 'tekstil']],
  ['synthetic', ['synthetique', 'sintetico', 'synthetisch', 'sentetik', 'synthetik', 'kunstfaser']],
];

/** Every folded printed word or phrase that names a fibre (English, French, Spanish, German, Italian, Portuguese, Dutch, Turkish, Japanese, Chinese) -> canonical fibre. */
export const FIBER_SYNONYMS: Record<string, string> = (() => {
  const out: Record<string, string> = Object.create(null);
  for (const [fibre, words] of EXTRA_SYNONYMS) for (const word of words) out[word] = fibre;
  // The English rows win, so the server's table and this one never disagree on a word both have.
  for (const key of Object.keys(CANONICAL_ALIASES)) out[key] = CANONICAL_ALIASES[key];
  return out;
})();

// ─── Parts ──────────────────────────────────────────────────────────────────

const partWords = (part: TagPart, words: readonly string[]): Array<readonly [string, TagPart]> => words.map(w => [w, part] as const);

/**
 * Folded header -> part of the garment. The German "obermaterial" is listed as shell; the parser reads it as upper for shoes.
 * A header that is not here never inherits the part above it: it starts a group of its own with part 'other'.
 */
export const PART_WORDS: Record<string, TagPart> = table<TagPart>([
  ...partWords('shell', [
    'shell', 'outer shell', 'outer', 'main', 'main fabric', 'main material', 'main body', 'body', 'self', 'fabric', 'exterior', 'outside', 'shell fabric',
    'face', 'face fabric', 'outer fabric', 'composition', 'content', 'contents', 'fabric content', 'fibre content', 'fiber content',
    'fibre composition', 'fiber composition', 'material', 'materials', 'made of', 'made from', 'made with', 'contains', 'composed of', 'consists of',
    'coquille', 'exterieur', 'tissu principal', 'tissu', 'matiere principale', 'matiere', 'corps',
    'tejido principal', 'tejido', 'composicion', 'material principal', 'cuerpo',
    'obermaterial', 'oberstoff', 'aussenmaterial', 'aussenstoff', 'hauptmaterial', 'hauptstoff', 'zusammensetzung',
    'esterno', 'tessuto esterno', 'tessuto', 'composizione', 'materiale principale', 'materiale',
    'tecido principal', 'tecido', 'composicao',
    'buitenstof', 'hoofdmateriaal', 'samenstelling',
    'dis kumas', 'ana kumas', 'kumas', 'icerik', 'bilesim',
    '表地', '本体', '組成', '素材', '品質', '混用率', '成分', '面料', '材质', '材質',
  ]),
  ...partWords('lining', [
    'lining', 'linings', 'lining fabric', 'inner lining', 'inner', 'inside', 'interior', 'doublure', 'forro', 'forro interior',
    'futter', 'innenfutter', 'futterung', 'fodera', 'voering', 'astar', '裏地', '里料', '内衬', '內襯',
  ]),
  ...partWords('fill', [
    'fill', 'filling', 'fillings', 'fill material', 'down fill', 'padding', 'insulation', 'stuffing', 'wadding', 'batting',
    'garnissage', 'rembourrage', 'remplissage', 'ouate', 'relleno', 'fullung', 'fullmaterial', 'wattierung', 'imbottitura',
    'riempimento', 'enchimento', 'recheio', 'vulling', 'isolatie', 'dolgu', '詰め物', '中綿', '充填物', '填充物', '填充',
  ]),
  ...partWords('trim', [
    'trim', 'trims', 'trimming', 'trimmings', 'contrast', 'contrasts', 'contrast fabric', 'contrasting', 'garniture',
    'contraste', 'besatz', 'kontrast', 'guarnizione', 'contrasto', 'garnering', 'garni',
  ]),
  ...partWords('upper', [
    'upper', 'uppers', 'shoe upper', 'tige', 'dessus', 'capellada', 'parte superior', 'schaft', 'tomaia', 'cabedal',
    'bovenwerk', 'bovenmateriaal', 'ust', 'アッパー', '鞋面',
  ]),
  ...partWords('sole', [
    'sole', 'soles', 'outsole', 'outer sole', 'sole unit', 'semelle', 'semelle exterieure', 'suela', 'suela exterior',
    'sohle', 'laufsohle', 'aussensohle', 'suola', 'sola', 'sola exterior', 'zool', 'buitenzool', 'taban',
    '靴底', 'ソール', 'アウトソール', '鞋底',
  ]),
  ...partWords('hardware', [
    'hardware', 'metal hardware', 'metal parts', 'metalware', 'fittings', 'quincaillerie', 'ferrures', 'herrajes', 'herraje',
    'beschlage', 'metallteile', 'minuteria', 'ferragens', 'beslag',
  ]),
]);

/** Headers that start a new garment on a set tag ("Top", "Bottom"); two or more on one tag is a set. */
export const GARMENT_WORDS: readonly string[] = ['top', 'bottom', 'jacket', 'pants', 'trousers', 'skirt', 'shirt', 'dress', 'vest', 'shorts', 'haut', 'bas'];

/** Words of the fibre and part dictionaries, for the letter repair ("c0tton" -> "cotton"). */
export const DICTIONARY_WORDS: ReadonlySet<string> = (() => {
  const words = new Set<string>();
  for (const key of Object.keys(FIBER_SYNONYMS)) for (const w of key.split(' ')) words.add(w);
  for (const key of Object.keys(PART_WORDS)) for (const w of key.split(' ')) words.add(w);
  return words;
})();

// ─── Suggestions for the materials editor ───────────────────────────────────

/** Quick suggestions under the material name field. The first group is what the editor always offered; the rest were added with tag reading. */
export const MATERIAL_SUGGESTIONS: readonly string[] = [
  'cotton', 'polyester', 'wool', 'cashmere', 'merino', 'linen', 'silk',
  'leather', 'suede', 'nylon', 'spandex', 'elastane', 'viscose', 'rayon',
  'acrylic', 'denim', 'canvas', 'velvet', 'satin', 'fleece', 'rubber',
  'gold-plated', 'silver-plated', 'brass',
  'lyocell', 'modal', 'cupro', 'down', 'feathers', 'textile', 'synthetic', 'hemp',
];

// ─── Reading a printed fibre ────────────────────────────────────────────────

/**
 * The canonical fibre for a folded printed word or phrase ("baumwolle", "organic cotton", "vegan leather"), or undefined
 * when it is not one we know. One run of the six qualifier words in front is allowed and ignored; "vegan", "faux",
 * "synthetic" and "imitation" are never ignored, so "faux suede" is unknown rather than suede.
 */
export const resolveFibre = (printed: string): string | undefined => {
  if (typeof printed !== 'string') return undefined;
  let key = printed.trim().toLowerCase().replace(/\s+/g, ' ');
  const direct = lookup(FIBER_SYNONYMS, key);
  if (direct) return direct;
  for (let i = 0; i < 3; i++) {
    const stripped = key.replace(/^(organic|recycled|regenerated|virgin|egyptian|supima) /, '');
    if (stripped === key) break;
    key = stripped;
    const hit = lookup(FIBER_SYNONYMS, key);
    if (hit) return hit;
  }
  return undefined;
};
