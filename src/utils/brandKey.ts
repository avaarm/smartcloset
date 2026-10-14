/**
 * The brand key: what "Hermès", "HERMES" and "hermes " have in common. It must stay identical to the SQL function
 * brand_key_raw (both are checked against __tests__/fixtures/brandKeys.json). A change to the fold table is made in
 * SQL, here and in the fixture together.
 */

const FOLD_FROM = 'ÀÁÂÃÄÅĀĂĄàáâãäåāăąÇĆČçćčĎĐÐďđðÈÉÊËĒĖĘĚèéêëēėęěĞğÌÍÎÏĪĮİìíîïīįıŁłÑŃŇñńňÒÓÔÕÖØŌŐòóôõöøōőŔŘŕřŚŠŞȘśšşșŤŢȚťţțÙÚÛÜŪŮŰŲùúûüūůűųÝŸýÿŹŻŽźżž';
const FOLD_TO = 'AAAAAAAAAaaaaaaaaaCCCcccDDDdddEEEEEEEEeeeeeeeeGgIIIIIIIiiiiiiiLlNNNnnnOOOOOOOOooooooooRRrrSSSSssssTTTtttUUUUUUUUuuuuuuuuYYyyZZZzzz';
const FOLD: Record<string, string> = {};
Array.from(FOLD_FROM).forEach((ch, i) => { FOLD[ch] = Array.from(FOLD_TO)[i]; });
const MULTI: ReadonlyArray<readonly [string, string]> = [['ß', 'ss'], ['æ', 'ae'], ['Æ', 'AE'], ['œ', 'oe'], ['Œ', 'OE'], ['þ', 'th'], ['Þ', 'TH']];

/** Accents folded, "&" read as "and", everything outside a-z0-9 dropped, 40 characters at most. Null when nothing is left. */
export const brandKeyRaw = (text?: string | null): string | null => {
  let s = '';
  for (const ch of Array.from(String(text ?? ''))) s += FOLD[ch] ?? ch;
  for (const [from, to] of MULTI) s = s.split(from).join(to);
  s = s.toLowerCase().split('&').join('and').replace(/[^a-z0-9]/g, '').slice(0, 40);
  return s === '' ? null : s;
};
