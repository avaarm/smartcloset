/**
 * How long photo analysis can take. The vision model is sent Google Vision's
 * hints, but must not wait more than a moment for them, and a call that never
 * answers must end in the usual friendly failure instead of an endless spinner.
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
import { analyzeClothingImage } from '../../src/services/imageRecognition';

const proxy = callAiProxy as jest.Mock;
const consent = ensureAiConsent as jest.Mock;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const bootsVision = {
  responses: [
    {
      labelAnnotations: [
        { description: 'Footwear', score: 0.97 },
        { description: 'Boot', score: 0.94 },
        { description: 'Suede', score: 0.72 },
      ],
      localizedObjectAnnotations: [
        {
          name: 'Boot',
          score: 0.83,
          boundingPoly: { normalizedVertices: [{ x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.6, y: 0.65 }, { x: 0, y: 0.65 }] },
        },
      ],
    },
  ],
};

const modelAnswer = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          category: 'shoes',
          subcategory: 'knee-high boots',
          colors: ['tan'],
          material: 'suede',
          confidence: 0.9,
        }),
      },
    },
  ],
};

let vision: Deferred<unknown>;
let model: Deferred<unknown>;

const callsMade = () => proxy.mock.calls.map(c => c[0]);
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  jest.useFakeTimers();
  vision = deferred();
  model = deferred();
  proxy.mockReset().mockImplementation((provider: string) => (provider === 'vision' ? vision.promise : model.promise));
  consent.mockReset().mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the vision model and its hints', () => {
  it('starts as soon as Google Vision answers, with the hints', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(100);
    expect(callsMade()).toEqual(['vision']);

    vision.resolve(bootsVision);
    await advance(0);

    expect(callsMade()).toEqual(['vision', 'openai-vision']);
    expect(proxy.mock.calls[1][1].visionContext.mainItem).toBe('Boot');

    model.resolve(modelAnswer);
    const result = await run;

    expect(result.category).toBe('shoes');
    expect(result.gpt4Enhanced).toBe(true);
    // Nothing left running behind the finished analysis.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts as soon as Google Vision fails, without hints', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(100);

    vision.reject(new Error('ai-proxy vision 500: boom'));
    await advance(0);

    expect(callsMade()).toEqual(['vision', 'openai-vision']);
    expect(proxy.mock.calls[1][1].visionContext.mainItem).toBeUndefined();

    model.resolve(modelAnswer);
    expect((await run).category).toBe('shoes');
  });

  it('goes ahead without hints when Google Vision takes more than 2.5 seconds, and still uses it when it arrives', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(2499);
    expect(callsMade()).toEqual(['vision']);

    await advance(1);
    expect(callsMade()).toEqual(['vision', 'openai-vision']);
    const context = proxy.mock.calls[1][1].visionContext;
    expect(context.mainItem).toBeUndefined();
    expect(context.labels).toBeUndefined();
    expect(context.allowedCategories).toContain('shoes');

    await advance(1500);
    vision.resolve(bootsVision);
    model.resolve(modelAnswer);
    const result = await run;

    expect(result.rawLabels).toEqual(expect.arrayContaining(['Boot', 'Footwear']));
    expect(result.gpt4Enhanced).toBe(true);
    expect(result.category).toBe('shoes');
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('a call that never answers', () => {
  it('ends in the usual failure when neither does', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(30000);
    const result = await run;

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('other');
    expect(result.category).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('uses the model\'s answer when only Google Vision hangs', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(3000);
    model.resolve(modelAnswer);
    await advance(25000);
    const result = await run;

    expect(result.isReal).toBe(true);
    expect(result.gpt4Enhanced).toBe(true);
    expect(result.category).toBe('shoes');
    expect(result.rawLabels).toBeUndefined();
  });

  it('uses Google Vision\'s answer when only the model hangs', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(100);
    vision.resolve(bootsVision);
    await advance(25000);
    const result = await run;

    expect(result.isReal).toBe(true);
    expect(result.gpt4Enhanced).toBeUndefined();
    expect(result.category).toBe('shoes');
  });

  it('is given a full 25 seconds, not less', async () => {
    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(100);
    vision.resolve(bootsVision);
    await advance(0);
    await advance(24000);

    // 24.1 s in: the model has had 24 s, so the analysis is still waiting for it.
    let settled = false;
    run.then(() => {
      settled = true;
    });
    await advance(0);
    expect(settled).toBe(false);

    model.resolve(modelAnswer);
    expect((await run).gpt4Enhanced).toBe(true);
  });
});

describe('the photo-sharing prompt', () => {
  it('does not use up the time the calls are given while the user reads it', async () => {
    let answerPrompt!: (allowed: boolean) => void;
    consent.mockReturnValue(new Promise<boolean>(resolve => (answerPrompt = resolve)));

    const run = analyzeClothingImage('file:///boots.jpg');
    await advance(120000);
    expect(proxy).not.toHaveBeenCalled();

    answerPrompt(true);
    await advance(0);
    expect(callsMade()).toEqual(['vision']);

    vision.resolve(bootsVision);
    await advance(0);
    model.resolve(modelAnswer);
    const result = await run;

    expect(result.isReal).toBe(true);
    expect(result.category).toBe('shoes');
    expect(result.gpt4Enhanced).toBe(true);
  });
});
