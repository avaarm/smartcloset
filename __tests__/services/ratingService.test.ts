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
  deleteAllMyRatings,
  deleteBrandRating,
  deleteItemRating,
  exportMyRatings,
  loadMyBrandSummary,
  loadMyItemRating,
  loadMyRatingCounts,
  saveBrandRating,
  saveItemRating,
  withdrawContributions,
} from '../../src/services/ratingService';
import { NOTE_MAX_LENGTH } from '../../src/config/ratingVocabulary';

const ITEM = '3f6c1d0e-8a54-4b0e-9c1a-2f7d5b6a9c11';

const itemRow = (over: Record<string, unknown> = {}) => ({
  item_id: ITEM,
  overall: 4,
  touch: 5,
  touch_tags: ['soft', 'silky'],
  comfort: 4,
  comfort_tags: ['breathable'],
  holds_up: 3,
  holds_up_tags: ['washes_well', 'keeps_shape'],
  fit: 'true_to_size',
  would_buy_again: 'yes',
  note: 'Lovely in summer',
  contributed: true,
  contributed_at: '2026-10-14T11:00:00Z',
  brand_key: 'zara',
  wears_at_rating: 5,
  created_at: '2026-10-14T10:00:00Z',
  updated_at: '2026-10-15T10:00:00Z',
  ...over,
});

const mappedItem = (over: Record<string, unknown> = {}) => ({
  itemId: ITEM,
  overall: 4,
  touch: 5,
  touchTags: ['soft', 'silky'],
  comfort: 4,
  comfortTags: ['breathable'],
  holdsUp: 3,
  holdsUpTags: ['washes_well', 'keeps_shape'],
  fit: 'true_to_size',
  wouldBuyAgain: 'yes',
  note: 'Lovely in summer',
  contributed: true,
  wearsAtRating: 5,
  createdAt: '2026-10-14T10:00:00Z',
  updatedAt: '2026-10-15T10:00:00Z',
  ...over,
});

const brandRow = (over: Record<string, unknown> = {}) => ({
  brand_label: 'Zara',
  overall: 4,
  quality: 3,
  fit_consistency: 2,
  value: 5,
  contributed: false,
  contributed_at: null,
  created_at: '2026-10-14T10:00:00Z',
  updated_at: '2026-10-15T10:00:00Z',
  ...over,
});

const consentRow = (over: Record<string, unknown> = {}) => ({
  purpose: 'share_ratings',
  granted: true,
  policy_version: 'ratings-2026-10',
  decided_at: '2026-10-14T10:00:00Z',
  adult_confirmed_at: '2026-10-14T10:00:00Z',
  requires_adult: true,
  current_version: 'ratings-2026-10',
  needs_reconsent: false,
  ...over,
});

/** A stand-in for the select chain: records each query and answers it with `answer`. */
interface Query { table: string; columns: string; opts?: unknown; eq: Array<[string, unknown]>; order?: string; range?: [number, number] }
type Answer = { data?: unknown; count?: number | null; error?: unknown };
let queries: Query[] = [];
let answer: (q: Query) => Answer = () => ({ data: [], count: 0, error: null });

const makeBuilder = (table: string) => {
  const q: Query = { table, columns: '', eq: [] };
  const builder: any = {
    select: (columns: string, opts?: unknown) => { q.columns = columns; q.opts = opts; return builder; },
    eq: (column: string, value: unknown) => { q.eq.push([column, value]); return builder; },
    order: (column: string) => { q.order = column; return builder; },
    range: (from: number, to: number) => { q.range = [from, to]; return builder; },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      queries.push(q);
      return Promise.resolve().then(() => answer(q)).then(resolve, reject);
    },
  };
  return builder;
};

/** rpc answers by function name; anything not listed answers with an empty success. */
const rpcAnswers = (answers: Record<string, { data?: unknown; error?: unknown }>) =>
  mockRpc.mockImplementation(async (fn: string) => ({ data: null, error: null, ...(answers[fn] ?? {}) }));

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockUser = { id: 'user-1' };
  mockGetSession.mockReset().mockImplementation(async () => ({ data: { session: mockUser ? { user: mockUser } : null }, error: null }));
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  queries = [];
  answer = () => ({ data: [], count: 0, error: null });
  mockFrom.mockReset().mockImplementation((table: string) => makeBuilder(table));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

describe('import', () => {
  it('touches neither supabase nor the network', () => {
    mockGetSession.mockClear();
    jest.isolateModules(() => {
      require('../../src/services/ratingService');
    });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('guests and local ids', () => {
  it('reads answer guest without a call when signed out', async () => {
    mockUser = null;
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'guest' });
    expect(await loadMyBrandSummary('Zara')).toEqual({ state: 'guest' });
    expect(await loadMyRatingCounts()).toEqual({ state: 'guest' });
    expect(mockGetSession).toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('the export of a guest has empty sections and makes no call', async () => {
    mockUser = null;
    expect(await exportMyRatings()).toEqual({ itemRatings: [], brandRatings: [], consents: [] });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it.each(['item-1', '', 'demo-3', '3f6c1d0e-8a54-4b0e-9c1a', ' 3f6c1d0e-8a54-4b0e-9c1a-2f7d5b6a9c11', 'not-a-uuid-at-all-not-a-uuid-at-all-x'])(
    'a local id (%j) is guest for a read, with no call',
    async id => {
      expect(await loadMyItemRating(id)).toEqual({ state: 'guest' });
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it('an upper-case cloud id is still a cloud id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await loadMyItemRating(ITEM.toUpperCase())).toEqual({ state: 'ok', value: null });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('every write says to sign in, with no call, when signed out', async () => {
    mockUser = null;
    const signIn = 'You need to be signed in.';
    await expect(saveItemRating(ITEM, { overall: 4 })).rejects.toThrow(signIn);
    await expect(deleteItemRating(ITEM)).rejects.toThrow(signIn);
    await expect(saveBrandRating('Zara', { overall: 4 })).rejects.toThrow(signIn);
    await expect(deleteBrandRating('Zara')).rejects.toThrow(signIn);
    await expect(withdrawContributions()).rejects.toThrow(signIn);
    await expect(deleteAllMyRatings()).rejects.toThrow(signIn);
    await expect(saveItemRating('item-1', { overall: 4 })).rejects.toThrow(signIn);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a write about a local id fails before any call', async () => {
    await expect(saveItemRating('item-1', { overall: 4 })).rejects.toThrow('That item is no longer in your closet.');
    await expect(deleteItemRating('item-1')).rejects.toThrow('That item is no longer in your closet.');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('loadMyItemRating', () => {
  it('calls get_my_item_rating and maps the row from snake case', async () => {
    mockRpc.mockResolvedValue({ data: itemRow(), error: null });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'ok', value: mappedItem() });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_my_item_rating', { p_item_id: ITEM });
  });

  it('is ok with null when the item is not rated yet', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'ok', value: null });
  });

  it('keeps a rating with only an overall score', async () => {
    mockRpc.mockResolvedValue({
      data: itemRow({ touch: null, touch_tags: [], comfort: null, comfort_tags: [], holds_up: null, holds_up_tags: [], fit: null, would_buy_again: null, note: null, contributed: false }),
      error: null,
    });
    expect(await loadMyItemRating(ITEM)).toEqual({
      state: 'ok',
      value: mappedItem({ touch: null, touchTags: [], comfort: null, comfortTags: [], holdsUp: null, holdsUpTags: [], fit: null, wouldBuyAgain: null, note: null, contributed: false }),
    });
  });

  it('drops unknown tags, repeats and everything past four', async () => {
    mockRpc.mockResolvedValue({
      data: itemRow({
        touch_tags: ['soft', 'bogus', 'soft', 'silky', 7, null, 'buttery', 'smooth', 'crisp'],
        comfort_tags: ['soft', 'warm'],          // 'soft' is a touch tag, not a comfort tag
        holds_up_tags: 'washes_well',            // not a list
      }),
      error: null,
    });
    const result = await loadMyItemRating(ITEM);
    expect(result.state).toBe('ok');
    if (result.state !== 'ok' || !result.value) return;
    expect(result.value.touchTags).toEqual(['soft', 'silky', 'buttery', 'smooth']);
    expect(result.value.comfortTags).toEqual(['warm']);
    expect(result.value.holdsUpTags).toEqual([]);
  });

  it.each([0, 6, -1, 3.5, NaN, Infinity, '4', true, {}, []])('turns the optional score %p into null', async bad => {
    mockRpc.mockResolvedValue({ data: itemRow({ touch: bad, comfort: bad, holds_up: bad }), error: null });
    const result = await loadMyItemRating(ITEM);
    expect(result.state).toBe('ok');
    if (result.state !== 'ok' || !result.value) return;
    expect(result.value).toMatchObject({ overall: 4, touch: null, comfort: null, holdsUp: null });
  });

  it('turns an unknown fit or buy-again answer into null', async () => {
    mockRpc.mockResolvedValue({ data: itemRow({ fit: 'tight', would_buy_again: 'definitely' }), error: null });
    const result = await loadMyItemRating(ITEM);
    expect(result).toMatchObject({ state: 'ok', value: { fit: null, wouldBuyAgain: null } });
  });

  it('reads only a true contributed flag as true, and tidies counts, notes and dates', async () => {
    mockRpc.mockResolvedValue({
      data: itemRow({ contributed: 'yes', wears_at_rating: -3, note: '   ', created_at: 5, updated_at: null }),
      error: null,
    });
    expect(await loadMyItemRating(ITEM)).toMatchObject({
      state: 'ok',
      value: { contributed: false, wearsAtRating: 0, note: null, createdAt: '', updatedAt: '' },
    });
    mockRpc.mockResolvedValue({ data: itemRow({ wears_at_rating: 2.5, note: 42 }), error: null });
    expect(await loadMyItemRating(ITEM)).toMatchObject({ state: 'ok', value: { wearsAtRating: 0, note: null } });
  });

  it('cuts an over-long stored note to the limit', async () => {
    mockRpc.mockResolvedValue({ data: itemRow({ note: 'x'.repeat(NOTE_MAX_LENGTH + 40) }), error: null });
    const result = await loadMyItemRating(ITEM);
    expect(result.state === 'ok' && result.value?.note).toBe('x'.repeat(NOTE_MAX_LENGTH));
  });

  it('uses the id it asked about when the row does not name one', async () => {
    mockRpc.mockResolvedValue({ data: itemRow({ item_id: undefined }), error: null });
    expect(await loadMyItemRating(ITEM)).toMatchObject({ state: 'ok', value: { itemId: ITEM } });
  });

  it.each([
    ['no overall score', itemRow({ overall: null })],
    ['an overall score of 9', itemRow({ overall: 9 })],
    ['a text overall score', itemRow({ overall: 'great' })],
    ['a string', 'rating'],
    ['a number', 7],
    ['a list', [itemRow()]],
    ['nothing at all', undefined],
  ])('is an error, not a crash, for a row with %s', async (_name, data) => {
    mockRpc.mockResolvedValue({ data, error: null });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'error', message: 'Couldn’t load your rating.' });
  });

  it('is unavailable when the function is not on the server yet', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function public.get_my_item_rating(uuid) does not exist' } });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'unavailable' });
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_my_item_rating(p_item_id) in the schema cache' } });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'unavailable' });
  });

  it('is offline when there is no connection, whether the call fails or throws', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'offline' });
    mockRpc.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'offline' });
    mockRpc.mockImplementation(() => { throw new TypeError('Network request failed'); });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'offline' });
  });

  it('is an error with a friendly message for anything else, and never throws', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'rating_rate_limited' } });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'error', message: 'You’ve rated a lot today. Please come back tomorrow.' });
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'select * from item_ratings where secret' } });
    expect(await loadMyItemRating(ITEM)).toEqual({ state: 'error', message: 'Couldn’t load your rating.' });
    for (const thrown of ['boom', undefined, null, 42, { odd: true }]) {
      mockRpc.mockReset().mockRejectedValue(thrown);
      const result = await loadMyItemRating(ITEM);
      expect(result.state).toBe('error');
    }
  });
});

describe('saveItemRating', () => {
  const saved = { data: [{ contributed: false, contribution_blocked: null, updated_at: '2026-10-15T12:00:00Z' }], error: null };

  it('sends every argument under its SQL name', async () => {
    mockRpc.mockResolvedValue(saved);
    await saveItemRating(ITEM, {
      overall: 4,
      touch: 5,
      touchTags: ['soft', 'silky'],
      comfort: 3,
      comfortTags: ['warm'],
      holdsUp: 2,
      holdsUpTags: ['pills'],
      fit: 'runs_small',
      wouldBuyAgain: 'maybe',
      note: 'Keep for winter',
      contribute: true,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('save_item_rating', {
      p_item_id: ITEM,
      p_overall: 4,
      p_touch: 5,
      p_touch_tags: ['soft', 'silky'],
      p_comfort: 3,
      p_comfort_tags: ['warm'],
      p_holds_up: 2,
      p_holds_up_tags: ['pills'],
      p_fit: 'runs_small',
      p_would_buy_again: 'maybe',
      p_note: 'Keep for winter',
      p_contribute: true,
      p_only_if_new: false,
    });
  });

  it('sends null for scores, fit and buy-again, and [] for tags, that the caller leaves out', async () => {
    mockRpc.mockResolvedValue(saved);
    await saveItemRating(ITEM, { overall: 3 });
    expect(mockRpc).toHaveBeenCalledWith('save_item_rating', {
      p_item_id: ITEM,
      p_overall: 3,
      p_touch: null,
      p_touch_tags: [],
      p_comfort: null,
      p_comfort_tags: [],
      p_holds_up: null,
      p_holds_up_tags: [],
      p_fit: null,
      p_would_buy_again: null,
      p_note: null,
      p_contribute: null,
      p_only_if_new: false,
    });
  });

  it('sends explicit nulls as nulls too', async () => {
    mockRpc.mockResolvedValue(saved);
    await saveItemRating(ITEM, { overall: 3, touch: null, comfort: null, holdsUp: null, fit: null, wouldBuyAgain: null, note: null });
    const args = mockRpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_touch: null, p_comfort: null, p_holds_up: null, p_fit: null, p_would_buy_again: null, p_note: null });
  });

  it.each([
    ['true', { contribute: true }, true],
    ['false', { contribute: false }, false],
    ['left out', {}, null],
    ['undefined', { contribute: undefined }, null],
  ])('sends p_contribute %s as %p', async (_name, extra, expected) => {
    mockRpc.mockResolvedValue(saved);
    await saveItemRating(ITEM, { overall: 4, ...extra });
    expect(mockRpc.mock.calls[0][1].p_contribute).toBe(expected);
  });

  it('sends createOnly as p_only_if_new, and nothing else about contribution', async () => {
    mockRpc.mockResolvedValue(saved);
    await saveItemRating(ITEM, { overall: 5, createOnly: true });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_overall: 5, p_only_if_new: true, p_contribute: null });
    mockRpc.mockClear();
    await saveItemRating(ITEM, { overall: 5, createOnly: false });
    expect(mockRpc.mock.calls[0][1].p_only_if_new).toBe(false);
  });

  describe('the note', () => {
    const sentNote = async (note: string | null | undefined) => {
      mockRpc.mockClear();
      mockRpc.mockResolvedValue(saved);
      await saveItemRating(ITEM, { overall: 4, note });
      return mockRpc.mock.calls[0][1].p_note;
    };

    it('is trimmed', async () => {
      expect(await sentNote('  soft after a wash \n')).toBe('soft after a wash');
    });

    it('is null when empty, blank or left out', async () => {
      expect(await sentNote('')).toBeNull();
      expect(await sentNote('   \n\t ')).toBeNull();
      expect(await sentNote(null)).toBeNull();
      expect(await sentNote(undefined)).toBeNull();
    });

    it('is cut to the limit', async () => {
      expect(await sentNote('x'.repeat(NOTE_MAX_LENGTH))).toBe('x'.repeat(NOTE_MAX_LENGTH));
      expect(await sentNote('x'.repeat(NOTE_MAX_LENGTH + 1))).toBe('x'.repeat(NOTE_MAX_LENGTH));
      expect(await sentNote(`  ${'y'.repeat(900)}  `)).toBe('y'.repeat(NOTE_MAX_LENGTH));
    });

    it('is cut by characters, so an emoji at the edge is kept whole or left out whole', async () => {
      const sent = await sentNote(`${'a'.repeat(NOTE_MAX_LENGTH - 1)}😀😀😀`);
      expect(sent).toBe(`${'a'.repeat(NOTE_MAX_LENGTH - 1)}😀`);
      expect(Array.from(sent as string)).toHaveLength(NOTE_MAX_LENGTH);
    });
  });

  it('hands tags to the server as given, so a wrong list is refused there and not hidden here', async () => {
    mockRpc.mockResolvedValue(saved);
    const tags = ['soft', 'silky', 'buttery', 'smooth', 'crisp'] as const;
    await saveItemRating(ITEM, { overall: 4, touchTags: [...tags] });
    expect(mockRpc.mock.calls[0][1].p_touch_tags).toEqual([...tags]);
  });

  describe('the answer', () => {
    it('maps the first row', async () => {
      mockRpc.mockResolvedValue({ data: [{ contributed: true, contribution_blocked: null, updated_at: '2026-10-15T12:00:00Z' }], error: null });
      expect(await saveItemRating(ITEM, { overall: 4, contribute: true })).toEqual({
        contributed: true,
        blocked: null,
        updatedAt: '2026-10-15T12:00:00Z',
      });
    });

    it.each(['not_worn', 'no_brand', 'no_consent'] as const)('says why a contribution was blocked: %s', async reason => {
      mockRpc.mockResolvedValue({ data: [{ contributed: false, contribution_blocked: reason, updated_at: '2026-10-15T12:00:00Z' }], error: null });
      expect(await saveItemRating(ITEM, { overall: 4, contribute: true })).toEqual({
        contributed: false,
        blocked: reason,
        updatedAt: '2026-10-15T12:00:00Z',
      });
    });

    it('never reports a blocked contribution as counting', async () => {
      mockRpc.mockResolvedValue({ data: [{ contributed: true, contribution_blocked: 'not_worn', updated_at: 'x' }], error: null });
      expect(await saveItemRating(ITEM, { overall: 4, contribute: true })).toMatchObject({ contributed: false, blocked: 'not_worn' });
    });

    it('ignores a reason it does not know', async () => {
      mockRpc.mockResolvedValue({ data: [{ contributed: false, contribution_blocked: 'because', updated_at: 'x' }], error: null });
      expect(await saveItemRating(ITEM, { overall: 4, contribute: true })).toMatchObject({ contributed: false, blocked: null });
    });

    it('accepts a single object instead of a list', async () => {
      mockRpc.mockResolvedValue({ data: { contributed: true, contribution_blocked: null, updated_at: 'x' }, error: null });
      expect(await saveItemRating(ITEM, { overall: 4 })).toEqual({ contributed: true, blocked: null, updatedAt: 'x' });
    });

    it.each([[[]], [null], [undefined], ['saved'], [[null]], [[7]]])('reports a private save when the answer is %j', async data => {
      mockRpc.mockResolvedValue({ data, error: null });
      expect(await saveItemRating(ITEM, { overall: 4 })).toEqual({ contributed: false, blocked: null, updatedAt: '' });
    });

    it('counts only a true contributed flag', async () => {
      mockRpc.mockResolvedValue({ data: [{ contributed: 'true', contribution_blocked: null, updated_at: 'x' }], error: null });
      expect((await saveItemRating(ITEM, { overall: 4 })).contributed).toBe(false);
    });
  });

  describe('failures throw a friendly Error', () => {
    const fails: Array<[string, unknown, string]> = [
      ['the daily limit by code', { code: '54000', message: 'x' }, 'You’ve rated a lot today. Please come back tomorrow.'],
      ['the daily limit by name', { message: 'rating_rate_limited' }, 'You’ve rated a lot today. Please come back tomorrow.'],
      ['not signed in', { code: '28000', message: 'not_authenticated' }, 'You need to be signed in.'],
      ['an item that is gone', { code: '22023', message: 'item_not_found' }, 'That item is no longer in your closet.'],
      ['a rating the server refuses', { code: '22023', message: 'invalid_rating' }, 'That couldn’t be saved. Please check it and try again.'],
      ['older wording than the server holds', { code: '22023', message: 'stale_consent_text' }, 'Please update SmartCloset to change this.'],
      ['an agreement that is needed', { message: 'consent_required' }, 'Agree to add your ratings to brand insights first.'],
      ['an adult confirmation that is needed', { message: 'adult_required' }, 'You need to confirm you’re 18 or older.'],
      ['a function that is not there yet', { code: '42883', message: 'function does not exist' }, 'This isn’t available yet.'],
      ['no connection', { message: 'TypeError: Network request failed' }, 'Couldn’t save your rating. Check your connection and try again.'],
      ['anything else', { code: 'XX000', message: 'insert into item_ratings failed' }, 'Couldn’t save your rating. Check your connection and try again.'],
    ];

    it.each(fails)('for %s', async (_name, error, message) => {
      mockRpc.mockResolvedValue({ data: null, error });
      const failure = saveItemRating(ITEM, { overall: 4 });
      await expect(failure).rejects.toBeInstanceOf(Error);
      await expect(failure).rejects.toThrow(message);
    });

    it('for a call that throws instead of answering', async () => {
      for (const thrown of [new TypeError('Network request failed'), 'boom', undefined, null]) {
        mockRpc.mockReset().mockRejectedValue(thrown);
        await expect(saveItemRating(ITEM, { overall: 4 })).rejects.toThrow('Couldn’t save your rating. Check your connection and try again.');
      }
    });

    it('never shows a status code, SQL or a function name', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'new row for relation "item_ratings" violates check constraint' } });
      const failure = await saveItemRating(ITEM, { overall: 4 }).catch((e: Error) => e);
      expect((failure as Error).message).not.toMatch(/23514|relation|constraint|save_item_rating|item_ratings/);
    });
  });
});

describe('deleteItemRating', () => {
  it('calls delete_item_rating with the item id', async () => {
    await expect(deleteItemRating(ITEM)).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('delete_item_rating', { p_item_id: ITEM });
  });

  it('throws a friendly Error when it fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await expect(deleteItemRating(ITEM)).rejects.toThrow('Couldn’t remove that. Check your connection and try again.');
    mockRpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'not_authenticated' } });
    await expect(deleteItemRating(ITEM)).rejects.toThrow('You need to be signed in.');
    mockRpc.mockRejectedValue(new Error('boom'));
    await expect(deleteItemRating(ITEM)).rejects.toThrow('Couldn’t remove that. Check your connection and try again.');
  });
});

describe('loadMyBrandSummary', () => {
  const summary = (over: Record<string, unknown> = {}) => ({
    items_rated: 4,
    avg_overall: 3.8,
    brand_rating: brandRow(),
    can_rate_brand: true,
    ...over,
  });

  it('calls get_my_brand_summary and maps the answer', async () => {
    mockRpc.mockResolvedValue({ data: summary(), error: null });
    expect(await loadMyBrandSummary('Zara')).toEqual({
      state: 'ok',
      value: {
        itemsRated: 4,
        avgOverall: 3.8,
        brandRating: { brandLabel: 'Zara', overall: 4, quality: 3, fitConsistency: 2, value: 5, contributed: false, updatedAt: '2026-10-15T10:00:00Z' },
        canRateBrand: true,
      },
    });
    expect(mockRpc).toHaveBeenCalledWith('get_my_brand_summary', { p_brand: 'Zara' });
  });

  it('maps a brand with nothing rated and no brand rating', async () => {
    mockRpc.mockResolvedValue({ data: summary({ items_rated: 0, avg_overall: null, brand_rating: null, can_rate_brand: false }), error: null });
    expect(await loadMyBrandSummary('Zara')).toEqual({
      state: 'ok',
      value: { itemsRated: 0, avgOverall: null, brandRating: null, canRateBrand: false },
    });
  });

  it('tidies numbers and flags that are not what they should be', async () => {
    mockRpc.mockResolvedValue({ data: summary({ items_rated: -2, avg_overall: 9, can_rate_brand: 'yes', brand_rating: brandRow({ quality: 0, fit_consistency: 7, value: 'x', contributed: 1 }) }), error: null });
    expect(await loadMyBrandSummary('Zara')).toEqual({
      state: 'ok',
      value: {
        itemsRated: 0,
        avgOverall: null,
        canRateBrand: false,
        brandRating: { brandLabel: 'Zara', overall: 4, quality: null, fitConsistency: null, value: null, contributed: false, updatedAt: '2026-10-15T10:00:00Z' },
      },
    });
    mockRpc.mockResolvedValue({ data: summary({ items_rated: 2.5, avg_overall: 'high' }), error: null });
    expect(await loadMyBrandSummary('Zara')).toMatchObject({ state: 'ok', value: { itemsRated: 0, avgOverall: null } });
  });

  it('drops a brand rating it cannot use', async () => {
    for (const bad of [brandRow({ overall: 9 }), brandRow({ brand_label: '' }), brandRow({ brand_label: undefined }), 'rated', 4, []]) {
      mockRpc.mockResolvedValue({ data: summary({ brand_rating: bad }), error: null });
      expect(await loadMyBrandSummary('Zara')).toMatchObject({ state: 'ok', value: { brandRating: null, itemsRated: 4 } });
    }
  });

  it.each([[null], [undefined], ['x'], [5], [[]]])('is an error, not a crash, when the answer is %j', async data => {
    mockRpc.mockResolvedValue({ data, error: null });
    expect(await loadMyBrandSummary('Zara')).toEqual({ state: 'error', message: 'Couldn’t load your rating.' });
  });

  it.each(['', '   ', '!!!', 'A', ' é '])('answers an empty summary for %j without a call', async brand => {
    expect(await loadMyBrandSummary(brand)).toEqual({
      state: 'ok',
      value: { itemsRated: 0, avgOverall: null, brandRating: null, canRateBrand: false },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('asks the server about text that reads as a key, such as "&" (which is "and")', async () => {
    mockRpc.mockResolvedValue({ data: summary(), error: null });
    await loadMyBrandSummary('&');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('does not fold away a brand with accents', async () => {
    mockRpc.mockResolvedValue({ data: summary(), error: null });
    await loadMyBrandSummary('Hermès');
    expect(mockRpc).toHaveBeenCalledWith('get_my_brand_summary', { p_brand: 'Hermès' });
  });

  it('reports unavailable, offline and error states', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'x' } });
    expect(await loadMyBrandSummary('Zara')).toEqual({ state: 'unavailable' });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    expect(await loadMyBrandSummary('Zara')).toEqual({ state: 'offline' });
    mockRpc.mockRejectedValue(new Error('boom'));
    expect(await loadMyBrandSummary('Zara')).toMatchObject({ state: 'error' });
  });
});

describe('saveBrandRating', () => {
  it('sends every argument under its SQL name', async () => {
    mockRpc.mockResolvedValue({ data: [{ contributed: false, contribution_blocked: null }], error: null });
    await saveBrandRating('Zara', { overall: 4, quality: 3, fitConsistency: 2, value: 5, contribute: false });
    expect(mockRpc).toHaveBeenCalledWith('save_brand_rating', {
      p_brand: 'Zara',
      p_overall: 4,
      p_quality: 3,
      p_fit_consistency: 2,
      p_value: 5,
      p_contribute: false,
    });
  });

  it('sends null for what the caller leaves out', async () => {
    mockRpc.mockResolvedValue({ data: [{ contributed: false, contribution_blocked: null }], error: null });
    await saveBrandRating('Zara', { overall: 4 });
    expect(mockRpc).toHaveBeenCalledWith('save_brand_rating', {
      p_brand: 'Zara',
      p_overall: 4,
      p_quality: null,
      p_fit_consistency: null,
      p_value: null,
      p_contribute: null,
    });
  });

  it.each([[true, true], [false, false], [undefined, null]])('sends p_contribute %p as %p', async (contribute, expected) => {
    mockRpc.mockResolvedValue({ data: [{ contributed: false, contribution_blocked: null }], error: null });
    await saveBrandRating('Zara', { overall: 4, contribute });
    expect(mockRpc.mock.calls[0][1].p_contribute).toBe(expected);
  });

  it('maps the answer, with the reason a contribution was blocked', async () => {
    mockRpc.mockResolvedValue({ data: [{ contributed: true, contribution_blocked: null }], error: null });
    expect(await saveBrandRating('Zara', { overall: 4, contribute: true })).toEqual({ contributed: true, blocked: null });
    for (const reason of ['not_worn', 'no_consent', 'no_brand'] as const) {
      mockRpc.mockResolvedValue({ data: [{ contributed: false, contribution_blocked: reason }], error: null });
      expect(await saveBrandRating('Zara', { overall: 4, contribute: true })).toEqual({ contributed: false, blocked: reason });
    }
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await saveBrandRating('Zara', { overall: 4 })).toEqual({ contributed: false, blocked: null });
  });

  it('says why a brand cannot be rated yet', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not_a_brand_owner' } });
    await expect(saveBrandRating('Zara', { overall: 4 })).rejects.toThrow('You can rate a brand once you own something from it.');
  });

  it('words the other refusals', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'rating_rate_limited' } });
    await expect(saveBrandRating('Zara', { overall: 4 })).rejects.toThrow('You’ve rated a lot today. Please come back tomorrow.');
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'invalid_brand' } });
    await expect(saveBrandRating('Zara', { overall: 4 })).rejects.toThrow('That couldn’t be saved. Please check it and try again.');
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await expect(saveBrandRating('Zara', { overall: 4 })).rejects.toThrow('Couldn’t save your rating. Check your connection and try again.');
    mockRpc.mockRejectedValue('boom');
    await expect(saveBrandRating('Zara', { overall: 4 })).rejects.toThrow('Couldn’t save your rating. Check your connection and try again.');
  });

  it.each(['', '  ', '***', 'A'])('refuses %j without a call', async brand => {
    await expect(saveBrandRating(brand, { overall: 4 })).rejects.toThrow('That couldn’t be saved. Please check it and try again.');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('deleteBrandRating', () => {
  it('calls delete_brand_rating with the brand', async () => {
    await expect(deleteBrandRating('Zara')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('delete_brand_rating', { p_brand: 'Zara' });
  });

  it('does nothing, without a call, for text with no brand key', async () => {
    await expect(deleteBrandRating('  ')).resolves.toBeUndefined();
    await expect(deleteBrandRating('A')).resolves.toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('throws a friendly Error when it fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await expect(deleteBrandRating('Zara')).rejects.toThrow('Couldn’t remove that. Check your connection and try again.');
  });
});

describe('withdrawContributions and deleteAllMyRatings', () => {
  it('call their functions with no arguments', async () => {
    await expect(withdrawContributions()).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenLastCalledWith('withdraw_contributions');
    await expect(deleteAllMyRatings()).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenLastCalledWith('delete_all_my_ratings');
  });

  it('throw a friendly Error when they fail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await expect(withdrawContributions()).rejects.toThrow('Couldn’t stop sharing your ratings. Check your connection and try again.');
    await expect(deleteAllMyRatings()).rejects.toThrow('Couldn’t remove that. Check your connection and try again.');
    mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'x' } });
    await expect(withdrawContributions()).rejects.toThrow('This isn’t available yet.');
    mockRpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'not_authenticated' } });
    await expect(deleteAllMyRatings()).rejects.toThrow('You need to be signed in.');
    mockRpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(deleteAllMyRatings()).rejects.toThrow('Couldn’t remove that. Check your connection and try again.');
  });
});

describe('loadMyRatingCounts', () => {
  /** items 5 (2 private), brands 3 (1 private). */
  const counts = (q: Query): Answer => {
    const privateOnly = q.eq.some(([column, value]) => column === 'contributed' && value === false);
    if (q.table === 'item_ratings') return { count: privateOnly ? 2 : 5, error: null };
    return { count: privateOnly ? 1 : 3, error: null };
  };

  it('counts the person’s own rows with head-only selects', async () => {
    answer = counts;
    expect(await loadMyRatingCounts()).toEqual({ state: 'ok', value: { items: 5, brands: 3, notContributing: 3 } });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(queries).toHaveLength(4);
    for (const q of queries) {
      expect(q.opts).toEqual({ count: 'exact', head: true });
      expect(q.eq).toContainEqual(['user_id', 'user-1']);
    }
    const summary = queries.map(q => `${q.table}:${q.eq.some(([c]) => c === 'contributed') ? 'private' : 'all'}`).sort();
    expect(summary).toEqual(['brand_ratings:all', 'brand_ratings:private', 'item_ratings:all', 'item_ratings:private']);
    expect(queries.filter(q => q.eq.some(([c]) => c === 'contributed')).every(q => q.eq.some(([c, v]) => c === 'contributed' && v === false))).toBe(true);
  });

  it('says zero when there is nothing yet', async () => {
    answer = () => ({ count: 0, error: null });
    expect(await loadMyRatingCounts()).toEqual({ state: 'ok', value: { items: 0, brands: 0, notContributing: 0 } });
  });

  it('is unavailable when the tables are not on the server yet', async () => {
    answer = () => ({ count: null, error: { code: '42P01', message: 'relation "public.item_ratings" does not exist' } });
    expect(await loadMyRatingCounts()).toEqual({ state: 'unavailable' });
    answer = () => ({ count: null, error: { code: 'PGRST205', message: 'Could not find the table \'public.item_ratings\' in the schema cache' } });
    expect(await loadMyRatingCounts()).toEqual({ state: 'unavailable' });
  });

  it('is offline without a connection', async () => {
    answer = () => ({ count: null, error: { message: 'TypeError: Network request failed' } });
    expect(await loadMyRatingCounts()).toEqual({ state: 'offline' });
  });

  it('is an error when one of the counts fails or comes back empty', async () => {
    answer = q => (q.table === 'brand_ratings' && q.eq.length > 1 ? { count: null, error: { code: 'XX000', message: 'boom' } } : counts(q));
    expect(await loadMyRatingCounts()).toEqual({ state: 'error', message: 'Couldn’t load your rating.' });
    answer = () => ({ count: null, error: null });
    expect(await loadMyRatingCounts()).toMatchObject({ state: 'error' });
    answer = () => ({ count: -1, error: null });
    expect(await loadMyRatingCounts()).toMatchObject({ state: 'error' });
  });

  it('never throws, even when the client has no tables or throws', async () => {
    mockFrom.mockImplementation(() => { throw new TypeError('supabase.from is not a function'); });
    expect(await loadMyRatingCounts()).toMatchObject({ state: 'error' });
    mockFrom.mockImplementation(() => { throw new TypeError('Network request failed'); });
    expect(await loadMyRatingCounts()).toEqual({ state: 'offline' });
    answer = () => { throw new Error('boom'); };
    mockFrom.mockImplementation((table: string) => makeBuilder(table));
    expect(await loadMyRatingCounts()).toMatchObject({ state: 'error' });
  });
});

describe('exportMyRatings', () => {
  const withData = (items: unknown[], brands: unknown[]) => {
    answer = q => ({ data: q.table === 'item_ratings' ? items : brands, error: null });
    rpcAnswers({ get_my_consents: { data: [consentRow()] } });
  };

  it('returns the person’s own ratings, notes included, and their consent answers', async () => {
    withData([itemRow({ wears_at_rating: undefined })], [brandRow({ contributed: true })]);
    const exported = await exportMyRatings();
    const expectedItem = Object.fromEntries(Object.entries(mappedItem()).filter(([key]) => key !== 'wearsAtRating'));
    expect(exported).toEqual({
      itemRatings: [expectedItem],
      brandRatings: [{ brandLabel: 'Zara', overall: 4, quality: 3, fitConsistency: 2, value: 5, contributed: true, updatedAt: '2026-10-15T10:00:00Z' }],
      consents: [{ purpose: 'share_ratings', granted: true, policyVersion: 'ratings-2026-10', decidedAt: '2026-10-14T10:00:00Z' }],
    });
    expect(exported.itemRatings[0]).not.toHaveProperty('wearsAtRating');
    expect(exported.itemRatings[0]).not.toHaveProperty('brand_key');
    expect(exported.itemRatings[0].note).toBe('Lovely in summer');
  });

  it('reads only the person’s rows, in a stable order, a page at a time', async () => {
    withData([], []);
    await exportMyRatings();
    expect(queries.map(q => q.table).sort()).toEqual(['brand_ratings', 'item_ratings']);
    for (const q of queries) {
      expect(q.eq).toEqual([['user_id', 'user-1']]);
      expect(q.range).toEqual([0, 499]);
      expect(q.opts).toBeUndefined();
    }
    expect(queries.find(q => q.table === 'item_ratings')?.order).toBe('item_id');
    expect(queries.find(q => q.table === 'brand_ratings')?.order).toBe('brand_key');
    expect(queries.find(q => q.table === 'item_ratings')?.columns).toContain('note');
    expect(queries.find(q => q.table === 'item_ratings')?.columns).not.toMatch(/brand_key|user_id/);
    expect(queries.find(q => q.table === 'brand_ratings')?.columns).not.toMatch(/brand_key|user_id/);
  });

  it('keeps reading until a page comes back short, so a long list is not cut', async () => {
    const full = Array.from({ length: 500 }, (_v, i) => itemRow({ item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    const rest = [itemRow({ item_id: '00000000-0000-4000-8000-999999999999' }), itemRow({ item_id: '00000000-0000-4000-8000-999999999998' })];
    answer = q => {
      if (q.table === 'brand_ratings') return { data: [], error: null };
      return { data: q.range?.[0] === 0 ? full : rest, error: null };
    };
    rpcAnswers({ get_my_consents: { data: [] } });
    const exported = await exportMyRatings();
    expect(exported.itemRatings).toHaveLength(502);
    const ranges = queries.filter(q => q.table === 'item_ratings').map(q => q.range);
    expect(ranges).toEqual([[0, 499], [500, 999]]);
  });

  it('stops after a fixed number of pages even if the server keeps answering full pages', async () => {
    const full = Array.from({ length: 500 }, (_v, i) => itemRow({ item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    answer = q => ({ data: q.table === 'item_ratings' ? full : [], error: null });
    rpcAnswers({ get_my_consents: { data: [] } });
    await exportMyRatings();
    expect(queries.filter(q => q.table === 'item_ratings').length).toBeLessThanOrEqual(20);
  });

  it('skips rows it cannot read and keeps the rest', async () => {
    withData([itemRow({ overall: null }), 'x', null, itemRow({ item_id: undefined }), itemRow({ touch_tags: ['soft', 'nope'], touch: 9 })], [brandRow({ overall: 0 }), brandRow({ brand_label: '' }), brandRow({ brand_label: 'Arket' })]);
    const exported = await exportMyRatings();
    expect(exported.itemRatings).toHaveLength(1);
    expect(exported.itemRatings[0]).toMatchObject({ touch: null, touchTags: ['soft'] });
    expect(exported.brandRatings.map(b => b.brandLabel)).toEqual(['Arket']);
  });

  it('gives empty sections when everything fails, and never throws', async () => {
    answer = () => ({ data: null, error: { message: 'Network request failed' } });
    rpcAnswers({ get_my_consents: { error: { message: 'Network request failed' } } });
    expect(await exportMyRatings()).toEqual({ itemRatings: [], brandRatings: [], consents: [] });
  });

  it('keeps a section when only another one fails', async () => {
    answer = q => (q.table === 'item_ratings' ? { data: null, error: { message: 'boom' } } : { data: [brandRow()], error: null });
    rpcAnswers({ get_my_consents: { data: [consentRow({ granted: null })] } });
    const exported = await exportMyRatings();
    expect(exported.itemRatings).toEqual([]);
    expect(exported.brandRatings).toHaveLength(1);
    expect(exported.consents).toEqual([{ purpose: 'share_ratings', granted: null, policyVersion: 'ratings-2026-10', decidedAt: '2026-10-14T10:00:00Z' }]);
  });

  it('keeps the ratings when the consent answers cannot be read', async () => {
    answer = q => ({ data: q.table === 'item_ratings' ? [itemRow()] : [], error: null });
    mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'x' } });
    const exported = await exportMyRatings();
    expect(exported.itemRatings).toHaveLength(1);
    expect(exported.consents).toEqual([]);
  });

  it('survives a client that throws or has no tables', async () => {
    mockFrom.mockImplementation(() => { throw new TypeError('supabase.from is not a function'); });
    mockRpc.mockRejectedValue(new Error('boom'));
    expect(await exportMyRatings()).toEqual({ itemRatings: [], brandRatings: [], consents: [] });
    mockGetSession.mockRejectedValue(new Error('storage broke'));
    expect(await exportMyRatings()).toEqual({ itemRatings: [], brandRatings: [], consents: [] });
  });

  it('is empty when the answers are not lists', async () => {
    answer = () => ({ data: { not: 'a list' }, error: null });
    rpcAnswers({ get_my_consents: { data: 'nope' } });
    expect(await exportMyRatings()).toEqual({ itemRatings: [], brandRatings: [], consents: [] });
  });
});
