/**
 * Compares two secrets in time that does not depend on where they first differ, so the answer cannot be
 * guessed one character at a time. Returns false when either is empty. Used by the swap-media sweep to
 * recognise the service key; the length is not hidden, which is fine for a fixed-length key.
 */
export const sameSecret = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};
