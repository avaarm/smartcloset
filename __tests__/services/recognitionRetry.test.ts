/**
 * Photo analysis when the vision model hiccups, and the listing title option.
 *
 * Without the model the result rests on Google Vision's labels and pixels, which name an item's colour wrongly
 * about three times in four, so a failure that is gone in a moment (a 5xx from the upstream, a per-minute limit,
 * a dropped connection, an answer with nothing in it) is tried once more. A failure that will not go away (signed
 * out, the daily limit, a bad request, a call that already used its 25 seconds) is not.
 */
jest.mock('../../src/config/env', () => ({
  env: { SUPABASE_URL: 'https://example.supabase.co', ENABLE_VISION_API: true },
  hasGoogleVision: () => true,
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));
jest.mock('../../src/services/aiProxy', () => ({
  ...jest.requireActual('../../src/services/aiProxy'),
  callAiProxy: jest.fn(),
}));
jest.mock('../../src/services/aiConsent', () => ({
  ...jest.requireActual('../../src/services/aiConsent'),
  ensureAiConsent: jest.fn(),
}));

import { callAiProxy } from '../../src/services/aiProxy';
import { ensureAiConsent } from '../../src/services/aiConsent';
import { analyzeClothingImage, retryDelayAfter } from '../../src/services/imageRecognition';

const proxy = callAiProxy as jest.Mock;
const consent = ensureAiConsent as jest.Mock;

const bootsVision = {
  responses: [
    {
      labelAnnotations: [
        { description: 'Footwear', score: 0.97 },
        { description: 'Boot', score: 0.94 },
        { description: 'Red', score: 0.97 },
      ],
      localizedObjectAnnotations: [
        {
          name: 'Boot',
          score: 0.83,
          boundingPoly: { normalizedVertices: [{ x: 0, y: 0 }, { x: 0.8, y: 0 }, { x: 0.8, y: 0.8 }, { x: 0, y: 0.8 }] },
        },
      ],
      imagePropertiesAnnotation: {
        dominantColors: { colors: [{ color: { red: 200, green: 30, blue: 40 }, pixelFraction: 0.12 }] },
      },
    },
  ],
};

const modelAnswer = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          item: 'knee-high boots',
          category: 'shoes',
          subcategory: 'Knee-high boots',
          colors: ['tan'],
          material: 'suede',
          confidence: 0.9,
          confidences: { category: 0.9, subcategory: 0.9, color: 0.9 },
        }),
      },
    },
  ],
};

const emptyAnswer = { choices: [{ message: { content: 'Sorry, I cannot help with that.' } }] };

const modelCalls = () => proxy.mock.calls.filter(c => c[0] === 'openai-vision');
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

/** Replies to Vision at once and to the model with each of `replies` in turn (an Error rejects). */
const script = (...replies: unknown[]) => {
  let n = 0;
  proxy.mockReset().mockImplementation(async (provider: string) => {
    if (provider === 'vision') return bootsVision;
    const reply = replies[Math.min(n++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return reply;
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  consent.mockReset().mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('retryDelayAfter', () => {
  it.each([
    ['ai-proxy openai-vision 502: {"error":"upstream failed"}', 1500],
    ['ai-proxy openai-vision 500: boom', 1500],
    ['ai-proxy openai-vision 503: busy', 1500],
    ['ai-proxy openai-vision 504: gateway', 1500],
    ['ai-proxy openai-vision 429: {"error":"rate limited","retryAfter":3}', 3000],
    ['ai-proxy openai-vision 429: {"error":"rate limited","retryAfter":45}', 8000],
    ['ai-proxy openai-vision 429: {"error":"rate limited"}', 1500],
    ['Network request failed', 1500],
    ['TypeError: fetch failed', 1500],
  ])('%s waits %s ms', (message, delay) => {
    expect(retryDelayAfter(new Error(message))).toBe(delay);
  });

  it.each([
    'ai-proxy openai-vision 429: {"error":"daily limit reached for this feature, try again tomorrow"}',
    'ai-proxy openai-vision 401: invalid auth',
    'ai-proxy openai-vision 400: {"error":"visionContext too large"}',
    'ai-proxy openai-vision 413: image too large',
    'ai-proxy openai-vision 404: not found',
    'ai_timeout: no answer after 25s',
    'ai_consent_required',
    'not_signed_in: ai-proxy requires an authenticated user',
  ])('%s is not worth asking again', message => {
    expect(retryDelayAfter(new Error(message))).toBeNull();
  });

  it('is null for something that is not an error with a message', () => {
    expect(retryDelayAfter(undefined)).toBeNull();
    expect(retryDelayAfter('boom')).toBeNull();
  });
});

describe('asking the vision model again', () => {
  it('after an upstream 5xx, and uses the second answer', async () => {
    script(new Error('ai-proxy openai-vision 502: {"error":"upstream failed"}'), modelAnswer);

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(1500 + 100);
    const result = await run;

    expect(modelCalls()).toHaveLength(2);
    expect(result.gpt4Enhanced).toBe(true);
    expect(result.category).toBe('shoes');
    expect(result.color).toBe('tan');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('after a per-minute limit, once the time it names has passed', async () => {
    script(new Error('ai-proxy openai-vision 429: {"error":"rate limited","retryAfter":4}'), modelAnswer);

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(3900);
    expect(modelCalls()).toHaveLength(1);

    await advance(200);
    const result = await run;

    expect(modelCalls()).toHaveLength(2);
    expect(result.gpt4Enhanced).toBe(true);
  });

  it('after a reply with nothing usable in it (a refusal)', async () => {
    script(emptyAnswer, modelAnswer);

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(1700);
    const result = await run;

    expect(modelCalls()).toHaveLength(2);
    expect(result.gpt4Enhanced).toBe(true);
  });

  it('only once: a second failure leaves Vision\'s own answer', async () => {
    script(new Error('ai-proxy openai-vision 502: down'), new Error('ai-proxy openai-vision 502: still down'));

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(5000);
    const result = await run;

    expect(modelCalls()).toHaveLength(2);
    expect(result.isReal).toBe(true);
    expect(result.gpt4Enhanced).toBeUndefined();
    expect(result.category).toBe('shoes');
    // Vision's "Red" label is backed by its red pixels: a colour worth filling in, named by the label.
    expect(result.color).toBe('red');
  });

  it('not after the daily limit, a bad request, or a call that timed out', async () => {
    for (const message of [
      'ai-proxy openai-vision 429: {"error":"daily limit reached for this feature, try again tomorrow"}',
      'ai-proxy openai-vision 401: invalid auth',
      'ai-proxy openai-vision 400: {"error":"visionContext too large"}',
    ]) {
      script(new Error(message), modelAnswer);
      const run = analyzeClothingImage('file:///boots.jpg');
      await advance(10000);
      const result = await run;

      expect(modelCalls()).toHaveLength(1);
      expect(result.gpt4Enhanced).toBeUndefined();
    }
  });

  it('keeps the cause when both analyses fail, so the screen can explain', async () => {
    proxy.mockReset().mockImplementation(async () => {
      throw new Error('ai-proxy openai-vision 401: invalid auth');
    });

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(5000);
    const result = await run;

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('signed_out');
  });
});

describe('the listing title option', () => {
  it('goes to the model as a cleaned listingTitle hint and backs brand, category and type in the result', async () => {
    script(modelAnswer);

    const run = analyzeClothingImage('https://shop.example/boot.jpg', { title: '  Stuart Weitzman 5050 "Knee-High" Boots\n' });
    await advance(100);
    const result = await run;

    const [, payload] = modelCalls()[0];
    expect(payload.visionContext.listingTitle).toBe('Stuart Weitzman 5050 Knee-High Boots');
    expect(result.category).toBe('shoes');
    expect(result.type).toBe('Knee-high boots');
  });

  it('sends nothing extra without one', async () => {
    script(modelAnswer);

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(100);
    await run;

    expect(modelCalls()[0][1].visionContext).not.toHaveProperty('listingTitle');
  });

  it('leaves the photo and its hints as they were for the Google Vision call', async () => {
    script(modelAnswer);

    const run = analyzeClothingImage('file:///boots.jpg', { title: 'Boots' });
    await advance(100);
    await run;

    const visionCall = proxy.mock.calls.find(c => c[0] === 'vision');
    expect(Object.keys(visionCall[1])).toEqual(['requests']);
  });
});
