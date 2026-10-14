const mockCallAiProxy = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null } })) } },
}));
jest.mock('../../src/services/aiProxy', () => {
  const actual = jest.requireActual('../../src/services/aiProxy');
  return { ...actual, callAiProxy: (...args: unknown[]) => mockCallAiProxy(...args) };
});

const mockReadImage = jest.fn();
const mockDiscard = jest.fn();
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: (...args: unknown[]) => mockReadImage(...args),
  discardTempImage: (...args: unknown[]) => mockDiscard(...args),
}));

const mockFlags = { model: false, feature: 'TEXT_DETECTION' };
jest.mock('../../src/config/ratingFlags', () => ({
  get TAG_MODEL_FALLBACK_ENABLED() {
    return mockFlags.model;
  },
  get TAG_OCR_FEATURE() {
    return mockFlags.feature;
  },
  tagScanActive: () => true,
  ratingsActive: () => true,
  brandInsightsActive: () => false,
}));

const mockReadWithModel = jest.fn();
jest.mock('../../src/services/tagModel', () => ({
  readTagWithModel: (...args: unknown[]) => mockReadWithModel(...args),
}));

import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { AI_CONSENT_ERROR } from '../../src/services/aiConsent';
import {
  classifyTagFailure,
  extractOcr,
  LOW_LEGIBILITY_CONFIDENCE,
  MAX_TAG_PHOTOS,
  MIN_WORD_HEIGHT_PX,
  pickTagPhoto,
  readTag,
  TAG_PHOTO_OPTIONS,
} from '../../src/services/tagReader';

const US_COTTON = '100% COTTON\nMADE IN BANGLADESH\nRN 12345\nMACHINE WASH COLD\nTUMBLE DRY LOW';
const SIDE_SEAM = 'MADE IN ITALY\nSIZE 40';

const box = (height: number, word = 'w') => ({
  description: word,
  boundingPoly: { vertices: [{ x: 0, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 10 + height }, { x: 0, y: 10 + height }] },
});

/** A Vision answer for one image, shaped like the public API description. */
const vision = (
  text: string,
  opts: { heights?: number[]; confidences?: number[]; locale?: string } = {},
) => ({
  responses: [
    {
      fullTextAnnotation: {
        text,
        pages: [
          {
            blocks: [
              { paragraphs: [{ words: (opts.confidences ?? []).map(confidence => ({ confidence })) }] },
            ],
          },
        ],
      },
      textAnnotations: [{ description: text, locale: opts.locale ?? 'en' }, ...(opts.heights ?? []).map(h => box(h))],
    },
  ],
});

const proxyError = (provider: string, status: number, body: string) => new Error(`ai-proxy ${provider} ${status}: ${body}`);

beforeEach(() => {
  mockCallAiProxy.mockReset();
  mockReadImage.mockReset().mockImplementation(async (uri: string) => `base64:${uri}`);
  mockDiscard.mockReset().mockResolvedValue(undefined);
  mockReadWithModel.mockReset().mockResolvedValue(null);
  mockFlags.model = false;
  mockFlags.feature = 'TEXT_DETECTION';
  (launchCamera as jest.Mock).mockReset().mockResolvedValue({ didCancel: true });
  (launchImageLibrary as jest.Mock).mockReset().mockResolvedValue({ didCancel: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('readTag: a clean tag', () => {
  it('reads one photo with one Vision call, parses it, and discards the photo', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON, { confidences: [0.95, 0.9], heights: [30, 32, 28, 31, 29, 30] }));
    const result = await readTag(['file:///cache/a.jpg'], { category: 'tops' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.groups[0].fibres[0]).toMatchObject({ fibre: 'cotton', percent: 100 });
    expect(result.read.groups[0].status).toBe('verified');
    expect(result.read.origin.country).toBe('Bangladesh');
    expect(result.read.care.items).toEqual(['Machine wash cold', 'Tumble dry low']);
    expect(result.read.transcription).toContain('RN 12345');
    expect(result.read.source).toBe('local');
    expect(mockCallAiProxy).toHaveBeenCalledTimes(1);
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('sends exactly one image and one text-reading feature, and nothing else', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON));
    await readTag(['file:///cache/a.jpg']);
    expect(mockCallAiProxy).toHaveBeenCalledWith('vision', {
      requests: [{ image: { content: 'base64:file:///cache/a.jpg' }, features: [{ type: 'TEXT_DETECTION' }] }],
    });
  });

  it('asks for the feature named in the flags file', async () => {
    mockFlags.feature = 'DOCUMENT_TEXT_DETECTION';
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON));
    await readTag(['file:///cache/a.jpg']);
    expect(mockCallAiProxy.mock.calls[0][1].requests[0].features).toEqual([{ type: 'DOCUMENT_TEXT_DETECTION' }]);
  });

  it('never calls the model step while the flag is off, even for a tag the parser cannot make sense of', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision('60% / 40%'));
    const result = await readTag(['file:///cache/a.jpg']);
    expect(result.ok).toBe(true);
    expect(mockReadWithModel).not.toHaveBeenCalled();
  });

  it('flags a low mean confidence as low legibility, so nothing is shown as Read', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON, { confidences: [LOW_LEGIBILITY_CONFIDENCE - 0.05, 0.4] }));
    const result = await readTag(['file:///cache/a.jpg']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.flags).toContain('low_legibility');
    expect(result.read.groups.every(g => g.status !== 'verified')).toBe(true);
  });
});

describe('readTag: failures end in a reason and the temporary photo is always discarded', () => {
  it('no_text when Vision found nothing', async () => {
    mockCallAiProxy.mockResolvedValueOnce({ responses: [{}] });
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'no_text' });
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('no_text when the words hold no letters or digits at all', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision('. - ~ ...'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'no_text' });
  });

  it('no_text, with what was seen, when only a stray character was read', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision('x'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'no_text', transcription: 'x' });
  });

  it('too_small when the word boxes are short, with the words that were found', async () => {
    const heights = new Array(8).fill(MIN_WORD_HEIGHT_PX - 4);
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON, { heights }));
    const result = await readTag(['file:///cache/a.jpg']);
    expect(result).toMatchObject({ ok: false, reason: 'too_small' });
    expect((result as { transcription?: string }).transcription).toContain('100% COTTON');
  });

  it('does not call a tag small on fewer than five word boxes', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON, { heights: [5, 5, 5, 5] }));
    expect((await readTag(['file:///cache/a.jpg'])).ok).toBe(true);
  });

  it('failed when Vision answers 200 with an error for the image', async () => {
    mockCallAiProxy.mockResolvedValueOnce({ responses: [{ error: { code: 3, message: 'Bad image data.' } }] });
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'failed' });
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('failed when the answer is not shaped like a Vision answer', async () => {
    mockCallAiProxy.mockResolvedValueOnce({ unexpected: true });
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'failed' });
  });

  it('failed, and the photo is still discarded, when the file cannot be read', async () => {
    mockReadImage.mockRejectedValueOnce(new Error('ENOENT'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'failed' });
    expect(mockCallAiProxy).not.toHaveBeenCalled();
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('consent when the person declined the AI permission', async () => {
    mockCallAiProxy.mockRejectedValueOnce(new Error(AI_CONSENT_ERROR));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'consent' });
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('signed_out when there is no login, or the proxy refuses it', async () => {
    mockCallAiProxy.mockRejectedValueOnce(new Error('not_signed_in: ai-proxy requires an authenticated user'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'signed_out' });
    mockCallAiProxy.mockRejectedValueOnce(proxyError('vision', 401, '{"error":"invalid auth"}'));
    expect(await readTag(['file:///cache/b.jpg'])).toEqual({ ok: false, reason: 'signed_out' });
  });

  it('daily_limit on a 429 that says the daily limit was reached, and does not retry', async () => {
    mockCallAiProxy.mockRejectedValue(proxyError('vision', 429, '{"error":"daily limit reached for this feature, try again tomorrow"}'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'daily_limit' });
    expect(mockCallAiProxy).toHaveBeenCalledTimes(1);
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('failed on a per-minute 429 or a 5xx, and does not retry', async () => {
    mockCallAiProxy.mockRejectedValueOnce(proxyError('vision', 429, '{"error":"rate limited","retryAfter":20}'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'failed' });
    mockCallAiProxy.mockRejectedValueOnce(proxyError('vision', 503, '{"error":"GOOGLE_VISION_API_KEY not configured"}'));
    expect(await readTag(['file:///cache/b.jpg'])).toEqual({ ok: false, reason: 'failed' });
    expect(mockCallAiProxy).toHaveBeenCalledTimes(2);
  });

  it('offline when the network failed or the saved login could not be refreshed', async () => {
    mockCallAiProxy.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await readTag(['file:///cache/a.jpg'])).toEqual({ ok: false, reason: 'offline' });
    mockCallAiProxy.mockRejectedValueOnce(new Error('session_unavailable: saved login could not be refreshed'));
    expect(await readTag(['file:///cache/b.jpg'])).toEqual({ ok: false, reason: 'offline' });
  });

  it('gives up after 25 seconds without an answer, as offline, and still discards the photo', async () => {
    jest.useFakeTimers();
    mockCallAiProxy.mockReturnValueOnce(new Promise(() => {}));
    const pending = readTag(['file:///cache/a.jpg']);
    await jest.advanceTimersByTimeAsync(24999);
    expect(mockDiscard).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2);
    expect(await pending).toEqual({ ok: false, reason: 'offline' });
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('resolves with failed rather than rejecting when the parser or anything else throws', async () => {
    mockCallAiProxy.mockResolvedValueOnce({
      get responses(): never {
        throw new Error('boom');
      },
    });
    await expect(readTag(['file:///cache/a.jpg'])).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('readTag: several photos', () => {
  it('reads them in order, never in parallel, and joins their words with a separator line', async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    mockCallAiProxy.mockImplementation(async (_provider: string, payload: any) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      order.push(payload.requests[0].image.content);
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
      return vision(order.length === 1 ? '100% COTTON' : SIDE_SEAM);
    });
    const result = await readTag(['file:///cache/1.jpg', 'file:///cache/2.jpg']);

    expect(order).toEqual(['base64:file:///cache/1.jpg', 'base64:file:///cache/2.jpg']);
    expect(maxRunning).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.flags).toContain('multiple_labels');
    expect(result.read.transcription).toBe('100% COTTON\n---\nMADE IN ITALY\nSIZE 40');
    expect(result.read.origin.country).toBe('Italy');
    expect(result.read.size.value).toBe('40');
    expect(mockDiscard).toHaveBeenCalledTimes(2);
  });

  it('reads at most three photos and discards the rest unread', async () => {
    mockCallAiProxy.mockResolvedValue(vision(US_COTTON));
    const uris = ['a', 'b', 'c', 'd', 'e'].map(n => `file:///cache/${n}.jpg`);
    await readTag(uris);
    expect(MAX_TAG_PHOTOS).toBe(3);
    expect(mockCallAiProxy).toHaveBeenCalledTimes(3);
    expect(mockDiscard.mock.calls.map(c => c[0]).sort()).toEqual(uris.slice().sort());
  });

  it('stops at the first photo that fails, and discards the photos it did not get to', async () => {
    mockCallAiProxy.mockResolvedValueOnce(vision('100% COTTON')).mockRejectedValueOnce(new TypeError('Network request failed'));
    const result = await readTag(['file:///cache/1.jpg', 'file:///cache/2.jpg', 'file:///cache/3.jpg']);
    expect(result).toEqual({ ok: false, reason: 'offline', transcription: '100% COTTON' });
    expect(mockCallAiProxy).toHaveBeenCalledTimes(2);
    expect(mockDiscard).toHaveBeenCalledTimes(3);
  });

  it('goes ahead on the photo that has words when another one has none', async () => {
    mockCallAiProxy.mockResolvedValueOnce({ responses: [{}] }).mockResolvedValueOnce(vision(US_COTTON));
    const result = await readTag(['file:///cache/1.jpg', 'file:///cache/2.jpg']);
    expect(result.ok).toBe(true);
  });

  it('is not called too small while one photo is sharp enough', async () => {
    mockCallAiProxy
      .mockResolvedValueOnce(vision('100% COTTON', { heights: new Array(6).fill(6) }))
      .mockResolvedValueOnce(vision(SIDE_SEAM, { heights: new Array(6).fill(30) }));
    expect((await readTag(['file:///cache/1.jpg', 'file:///cache/2.jpg'])).ok).toBe(true);
  });

  it('parses a second side together with the earlier text of the same scan, and counts the earlier photos', async () => {
    mockCallAiProxy.mockResolvedValue(vision(SIDE_SEAM));
    const result = await readTag(['file:///cache/2.jpg'], { prior: { text: '100% COTTON', photos: 1 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.groups[0].fibres[0].fibre).toBe('cotton');
    expect(result.read.origin.country).toBe('Italy');
    expect(result.read.flags).toContain('multiple_labels');

    mockCallAiProxy.mockClear();
    const full = await readTag(['file:///cache/4.jpg'], { prior: { text: '100% COTTON', photos: 3 } });
    expect(full).toEqual({ ok: false, reason: 'failed', transcription: '100% COTTON' });
    expect(mockCallAiProxy).not.toHaveBeenCalled();
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/4.jpg');
  });

  it('has nothing to read when it is given no photo', async () => {
    expect(await readTag([])).toEqual({ ok: false, reason: 'no_text' });
    expect(await readTag(['', undefined as unknown as string])).toEqual({ ok: false, reason: 'no_text' });
    expect(mockCallAiProxy).not.toHaveBeenCalled();
  });

  it('keeps an earlier low-legibility flag when the next photo is clear', async () => {
    mockCallAiProxy.mockResolvedValue(vision(SIDE_SEAM, { confidences: [0.99] }));
    const result = await readTag(['file:///cache/2.jpg'], { prior: { text: '100% COTTON', photos: 1, lowLegibility: true } });
    expect(result.ok && result.read.flags).toContain('low_legibility');
  });
});

describe('readTag: one scan at a time', () => {
  it('lets a second scan wait until the first has finished', async () => {
    const events: string[] = [];
    let release!: () => void;
    mockCallAiProxy.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          events.push('first starts');
          release = () => {
            events.push('first ends');
            resolve(vision(US_COTTON));
          };
        }),
    );
    mockCallAiProxy.mockImplementationOnce(async () => {
      events.push('second starts');
      return vision(US_COTTON);
    });

    const first = readTag(['file:///cache/1.jpg']);
    const second = readTag(['file:///cache/2.jpg']);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(events).toEqual(['first starts']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first starts', 'first ends', 'second starts']);
  });

  it('does not stay blocked after a scan failed', async () => {
    mockCallAiProxy.mockRejectedValueOnce(new Error('boom'));
    await readTag(['file:///cache/1.jpg']);
    mockCallAiProxy.mockResolvedValueOnce(vision(US_COTTON));
    expect((await readTag(['file:///cache/2.jpg'])).ok).toBe(true);
  });
});

describe('readTag: the optional model step (off in this build)', () => {
  it('asks only when the flag is on and the local read is not clean, and merges what is grounded', async () => {
    mockFlags.model = true;
    mockCallAiProxy.mockResolvedValue(vision('55% COTTON 40% POLYESTER'));
    mockReadWithModel.mockResolvedValue({
      readable: true,
      composition: [],
      care: ['Hand wash'],
      origin: null,
      size: null,
      brand: null,
      languages: ['en'],
      flags: [],
    });
    const steps: string[] = [];
    const result = await readTag(['file:///cache/a.jpg'], { onProgress: p => steps.push(p) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(steps).toEqual(['reading', 'structuring']);
    expect(mockReadWithModel).toHaveBeenCalledTimes(1);
    expect(result.read.source).toBe('merged');
    expect(result.read.care.items).toEqual(['Hand wash']);
    expect(result.read.care.status).toBe('check');
  });

  it('does not ask for a clean tag', async () => {
    mockFlags.model = true;
    mockCallAiProxy.mockResolvedValue(vision('100% COTTON'));
    const result = await readTag(['file:///cache/a.jpg']);
    expect(result.ok && result.read.source).toBe('local');
    expect(mockReadWithModel).not.toHaveBeenCalled();
  });

  it('keeps the local result, with no error, when the model step fails or throws', async () => {
    mockFlags.model = true;
    mockCallAiProxy.mockResolvedValue(vision('60% / 40%'));
    mockReadWithModel.mockRejectedValueOnce(new Error('unknown provider'));
    const thrown = await readTag(['file:///cache/a.jpg']);
    expect(thrown.ok && thrown.read.source).toBe('local');
    mockReadWithModel.mockResolvedValueOnce(null);
    const empty = await readTag(['file:///cache/b.jpg']);
    expect(empty.ok && empty.read.source).toBe('local');
  });
});

describe('extractOcr', () => {
  it('prefers the full text, then the first annotation, then nothing', () => {
    expect(extractOcr({ fullTextAnnotation: { text: 'FULL' }, textAnnotations: [{ description: 'FIRST' }] }).text).toBe('FULL');
    expect(extractOcr({ textAnnotations: [{ description: 'FIRST' }] }).text).toBe('FIRST');
    expect(extractOcr({ fullTextAnnotation: { text: '' }, textAnnotations: [{ description: 'FIRST' }] }).text).toBe('FIRST');
    expect(extractOcr({}).text).toBe('');
    expect(extractOcr(null).text).toBe('');
    expect(extractOcr(undefined).wordHeights).toEqual([]);
  });

  it('takes word heights from every box after the first, counting a missing y as 0', () => {
    const ocr = extractOcr({
      textAnnotations: [
        { description: 'ALL' },
        { boundingPoly: { vertices: [{ x: 1, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 30 }, { x: 1, y: 30 }] } },
        { boundingPoly: { vertices: [{ x: 1 }, { x: 5 }, { x: 5, y: 12 }, { x: 1, y: 12 }] } },
        { boundingPoly: {} },
        { description: 'no box' },
      ],
    });
    expect(ocr.wordHeights).toEqual([20, 12]);
  });

  it('averages the word confidences of every page, block and paragraph, or gives null', () => {
    const ocr = extractOcr({
      fullTextAnnotation: {
        text: 'A B',
        pages: [
          { blocks: [{ paragraphs: [{ words: [{ confidence: 0.9 }, { confidence: 0.5 }] }, { words: [{ confidence: 0.7 }] }] }] },
          { blocks: [{ paragraphs: [{ words: [{ confidence: 0.9 }, { notAConfidence: 1 }] }] }] },
        ],
      },
    });
    expect(ocr.meanConfidence).toBeCloseTo(0.75, 5);
    expect(extractOcr({ fullTextAnnotation: { text: 'A', pages: [] } }).meanConfidence).toBeNull();
    expect(extractOcr({ fullTextAnnotation: { text: 'A' } }).meanConfidence).toBeNull();
  });

  it('keeps the locale of the first annotation, and accepts the whole API answer too', () => {
    expect(extractOcr({ textAnnotations: [{ description: 'A', locale: 'fr' }] }).locale).toBe('fr');
    expect(extractOcr(vision('SIZE M', { locale: 'de' })).locale).toBe('de');
    expect(extractOcr({ textAnnotations: [{ description: 'A' }] }).locale).toBeUndefined();
  });
});

describe('classifyTagFailure', () => {
  it('maps every kind of failure to one reason', () => {
    expect(classifyTagFailure(new Error(AI_CONSENT_ERROR))).toBe('consent');
    expect(classifyTagFailure(new Error('not_signed_in: x'))).toBe('signed_out');
    expect(classifyTagFailure(proxyError('vision', 429, 'daily limit reached for this feature'))).toBe('daily_limit');
    expect(classifyTagFailure(proxyError('vision', 429, 'rate limited'))).toBe('failed');
    expect(classifyTagFailure(new Error('ai_timeout: no answer after 25s'))).toBe('offline');
    expect(classifyTagFailure(new TypeError('Network request failed'))).toBe('offline');
    expect(classifyTagFailure(proxyError('vision', 400, 'feature not allowed'))).toBe('failed');
    expect(classifyTagFailure(undefined)).toBe('failed');
    expect(classifyTagFailure('boom')).toBe('failed');
  });
});

describe('pickTagPhoto', () => {
  it('opens the camera with the tag photo options and gives back the picture', async () => {
    (launchCamera as jest.Mock).mockResolvedValueOnce({ assets: [{ uri: 'file:///cache/new.jpg' }] });
    expect(await pickTagPhoto('camera')).toEqual({ status: 'ok', uri: 'file:///cache/new.jpg' });
    expect(launchCamera).toHaveBeenCalledWith({
      mediaType: 'photo',
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 0.9,
      saveToPhotos: false,
      includeBase64: false,
    });
    expect(TAG_PHOTO_OPTIONS.saveToPhotos).toBe(false);
  });

  it('opens the library for one photo with the same options', async () => {
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({ assets: [{ uri: 'file:///cache/lib.jpg' }] });
    expect(await pickTagPhoto('library')).toEqual({ status: 'ok', uri: 'file:///cache/lib.jpg' });
    expect(launchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({ ...TAG_PHOTO_OPTIONS, selectionLimit: 1 }));
  });

  it('tells a cancel, a denied permission and a missing camera apart, and never throws', async () => {
    expect(await pickTagPhoto('camera')).toEqual({ status: 'cancelled' });
    (launchCamera as jest.Mock).mockResolvedValueOnce({ errorCode: 'permission' });
    expect(await pickTagPhoto('camera')).toEqual({ status: 'denied' });
    (launchCamera as jest.Mock).mockResolvedValueOnce({ errorCode: 'camera_unavailable' });
    expect(await pickTagPhoto('camera')).toEqual({ status: 'unavailable' });
    (launchCamera as jest.Mock).mockResolvedValueOnce({ assets: [] });
    expect(await pickTagPhoto('camera')).toEqual({ status: 'cancelled' });
    (launchImageLibrary as jest.Mock).mockRejectedValueOnce(new Error('native module missing'));
    expect(await pickTagPhoto('library')).toEqual({ status: 'unavailable' });
  });

  it('asks for the camera permission on Android before opening the camera', async () => {
    const { Platform, PermissionsAndroid } = require('react-native');
    const original = Platform.OS;
    Platform.OS = 'android';
    const request = jest.spyOn(PermissionsAndroid, 'request');
    try {
      request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
      expect(await pickTagPhoto('camera')).toEqual({ status: 'denied' });
      expect(launchCamera).not.toHaveBeenCalled();

      request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
      (launchCamera as jest.Mock).mockResolvedValueOnce({ assets: [{ uri: 'file:///cache/new.jpg' }] });
      expect(await pickTagPhoto('camera')).toEqual({ status: 'ok', uri: 'file:///cache/new.jpg' });

      // The library needs no camera permission.
      request.mockClear();
      await pickTagPhoto('library');
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
      Platform.OS = original;
    }
  });
});
