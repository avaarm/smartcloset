import { foldText } from './textFold';

/**
 * What is kept of the text read from a tag photo. The raw OCR text can hold phone numbers, addresses of
 * importers, websites and barcodes; none of that is stored. The result is the item's `tag_text`, private to its owner.
 */

const MAX_LINE_CHARS = 120;
const MAX_LINES = 60;
const MAX_TOTAL_CHARS = 2000; // the database check on clothing_items.tag_text

/**
 * True when the text holds an email address: in one word, a character, an at sign, and after it a dot with at least one character
 * on each side. The same matches as /\S+@\S+\.\S+/, but read in one pass: that pattern takes cubic time on a run of at signs.
 */
const hasEmail = (text: string): boolean =>
  text.split(/\s+/).some(word => {
    const at = word.indexOf('@', 1);
    if (at === -1) return false;
    const dot = word.indexOf('.', at + 2);
    return dot !== -1 && dot <= word.length - 2;
  });

const URL_OR_SITE = /https?:\/\/|www\.|\.com\b|\.net\b|\.org\b/i;
// Nine or more digits, possibly spaced out with dots, dashes, slashes, dots at mid-height, brackets or a leading plus: a phone number.
const PHONE_LIKE = /\+?(?:\d[\s().\-/\u00b7\u2022_]*){9,}/;
const LONG_DIGIT_RUN = /\d{8,}/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const NON_LATIN_DIGITS = /[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;
const DASHES = /[\u2010-\u2015\u2212]/g;

/** The line as the patterns read it: fullwidth forms, Arabic-Indic and Devanagari digits and every dash made plain ASCII. The stored line is left as it was. */
const forTest = (line: string): string =>
  foldText(line)
    .replace(NON_LATIN_DIGITS, ch => {
      const code = ch.charCodeAt(0);
      const base = code >= 0x0966 ? 0x0966 : code >= 0x06f0 ? 0x06f0 : 0x0660;
      return String.fromCharCode(48 + code - base);
    })
    .replace(DASHES, '-');

const dropLine = (line: string): boolean => {
  const t = forTest(line);
  return hasEmail(t) || URL_OR_SITE.test(t) || PHONE_LIKE.test(t) || LONG_DIGIT_RUN.test(t);
};

/**
 * Which lines go, after the lines have been judged one by one. A number or an address that the tag wraps over two lines is
 * caught by joining a line to the next one, but only when the first line ends on a dash, slash, plus or opening bracket (a
 * phone number cut short) or on "@" (an address cut after the at sign). Joining every pair would drop real lines:
 * "RN 123456" and "100% COTTON" next to each other make nine digits.
 */
const droppedLines = (lines: string[]): boolean[] => {
  const dropped = lines.map(dropLine);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (dropped[i]) continue;
    const first = forTest(lines[i]).trimEnd();
    if (first.endsWith('@')) {
      if (hasEmail(forTest(lines[i] + lines[i + 1]))) dropped[i] = dropped[i + 1] = true;
    } else if (!dropped[i + 1] && /[-/+(]$/.test(first) && dropLine(`${lines[i]} ${lines[i + 1]}`)) {
      dropped[i] = dropped[i + 1] = true;
    }
  }
  return dropped;
};

/**
 * The text of a tag as it may be stored: lines with an email, a web address, a phone-like number or a digit run of
 * eight or more dropped (a short RN, CA or WPL number of five to seven digits stays), each line cut to 120
 * characters, at most 60 lines, cut at a line boundary so the whole is at most 2000 characters.
 */
export const sanitizeTranscription = (text: string): string => {
  if (typeof text !== 'string' || text === '') return '';
  const lines = text
    .replace(CONTROL_CHARS, ' ')
    .split(/\r\n|[\r\n\u2028\u2029]/)
    .map(rawLine => rawLine.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(line => line !== '');
  const dropped = droppedLines(lines);
  const out: string[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    if (dropped[i]) continue;
    const kept = lines[i].slice(0, MAX_LINE_CHARS).trim();
    const cost = kept.length + (out.length > 0 ? 1 : 0);
    if (out.length >= MAX_LINES || total + cost > MAX_TOTAL_CHARS) break;
    out.push(kept);
    total += cost;
  }
  return out.join('\n');
};

/** The registration numbers printed on a tag: "RN 12345", "CA 12345", "WPL 12345" (five to seven digits). They stay in the transcription only. */
export const extractIds = (foldedText: string): { rn?: string; ca?: string; wpl?: string } => {
  const ids: { rn?: string; ca?: string; wpl?: string } = {};
  const read = (re: RegExp): string | undefined => re.exec(foldedText)?.[1];
  const rn = read(/\brn ?#?:? ?(\d{5,7})\b/);
  const ca = read(/\bca ?#?:? ?(\d{5,7})\b/);
  const wpl = read(/\bwpl ?#?:? ?(\d{5,7})\b/);
  if (rn) ids.rn = rn;
  if (ca) ids.ca = ca;
  if (wpl) ids.wpl = wpl;
  return ids;
};
