let mockUser: { id: string } | null = { id: 'user-1' };
const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

import {
  clearBrandInsightCache,
  loadBrandInsight,
  parseBrandInsight,
  reportBrandInsight,
} from '../../src/services/brandInsightService';

const GOOD = {
  status: 'ok',
  n_bucket: '10-24',
  score: 4.1,
  as_of: '2026-10-14',
  item: {
    feel: 4.4,
    comfort: 4.2,
    holds_up: 3.9,
    would_buy_again_pct: 75,
    fit: { runs_small: 10, true_to_size: 70, runs_large: 20 },
  },
  brand: { quality: 4.0, fit_consistency: 3.5, value: 3.8 },
  traits: [{ group: 'touch', tag: 'soft', pct: 70 }],
  slices: [{ kind: 'material', key: 'cotton', n_bucket: '10-24', overall: 4.4, feel: 4.5, holds_up: 4.1 }],
};

const PARSED_GOOD = {
  status: 'ok',
  nBucket: '10-24',
  score: 4.1,
  asOf: '2026-10-14',
  item: { feel: 4.4, comfort: 4.2, holdsUp: 3.9, wouldBuyAgainPct: 75, fit: { runsSmall: 10, trueToSize: 70, runsLarge: 20 } },
  brand: { quality: 4.0, fitConsistency: 3.5, value: 3.8 },
  traits: [{ group: 'touch', tag: 'soft', pct: 70 }],
  slices: [{ kind: 'material', key: 'cotton', nBucket: '10-24', overall: 4.4, feel: 4.5, holdsUp: 4.1 }],
};

const INSUFFICIENT = { status: 'insufficient' };
const QUOTA = 'You’ve looked at a lot of brands today. Please come back tomorrow.';
const SIX_HOURS = 6 * 60 * 60 * 1000;

describe('parseBrandInsight', () => {
  it('maps the documented answer from snake case', () => {
    expect(parseBrandInsight(GOOD)).toEqual(PARSED_GOOD);
  });

  it('fills item, brand, traits and slices when the server leaves them out', () => {
    expect(parseBrandInsight({ status: 'ok', n_bucket: 'under_10', score: 3.5, as_of: '2026-10-14' })).toEqual({
      status: 'ok', nBucket: 'under_10', score: 3.5, asOf: '2026-10-14', item: {}, brand: {}, traits: [], slices: [],
    });
    expect(parseBrandInsight({ ...GOOD, item: {}, brand: {}, traits: [], slices: [] })).toMatchObject({ item: {}, brand: {}, traits: [], slices: [] });
  });

  it('passes the other two answers through', () => {
    expect(parseBrandInsight({ status: 'insufficient' })).toEqual(INSUFFICIENT);
    expect(parseBrandInsight({ status: 'unavailable' })).toEqual({ status: 'unavailable' });
    expect(parseBrandInsight({ status: 'unavailable', score: 4, item: {} })).toEqual({ status: 'unavailable' });
  });

  it('keeps all four bucket names', () => {
    for (const bucket of ['under_10', '10-24', '25-99', '100+']) {
      expect(parseBrandInsight({ ...GOOD, n_bucket: bucket })).toMatchObject({ status: 'ok', nBucket: bucket });
    }
  });

  describe('hostile input', () => {
    it.each([null, undefined, 0, 5, 'ok', true, [], [GOOD], () => GOOD, {}])('defaults to insufficient for %p', raw => {
      expect(parseBrandInsight(raw)).toEqual(INSUFFICIENT);
    });

    it.each(['OK', 'okay', 'error', '', 7, null, undefined, { status: 'ok' }, ['ok']])('defaults to insufficient for the status %p', status => {
      expect(parseBrandInsight({ ...GOOD, status })).toEqual(INSUFFICIENT);
    });

    it.each([0, 0.9, 5.1, 6, -4, NaN, Infinity, -Infinity, '4', '4.0', true, null, undefined, {}, [4]])('is insufficient for an ok answer with the score %p', score => {
      expect(parseBrandInsight({ ...GOOD, score })).toEqual(INSUFFICIENT);
    });

    it('keeps the ends of the score range', () => {
      expect(parseBrandInsight({ ...GOOD, score: 1 })).toMatchObject({ score: 1 });
      expect(parseBrandInsight({ ...GOOD, score: 5 })).toMatchObject({ score: 5 });
    });

    it.each(['0-9', '10', '100', '', 'UNDER_10', 5, null, undefined, {}])('is insufficient for an ok answer with the bucket %p', bucket => {
      expect(parseBrandInsight({ ...GOOD, n_bucket: bucket })).toEqual(INSUFFICIENT);
    });

    it('does not show a score without a stated basis', () => {
      const noBucket = Object.fromEntries(Object.entries(GOOD).filter(([key]) => key !== 'n_bucket'));
      expect(parseBrandInsight(noBucket)).toEqual(INSUFFICIENT);
    });

    it('keeps an ok answer whose date is missing or not a date, with an empty date', () => {
      const noDate = Object.fromEntries(Object.entries(GOOD).filter(([key]) => key !== 'as_of'));
      expect(parseBrandInsight(noDate)).toMatchObject({ status: 'ok', asOf: '' });
      for (const asOf of ['yesterday', '2026-10-14T10:00:00Z', 20261014, null, '<b>x</b>']) {
        expect(parseBrandInsight({ ...GOOD, as_of: asOf })).toMatchObject({ status: 'ok', asOf: '' });
      }
    });

    it('drops numbers outside their range and keeps the rest', () => {
      const parsed = parseBrandInsight({
        ...GOOD,
        item: { feel: 7, comfort: 0, holds_up: -1, would_buy_again_pct: 101, fit: { runs_small: 10, true_to_size: 70, runs_large: 20 } },
        brand: { quality: 5.5, fit_consistency: 0.5, value: 3 },
      });
      expect(parsed).toMatchObject({
        status: 'ok',
        item: { fit: { runsSmall: 10, trueToSize: 70, runsLarge: 20 } },
        brand: { value: 3 },
      });
      if (parsed.status !== 'ok') return;
      expect(parsed.item).not.toHaveProperty('feel');
      expect(parsed.item).not.toHaveProperty('comfort');
      expect(parsed.item).not.toHaveProperty('holdsUp');
      expect(parsed.item).not.toHaveProperty('wouldBuyAgainPct');
      expect(parsed.brand).not.toHaveProperty('quality');
      expect(parsed.brand).not.toHaveProperty('fitConsistency');
    });

    it('keeps the ends of the percentage range', () => {
      const parsed = parseBrandInsight({ ...GOOD, item: { would_buy_again_pct: 0 } });
      expect(parsed).toMatchObject({ item: { wouldBuyAgainPct: 0 } });
      expect(parseBrandInsight({ ...GOOD, item: { would_buy_again_pct: 100 } })).toMatchObject({ item: { wouldBuyAgainPct: 100 } });
    });

    it('drops values of the wrong type', () => {
      const parsed = parseBrandInsight({
        ...GOOD,
        item: { feel: '4.4', comfort: null, holds_up: [3], would_buy_again_pct: { v: 1 }, fit: 'true_to_size' },
        brand: 'good',
      });
      expect(parsed).toMatchObject({ status: 'ok', item: {}, brand: {} });
    });

    it('treats item, brand, traits and slices of the wrong type as absent', () => {
      for (const bad of ['x', 7, null, true, []]) {
        expect(parseBrandInsight({ ...GOOD, item: bad, brand: bad, traits: bad, slices: bad })).toMatchObject({
          status: 'ok', item: {}, brand: {}, traits: [], slices: [],
        });
      }
      expect(parseBrandInsight({ ...GOOD, traits: { group: 'touch' }, slices: { kind: 'material' } })).toMatchObject({ traits: [], slices: [] });
    });

    it('drops fit unless all three shares are there and make a whole', () => {
      const fit = (value: unknown) => (parseBrandInsight({ ...GOOD, item: { fit: value } }) as { item: { fit?: unknown } }).item.fit;
      expect(fit({ runs_small: 10, true_to_size: 70 })).toBeUndefined();
      expect(fit({ runs_small: 10, true_to_size: 70, runs_large: 'x' })).toBeUndefined();
      expect(fit({ runs_small: 10, true_to_size: 70, runs_large: 30 })).toBeUndefined();   // 110
      expect(fit({ runs_small: 10, true_to_size: 60, runs_large: 20 })).toBeUndefined();   // 90
      expect(fit({ runs_small: -10, true_to_size: 90, runs_large: 20 })).toBeUndefined();
      expect(fit({ runs_small: 0, true_to_size: 100, runs_large: 0 })).toEqual({ runsSmall: 0, trueToSize: 100, runsLarge: 0 });
    });

    it('drops traits with an unknown group, a tag from another group, a tag it does not know, or a bad percentage', () => {
      const parsed = parseBrandInsight({
        ...GOOD,
        traits: [
          { group: 'smell', tag: 'soft', pct: 70 },
          { group: 'comfort', tag: 'soft', pct: 70 },      // a touch tag
          { group: 'touch', tag: 'plasticky', pct: 70 },
          { group: 'touch', tag: '<script>', pct: 70 },
          { group: 'touch', tag: 'soft', pct: 120 },
          { group: 'touch', tag: 'soft', pct: '70' },
          { group: 'touch', tag: 'soft' },
          { group: 'touch', pct: 50 },
          { group: 'touch', tag: 5, pct: 50 },
          null, 'x', 7, [],
          { group: 'holds_up', tag: 'pills', pct: 25 },
        ],
      });
      expect(parsed).toMatchObject({ traits: [{ group: 'holds_up', tag: 'pills', pct: 25 }] });
    });

    it('keeps each trait once', () => {
      const parsed = parseBrandInsight({
        ...GOOD,
        traits: [{ group: 'touch', tag: 'soft', pct: 70 }, { group: 'touch', tag: 'soft', pct: 60 }, { group: 'comfort', tag: 'warm', pct: 40 }],
      });
      expect(parsed).toMatchObject({ traits: [{ group: 'touch', tag: 'soft', pct: 70 }, { group: 'comfort', tag: 'warm', pct: 40 }] });
    });

    it('caps traits at four, in the order given', () => {
      const traits = ['soft', 'silky', 'buttery', 'smooth', 'crisp', 'structured'].map((tag, i) => ({ group: 'touch', tag, pct: 80 - i * 5 }));
      const parsed = parseBrandInsight({ ...GOOD, traits });
      expect(parsed).toMatchObject({ status: 'ok' });
      if (parsed.status !== 'ok') return;
      expect(parsed.traits.map(t => t.tag)).toEqual(['soft', 'silky', 'buttery', 'smooth']);
    });

    it('caps traits at four when a huge list is sent, counting only the ones that are valid', () => {
      const junk = Array.from({ length: 5000 }, (_v, i) => ({ group: 'touch', tag: `bogus${i}`, pct: 10 }));
      const valid = ['soft', 'silky', 'buttery', 'smooth', 'crisp'].map(tag => ({ group: 'touch', tag, pct: 10 }));
      const parsed = parseBrandInsight({ ...GOOD, traits: [...junk, ...valid] });
      if (parsed.status !== 'ok') throw new Error('expected ok');
      expect(parsed.traits.map(t => t.tag)).toEqual(['soft', 'silky', 'buttery', 'smooth']);
    });

    it('drops slices with an unknown kind, bucket, key or score', () => {
      const ok = { kind: 'category', key: 'tops', n_bucket: '10-24', overall: 4.2 };
      const parsed = parseBrandInsight({
        ...GOOD,
        slices: [
          { ...ok, kind: 'colour' },
          { ...ok, n_bucket: '1-9' },
          { ...ok, n_bucket: undefined },
          { ...ok, key: '' },
          { ...ok, key: 'x'.repeat(41) },
          { ...ok, key: '<img src=x>' },
          { ...ok, key: 'Tops' },
          { ...ok, key: 7 },
          { ...ok, key: undefined },
          { ...ok, overall: 0 },
          { ...ok, overall: 6 },
          { ...ok, overall: '4' },
          { ...ok, overall: undefined },
          null, 'x', 7, [],
          ok,
        ],
      });
      expect(parsed).toMatchObject({ slices: [{ kind: 'category', key: 'tops', nBucket: '10-24', overall: 4.2 }] });
      if (parsed.status === 'ok') expect(parsed.slices).toHaveLength(1);
    });

    it('keeps a slice without feel or holding up, and drops only the bad one of the two', () => {
      const slice = { kind: 'material', key: 'cotton', n_bucket: '25-99', overall: 4 };
      const parsed = parseBrandInsight({ ...GOOD, slices: [slice, { ...slice, key: 'wool', feel: 9, holds_up: 3.5 }, { ...slice, key: 'linen', feel: 4, holds_up: 'x' }] });
      if (parsed.status !== 'ok') throw new Error('expected ok');
      expect(parsed.slices).toEqual([
        { kind: 'material', key: 'cotton', nBucket: '25-99', overall: 4 },
        { kind: 'material', key: 'wool', nBucket: '25-99', overall: 4, holdsUp: 3.5 },
        { kind: 'material', key: 'linen', nBucket: '25-99', overall: 4, feel: 4 },
      ]);
    });

    it('keeps multi-word and hyphenated keys', () => {
      const parsed = parseBrandInsight({ ...GOOD, slices: [{ kind: 'category', key: 'activewear', n_bucket: '10-24', overall: 4 }, { kind: 'material', key: 'merino wool', n_bucket: '10-24', overall: 4 }, { kind: 'material', key: 'faux-leather', n_bucket: '10-24', overall: 4 }] });
      if (parsed.status !== 'ok') throw new Error('expected ok');
      expect(parsed.slices.map(s => s.key)).toEqual(['activewear', 'merino wool', 'faux-leather']);
    });

    it('caps slices at six of each kind, keeping the order given', () => {
      const make = (kind: string, count: number) => Array.from({ length: count }, (_v, i) => ({ kind, key: `key${i}`, n_bucket: '10-24', overall: 4 }));
      const parsed = parseBrandInsight({ ...GOOD, slices: [...make('category', 40), ...make('material', 40)] });
      if (parsed.status !== 'ok') throw new Error('expected ok');
      expect(parsed.slices).toHaveLength(12);
      expect(parsed.slices.filter(s => s.kind === 'category').map(s => s.key)).toEqual(['key0', 'key1', 'key2', 'key3', 'key4', 'key5']);
      expect(parsed.slices.filter(s => s.kind === 'material')).toHaveLength(6);
    });

    it('caps each kind separately when the kinds are mixed', () => {
      const mixed = Array.from({ length: 30 }, (_v, i) => ({ kind: i % 2 ? 'category' : 'material', key: `key${i}`, n_bucket: '10-24', overall: 4 }));
      const parsed = parseBrandInsight({ ...GOOD, slices: mixed });
      if (parsed.status !== 'ok') throw new Error('expected ok');
      expect(parsed.slices.filter(s => s.kind === 'category')).toHaveLength(6);
      expect(parsed.slices.filter(s => s.kind === 'material')).toHaveLength(6);
    });

    it('keeps each slice once', () => {
      const slice = { kind: 'material', key: 'cotton', n_bucket: '10-24', overall: 4 };
      const parsed = parseBrandInsight({ ...GOOD, slices: [slice, { ...slice, overall: 2 }] });
      if (parsed.status !== 'ok') throw new Error('expected ok');
      expect(parsed.slices).toEqual([{ kind: 'material', key: 'cotton', nBucket: '10-24', overall: 4 }]);
    });

    it('returns only the fields it knows (no user ids, notes or exact counts can ride along)', () => {
      const parsed = parseBrandInsight({
        ...GOOD,
        user_id: 'u1',
        n: 17,
        note: 'secret',
        item: { ...GOOD.item, item_id: 'i1', n_feel: 12, note: 'hello' },
        brand: { ...GOOD.brand, n: 12 },
        traits: [{ group: 'touch', tag: 'soft', pct: 70, count: 9, user_id: 'u2' }],
        slices: [{ kind: 'material', key: 'cotton', n_bucket: '10-24', overall: 4.4, feel: 4.5, holds_up: 4.1, n: 11, user_id: 'u3' }],
      });
      expect(parsed).toEqual(PARSED_GOOD);
      expect(JSON.stringify(parsed)).not.toMatch(/u1|u2|u3|secret|hello|i1/);
    });

    it('does not read inherited or special properties', () => {
      const raw = JSON.parse('{"__proto__":{"status":"ok","score":4,"n_bucket":"10-24"},"constructor":{"status":"ok"}}');
      expect(parseBrandInsight(raw)).toEqual(INSUFFICIENT);
    });

    it('does not mutate its input', () => {
      const raw = JSON.parse(JSON.stringify(GOOD));
      parseBrandInsight(raw);
      expect(raw).toEqual(GOOD);
    });
  });
});

describe('loadBrandInsight', () => {
  let errorSpy: jest.SpyInstance;
  let now: number;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockGetSession.mockReset().mockImplementation(async () => ({ data: { session: mockUser ? { user: mockUser } : null }, error: null }));
    mockRpc.mockReset().mockResolvedValue({ data: GOOD, error: null });
    mockFrom.mockReset();
    clearBrandInsightCache();
    now = 1_800_000_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    nowSpy.mockRestore();
    clearBrandInsightCache();
  });

  it('touches neither supabase nor the network at import', () => {
    mockGetSession.mockClear();
    jest.isolateModules(() => {
      require('../../src/services/brandInsightService');
    });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  describe('what it asks and what it answers', () => {
    it('calls get_brand_insight with the brand and returns the parsed answer', async () => {
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: PARSED_GOOD });
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('get_brand_insight', { p_brand: 'Zara' });
    });

    it('parses hostile answers instead of passing them on', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'ok', score: 99, n_bucket: '10-24', user_id: 'u1' }, error: null });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: INSUFFICIENT });
      mockRpc.mockResolvedValue({ data: 'garbage', error: null });
      expect(await loadBrandInsight('Arket')).toEqual({ state: 'ok', value: INSUFFICIENT });
      mockRpc.mockResolvedValue({ data: null, error: null });
      expect(await loadBrandInsight('Cos')).toEqual({ state: 'ok', value: INSUFFICIENT });
    });

    it('passes the answer for a brand that is below the threshold, and a paused service', async () => {
      mockRpc.mockResolvedValue({ data: INSUFFICIENT, error: null });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: INSUFFICIENT });
      mockRpc.mockResolvedValue({ data: { status: 'unavailable' }, error: null });
      expect(await loadBrandInsight('Arket')).toEqual({ state: 'ok', value: { status: 'unavailable' } });
    });
  });

  describe('guests and short brands', () => {
    it('is guest, with no call, when signed out', async () => {
      mockUser = null;
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'guest' });
      expect(await loadBrandInsight('')).toEqual({ state: 'guest' });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it.each(['', '   ', '!!!', '---', 'A', ' é ', '1'])('is insufficient, with no call, for the brand %j', async brand => {
      expect(await loadBrandInsight(brand)).toEqual({ state: 'ok', value: INSUFFICIENT });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('does not take a non-string for a brand', async () => {
      expect(await loadBrandInsight(undefined as unknown as string)).toEqual({ state: 'ok', value: INSUFFICIENT });
      expect(await loadBrandInsight(null as unknown as string)).toEqual({ state: 'ok', value: INSUFFICIENT });
      expect(await loadBrandInsight(42 as unknown as string)).toEqual({ state: 'ok', value: INSUFFICIENT });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('asks about a two-character brand', async () => {
      await loadBrandInsight('H&M');
      await loadBrandInsight('COS');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('does not remember a guest answer', async () => {
      mockUser = null;
      await loadBrandInsight('Zara');
      mockUser = { id: 'user-1' };
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: PARSED_GOOD });
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  describe('memory', () => {
    it('answers the same brand from memory', async () => {
      await loadBrandInsight('Zara');
      await loadBrandInsight('Zara');
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('shares one entry between spellings with the same brand key', async () => {
      await loadBrandInsight('Zara');
      expect(await loadBrandInsight('ZARA')).toEqual({ state: 'ok', value: PARSED_GOOD });
      await loadBrandInsight(' zara ');
      await loadBrandInsight('Z.A.R.A');
      expect(mockRpc).toHaveBeenCalledTimes(1);
      await loadBrandInsight('Hermes');
      await loadBrandInsight('Hermès');
      await loadBrandInsight('HERMÈS');
      expect(mockRpc).toHaveBeenCalledTimes(2);
      await loadBrandInsight('Dolce & Gabbana');
      await loadBrandInsight('Dolce and Gabbana');
      expect(mockRpc).toHaveBeenCalledTimes(3);
    });

    it('keeps brands apart', async () => {
      await loadBrandInsight('Zara');
      await loadBrandInsight('Arket');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('remembers "not enough ratings" and "paused" too', async () => {
      mockRpc.mockResolvedValue({ data: INSUFFICIENT, error: null });
      await loadBrandInsight('Zara');
      await loadBrandInsight('Zara');
      mockRpc.mockResolvedValue({ data: { status: 'unavailable' }, error: null });
      await loadBrandInsight('Arket');
      expect(await loadBrandInsight('Arket')).toEqual({ state: 'ok', value: { status: 'unavailable' } });
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('remembers that the server does not have the function yet', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function public.get_brand_insight(text) does not exist' } });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'unavailable' });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'unavailable' });
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('forgets an answer after six hours', async () => {
      await loadBrandInsight('Zara');
      now += SIX_HOURS - 1;
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(1);
      now += 1;
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(2);
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('does not trust an answer from a clock that went backwards', async () => {
      await loadBrandInsight('Zara');
      now -= 60 * 60 * 1000;
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('keeps at most 200 brands and drops the oldest first', async () => {
      for (let i = 0; i < 201; i += 1) {
        now += 1;
        await loadBrandInsight(`Brand${i}x`);
      }
      expect(mockRpc).toHaveBeenCalledTimes(201);
      await loadBrandInsight('Brand200x');      // newest: still remembered
      await loadBrandInsight('Brand1x');        // second oldest: still remembered
      expect(mockRpc).toHaveBeenCalledTimes(201);
      await loadBrandInsight('Brand0x');        // oldest: gone
      expect(mockRpc).toHaveBeenCalledTimes(202);
    });

    it('counts a refreshed brand as new, not as old', async () => {
      for (let i = 0; i < 200; i += 1) {
        now += 1;
        await loadBrandInsight(`Brand${i}x`);
      }
      now += SIX_HOURS;                          // every entry is now out of date
      await loadBrandInsight('Brand0x');        // refreshed: now the newest
      expect(mockRpc).toHaveBeenCalledTimes(201);
      await loadBrandInsight('Fresh201x');      // one more: the oldest (Brand1x) goes, not Brand0x
      await loadBrandInsight('Brand0x');
      expect(mockRpc).toHaveBeenCalledTimes(202);
    });

    it('forgets everything on clearBrandInsightCache', async () => {
      await loadBrandInsight('Zara');
      clearBrandInsightCache();
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });
  });

  describe('calls in flight', () => {
    /** Lets the caller get past its sign-in check and start the call. */
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    const deferred = () => {
      let resolve!: (v: unknown) => void;
      const promise = new Promise(res => { resolve = res; });
      return { promise, resolve };
    };

    it('shares one call between callers that ask at the same time', async () => {
      const gate = deferred();
      mockRpc.mockReturnValue(gate.promise);
      const first = loadBrandInsight('Zara');
      const second = loadBrandInsight('ZARA');
      const third = loadBrandInsight('zara');
      await flush();
      gate.resolve({ data: GOOD, error: null });
      const results = await Promise.all([first, second, third]);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(results[0]).toEqual({ state: 'ok', value: PARSED_GOOD });
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    });

    it('does not share a call between different brands', async () => {
      const gate = deferred();
      mockRpc.mockReturnValue(gate.promise);
      const a = loadBrandInsight('Zara');
      const b = loadBrandInsight('Arket');
      await flush();
      gate.resolve({ data: GOOD, error: null });
      await Promise.all([a, b]);
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('lets everyone who shared a failed call see the failure, and asks again afterwards', async () => {
      const gate = deferred();
      mockRpc.mockReturnValueOnce(gate.promise);
      const a = loadBrandInsight('Zara');
      const b = loadBrandInsight('Zara');
      await flush();
      gate.resolve({ data: null, error: { message: 'Network request failed' } });
      expect(await a).toEqual({ state: 'offline' });
      expect(await b).toEqual({ state: 'offline' });
      mockRpc.mockResolvedValue({ data: GOOD, error: null });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: PARSED_GOOD });
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('does not store an answer that was on its way when the memory was cleared', async () => {
      const gate = deferred();
      mockRpc.mockReturnValueOnce(gate.promise);
      const pending = loadBrandInsight('Zara');
      await flush();
      clearBrandInsightCache();
      gate.resolve({ data: GOOD, error: null });
      expect(await pending).toEqual({ state: 'ok', value: PARSED_GOOD });
      mockRpc.mockResolvedValue({ data: GOOD, error: null });
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('starts a new call for a brand asked about after the memory was cleared mid-flight', async () => {
      const gate = deferred();
      mockRpc.mockReturnValueOnce(gate.promise);
      const old = loadBrandInsight('Zara');
      await flush();
      clearBrandInsightCache();
      mockRpc.mockResolvedValue({ data: INSUFFICIENT, error: null });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: INSUFFICIENT });
      gate.resolve({ data: GOOD, error: null });
      await old;
      // The late answer must not replace the newer one in memory.
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: INSUFFICIENT });
    });
  });

  describe('failures', () => {
    it('words the daily limit, by code and by name', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'rating_rate_limited' } });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'error', message: QUOTA });
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } });
      expect(await loadBrandInsight('Arket')).toEqual({ state: 'error', message: QUOTA });
    });

    it('is unavailable when the function is not on the server yet', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_brand_insight(p_brand) in the schema cache' } });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'unavailable' });
    });

    it('is offline when there is no connection, whether the call fails or throws', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'offline' });
      mockRpc.mockRejectedValue(new TypeError('Failed to fetch'));
      expect(await loadBrandInsight('Arket')).toEqual({ state: 'offline' });
      mockRpc.mockImplementation(() => { throw new TypeError('Network request failed'); });
      expect(await loadBrandInsight('Cos')).toEqual({ state: 'offline' });
    });

    it('is a friendly error for anything else, and never throws', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'select * from brand_stats' } });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'error', message: 'Couldn’t load what members say.' });
      let i = 0;
      for (const thrown of ['boom', undefined, null, 42, { odd: true }]) {
        mockRpc.mockReset().mockRejectedValue(thrown);
        i += 1;
        expect((await loadBrandInsight(`Brand${i}x`)).state).toBe('error');
      }
    });

    it('never remembers an error, an offline answer or a quota answer', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'rating_rate_limited' } });
      expect((await loadBrandInsight('Zara')).state).toBe('error');
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
      expect((await loadBrandInsight('Zara')).state).toBe('offline');
      mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'x' } });
      expect((await loadBrandInsight('Zara')).state).toBe('error');
      expect(mockRpc).toHaveBeenCalledTimes(3);
      mockRpc.mockResolvedValue({ data: GOOD, error: null });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: PARSED_GOOD });
      expect(mockRpc).toHaveBeenCalledTimes(4);
      await loadBrandInsight('Zara');
      expect(mockRpc).toHaveBeenCalledTimes(4);
    });

    it('does not let a failure replace a good answer that is still fresh', async () => {
      await loadBrandInsight('Zara');
      mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
      expect(await loadBrandInsight('Zara')).toEqual({ state: 'ok', value: PARSED_GOOD });
    });
  });
});

describe('reportBrandInsight', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockGetSession.mockReset().mockImplementation(async () => ({ data: { session: mockUser ? { user: mockUser } : null }, error: null }));
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('sends the brand and the reason under their SQL names', async () => {
    await expect(reportBrandInsight('Zara', 'looks_manipulated')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('report_brand_insight', { p_brand: 'Zara', p_reason: 'looks_manipulated' });
  });

  it.each(['looks_manipulated', 'inaccurate', 'other'] as const)('accepts the reason %s', async reason => {
    await reportBrandInsight('Zara', reason);
    expect(mockRpc.mock.calls[0][1]).toEqual({ p_brand: 'Zara', p_reason: reason });
  });

  it('says to sign in, with no call, when signed out', async () => {
    mockUser = null;
    await expect(reportBrandInsight('Zara', 'other')).rejects.toThrow('You need to be signed in.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses a reason it does not know, or a brand with no key, without a call', async () => {
    await expect(reportBrandInsight('Zara', 'spam' as never)).rejects.toThrow('That couldn’t be saved. Please check it and try again.');
    await expect(reportBrandInsight('Zara', undefined as never)).rejects.toThrow('That couldn’t be saved. Please check it and try again.');
    await expect(reportBrandInsight('', 'other')).rejects.toThrow('That couldn’t be saved. Please check it and try again.');
    await expect(reportBrandInsight('A', 'other')).rejects.toThrow('That couldn’t be saved. Please check it and try again.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('words the failures for people', async () => {
    const message = async (error: unknown) => {
      mockRpc.mockReset().mockResolvedValue({ data: null, error });
      return reportBrandInsight('Zara', 'other').catch((e: Error) => e.message);
    };
    expect(await message({ code: '54000', message: 'rating_rate_limited' })).toBe('You’ve sent a lot of reports today. Please try again tomorrow.');
    expect(await message({ code: '22023', message: 'invalid_report' })).toBe('That couldn’t be saved. Please check it and try again.');
    expect(await message({ code: '28000', message: 'not_authenticated' })).toBe('You need to be signed in.');
    expect(await message({ code: '42883', message: 'function does not exist' })).toBe('This isn’t available yet.');
    expect(await message({ message: 'Network request failed' })).toBe('Couldn’t send that. Check your connection and try again.');
    expect(await message({ code: 'XX000', message: 'insert into insight_reports' })).toBe('Couldn’t send that. Check your connection and try again.');
  });

  it('throws an Error, not a raw object, when the call itself throws', async () => {
    for (const thrown of [new TypeError('Network request failed'), 'boom', undefined, null]) {
      mockRpc.mockReset().mockRejectedValue(thrown);
      const failure = reportBrandInsight('Zara', 'other');
      await expect(failure).rejects.toBeInstanceOf(Error);
      await expect(failure).rejects.toThrow('Couldn’t send that. Check your connection and try again.');
    }
  });
});
