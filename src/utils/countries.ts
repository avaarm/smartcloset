/**
 * Country of origin as printed on a tag ("Made in Viet Nam", "Hecho en Peru", "中国") to one English name.
 * Production countries only, with the spellings tags actually use.
 */
import { foldText } from './textFold';

/** The canonical English names, every country a garment is likely to be made in. */
export const COUNTRY_NAMES: readonly string[] = [
  'Afghanistan', 'Albania', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Bolivia',
  'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Cambodia', 'Canada', 'Chile', 'China', 'Colombia', 'Costa Rica', 'Croatia', 'Czech Republic',
  'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Eswatini', 'Ethiopia', 'Finland', 'France', 'Georgia',
  'Germany', 'Greece', 'Guatemala', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kenya', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lesotho', 'Lithuania', 'Macau', 'Madagascar', 'Malaysia', 'Mauritius',
  'Mexico', 'Moldova', 'Mongolia', 'Morocco', 'Myanmar', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'North Macedonia', 'Norway',
  'Pakistan', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Romania', 'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'South Africa',
  'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Tanzania', 'Thailand', 'Tunisia', 'Turkey', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vietnam',
];

/** Folded spelling -> English name, for everything that is not simply the English name folded. */
const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  // English variants and abbreviations
  ['viet nam', 'Vietnam'], ['socialist republic of vietnam', 'Vietnam'],
  ['prc', 'China'], ['p.r.c.', 'China'], ['p.r.c', 'China'], ['peoples republic of china', 'China'], ["people's republic of china", 'China'], ['mainland china', 'China'],
  ['turkiye', 'Turkey'], ['republic of turkey', 'Turkey'],
  ['usa', 'United States'], ['u.s.a.', 'United States'], ['u.s.a', 'United States'], ['us', 'United States'], ['u.s.', 'United States'],
  ['united states of america', 'United States'], ['the united states', 'United States'], ['america', 'United States'],
  ['burma', 'Myanmar'],
  ['korea', 'South Korea'], ['republic of korea', 'South Korea'], ['rok', 'South Korea'], ['s. korea', 'South Korea'], ['south-korea', 'South Korea'],
  ['uk', 'United Kingdom'], ['u.k.', 'United Kingdom'], ['great britain', 'United Kingdom'], ['england', 'United Kingdom'], ['britain', 'United Kingdom'], ['scotland', 'United Kingdom'],
  ['uae', 'United Arab Emirates'], ['u.a.e.', 'United Arab Emirates'],
  ['holland', 'Netherlands'], ['the netherlands', 'Netherlands'],
  ['czechia', 'Czech Republic'], ['czech', 'Czech Republic'],
  ['macedonia', 'North Macedonia'], ['swaziland', 'Eswatini'], ['lao pdr', 'Laos'], ['lao', 'Laos'], ['kampuchea', 'Cambodia'],
  ['sri-lanka', 'Sri Lanka'], ['srilanka', 'Sri Lanka'], ['hongkong', 'Hong Kong'], ['hong kong sar', 'Hong Kong'], ['r.o.c.', 'Taiwan'], ['taiwan roc', 'Taiwan'], ['taiwan r.o.c.', 'Taiwan'],
  ['elsalvador', 'El Salvador'], ['dominican rep', 'Dominican Republic'], ['bosnia', 'Bosnia and Herzegovina'],
  ['republic of moldova', 'Moldova'], ['russia', 'Russia'],
  // French
  ['chine', 'China'], ['inde', 'India'], ['italie', 'Italy'], ['turquie', 'Turkey'], ['allemagne', 'Germany'], ['roumanie', 'Romania'], ['maroc', 'Morocco'],
  ['tunisie', 'Tunisia'], ['egypte', 'Egypt'], ['cambodge', 'Cambodia'], ['birmanie', 'Myanmar'], ['indonesie', 'Indonesia'], ['bangladesh', 'Bangladesh'],
  ['etats-unis', 'United States'], ['etats unis', 'United States'], ['royaume-uni', 'United Kingdom'], ['royaume uni', 'United Kingdom'], ['espagne', 'Spain'],
  ['pologne', 'Poland'], ['hongrie', 'Hungary'], ['bulgarie', 'Bulgaria'], ['coree du sud', 'South Korea'], ['pays-bas', 'Netherlands'], ['suisse', 'Switzerland'],
  ['thailande', 'Thailand'], ['philippines', 'Philippines'], ['pakistan', 'Pakistan'], ['jordanie', 'Jordan'], ['maurice', 'Mauritius'], ['grece', 'Greece'],
  // Spanish and Portuguese
  ['espana', 'Spain'], ['marruecos', 'Morocco'], ['turquia', 'Turkey'], ['camboya', 'Cambodia'], ['alemania', 'Germany'], ['italia', 'Italy'], ['rumania', 'Romania'],
  ['tailandia', 'Thailand'], ['filipinas', 'Philippines'], ['estados unidos', 'United States'], ['reino unido', 'United Kingdom'], ['marrocos', 'Morocco'],
  ['camboja', 'Cambodia'], ['alemanha', 'Germany'], ['romenia', 'Romania'], ['tailandia', 'Thailand'], ['egipto', 'Egypt'], ['paquistan', 'Pakistan'], ['grecia', 'Greece'],
  ['peru', 'Peru'], ['brasil', 'Brazil'], ['mexico', 'Mexico'], ['polonia', 'Poland'], ['hungria', 'Hungary'], ['bulgaria', 'Bulgaria'], ['coreia do sul', 'South Korea'],
  ['corea del sur', 'South Korea'], ['paises bajos', 'Netherlands'], ['suiza', 'Switzerland'], ['suica', 'Switzerland'], ['sri lanka', 'Sri Lanka'],
  // German
  ['bangladesch', 'Bangladesh'], ['indien', 'India'], ['turkei', 'Turkey'], ['indonesien', 'Indonesia'], ['kambodscha', 'Cambodia'], ['rumanien', 'Romania'],
  ['tunesien', 'Tunisia'], ['agypten', 'Egypt'], ['italien', 'Italy'], ['polen', 'Poland'], ['ungarn', 'Hungary'], ['spanien', 'Spain'], ['marokko', 'Morocco'],
  ['deutschland', 'Germany'], ['frankreich', 'France'], ['osterreich', 'Austria'], ['schweiz', 'Switzerland'], ['niederlande', 'Netherlands'], ['vereinigte staaten', 'United States'],
  ['vietnam', 'Vietnam'], ['thailand', 'Thailand'], ['sudkorea', 'South Korea'], ['griechenland', 'Greece'], ['bulgarien', 'Bulgaria'], ['mazedonien', 'North Macedonia'],
  // Italian
  ['cina', 'China'], ['turchia', 'Turkey'], ['egitto', 'Egypt'], ['marocco', 'Morocco'], ['tunisia', 'Tunisia'], ['romania', 'Romania'], ['germania', 'Germany'],
  ['francia', 'France'], ['spagna', 'Spain'], ['polonia', 'Poland'], ['grecia', 'Greece'], ['cambogia', 'Cambodia'], ['tailandia', 'Thailand'], ['filippine', 'Philippines'],
  ['stati uniti', 'United States'], ['regno unito', 'United Kingdom'], ['svizzera', 'Switzerland'], ['paesi bassi', 'Netherlands'],
  // Dutch
  ['turkije', 'Turkey'], ['roemenie', 'Romania'], ['egypte', 'Egypt'], ['marokko', 'Morocco'], ['duitsland', 'Germany'], ['frankrijk', 'France'], ['spanje', 'Spain'],
  ['polen', 'Poland'], ['griekenland', 'Greece'], ['italie', 'Italy'], ['verenigde staten', 'United States'], ['verenigd koninkrijk', 'United Kingdom'], ['zwitserland', 'Switzerland'],
  // Turkish
  ['cin', 'China'], ['hindistan', 'India'], ['bangladesh', 'Bangladesh'], ['misir', 'Egypt'], ['kambocya', 'Cambodia'], ['italya', 'Italy'], ['almanya', 'Germany'],
  ['romanya', 'Romania'], ['fas', 'Morocco'], ['endonezya', 'Indonesia'], ['tayland', 'Thailand'], ['pakistan', 'Pakistan'], ['bulgaristan', 'Bulgaria'], ['portekiz', 'Portugal'],
  ['ispanya', 'Spain'], ['amerika birlesik devletleri', 'United States'], ['abd', 'United States'], ['yunanistan', 'Greece'], ['polonya', 'Poland'], ['macaristan', 'Hungary'],
  // Japanese and Chinese
  ['中国', 'China'], ['中國', 'China'], ['日本', 'Japan'], ['ベトナム', 'Vietnam'], ['越南', 'Vietnam'], ['インドネシア', 'Indonesia'], ['印度尼西亚', 'Indonesia'],
  ['バングラデシュ', 'Bangladesh'], ['孟加拉', 'Bangladesh'], ['カンボジア', 'Cambodia'], ['柬埔寨', 'Cambodia'], ['タイ', 'Thailand'], ['泰国', 'Thailand'], ['インド', 'India'],
  ['印度', 'India'], ['トルコ', 'Turkey'], ['土耳其', 'Turkey'], ['韓国', 'South Korea'], ['韩国', 'South Korea'], ['台湾', 'Taiwan'], ['台灣', 'Taiwan'],
  ['ミャンマー', 'Myanmar'], ['缅甸', 'Myanmar'], ['イタリア', 'Italy'], ['意大利', 'Italy'], ['ポルトガル', 'Portugal'], ['葡萄牙', 'Portugal'], ['フランス', 'France'],
  ['法国', 'France'], ['アメリカ', 'United States'], ['美国', 'United States'], ['ルーマニア', 'Romania'], ['ブルガリア', 'Bulgaria'], ['ペルー', 'Peru'], ['メキシコ', 'Mexico'],
  ['フィリピン', 'Philippines'], ['菲律宾', 'Philippines'], ['スリランカ', 'Sri Lanka'], ['マレーシア', 'Malaysia'], ['马来西亚', 'Malaysia'], ['パキスタン', 'Pakistan'],
  ['エジプト', 'Egypt'], ['モロッコ', 'Morocco'], ['スペイン', 'Spain'], ['ドイツ', 'Germany'], ['イギリス', 'United Kingdom'], ['ラオス', 'Laos'], ['香港', 'Hong Kong'],
];

const BY_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = Object.create(null);
  for (const name of COUNTRY_NAMES) out[foldText(name)] = name;
  for (const [key, name] of SYNONYMS) out[foldText(key)] = name;
  out.russia = 'Russia';
  return out;
})();

/** A key to look a printed country up by: folded, "the" dropped, dots and extra spaces removed. */
const countryKey = (raw: string): string =>
  foldText(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/[.,;:()]+$/g, '')
    .trim();

const titleCase = (s: string): string =>
  s
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const find = (raw: string): string | undefined => {
  const key = countryKey(raw);
  if (!key) return undefined;
  const direct = Object.prototype.hasOwnProperty.call(BY_KEY, key) ? BY_KEY[key] : undefined;
  if (direct) return direct;
  // "u.s.a." and "p.r.c." with or without their dots
  const dotless = key.replace(/\./g, '');
  return Object.prototype.hasOwnProperty.call(BY_KEY, dotless) ? BY_KEY[dotless] : undefined;
};

/**
 * One English name for a printed country. A name that is not a production country we know is kept as printed
 * (capitalised) with known false, so the person can still see and keep it.
 */
export const normalizeCountry = (raw: string): { country: string; known: boolean } => {
  const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  const hit = find(text);
  if (hit) return { country: hit, known: true };
  return { country: titleCase(text.toLowerCase()).slice(0, 60), known: false };
};

/**
 * The longest run of words, from the start, that is a known country ("united states of america ..."), or null.
 * `words` are already folded. Used by the tag parser after "made in".
 */
export const matchCountryPrefix = (words: readonly string[]): { country: string; used: number } | null => {
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    const hit = find(words.slice(0, n).join(' '));
    if (hit) return { country: hit, used: n };
  }
  return null;
};
