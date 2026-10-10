/**
 * The ai-proxy Edge Function is Deno code that jest cannot import, so its
 * Brave limits are read out of the source and compared with what the app sends.
 * If the app asks for more than the proxy accepts, every search would fail
 * (or silently get fewer results than it counted on).
 */
import fs from 'fs';
import path from 'path';
import {
  BRAVE_QUERY_MAX,
  BRAVE_QUERY_MAX_WORDS,
  COMPACT_QUERY_MAX,
  SEARCH_RESULT_COUNT,
} from '../../src/services/searchRanking';

const source = fs.readFileSync(
  path.join(__dirname, '../../supabase/functions/ai-proxy/index.ts'),
  'utf8',
);

const constant = (name: string): number => {
  const m = source.match(new RegExp(`const ${name} = (\\d+);`));
  if (!m) throw new Error(`${name} not found in ai-proxy`);
  return Number(m[1]);
};

describe('ai-proxy brave route limits', () => {
  it('accepts the longest query the app builds', () => {
    expect(constant('BRAVE_MAX_Q_CHARS')).toBeGreaterThanOrEqual(BRAVE_QUERY_MAX);
    expect(constant('BRAVE_MAX_Q_WORDS')).toBeGreaterThanOrEqual(BRAVE_QUERY_MAX_WORDS);
  });

  it('returns as many results as the app asks for', () => {
    expect(constant('BRAVE_MAX_COUNT')).toBeGreaterThanOrEqual(SEARCH_RESULT_COUNT);
  });

  it('accepts the compact query an app falls back to against an older proxy', () => {
    expect(COMPACT_QUERY_MAX).toBeLessThanOrEqual(constant('BRAVE_MAX_Q_CHARS'));
  });

  it('keeps the checks the route always had', () => {
    expect(source).toMatch(/typeof q !== "string" \|\| !q\.trim\(\)\) return json\(\{ error: "q required" \}, 400\)/);
    // The client falls back to a shorter query on exactly this message.
    expect(source).toMatch(/error: "q too long"/);
    expect(source).toMatch(/safesearch: "strict"/);
    expect(source).toMatch(/Math\.min\(Number\(num\) \|\| BRAVE_DEFAULT_COUNT, BRAVE_MAX_COUNT\)/);
  });

  it('keeps the per-user limits', () => {
    expect(source).toMatch(/"brave": \{ perMin: 20, perDay: 400 \}/);
    expect(source).toMatch(/RATE_LIMIT_PER_MIN = 60/);
  });
});
