/**
 * Text folding for tag reading. Printed labels come back from OCR in every case, with accents, fullwidth
 * digits and trademark signs; the parser and the grounding check both compare against this folded form.
 *
 * Folds by an explicit table rather than String.normalize, so it behaves the same on every JS engine
 * (Hermes does not ship the Unicode normalisation tables on every platform).
 */

/** Letter groups and the plain letter each folds to. */
const FOLD_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['àáâãäåāăą', 'a'], ['çćč', 'c'], ['ďđð', 'd'], ['èéêëēėęě', 'e'], ['ğ', 'g'], ['ìíîïīįı', 'i'], ['ł', 'l'],
  ['ñńň', 'n'], ['òóôõöøōő', 'o'], ['ŕř', 'r'], ['śšşș', 's'], ['ťţț', 't'], ['ùúûüūůűų', 'u'], ['ýÿ', 'y'], ['źżž', 'z'],
];
const FOLD: Record<string, string> = {};
for (const [letters, base] of FOLD_GROUPS) for (const ch of Array.from(letters)) FOLD[ch] = base;
FOLD['ß'] = 'ss';
FOLD['æ'] = 'ae';
FOLD['œ'] = 'oe';
FOLD['þ'] = 'th';

/** Fullwidth ASCII (U+FF01 to U+FF5E) sits 0xFEE0 above the plain character. */
const FULLWIDTH_START = 0xff01;
const FULLWIDTH_END = 0xff5e;
const FULLWIDTH_OFFSET = 0xfee0;

/**
 * Accents to ASCII by table, lowercase, fullwidth letters, digits and percent to ASCII, trademark signs removed,
 * typographic apostrophes to '. Newlines are kept. Letters of other scripts (Japanese, Chinese, Cyrillic) stay as they are.
 */
export const foldText = (s: string): string => {
  if (typeof s !== 'string' || s === '') return '';
  let out = '';
  for (const original of Array.from(s)) {
    let ch = original;
    const code = ch.charCodeAt(0);
    if (code >= FULLWIDTH_START && code <= FULLWIDTH_END) ch = String.fromCharCode(code - FULLWIDTH_OFFSET);
    // Dotted capital I lowercases to two characters in JavaScript; read it as a plain i.
    if (ch === 'İ') ch = 'i';
    ch = ch.toLowerCase();
    if (ch === '٪' || ch === '﹪') ch = '%';
    else if (ch === '™' || ch === '®' || ch === '©' || ch === '℠') continue;
    else if (ch === '’' || ch === '‘' || ch === 'ʼ' || ch === '´' || ch === '`') ch = "'";
    else if (code === 0x3000 || code === 0xa0 || (code >= 0x2000 && code <= 0x200a) || code === 0x202f || code === 0x205f) ch = ' ';
    else if (code === 0xad || (code >= 0x200b && code <= 0x200f) || code === 0xfeff) continue;
    else if (code >= 0x0300 && code <= 0x036f) continue; // a combining accent left over from decomposed input
    out += FOLD[ch] ?? ch;
  }
  return out;
};

/**
 * The text the parser reads: folded, a decimal comma between digits made a point ("97,5%" is "97.5%"),
 * runs of spaces collapsed, split into lines, each trimmed, empty lines dropped.
 */
export const normalizeLines = (s: string): string[] => {
  const folded = foldText(s).replace(/(\d),(\d)/g, '$1.$2');
  return folded
    .split(/\r\n|[\r\n\u2028\u2029]/)
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(line => line !== '');
};

/** normalizeLines joined back with newlines: what a value must be found in to count as "printed". */
export const normalizeText = (s: string): string => normalizeLines(s).join('\n');
