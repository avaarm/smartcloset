/**
 * Reads the text of a clothing tag (as returned by OCR) into fabric groups, care, origin, size and a brand suggestion.
 *
 * Deterministic and local: no network, no model, nothing is stored. A field is only ever shown as Read (verified)
 * when the design's rules all hold (tagGrounding.buildGroup); anything the parser had to guess, repair or
 * could not line up is Check, and the person confirms it in the review sheet. Recall misses cost one manual entry;
 * a wrong Read teaches people to stop checking, so every choice below errs towards Check.
 */
import type { FieldStatus, TagFibre, TagFlag, TagGroup, TagOcr, TagPart, TagRead } from '../types/tag';
import { brandFromText } from './brandNames';
import { CARE_PHRASES, CARE_WORDS, analyzeCareLine, looksLikeCare, matchCareLine } from './careNames';
import { matchCountryPrefix, normalizeCountry } from './countries';
import {
  CANONICAL_ALIASES,
  CHANGER_WORDS,
  DICTIONARY_WORDS,
  FIBER_SYNONYMS,
  GARMENT_WORDS,
  PART_WORDS,
  RECORDED_QUALIFIERS,
  STRIPPED_QUALIFIERS,
  lookup,
} from './materialNames';
import type { GroupDraft } from './tagGrounding';
import { ISSUE, MAX_FIBRES, applyReadRules, buildGroup, isFibreGrounded } from './tagGrounding';
import { extractIds, sanitizeTranscription } from './tagTranscription';
import { foldText, normalizeLines } from './textFold';

const MAX_INPUT_CHARS = 8000; // three photos of a tag come to a few hundred characters; the cap only stops hostile input
/** Stands for a line that is not composition; it matches no gap between a percentage and a fibre. */
const BARRIER = '§';
const MIN_ALNUM_CHARS = 2;
const LOW_CONFIDENCE = 0.6;

// ─── Small helpers ──────────────────────────────────────────────────────────

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isLatinWord = (s: string): boolean => /^[a-z' ]+$/.test(s);
const isLetter = (ch: string | undefined): boolean => ch !== undefined && ch >= 'a' && ch <= 'z';
const clip = (s: string, n: number): string => s.slice(0, n);
const hasPercentSign = (s: string): boolean => s.indexOf('%') !== -1;

/** Words that are never an unknown fibre, however they follow a number. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'from', 'only', 'all', 'new', 'other', 'exclusive',
  'excluding', 'except', 'not', 'no', 'page', 'style', 'made', 'imported', 'import', 'blend', 'mix', 'fiber', 'fibre', 'fibers', 'fibres',
  'yarn', 'knit', 'woven', 'total', 'approx', 'about', 'size', 'item', 'lot', 'et', 'ou', 'de', 'du', 'des', 'la', 'le', 'les', 'y', 'o',
  'und', 'oder', 'mit', 'avec', 'sans', 'sin', 'con', 'per', 'da', 'di', 'del', 'van', 'het', 'een', 've', 'ile', 'pour', 'para', 'fur',
]);

const REPAIR_WORDS: ReadonlySet<string> = new Set([...Array.from(DICTIONARY_WORDS), ...Array.from(CARE_WORDS)]);
const REPAIR_PREFIX_WORDS: string[] = Array.from(REPAIR_WORDS).filter(w => w.length >= 5);

// ─── Lines ──────────────────────────────────────────────────────────────────

interface Line {
  /** The line as printed (trimmed), for the brand check, which needs accents. */
  raw: string;
  /** Folded text before any repair: what a value must be found in to count as printed. */
  original: string;
  /** Folded text after the digit and letter repairs. */
  text: string;
  repaired: boolean;
  photo: number;
}

/** O, Q to 0 and l, I, | to 1 next to a percent sign when the rest is digits ("1OO%", "6O%"). Folded text, so lowercase. */
const repairDigits = (input: string): { text: string; changed: boolean } => {
  let text = input;
  let changed = false;
  for (let pass = 0; pass < 6; pass++) {
    const after = text
      .replace(/(^|[^a-z0-9|])([0-9oqli|]+(?:\.[0-9oqli|]+)?)(?= ?%)/g, (m: string, pre: string, run: string) =>
        /[0-9]/.test(run) ? pre + run.replace(/[oq]/g, '0').replace(/[li|]/g, '1') : m,
      )
      .replace(/(%\s?)([0-9oqli|]+)(?![a-z0-9|])/g, (m: string, pre: string, run: string) =>
        /[0-9]/.test(run) ? pre + run.replace(/[oq]/g, '0').replace(/[li|]/g, '1') : m,
      );
    if (after === text) break;
    text = after;
    changed = true;
  }
  return { text, changed };
};

/** 0, 1, 5 to o, l, s in a word of four or more characters, kept only when the result is exactly a dictionary word ("c0tt0n"). */
const repairLetters = (input: string): { text: string; changed: boolean } => {
  let changed = false;
  const text = input.replace(/[a-z0-9]{4,}/g, word => {
    if (!/[015]/.test(word) || !/[a-z]/.test(word)) return word;
    const fixed = word.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's');
    if (REPAIR_WORDS.has(fixed)) {
      changed = true;
      return fixed;
    }
    return word;
  });
  return { text, changed };
};

/** Splits the input into photos (separator lines of three or more dashes) and prepares each line. */
const prepareLines = (input: string): { lines: Line[]; photos: number } => {
  const lines: Line[] = [];
  let photo = 0;
  let sawContent = false;
  for (const rawLine of input.split(/\r\n|[\r\n\u2028\u2029]/)) {
    const raw = rawLine.replace(/[ \t\f\v]+/g, ' ').trim();
    if (/^-{3,}$/.test(raw) || /^[—–_=]{3,}$/.test(raw)) {
      if (sawContent) photo += 1;
      sawContent = false;
      continue;
    }
    const folded = normalizeLines(raw);
    if (folded.length === 0) continue;
    const original = folded.join(' ');
    const d = repairDigits(original);
    const l = repairLetters(d.text);
    lines.push({ raw, original, text: l.text, repaired: d.changed || l.changed, photo });
    sawContent = true;
  }
  const photos = lines.length === 0 ? 0 : lines[lines.length - 1].photo + 1;
  return { lines, photos };
};

// ─── Line kinds ─────────────────────────────────────────────────────────────

const NOISE_PATTERNS: RegExp[] = [
  /silk screen/, /screen print/, /wool cycle/, /linen finish/, /\bprop(?:osition)?\.? ?65\b/, /flammab/, /\bimported by\b/, /\bdistributed by\b/,
  /\bmanufactured for\b/, /\bmade for\b/, /\bdo not remove\b/, /\bunder penalty of law\b/, /\bcan expose you to\b/, /\bknown to the state of california\b/,
];

const isNoiseLine = (text: string): boolean => {
  if (NOISE_PATTERNS.some(re => re.test(text))) return true;
  if (/\d{8,}/.test(text)) return true;
  if (/^[\d\s-]+$/.test(text) && (text.match(/\d/g) ?? []).length >= 8) return true; // a barcode printed in groups
  if (/@|https?:|www\.|\.(?:com|net|org)\b/.test(text)) return true;
  return false;
};

const ORIGIN_PHRASES =
  '(?:made in|manufactured in|product of|produced in|fabrique (?:en|au|aux)|hecho en|fabricado en|hergestellt in|fabbricato in|feito em|gemaakt in)';
const ORIGIN_LINE = new RegExp(`\\b${ORIGIN_PHRASES}\\b|製造|原産国`);

const SIZE_KEYWORD = /^(?:size|sz|taille|talla|grosse|tg|tamanho|maat|beden)\b ?/;
const SIZE_LETTER = /^(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|os|petite|regular)$/;
const SIZE_NUMBER = /^\d{1,3}(?:\.5)?$/;

/** A size line: an optional size keyword and then only size tokens. Null when the line is anything else. */
const parseSizeLine = (text: string): { keyword: boolean; tokens: string[] } | null => {
  let t = text.replace(/[:/,;|]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  let keyword = false;
  for (let guard = 0; guard < 4; guard++) {
    const m = SIZE_KEYWORD.exec(t);
    if (!m) break;
    keyword = true;
    t = t.slice(m[0].length).trim();
  }
  if (!t) return null;
  const words = t.split(' ');
  const tokens: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^(?:eu|us|uk|it|fr|de)$/.test(w) && i + 1 < words.length && /^\d{1,2}(?:\.5)?$/.test(words[i + 1])) {
      tokens.push(`${w.toUpperCase()} ${words[i + 1]}`);
      i += 1;
    } else if (w === 'one' && words[i + 1] === 'size') {
      tokens.push('One size');
      i += 1;
    } else if (SIZE_LETTER.test(w)) {
      tokens.push(w === 'petite' || w === 'regular' ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase());
    } else if (SIZE_NUMBER.test(w) && (keyword || words.length === 1)) {
      tokens.push(w);
    } else {
      return null;
    }
  }
  return tokens.length > 0 ? { keyword, tokens } : null;
};

const isStructural = (text: string): boolean => {
  if (hasPercentSign(text)) return false;
  if (ORIGIN_LINE.test(text)) return true;
  if (looksLikeCare(text) || matchCareLine(text).length > 0) return true;
  return parseSizeLine(text) !== null;
};

const stripIds = (text: string): string => text.replace(/\b(?:rn|ca|wpl) ?#?:? ?\d{4,8}\b/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Fibre words in a piece of text ─────────────────────────────────────────

const FIBRE_BY_FIRST: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const phrase of Object.keys(FIBER_SYNONYMS).sort((a, b) => b.length - a.length)) {
    const first = phrase.charAt(0);
    const list = map.get(first);
    if (list) list.push(phrase);
    else map.set(first, [phrase]);
  }
  return map;
})();

interface FibTok {
  kind: 'fib';
  start: number;
  end: number;
  phrase: string;
  fibre: string;
  printed: string;
  qualifier: 'organic' | 'recycled' | null;
  unknown: boolean;
  issues: string[];
}
interface NumTok {
  kind: 'num';
  start: number;
  end: number;
  value: number;
  form: 'post' | 'pre' | 'bare';
  /** Printed with a leading zero ("05%", "055%"): usually a stray character, so never trusted as Read. */
  padded: boolean;
}
type Tok = FibTok | NumTok;

const TWO_QUALIFIERS = 'Check the fibre name';

/** Known fibre phrases, longest first, as whole words, with the qualifier and changer words in front dealt with. */
const scanFibres = (text: string): FibTok[] => {
  const raw: FibTok[] = [];
  let i = 0;
  while (i < text.length) {
    const candidates = FIBRE_BY_FIRST.get(text.charAt(i));
    let matched: string | null = null;
    if (candidates) {
      for (const phrase of candidates) {
        if (!text.startsWith(phrase, i)) continue;
        const end = i + phrase.length;
        if (isLatinWord(phrase) && !wholeWord(text, i, end)) continue;
        matched = phrase;
        break;
      }
    }
    if (matched) {
      raw.push({
        kind: 'fib', start: i, end: i + matched.length, phrase: matched, fibre: FIBER_SYNONYMS[matched], printed: matched,
        qualifier: null, unknown: false, issues: [],
      });
      i += matched.length;
    } else {
      i += 1;
    }
  }

  const out: FibTok[] = [];
  for (const tok of raw) {
    // "synthetic" is a fibre of its own and also a word that changes the next one ("synthetic suede").
    const prev = out[out.length - 1];
    const gapOk = prev && /^\s*$/.test(text.slice(prev.end, tok.start));
    if (prev && gapOk && !prev.unknown && (CHANGER_WORDS as readonly string[]).includes(prev.phrase) && prev.fibre !== tok.fibre) {
      out.pop();
      out.push({ ...tok, start: prev.start, fibre: `${prev.phrase} ${tok.phrase}`, printed: `${prev.phrase} ${tok.phrase}`, unknown: true });
      continue;
    }
    out.push(tok);
  }

  for (const tok of out) {
    const qualifiers: string[] = [];
    const changers: string[] = [];
    let start = tok.start;
    for (let guard = 0; guard < 4; guard++) {
      const m = /([a-z]+)\s*$/.exec(text.slice(0, start));
      if (!m) break;
      const w = m[1];
      if ((STRIPPED_QUALIFIERS as readonly string[]).includes(w)) qualifiers.unshift(w);
      else if ((CHANGER_WORDS as readonly string[]).includes(w)) changers.unshift(w);
      else break;
      start = m.index;
    }
    tok.start = Math.min(tok.start, start);
    const recorded = qualifiers.filter(q => (RECORDED_QUALIFIERS as readonly string[]).includes(q));
    if (new Set(recorded).size > 1) {
      tok.issues.push(TWO_QUALIFIERS);
    } else if (recorded.length > 0) {
      tok.qualifier = recorded[0] as 'organic' | 'recycled';
    }
    if (changers.length > 0) {
      const phrase = `${changers.join(' ')} ${tok.printed}`;
      tok.fibre = phrase;
      tok.printed = phrase;
      tok.unknown = true;
    }
  }
  return out;
};

/**
 * A fibre word is a whole word: not inside a longer word, not touching a digit that is not the start of a percentage
 * ("elastan3e" is garbled, "cotton60%" is not), and not the front half of a word split across lines ("poly-" and "amide").
 */
const wholeWord = (text: string, start: number, end: number): boolean => {
  const before = text.charAt(start - 1);
  const after = text.charAt(end);
  if (isLetter(before) || (before >= '0' && before <= '9')) return false;
  if (isLetter(after)) return false;
  if (after >= '0' && after <= '9' && !/^\d{1,3}(?:\.\d)? ?%/.test(text.slice(end))) return false;
  if (after === '-' && (text.charAt(end + 1) === ' ' || text.charAt(end + 1) === '')) return false;
  return true;
};

const hasNumberAndFibre = (text: string): boolean => /\d/.test(text) && scanFibres(text).length > 0;

/** Percentages. The form is decided for the whole piece of text: "60%" (post), "%60" (pre) or, only if neither is present, bare numbers. */
const isPadded = (printed: string): boolean => /^0\d/.test(printed);

const scanNumbers = (text: string): NumTok[] => {
  const out: NumTok[] = [];
  const post = /(^|[^\d.])(\d{1,3}(?:\.\d)?) ?%/g;
  let m: RegExpExecArray | null;
  while ((m = post.exec(text)) !== null) {
    const start = m.index + m[1].length;
    out.push({ kind: 'num', start, end: m.index + m[0].length, value: parseFloat(m[2]), form: 'post', padded: isPadded(m[2]) });
    post.lastIndex = m.index + m[0].length - 1; // the percent sign may be the character before the next number
  }
  if (out.length > 0) return out;
  const pre = /%\s?(\d{1,3}(?:\.\d)?)(?!\d|\.\d)/g;
  while ((m = pre.exec(text)) !== null) {
    out.push({ kind: 'num', start: m.index, end: m.index + m[0].length, value: parseFloat(m[1]), form: 'pre', padded: isPadded(m[1]) });
  }
  if (out.length > 0) return out;
  const bare = /(^|[\s(:/,])(\d{1,3}(?:\.\d)?)(?!\d|\.\d|%| %)/g;
  while ((m = bare.exec(text)) !== null) {
    const start = m.index + m[1].length;
    out.push({ kind: 'num', start, end: start + m[2].length, value: parseFloat(m[2]), form: 'bare', padded: isPadded(m[2]) });
    bare.lastIndex = start + m[2].length;
  }
  return out;
};

const separatorGap = (text: string, from: number, to: number): boolean => to >= from && /^[\s\-/,·•|]*$/.test(text.slice(from, to));
/** Between a percentage and the fibre it belongs to: only space (and an opening bracket). A stray letter or digit means the two are not a pair. */
const gapNumToFib = (text: string, from: number, to: number): boolean => to >= from && /^[\s(]*$/.test(text.slice(from, to));
/** Between a fibre and its percentage ("cotton 60%", "cotton: 60%", "cotton (60%)"). */
const gapFibToNum = (text: string, from: number, to: number): boolean => to >= from && /^[\s(:]*$/.test(text.slice(from, to));

const isUnknownCandidate = (word: string): boolean =>
  word.length >= 3 && !STOP_WORDS.has(word) && !REPAIR_WORDS.has(word) && !(STRIPPED_QUALIFIERS as readonly string[]).includes(word);

// ─── Headers and segments ───────────────────────────────────────────────────

const HEADER_KEYS = Object.keys(PART_WORDS);
const LATIN_HEADERS = HEADER_KEYS.filter(isLatinWord).sort((a, b) => b.length - a.length);
const CJK_HEADERS = HEADER_KEYS.filter(k => !isLatinWord(k)).sort((a, b) => b.length - a.length);
const HEADER_ALT = LATIN_HEADERS.map(escapeRe).join('|');
const HEADER_CHAIN = `(?:${HEADER_ALT})(?:\\s*[/\\-]\\s*(?:${HEADER_ALT}))*`;
// A header starts a new part in the middle of a line when a colon follows it, or a percentage ("lining 100% polyester").
const HEADER_AFTER_SPACE = new RegExp(`(^|[\\s;,])(${HEADER_CHAIN})(?:\\s*:|\\s+(?=\\d{1,3}(?:\\.\\d)?\\s?%|%\\s?\\d))`, 'g');
const HEADER_BEFORE_NUMBER = new RegExp(`^(${HEADER_CHAIN})\\s+(?=[\\d%])`);

interface Header {
  part: TagPart;
  label: string | null;
  known: boolean;
}

const resolvePart = (key: string, category: string | undefined): TagPart | undefined => {
  if (key === 'obermaterial' && category === 'shoes') return 'upper';
  return lookup(PART_WORDS, key);
};

/** "shell", "shell/coquille", "main fabric - tissu principal": every element a known header word, all for the same part. */
const knownHeader = (prefix: string, category: string | undefined): Header | null => {
  const clean = prefix.replace(/^[\s([]+|[\s)\]]+$/g, '');
  if (!clean || clean.length > 40) return null;
  let part: TagPart | undefined;
  for (const element of clean.split(/\s*[/-]\s*/)) {
    const p = resolvePart(element.trim(), category);
    if (!p) return null;
    if (part && part !== p) return { part: 'other', label: clip(clean, 30), known: false };
    part = p;
  }
  return part ? { part, label: clip(clean, 30), known: true } : null;
};

const garmentHeader = (label: string | null): boolean => (label ?? '').split(/[\s/-]+/).some(w => (GARMENT_WORDS as readonly string[]).includes(w));

interface Segment {
  header: Header | null;
  lines: string[];
  repaired: boolean;
  photo: number;
}

/** Words that join two clauses; the only words, besides fibres, a header can follow without those words being part of it. */
const CLAUSE_JOINERS: ReadonlySet<string> = new Set(['and', 'et', 'und', 'y', 'e', 'ou', 'or', 'oder']);

/**
 * Where the header that has a known header word at `at` really starts: words in front of it that are neither a fibre nor a
 * joiner belong to the header ("pocket lining", "outer shell excluding trim"), so the cut moves back over them. A header that
 * is not made of known words is then an unknown part, never the part its last word names.
 */
const headerStart = (text: string, at: number): number => {
  let i = at;
  for (;;) {
    let end = i;
    while (end > 0 && /\s/.test(text.charAt(end - 1))) end -= 1;
    let begin = end;
    while (begin > 0 && /[a-z']/.test(text.charAt(begin - 1))) begin -= 1;
    const word = text.slice(begin, end);
    if (word === '' || scanFibres(word).length > 0 || CLAUSE_JOINERS.has(word)) return i;
    i = begin;
  }
};

/** Cuts a line where a known header followed by a colon starts in the middle of it ("shell: 100% nylon lining: 100% polyester"). */
const splitInlineHeaders = (text: string): string[] => {
  const found = new Set<number>();
  const re = new RegExp(HEADER_AFTER_SPACE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = headerStart(text, m.index + m[1].length);
    if (start > 0) found.add(start);
    re.lastIndex = m.index + m[0].length;
  }
  // A word and a colon in front of a percentage is a header too, known or not ("Sleeves: 100% polyester"), unless the word is a fibre
  // ("cotton: 60% polyester: 40%").
  const unknown = /(^|\s)([^\s:%]{2,24}):\s*(?=\d{1,3}(?:\.\d)?\s?%)/g;
  while ((m = unknown.exec(text)) !== null) {
    if (scanFibres(m[2]).length > 0) continue;
    const start = headerStart(text, m.index + m[1].length);
    if (start > 0) found.add(start);
  }
  const cuts = Array.from(found).sort((a, b) => a - b);
  if (cuts.length === 0) return [text];
  const pieces: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    pieces.push(text.slice(from, cut));
    from = cut;
  }
  pieces.push(text.slice(from));
  return pieces.map(p => p.trim()).filter(Boolean);
};

/** What cannot be a header: text with a fibre, care, origin, size or noise in it, or no letter at all. */
const notStructure = (text: string): boolean =>
  /[a-z]/.test(text) && !text.includes(BARRIER) && scanFibres(text).length === 0 && !looksLikeCare(text) &&
  !ORIGIN_LINE.test(text) && parseSizeLine(text) === null && !isNoiseLine(text);

/** A short line of letters and spaces (the unknown header of the design: "Sleeves"). */
const looksLikeUnknownHeaderText = (text: string, maxLength: number): boolean =>
  text.length > 0 && text.length <= maxLength && /^[a-z][a-z '/-]*$/.test(text) && notStructure(text);

/**
 * The text before a colon, or before the first percentage, when it is short and has no fibre, care, origin, size keyword or noise
 * in it, even if OCR garbled it ("l1ning", "she|l"). With `fragment`, a size such as "l" is allowed: before a colon and a
 * composition it is the end of a header split by a line break, not a size.
 */
const looksLikeGarbledHeader = (text: string, fragment = false): boolean =>
  text.length > 0 && text.length <= 30 && /[a-z]/.test(text) && !text.includes(BARRIER) && scanFibres(text).length === 0 && !looksLikeCare(text) &&
  !ORIGIN_LINE.test(text) && !SIZE_KEYWORD.test(text) && (fragment || parseSizeLine(text) === null) && !isNoiseLine(text);

/**
 * Decides whether a piece of text starts a new part. Returns the header and what follows it on the same line.
 * An unknown header never inherits the part above it.
 */
const detectHeader = (
  piece: string,
  line: Line,
  nextPiece: string | undefined,
  category: string | undefined,
): { header: Header; rest: string } | null => {
  // (a) known header words, then a colon
  const colon = piece.indexOf(':');
  if (colon >= 0) {
    const prefix = piece.slice(0, colon).trim();
    const known = prefix ? knownHeader(prefix, category) : null;
    if (known) return { header: known, rest: piece.slice(colon + 1).trim() };
    // Not a known header: the text before the last colon ahead of the first number may still be one that OCR garbled ("l1ning", "she|l").
    const percentAt = piece.search(/\d{1,3}(?:\.\d)? ?%|% ?\d/);
    const aheadOfComposition = Math.min(percentAt === -1 ? piece.length : percentAt, ...scanFibres(piece).map(f => f.start));
    const garbledAt = piece.lastIndexOf(':', aheadOfComposition);
    if (garbledAt >= 0) {
      const garbled = piece.slice(0, garbledAt).trim();
      const rest = piece.slice(garbledAt + 1).trim();
      const followedByComposition =
        hasNumberAndFibre(rest) ||
        (/^\d{1,3}(?:\.\d)? ?%?$/.test(rest) && nextPiece !== undefined && scanFibres(nextPiece).length > 0) ||
        (rest === '' && nextPiece !== undefined && hasNumberAndFibre(nextPiece));
      // A line that starts with a colon has lost its header to the line above.
      const garbledOk =
        garbled === '' ? garbledAt === 0 : looksLikeGarbledHeader(garbled, garbled.length <= 3) && !brandFromText(line.raw.split(':')[0]);
      if (garbledOk && followedByComposition) {
        return { header: { part: 'other', label: garbled === '' ? null : clip(garbled, 30), known: false }, rest };
      }
    }
    return null;
  }
  // (b), (c) the whole line is header words
  const whole = knownHeader(piece, category);
  if (whole) return { header: whole, rest: '' };
  // (d) Japanese and Chinese headers are followed by a space
  for (const key of CJK_HEADERS) {
    if (piece.startsWith(key) && (piece.length === key.length || piece.charAt(key.length) === ' ')) {
      const part = lookup(PART_WORDS, key);
      if (part) return { header: { part, label: clip(key, 30), known: true }, rest: piece.slice(key.length).trim() };
    }
  }
  // a known header straight before a number ("lining 100% polyester")
  const before = HEADER_BEFORE_NUMBER.exec(piece);
  if (before) {
    const known = knownHeader(before[1], category);
    if (known) return { header: known, rest: piece.slice(before[0].length).trim() };
  }
  // words before the first percentage that are no known header ("Sleeves 100% polyester", "fill0 100% nylon")
  const firstNum = scanNumbers(piece)[0];
  if (firstNum && firstNum.form === 'post' && firstNum.start > 0) {
    const lead = piece.slice(0, firstNum.start).trim();
    const brand = brandFromText(line.raw);
    if (looksLikeGarbledHeader(lead) && !(brand && lead.includes(foldText(brand)))) {
      return { header: { part: 'other', label: clip(lead, 30), known: false }, rest: piece.slice(firstNum.start).trim() };
    }
  }
  // a short line that is not a fibre, care, origin, size, noise or brand, followed by a line with a number and a fibre
  if (nextPiece !== undefined && looksLikeUnknownHeaderText(piece, 20) && /^[a-z ]+$/.test(piece) && !brandFromText(line.raw) && hasNumberAndFibre(nextPiece)) {
    return { header: { part: 'other', label: clip(piece, 30), known: false }, rest: '' };
  }
  return null;
};

/** Joins a line that is only a percentage to the line after it. */
const joinLonePercents = (lines: Line[]): Line[] => {
  const out: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (next && next.photo === line.photo && /^(?:%\s?\d{1,3}(?:\.\d)?|\d{1,3}(?:\.\d)?\s?%)$/.test(line.text)) {
      out.push({ ...next, text: `${line.text} ${next.text}`, original: `${line.original} ${next.original}`, raw: `${line.raw} ${next.raw}`, repaired: line.repaired || next.repaired });
      i += 1;
    } else {
      out.push(line);
    }
  }
  return out;
};

const buildSegments = (lines: Line[], category: string | undefined): Segment[] => {
  const segments: Segment[] = [];
  const photos = Array.from(new Set(lines.map(l => l.photo)));
  for (const photo of photos) {
    const own = joinLonePercents(lines.filter(l => l.photo === photo));
    // The default part for text above the first header is the shell.
    let current: Segment = { header: null, lines: [], repaired: false, photo };
    segments.push(current);
    for (let i = 0; i < own.length; i++) {
      const line = own[i];
      const pieces = splitInlineHeaders(line.text);
      for (let p = 0; p < pieces.length; p++) {
        const piece = pieces[p];
        const upcoming = p + 1 < pieces.length ? pieces[p + 1] : own[i + 1]?.text;
        const found = detectHeader(piece, line, upcoming, category);
        if (found) {
          current = { header: found.header, lines: [], repaired: line.repaired, photo };
          segments.push(current);
          if (found.rest) current.lines.push(found.rest);
        } else {
          current.lines.push(piece);
          // a repaired care or origin line (a barrier here) says nothing about how well the fabric was read
          if (line.repaired && piece !== BARRIER) current.repaired = true;
        }
      }
    }
  }
  return segments;
};

// ─── A segment's text to a group ────────────────────────────────────────────

interface Pair {
  num: NumTok | null;
  fibs: FibTok[];
}

const insertUnknownFibres = (text: string, nums: NumTok[], fibs: FibTok[], orientation: 'num' | 'fib'): FibTok[] => {
  const out = fibs.slice();
  const wordAt = (from: number, to: number, last: boolean): { word: string; start: number; end: number } | null => {
    const gap = text.slice(from, to);
    const re = last ? /(?:^|[^a-z0-9'])([a-z][a-z']{2,24})[\s):.]*$/ : /^[\s([]*([a-z][a-z']{2,24})(?![a-z0-9'])/;
    const m = re.exec(gap);
    if (!m) return null;
    const start = last ? from + m.index + m[0].indexOf(m[1]) : from + m[0].length - m[1].length;
    return { word: m[1], start, end: start + m[1].length };
  };
  for (const num of nums) {
    if (orientation === 'num') {
      const next = out.filter(f => f.start >= num.end).sort((a, b) => a.start - b.start)[0];
      const nextNum = nums.filter(n => n.start > num.start).sort((a, b) => a.start - b.start)[0];
      const limit = Math.min(next ? next.start : text.length, nextNum ? nextNum.start : text.length);
      if (next && next.start === limit && gapNumToFib(text, num.end, next.start)) continue;
      const hit = wordAt(num.end, limit, false);
      if (!hit || !isUnknownCandidate(hit.word)) continue;
      let word = hit.word;
      let end = hit.end;
      if ((CHANGER_WORDS as readonly string[]).includes(word)) {
        const follow = /^ ([a-z][a-z']{2,24})/.exec(text.slice(end, limit));
        if (follow) {
          word = `${word} ${follow[1]}`;
          end += follow[0].length;
        }
      }
      out.push({ kind: 'fib', start: hit.start, end, phrase: word, fibre: word, printed: word, qualifier: null, unknown: true, issues: [] });
    } else {
      const prev = out.filter(f => f.end <= num.start).sort((a, b) => b.end - a.end)[0];
      const prevNum = nums.filter(n => n.end <= num.start).sort((a, b) => b.end - a.end)[0];
      const floor = Math.max(prev ? prev.end : 0, prevNum ? prevNum.end : 0);
      if (prev && prev.end === floor && gapFibToNum(text, prev.end, num.start)) continue;
      const hit = wordAt(floor, num.start, true);
      if (!hit || !isUnknownCandidate(hit.word)) continue;
      out.push({ kind: 'fib', start: hit.start, end: hit.end, phrase: hit.word, fibre: hit.word, printed: hit.word, qualifier: null, unknown: true, issues: [] });
    }
  }
  return out.sort((a, b) => a.start - b.start);
};

const pairTokens = (text: string, nums: NumTok[], fibs: FibTok[]): { pairs: Pair[]; misaligned: number } => {
  const tokens: Tok[] = [...nums, ...fibs].sort((a, b) => a.start - b.start);
  const pairs: Pair[] = [];
  let misaligned = 0;
  if (tokens.length === 0) return { pairs, misaligned };
  // The order is decided once, from the first number or fibre of the segment; the other order is never tried.
  const orientation: 'num' | 'fib' = tokens[0].kind === 'num' ? 'num' : 'fib';
  let cur: Pair | null = null;
  const lastFib = (pair: Pair): FibTok => pair.fibs[pair.fibs.length - 1];
  const drop = (pair: Pair) => {
    pairs.splice(pairs.indexOf(pair), 1);
    misaligned += 1;
  };
  for (const tok of tokens) {
    if (orientation === 'num') {
      if (tok.kind === 'num') {
        if (cur && cur.fibs.length === 0) drop(cur); // a percentage that no fibre followed
        cur = { num: tok, fibs: [] };
        pairs.push(cur);
      } else if (cur && cur.fibs.length === 0 && cur.num && gapNumToFib(text, cur.num.end, tok.start)) {
        cur.fibs.push(tok);
      } else if (cur && cur.fibs.length > 0 && separatorGap(text, lastFib(cur).end, tok.start)) {
        cur.fibs.push(tok); // the same fibre in another language, or a second fibre for the same percentage
      } else {
        // a fibre with no percentage right before it, or one with something else in between
        pairs.push({ num: null, fibs: [tok] });
        misaligned += 1;
        cur = cur && cur.fibs.length === 0 ? cur : null;
      }
    } else if (tok.kind === 'fib') {
      if (cur && cur.num === null && separatorGap(text, lastFib(cur).end, tok.start)) cur.fibs.push(tok);
      else {
        cur = { num: null, fibs: [tok] };
        pairs.push(cur);
      }
    } else if (cur && cur.num === null && gapFibToNum(text, lastFib(cur).end, tok.start)) {
      cur.num = tok;
    } else {
      misaligned += 1; // a percentage with no fibre right before it
    }
  }
  if (orientation === 'num' && cur && cur.fibs.length === 0) drop(cur);
  return { pairs, misaligned };
};

const prepareSegmentText = (lines: string[]): string =>
  lines
    .join(' ')
    .replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

/** The English word of a chain of the same fibre in several languages: the fibre's own name, else another English alias, else the first. */
const englishFirst = (fibs: FibTok[]): FibTok =>
  fibs.find(f => f.phrase === f.fibre) ?? fibs.find(f => lookup(CANONICAL_ALIASES, f.phrase) !== undefined) ?? fibs[0];

interface DraftContext {
  haystack: string;
  fibreBudget: { left: number };
}

const segmentToDraft = (seg: Segment, ctx: DraftContext): GroupDraft | null => {
  const text = prepareSegmentText(seg.lines);
  if (!text) return null;

  const knownFibres = scanFibres(text);
  let nums = scanNumbers(text);
  // A number stuck to the end of an unrelated word ("w1%") is a damaged read, not a percentage; one stuck to a fibre word is not.
  const fibreEnds = new Set(knownFibres.map(f => f.end));
  const gluedNums = nums.filter(n => isLetter(text.charAt(n.start - 1)) && !fibreEnds.has(n.start));
  if (gluedNums.length > 0) nums = nums.filter(n => !gluedNums.includes(n));
  if (nums.length > 0 && nums[0].form === 'bare') {
    // Bare numbers are only believed next to a fibre word.
    nums = nums.filter(n => knownFibres.some(f => gapNumToFib(text, n.end, f.start) || gapFibToNum(text, f.end, n.start)));
  }
  const firstNum = nums.slice().sort((a, b) => a.start - b.start)[0];
  const firstFib = knownFibres[0];
  const orientation: 'num' | 'fib' = firstNum && (!firstFib || firstNum.start < firstFib.start) ? 'num' : 'fib';
  const fibs = insertUnknownFibres(text, nums, knownFibres, orientation);
  if (fibs.length === 0 && nums.length === 0) return null;

  const { pairs, misaligned } = pairTokens(text, nums, fibs);
  const issues: string[] = [];
  const note = (s: string) => {
    if (!issues.includes(s)) issues.push(s);
  };
  if (misaligned > 0 || gluedNums.length > 0) note(ISSUE.misaligned);

  const part = seg.header ? seg.header.part : 'shell';
  const kept: TagFibre[] = [];
  let bareTotal = 0;
  let bareCount = 0;
  const isBare = nums.length > 0 && nums[0].form === 'bare';

  for (const pair of pairs) {
    if (pair.fibs.length === 0) continue;
    const value = pair.num ? pair.num.value : null;
    if (value !== null && value > 100) {
      note(ISSUE.over100);
      continue;
    }
    if (value !== null && value <= 0) {
      note('Percentage not valid');
      continue;
    }
    if (pair.num && pair.num.padded) note(ISSUE.paddedNumber);
    // Synonym chains: the same fibre in several languages is one fibre; different fibres share one percentage.
    const distinct = Array.from(new Set(pair.fibs.map(f => f.fibre)));
    const primary = distinct.length === 1 ? englishFirst(pair.fibs) : pair.fibs[0];
    if (distinct.length > 1) note(ISSUE.twoFibres);
    for (const f of pair.fibs) for (const i of f.issues) note(i);
    if (primary.unknown) note(ISSUE.unknownFibre);
    if (ctx.fibreBudget.left <= 0) {
      note(ISSUE.tooMany);
      continue;
    }
    ctx.fibreBudget.left -= 1;
    const qualifier = pair.fibs.find(f => f.fibre === primary.fibre && f.qualifier)?.qualifier ?? primary.qualifier;
    const from = Math.min(pair.num ? pair.num.start : Infinity, ...pair.fibs.map(f => f.start));
    const to = Math.max(pair.num ? pair.num.end : 0, ...pair.fibs.map(f => f.end));
    if (isBare && value !== null) {
      bareTotal += value;
      bareCount += 1;
    }
    kept.push({
      fibre: primary.fibre,
      printed: clip(primary.printed, 40),
      percent: value,
      qualifier: qualifier ?? null,
      evidence: clip(text.slice(from, to).trim(), 80),
      grounded: false,
    });
  }

  // Bare numbers count only if the whole segment adds up to exactly 100, and even then the group is Check: a tag
  // that prints no percent sign is not the kind of text a Read should rest on.
  if (isBare && bareCount > 0) {
    if (bareTotal !== 100) kept.forEach(f => { f.percent = null; });
    note(ISSUE.noPercentSigns);
  }

  const numbered = kept.some(f => f.percent !== null);
  let fibres = kept;
  if (!numbered && kept.length > 0) {
    const explicit = part === 'lining' || part === 'upper' || part === 'sole' || part === 'fill' || part === 'hardware' || part === 'trim';
    if (part === 'shell' || bareCount > 0) {
      fibres = kept; // recorded without a percentage; the sum rule keeps it Check (a number was printed, so it is never a lone fibre)
    } else if (explicit && kept.length === 1 && issues.length === 0) {
      fibres = kept; // "upper: leather"
    } else {
      fibres = [];
    }
  }

  fibres.forEach(f => {
    f.grounded = isFibreGrounded(f, ctx.haystack);
  });

  // A segment that ended with no fibre is dropped, except when a percentage over 100 was thrown away: that reason is kept.
  if (fibres.length === 0 && !issues.includes(ISSUE.over100)) return null;
  return {
    part,
    label: seg.header ? seg.header.label : null,
    fibres,
    issues,
    repaired: seg.repaired && fibres.length > 0,
  };
};

// ─── Origin, size, brand, care ──────────────────────────────────────────────

interface OriginFound {
  country: string;
  known: boolean;
  mixed: boolean;
}

const ORIGIN_RE = new RegExp(`\\b${ORIGIN_PHRASES}\\s+([^\\n]+)`, 'g');
const ORIGIN_ARTICLES = new Set(['the', 'der', 'die', 'das', 'den', 'la', 'le', 'les', 'el', 'los', 'las', 'il', 'lo', 'het', 'de']);
const ORIGIN_STOP = new Set(['for', 'by', 'with', 'imported', 'import', 'exclusive', 'excluding', 'fabric', 'using', 'from', 'in', 'to', 'and']);
const JA_ORIGIN_RE = /(?:製造国|原産国|製造)[:：]?\s*([^\s/、,]+)/g;
const JA_MADE_RE = /([\u3040-\u30FF\u4E00-\u9FFF]{2,8})製/g;

const findOrigins = (lines: Line[]): OriginFound[] => {
  const found: OriginFound[] = [];
  for (const line of lines) {
    const text = line.original;
    const re = new RegExp(ORIGIN_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const tail = m[1];
      const cut = tail.search(/\s[/|]\s|\s-\s|[,;(\d]|\s+&\s|\.\s/);
      const phrase = (cut === -1 ? tail : tail.slice(0, cut)).replace(/^the /, '').trim();
      let mixed = /\bimported\b(?! by\b)|\bof imported\b/.test(tail);
      const words = phrase.split(/\s+/).filter(Boolean);
      while (words.length > 1 && ORIGIN_ARTICLES.has(words[0])) words.shift();
      if (words.length === 0) continue;
      const hit = matchCountryPrefix(words);
      if (hit) {
        // "Made in Italy and China", "Made in Italy / Spain": a second country on the same line makes it a mixed origin.
        const later = tail.split(/\s[/|]\s|[,;/&]|\s-\s|\sand\s|\sor\s/).slice(1);
        for (const chunk of later) {
          const other = matchCountryPrefix(chunk.trim().split(/\s+/).filter(Boolean));
          if (other && other.country !== hit.country) mixed = true;
        }
        found.push({ country: hit.country, known: true, mixed });
        continue;
      }
      const kept: string[] = [];
      for (const w of words) {
        if (ORIGIN_STOP.has(w) || kept.length >= 3) break;
        kept.push(w);
      }
      if (kept.length === 0) continue;
      const result = normalizeCountry(kept.join(' '));
      found.push({ country: result.country, known: result.known, mixed });
    }
    const ja = new RegExp(JA_ORIGIN_RE.source, 'g');
    while ((m = ja.exec(text)) !== null) {
      const result = normalizeCountry(m[1]);
      if (result.known) found.push({ country: result.country, known: true, mixed: false });
    }
    const made = new RegExp(JA_MADE_RE.source, 'g');
    while ((m = made.exec(text)) !== null) {
      const result = normalizeCountry(m[1]);
      if (result.known) found.push({ country: result.country, known: true, mixed: false });
    }
  }
  return found;
};

const formatSizeValue = (token: string): string => clip(token, 20);

interface SizeFound {
  value: string | null;
  status: FieldStatus;
  grid: boolean;
}

const findSize = (lines: Line[]): SizeFound => {
  const keywordSizes: string[] = [];
  const standalone: string[] = [];
  let grid = false;
  for (const line of lines) {
    if (hasPercentSign(line.text) || isNoiseLine(line.text)) continue;
    const parsed = parseSizeLine(line.text);
    if (!parsed) continue;
    if (parsed.tokens.length >= 2) {
      grid = true;
    } else if (parsed.keyword) {
      keywordSizes.push(parsed.tokens[0]);
    } else {
      standalone.push(parsed.tokens[0]);
    }
  }
  if (grid) return { value: null, status: 'missing', grid: true };
  if (keywordSizes.length > 0) {
    const distinct = Array.from(new Set(keywordSizes));
    return { value: formatSizeValue(distinct[0]), status: distinct.length === 1 ? 'verified' : 'check', grid: false };
  }
  if (standalone.length === 1) return { value: formatSizeValue(standalone[0]), status: 'check', grid: false };
  return { value: null, status: 'missing', grid: false };
};

const findBrand = (lines: Line[]): TagRead['brand'] => {
  const photos = Array.from(new Set(lines.map(l => l.photo)));
  for (const photo of photos) {
    const own = lines.filter(l => l.photo === photo).slice(0, 3);
    for (const line of own) {
      const words = line.raw.split(/\s+/).filter(Boolean);
      if (line.raw.length > 30 || words.length > 3) continue;
      if (hasPercentSign(line.text) || isNoiseLine(line.text) || isStructural(line.text) || scanFibres(line.text).length > 0) continue;
      const name = brandFromText(line.raw);
      if (name) return { name, whereSeen: 'neck_label', confidence: 0.8, status: 'check' };
    }
  }
  return { name: null, whereSeen: null, confidence: 0, status: 'missing' };
};

// ─── Flags and languages ────────────────────────────────────────────────────

/** Laundry and other symbols: arrows to geometric shapes and dingbats (U+2190 to U+2BFF) and the pictograph blocks. */
const isGlyph = (ch: string): boolean => {
  const code = ch.codePointAt(0) ?? 0;
  return /\s/.test(ch) || (code >= 0x2190 && code <= 0x2bff) || (code >= 0x1f300 && code <= 0x1faff);
};

/** Lines of at most two characters, or made only of symbols: what a care-symbol tag looks like once read as text. */
const countSymbolLines = (lines: Line[]): number =>
  lines.filter(line => {
    const chars = Array.from(line.raw.trim());
    if (chars.length === 0) return false;
    if (chars.length <= 2 && parseSizeLine(line.text) !== null) return false; // a size such as "M" is not a symbol
    return chars.length <= 2 || chars.every(isGlyph);
  }).length;

const COMPOSITION_ELSEWHERE =
  /\bsee (?:reverse|back|other side|opposite side)\b|\b(?:composition|content|contents|fabric|fiber|fibre|material)s?\b[^.\n]{0,30}\b(?:on|at) (?:the )?(?:reverse|back|other side|opposite side)\b|\b(?:composition|contenu|composicion|zusammensetzung)\b[^.\n]{0,25}\b(?:au verso|au dos|al dorso|en el reverso|auf der ruckseite)\b/;

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

const LANGUAGE_HINTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['en', /\b(?:cotton|polyester|machine wash|made in|tumble dry|shell|lining|do not|iron|bleach|wool|nylon)\b/],
  ['fr', /\b(?:coton|fabrique|laver|lavage|doublure|ne pas|repasser|coquille|laine|soie|nettoyage|sechage|elasthanne)\b/],
  ['es', /\b(?:algodon|hecho en|fabricado|forro|lavar|planchar|lana|seda|lavado|secar|elastano)\b/],
  ['de', /\b(?:baumwolle|hergestellt|futter|nicht|waschen|bugeln|obermaterial|wolle|seide|trocknen|elastan)\b/],
  ['it', /\b(?:cotone|fabbricato|fodera|lavare|stirare|seta|asciugare|poliestere)\b/],
  ['pt', /\b(?:algodao|feito em|forro|passar a ferro|couro|poliester)\b/],
  ['nl', /\b(?:katoen|gemaakt|voering|wassen|strijken|zijde|niet)\b/],
  ['tr', /\b(?:pamuk|astar|yikama|yun|ipek|deri|uretim)\b/],
];

const detectLanguages = (text: string): string[] => {
  const out: string[] = [];
  for (const [code, re] of LANGUAGE_HINTS) if (re.test(text)) out.push(code);
  if (/[\u3040-\u30FF]/.test(text)) out.push('ja');
  else if (/[\u4E00-\u9FFF]/.test(text)) out.push('zh');
  if (/[\u0400-\u04FF]/.test(text)) out.push('ru');
  if (RTL.test(text)) out.push('ar');
  return out;
};

const alnumCount = (text: string): number => {
  let n = 0;
  for (const ch of Array.from(text)) {
    const code = ch.codePointAt(0) ?? 0;
    if (/[a-z0-9]/i.test(ch) || (code >= 0xc0 && code <= 0x1fff && code !== 0x2000) || (code >= 0x3040 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)) n += 1;
  }
  return n;
};

const endsCutOff = (lastLine: string): boolean => {
  if (/(?:^|\s)\d{1,3}(?:\.\d)?\s?%?$/.test(lastLine) || /%$/.test(lastLine)) return true;
  const word = /([a-z]{3,})$/.exec(lastLine)?.[1];
  if (!word || REPAIR_WORDS.has(word)) return false;
  return REPAIR_PREFIX_WORDS.some(w => w.length > word.length && w.startsWith(word));
};

const emptyRead = (transcription: string, flags: TagFlag[], readable: boolean): TagRead => ({
  readable,
  flags,
  groups: [],
  care: { items: [], status: 'missing' },
  origin: { country: null, known: false, status: 'missing' },
  size: { value: null, status: 'missing' },
  brand: { name: null, whereSeen: null, confidence: 0, status: 'missing' },
  ids: {},
  languages: [],
  transcription,
  source: 'local',
});

// ─── The parser ─────────────────────────────────────────────────────────────

/**
 * Parses the OCR text of one or more tag photos (joined with a line of dashes) into a TagRead.
 * `opts.category` is the item's category (it decides whether the German "Obermaterial" is a shoe upper or a shell);
 * `opts.ocr.meanConfidence` below 0.6 marks the read low-legibility, which leaves nothing shown as Read.
 */
export const parseTagText = (text: string, opts?: { category?: string; ocr?: Pick<TagOcr, 'meanConfidence'> }): TagRead => {
  const input = typeof text === 'string' ? text.slice(0, MAX_INPUT_CHARS) : '';
  const transcription = sanitizeTranscription(input);
  const { lines, photos } = prepareLines(input);

  if (alnumCount(input) < MIN_ALNUM_CHARS || lines.length === 0) {
    const flags: TagFlag[] = ['no_text'];
    return emptyRead(transcription, flags, false);
  }

  const category = opts?.category;
  const flags: TagFlag[] = [];
  const addFlag = (f: TagFlag) => {
    if (!flags.includes(f)) flags.push(f);
  };
  if (photos > 1) addFlag('multiple_labels');
  const confidence = opts?.ocr?.meanConfidence;
  if (typeof confidence === 'number' && Number.isFinite(confidence) && confidence < LOW_CONFIDENCE) addFlag('low_legibility');
  if (RTL.test(input)) addFlag('low_legibility');

  const originalText = lines.map(l => l.original).join('\n');
  const haystack = `${originalText}\n${originalText.replace(/([a-z])-(?=[a-z])/g, '$1 ')}`;
  // Noise, identifiers, care, origin and size lines are not composition. They stay in place as a barrier, so a percentage and a
  // fibre that only meet because such a line was cut out between them are not taken for a pair.
  const parseLines: Line[] = lines.map(l => {
    if (isNoiseLine(l.text)) return { ...l, text: BARRIER };
    const stripped = stripIds(l.text);
    if (stripped === '' || (!hasPercentSign(stripped) && isStructural(stripped))) return { ...l, text: BARRIER };
    return { ...l, text: stripped };
  });

  // Composition
  const segments = buildSegments(parseLines, category);
  const budget = { left: MAX_FIBRES };
  const drafts: GroupDraft[] = [];
  for (const seg of segments) {
    const draft = segmentToDraft(seg, { haystack, fibreBudget: budget });
    if (draft) drafts.push(draft);
  }
  const headerLabels = segments.filter(s => s.header).map(s => (s.header as Header).label);
  if (headerLabels.filter(garmentHeader).length >= 2) addFlag('set_of_garments');

  const builtGroups = drafts.map(buildGroup);

  // partial: a group adds up to less than 90 and a photo's text stops short
  const lastLines = Array.from(new Set(lines.map(l => l.photo))).map(photo => {
    const own = lines.filter(l => l.photo === photo);
    return own[own.length - 1].original;
  });
  const shortGroup = builtGroups.some(g => {
    const percents = g.fibres.map(f => f.percent).filter((p): p is number => p !== null);
    return percents.length > 0 && percents.reduce((a, b) => a + b, 0) < 90;
  });
  if (shortGroup && lastLines.some(endsCutOff)) addFlag('partial');

  if (COMPOSITION_ELSEWHERE.test(originalText)) addFlag('composition_elsewhere');

  // Care
  const careItems: string[] = [];
  let unmapped = 0;
  let careRepaired = false;
  for (const line of lines) {
    const { phrases, leftover } = analyzeCareLine(line.text);
    for (const p of phrases) if (!careItems.includes(p)) careItems.push(p);
    if (phrases.length > 0 && line.repaired) careRepaired = true;
    if (leftover) unmapped += 1; // a care word that no phrase accounts for
  }
  const care: TagRead['care'] = {
    items: CARE_PHRASES.filter(p => careItems.includes(p)),
    status: careItems.length > 0 ? (unmapped === 0 && !careRepaired ? 'verified' : 'check') : unmapped > 0 ? 'check' : 'missing',
  };

  // Origin
  const origins = findOrigins(lines);
  let origin: TagRead['origin'] & { issues?: string[] } = { country: null, known: false, status: 'missing' };
  if (origins.length > 0) {
    const first = origins[0];
    const issues: string[] = [];
    if (first.mixed) issues.push('Mixed origin');
    if (origins.some(o => o.country !== first.country)) issues.push('Two origins');
    origin = {
      country: first.country,
      known: first.known,
      status: first.known && issues.length === 0 ? 'verified' : 'check',
    };
    if (issues.length > 0) origin.issues = issues;
  }

  // Size, brand, ids
  const sizeFound = findSize(lines.filter(l => !isNoiseLine(l.text)));
  if (sizeFound.grid) addFlag('multiple_sizes');
  const brand = findBrand(lines.filter(l => !isNoiseLine(l.text)));
  const ids = extractIds(originalText);

  // symbols_only
  if (countSymbolLines(lines) >= 3 && careItems.length === 0 && unmapped === 0 && !lines.some(l => looksLikeCare(l.text))) addFlag('symbols_only');

  const groups = applyReadRules(builtGroups, flags);

  // A read that cannot be trusted as the whole tag leaves nothing shown as Read, not even the small fields.
  const lowLegibility = flags.includes('low_legibility');
  const downgrade = (status: FieldStatus): FieldStatus => (lowLegibility && status === 'verified' ? 'check' : status);
  care.status = downgrade(care.status);
  origin.status = downgrade(origin.status);
  const size: TagRead['size'] = { value: sizeFound.value, status: downgrade(sizeFound.status) };

  return {
    readable: true,
    flags,
    groups,
    care,
    origin,
    size,
    brand,
    ids,
    languages: detectLanguages(originalText),
    transcription,
    source: 'local',
  };
};

// ─── Clean reads and merging ────────────────────────────────────────────────

/**
 * True when the local read needs no second opinion: at least one group, every group Read, no flags, no unknown headers.
 * (Origin and care are either found or absent because the tag has no such lines; a missing field is never guessed.)
 */
export const isClean = (read: TagRead): boolean =>
  read.groups.length > 0 && read.groups.every(g => g.status === 'verified' && g.part !== 'other') && read.flags.length === 0;

const fibreKey = (g: TagGroup): string =>
  g.fibres
    .map(f => `${f.fibre}:${f.percent === null ? '-' : Math.round(f.percent * 10) / 10}:${f.qualifier ?? ''}`)
    .sort()
    .join('|');

const describeGroup = (g: TagGroup): string =>
  g.fibres.map(f => `${f.percent === null ? '' : `${Math.round(f.percent * 10) / 10}% `}${f.qualifier ? `${f.qualifier} ` : ''}${f.fibre}`).join(', ');

/**
 * Combines the local read with the grounded answer of the optional model step. Groups are matched by part. Equal
 * groups keep their status; different ones become Check and say so; a group only the model found counts only if
 * every number and word in it is grounded. Care, origin, size and brand come from the model only where the local
 * read has none, and stay Check.
 */
export const mergeReads = (local: TagRead, model: TagRead): TagRead => {
  const flags: TagFlag[] = Array.from(new Set([...local.flags, ...model.flags]));

  const used = new Set<TagGroup>();
  const merged: TagGroup[] = [];
  for (const lg of local.groups) {
    const other = model.groups.find(mg => mg.part === lg.part && !used.has(mg));
    if (!other || other.fibres.length === 0) {
      merged.push(lg);
      continue;
    }
    used.add(other);
    if (fibreKey(lg) === fibreKey(other)) {
      merged.push(lg);
    } else {
      const issue = `Tag says ${describeGroup(lg)}; second opinion ${describeGroup(other)}`;
      merged.push({ ...lg, status: lg.fibres.length > 0 ? 'check' : lg.status, issues: [...lg.issues, issue] });
    }
  }
  for (const mg of model.groups) {
    if (used.has(mg) || mg.fibres.length === 0) continue;
    if (mg.fibres.every(f => f.grounded)) merged.push(mg);
  }

  const care: TagRead['care'] =
    local.care.items.length > 0 || local.care.status !== 'missing'
      ? local.care
      : model.care.items.length > 0
        ? { items: model.care.items, status: 'check' }
        : local.care;
  const origin: TagRead['origin'] =
    local.origin.country !== null ? local.origin : model.origin.country !== null ? { ...model.origin, status: 'check' } : local.origin;
  const size: TagRead['size'] =
    local.size.value !== null ? local.size : model.size.value !== null ? { value: model.size.value, status: 'check' } : local.size;
  const brand: TagRead['brand'] =
    local.brand.name !== null ? local.brand : model.brand.name !== null ? { ...model.brand, status: 'check' } : local.brand;

  return {
    readable: local.readable || model.readable,
    flags,
    groups: applyReadRules(merged, flags),
    care,
    origin,
    size,
    brand,
    ids: { ...model.ids, ...local.ids },
    languages: Array.from(new Set([...local.languages, ...model.languages])),
    transcription: local.transcription,
    source: 'merged',
  };
};
