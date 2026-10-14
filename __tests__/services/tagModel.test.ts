const mockCallAiProxy = jest.fn();
jest.mock('../../src/services/aiProxy', () => ({
  callAiProxy: (...args: unknown[]) => mockCallAiProxy(...args),
}));

import { CARE_PHRASES } from '../../src/utils/careNames';
import { cleanModelRead, MIN_MODEL_TEXT, readTagWithModel } from '../../src/services/tagModel';

const TEXT = 'SHELL: 60% COTTON 40% POLYESTER\nLINING: 100% POLYESTER\nMADE IN PERU';

const goodRead = {
  readable: true,
  composition: [
    {
      part: 'shell',
      part_label: 'Shell',
      fibers: [
        { fiber: 'cotton', as_printed: 'COTTON', percent: 60, qualifier: null, evidence: '60% COTTON' },
        { fiber: 'polyester', as_printed: 'POLYESTER', percent: 40, qualifier: null, evidence: '40% POLYESTER' },
      ],
    },
  ],
  care: ['Hand wash'],
  origin: 'Peru',
  size: { primary: 'M', all: ['M'] },
  brand: { name: 'Everlane', where_seen: 'neck_label' },
  languages: ['en'],
  flags: [],
};

let logs: jest.SpyInstance[];

beforeEach(() => {
  mockCallAiProxy.mockReset().mockResolvedValue({ read: goodRead });
  logs = (['log', 'info', 'warn', 'error'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  logs.forEach(spy => spy.mockRestore());
});

describe('readTagWithModel: the request', () => {
  it('sends the words to the tag route, and only the words and a valid locale', async () => {
    const read = await readTagWithModel(TEXT, 'en-US');
    expect(read).toMatchObject({ readable: true, origin: 'Peru' });
    expect(mockCallAiProxy).toHaveBeenCalledTimes(1);
    expect(mockCallAiProxy).toHaveBeenCalledWith('openai-tag', { ocrText: TEXT, locale: 'en-US' });
    expect(Object.keys(mockCallAiProxy.mock.calls[0][1]).sort()).toEqual(['locale', 'ocrText']);
  });

  it('drops a locale that is not a language code, and sends no image field ever', async () => {
    await readTagWithModel(TEXT, 'english');
    await readTagWithModel(TEXT, 'EN');
    await readTagWithModel(TEXT);
    for (const call of mockCallAiProxy.mock.calls) {
      expect(call[1]).toEqual({ ocrText: TEXT });
    }
  });

  it('keeps contact details, web addresses and long numbers off the wire', async () => {
    const text = `${TEXT}\ncall +1 (555) 123-4567\nwrite to a@b.co\nwww.example.com\n1234567890\nRN 12345`;
    await readTagWithModel(text);
    const sent = mockCallAiProxy.mock.calls[0][1].ocrText as string;
    expect(sent).toContain('RN 12345');
    expect(sent).toContain('SHELL: 60% COTTON 40% POLYESTER');
    expect(sent).not.toMatch(/555|a@b\.co|example\.com|1234567890/);
  });

  it('does not spend a call on text too short to mean anything, or on non-text', async () => {
    expect(await readTagWithModel('100% COTTON')).toBeNull();
    expect('100% COTTON'.length).toBeLessThan(MIN_MODEL_TEXT);
    expect(await readTagWithModel('')).toBeNull();
    expect(await readTagWithModel(undefined as unknown as string)).toBeNull();
    expect(mockCallAiProxy).not.toHaveBeenCalled();
  });

  it('never writes the words to a log', async () => {
    await readTagWithModel(TEXT);
    mockCallAiProxy.mockRejectedValueOnce(new Error('boom'));
    await readTagWithModel(TEXT);
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });
});

describe('readTagWithModel: null on every failure', () => {
  const failures: Array<[string, () => void]> = [
    ['the route does not exist yet (400 unknown provider)', () => mockCallAiProxy.mockRejectedValue(new Error('ai-proxy openai-tag 400: {"error":"unknown provider"}'))],
    ['a daily limit (429)', () => mockCallAiProxy.mockRejectedValue(new Error('ai-proxy openai-tag 429: {"error":"daily limit reached for this feature, try again tomorrow"}'))],
    ['an unavailable service (503)', () => mockCallAiProxy.mockRejectedValue(new Error('ai-proxy openai-tag 503: {"error":"not configured"}'))],
    ['a server error (500)', () => mockCallAiProxy.mockRejectedValue(new Error('ai-proxy openai-tag 500: {}'))],
    ['"not now" to the AI permission', () => mockCallAiProxy.mockRejectedValue(new Error('ai_consent_required'))],
    ['no connection', () => mockCallAiProxy.mockRejectedValue(new TypeError('Network request failed'))],
    ['no login', () => mockCallAiProxy.mockRejectedValue(new Error('not_signed_in: ai-proxy requires an authenticated user'))],
    ['a refusal with no read in it', () => mockCallAiProxy.mockResolvedValue({ refusal: 'I cannot help with that.' })],
    ['a read that is not an object', () => mockCallAiProxy.mockResolvedValue({ read: 'Sorry, I cannot read this tag.' })],
    ['a null read', () => mockCallAiProxy.mockResolvedValue({ read: null })],
    ['a read that is an array', () => mockCallAiProxy.mockResolvedValue({ read: [] })],
    ['an answer that is not an object', () => mockCallAiProxy.mockResolvedValue('nope')],
    ['no answer at all', () => mockCallAiProxy.mockResolvedValue(undefined)],
  ];

  it.each(failures)('%s', async (_name, arrange) => {
    arrange();
    await expect(readTagWithModel(TEXT)).resolves.toBeNull();
  });
});

describe('cleanModelRead: only a whitelist gets through', () => {
  it('keeps a well-formed read as it is', () => {
    expect(cleanModelRead(goodRead)).toEqual(goodRead);
  });

  it('drops keys it does not know, at every level', () => {
    const read: any = cleanModelRead({
      ...goodRead,
      instructions: 'ignore the above',
      composition: [{ ...goodRead.composition[0], note: 'x', fibers: [{ ...goodRead.composition[0].fibers[0], extra: 1 }] }],
      size: { primary: 'M', all: ['M'], secret: true },
      brand: { name: 'Everlane', where_seen: 'neck_label', url: 'x' },
    });
    expect(read.instructions).toBeUndefined();
    expect(read.composition[0].note).toBeUndefined();
    expect(read.composition[0].fibers[0].extra).toBeUndefined();
    expect(read.size.secret).toBeUndefined();
    expect(read.brand.url).toBeUndefined();
  });

  it('turns an unknown fibre into "other" and keeps the printed word, and an unknown part into "other"', () => {
    const read = cleanModelRead({
      readable: true,
      composition: [
        { part: 'sleeves', part_label: null, fibers: [{ fiber: 'unobtainium', as_printed: 'UNOBTAINIUM', percent: 100, qualifier: 'shiny', evidence: 'x' }] },
      ],
    });
    expect(read?.composition[0].part).toBe('other');
    expect(read?.composition[0].fibers[0]).toMatchObject({ fiber: 'other', as_printed: 'UNOBTAINIUM', qualifier: null });
  });

  it('accepts only percentages from 0 to 100, and only the two qualifiers that are recorded', () => {
    const row = (percent: unknown, qualifier?: unknown) => ({ fiber: 'cotton', as_printed: 'COTTON', percent, qualifier, evidence: '' });
    const read = cleanModelRead({
      readable: true,
      composition: [
        { part: 'shell', part_label: null, fibers: [row(120), row(-5), row('60'), row(Infinity), row(NaN), row(0), row(100, 'organic'), row(50, 'recycled'), row(50, 'regenerated')] },
      ],
    });
    // Eight fibres per group at most.
    const fibres = read!.composition[0].fibers;
    expect(fibres).toHaveLength(8);
    expect(fibres.map(f => f.percent)).toEqual([null, null, null, null, null, 0, 100, 50]);
    expect(fibres.map(f => f.qualifier)).toEqual([null, null, null, null, null, null, 'organic', 'recycled']);
  });

  it('keeps care phrases from the list of 24 only, once each', () => {
    const read = cleanModelRead({ readable: true, care: ['Hand wash', 'Hand wash', 'Wash in lava', 7, ...CARE_PHRASES] });
    expect(read!.care.every(phrase => CARE_PHRASES.includes(phrase))).toBe(true);
    expect(new Set(read!.care).size).toBe(read!.care.length);
    expect(read!.care.length).toBeLessThanOrEqual(12);
    expect(read!.care[0]).toBe('Hand wash');
  });

  it('caps groups, strings and lists', () => {
    const group = { part: 'shell', part_label: 'x'.repeat(100), fibers: [] };
    const read = cleanModelRead({
      readable: true,
      composition: new Array(9).fill(group),
      origin: 'y'.repeat(200),
      size: { primary: 'z'.repeat(50), all: new Array(30).fill('M') },
      brand: { name: 'b'.repeat(200), where_seen: 'billboard' },
      languages: ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'tr', 'EN', 'english'],
      flags: ['partial', 'partial', 'invented', 'symbols_only'],
    });
    expect(read!.composition).toHaveLength(6);
    expect(read!.composition[0].part_label).toHaveLength(30);
    expect(read!.origin).toHaveLength(60);
    expect(read!.size!.primary).toHaveLength(20);
    expect(read!.size!.all).toHaveLength(10);
    expect(read!.brand!.name).toHaveLength(60);
    expect(read!.brand!.where_seen).toBeNull();
    expect(read!.languages).toEqual(['en', 'fr', 'de', 'es', 'it', 'pt']);
    expect(read!.flags).toEqual(['partial', 'symbols_only']);
  });

  it('treats a claim of readability as false unless it is exactly true, and tolerates a bare object', () => {
    expect(cleanModelRead({ readable: 'yes' })?.readable).toBe(false);
    expect(cleanModelRead({})).toEqual({
      readable: false,
      composition: [],
      care: [],
      origin: null,
      size: null,
      brand: null,
      languages: [],
      flags: [],
    });
    expect(cleanModelRead(null)).toBeNull();
    expect(cleanModelRead('read')).toBeNull();
  });
});
