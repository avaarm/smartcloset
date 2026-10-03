/**
 * Parse a price the user typed. Accepts "12", "12.50", "$1,299", "12,50"
 * (decimal comma, as the keypad types it in many locales) and "1.299,00".
 * Returns NaN for anything that isn't a number, including an empty string.
 *
 * parseFloat alone stops at the first comma, so "1,299" became 1.
 */
export const parseMoney = (raw: string): number => {
  let s = (raw ?? '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // A trailing group of 1-2 digits after the last comma is a decimal part;
    // otherwise commas are thousands separators.
    const decimals = s.length - lastComma - 1;
    s = decimals <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  return Number(s);
};
