import { sameSecret } from '../../supabase/functions/_shared/sameSecret';

describe('sameSecret', () => {
  const key = 'sb-service-key-0123456789abcdef.0123456789abcdef.0123456789abcdef';

  it('accepts the same secret', () => {
    expect(sameSecret(key, key)).toBe(true);
    expect(sameSecret(key, `${key}`)).toBe(true);
  });

  it('refuses anything else, however close', () => {
    expect(sameSecret(key, key.slice(0, -1))).toBe(false);
    expect(sameSecret(key, `${key}x`)).toBe(false);
    expect(sameSecret(key, key.replace('0', '1'))).toBe(false);
    expect(sameSecret(key, key.toUpperCase())).toBe(false);
    expect(sameSecret('a', 'b')).toBe(false);
  });

  it('refuses when either side is missing, even if both are', () => {
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret(undefined, undefined)).toBe(false);
    expect(sameSecret(null, null)).toBe(false);
    expect(sameSecret(key, undefined)).toBe(false);
    expect(sameSecret(undefined, key)).toBe(false);
    expect(sameSecret(key, '')).toBe(false);
  });

  it('does not read a token: one that only claims to be the service role is refused', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none' })}.${b64({ role: 'service_role' })}.`;
    expect(sameSecret(forged, key)).toBe(false);
  });
});
