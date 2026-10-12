/**
 * Who the wardrobe is for, and the photo analysis: buildVisionContext tells the model only when the owner said
 * women's or men's, and analyzeClothingImage takes the answer from its options or, when they leave it out, from the
 * owner's saved answer (a failure to read it just means no answer).
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
jest.mock('../../src/services/wardrobeAudience', () => ({
  ...jest.requireActual('../../src/services/wardrobeAudience'),
  getWardrobeFor: jest.fn(),
}));

import { callAiProxy } from '../../src/services/aiProxy';
import { ensureAiConsent } from '../../src/services/aiConsent';
import { getWardrobeFor } from '../../src/services/wardrobeAudience';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { analyzeVision, buildVisionContext } from '../../src/services/recognitionFusion';

const proxy = callAiProxy as jest.Mock;
const consent = ensureAiConsent as jest.Mock;
const saved = getWardrobeFor as jest.Mock;

const bootsResponse = {
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
          gender: 'women',
          confidence: 0.9,
          confidences: { category: 0.9, subcategory: 0.9, color: 0.9 },
        }),
      },
    },
  ],
};

const modelCalls = () => proxy.mock.calls.filter(c => c[0] === 'openai-vision');
const contextOf = (call = 0): Record<string, unknown> => modelCalls()[call][1].visionContext;
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

/** Replies to Vision at once and to the model with each of `replies` in turn (an Error rejects). */
const script = (...replies: unknown[]) => {
  let n = 0;
  proxy.mockReset().mockImplementation(async (provider: string) => {
    if (provider === 'vision') return bootsResponse;
    const reply = replies[Math.min(n++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return reply;
  });
};

const analyze = async (...args: Parameters<typeof analyzeClothingImage>) => {
  const run = analyzeClothingImage(...args);
  await advance(100);
  return run;
};

beforeEach(() => {
  jest.useFakeTimers();
  consent.mockReset().mockResolvedValue(true);
  saved.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('buildVisionContext and wardrobeFor', () => {
  it.each(['women', 'men'] as const)('carries %s', value => {
    expect(buildVisionContext(null, { wardrobeFor: value }).wardrobeFor).toBe(value);
  });

  it.each([['both'], [null], [undefined], [''], ['unisex'], ['Women'], ['MEN'], [' men'], ['women '], [1], [true], [{}], [['women']]])(
    'carries nothing for %j',
    value => {
      const ctx = buildVisionContext(null, { wardrobeFor: value as any });
      expect(Object.keys(ctx)).not.toContain('wardrobeFor');
    },
  );

  it('carries nothing when no options are given, or none about this', () => {
    expect(Object.keys(buildVisionContext(null))).not.toContain('wardrobeFor');
    expect(Object.keys(buildVisionContext(null, {}))).not.toContain('wardrobeFor');
    expect(Object.keys(buildVisionContext(null, { title: 'Boots' }))).not.toContain('wardrobeFor');
  });

  it('changes nothing else in the context', () => {
    const vision = analyzeVision(bootsResponse.responses[0] as any);
    const without = buildVisionContext(vision, { title: 'Stuart Weitzman Knee-High Boots' });
    for (const wardrobeFor of ['women', 'men'] as const) {
      expect(buildVisionContext(vision, { title: 'Stuart Weitzman Knee-High Boots', wardrobeFor })).toEqual({
        ...without,
        wardrobeFor,
      });
    }
    // and 'both' is exactly the context without
    expect(buildVisionContext(vision, { title: 'Stuart Weitzman Knee-High Boots', wardrobeFor: 'both' })).toEqual(without);
  });

  it('is a plain string, so the server can compare it', () => {
    expect(typeof buildVisionContext(null, { wardrobeFor: 'women' }).wardrobeFor).toBe('string');
  });

  it('keeps the context far under the 4000 characters the server accepts, with everything in it', () => {
    const long = 'x'.repeat(200);
    const vision = analyzeVision({
      labelAnnotations: Array.from({ length: 30 }, (_, i) => ({ description: `${long}${i} boot`, score: 0.9 })),
      webDetection: { bestGuessLabels: [{ label: long }] },
    });
    const ctx = buildVisionContext(vision, { title: 'y '.repeat(400), wardrobeFor: 'women' });
    expect(ctx.wardrobeFor).toBe('women');
    expect(JSON.stringify(ctx).length).toBeLessThan(3000);
  });
});

describe('analyzeClothingImage and wardrobeFor', () => {
  describe('given in the options', () => {
    it.each(['women', 'men'] as const)('sends %s to the model, and does not look at the saved answer', async value => {
      script(modelAnswer);
      await analyze('file:///boots.jpg', { wardrobeFor: value });
      expect(modelCalls()).toHaveLength(1);
      expect(contextOf().wardrobeFor).toBe(value);
      expect(saved).not.toHaveBeenCalled();
    });

    it('overrides what is saved', async () => {
      saved.mockResolvedValue('women');
      script(modelAnswer);
      await analyze('file:///boots.jpg', { wardrobeFor: 'men' });
      expect(contextOf().wardrobeFor).toBe('men');
      expect(saved).not.toHaveBeenCalled();
    });

    it("sends nothing for both, even when women's is saved, and does not look at the saved answer", async () => {
      saved.mockResolvedValue('women');
      script(modelAnswer);
      await analyze('file:///boots.jpg', { wardrobeFor: 'both' });
      expect(Object.keys(contextOf())).not.toContain('wardrobeFor');
      expect(saved).not.toHaveBeenCalled();
    });

    it("sends nothing for null (\"no answer\"), even when men's is saved, and does not look at the saved answer", async () => {
      saved.mockResolvedValue('men');
      script(modelAnswer);
      await analyze('file:///boots.jpg', { wardrobeFor: null });
      expect(Object.keys(contextOf())).not.toContain('wardrobeFor');
      expect(saved).not.toHaveBeenCalled();
    });

    it('goes along with a listing title', async () => {
      script(modelAnswer);
      await analyze('https://shop.example/boot.jpg', { title: 'Stuart Weitzman 5050 Boots', wardrobeFor: 'women' });
      expect(contextOf()).toEqual(
        expect.objectContaining({ listingTitle: 'Stuart Weitzman 5050 Boots', wardrobeFor: 'women' }),
      );
    });
  });

  describe('left out of the options', () => {
    it.each([
      ['women', 'women'],
      ['men', 'men'],
    ] as const)("sends the saved answer (%s)", async (answer, expected) => {
      saved.mockResolvedValue(answer);
      script(modelAnswer);
      await analyze('file:///boots.jpg');
      expect(saved).toHaveBeenCalledTimes(1);
      expect(contextOf().wardrobeFor).toBe(expected);
    });

    it.each([['both'], [null]])('sends nothing when the saved answer is %s', async answer => {
      saved.mockResolvedValue(answer);
      script(modelAnswer);
      await analyze('file:///boots.jpg');
      expect(saved).toHaveBeenCalledTimes(1);
      expect(Object.keys(contextOf())).not.toContain('wardrobeFor');
    });

    it('reads the saved answer when other options are given but not this one', async () => {
      saved.mockResolvedValue('men');
      script(modelAnswer);
      await analyze('https://shop.example/boot.jpg', { title: 'Boots' });
      expect(contextOf().wardrobeFor).toBe('men');
      expect(contextOf().listingTitle).toBe('Boots');
    });

    it('reads the saved answer when the options say undefined', async () => {
      saved.mockResolvedValue('women');
      script(modelAnswer);
      await analyze('file:///boots.jpg', { wardrobeFor: undefined });
      expect(contextOf().wardrobeFor).toBe('women');
    });

    it('treats a failure to read it as no answer, and still analyses the photo', async () => {
      saved.mockRejectedValue(new Error('storage down'));
      script(modelAnswer);
      const result = await analyze('file:///boots.jpg');
      expect(modelCalls()).toHaveLength(1);
      expect(Object.keys(contextOf())).not.toContain('wardrobeFor');
      expect(result.isReal).toBe(true);
      expect(result.gpt4Enhanced).toBe(true);
      expect(result.unavailableReason).toBeUndefined();
    });
  });

  describe('through the model\'s retries', () => {
    it('is read once and sent with the second ask too (after a 5xx)', async () => {
      saved.mockResolvedValue('women');
      script(new Error('ai-proxy openai-vision 502: {"error":"upstream failed"}'), modelAnswer);
      const run = analyzeClothingImage('file:///boots.jpg');
      await advance(1700);
      const result = await run;

      expect(modelCalls()).toHaveLength(2);
      expect(contextOf(0).wardrobeFor).toBe('women');
      expect(contextOf(1).wardrobeFor).toBe('women');
      expect(saved).toHaveBeenCalledTimes(1);
      expect(result.gpt4Enhanced).toBe(true);
    });

    it('is sent with the second ask after a reply with nothing in it', async () => {
      script({ choices: [{ message: { content: 'Sorry, I cannot help with that.' } }] }, modelAnswer);
      const run = analyzeClothingImage('file:///boots.jpg', { wardrobeFor: 'men' });
      await advance(1700);
      await run;

      expect(modelCalls()).toHaveLength(2);
      expect(contextOf(0).wardrobeFor).toBe('men');
      expect(contextOf(1).wardrobeFor).toBe('men');
    });
  });

  describe('what it does not change', () => {
    it('does not send it to Google Vision, only to the model', async () => {
      saved.mockResolvedValue('women');
      script(modelAnswer);
      await analyze('file:///boots.jpg');
      const visionCall = proxy.mock.calls.find(c => c[0] === 'vision');
      expect(Object.keys(visionCall[1])).toEqual(['requests']);
      expect(JSON.stringify(visionCall[1])).not.toContain('wardrobeFor');
    });

    it('does not change how the answer is read: the same photo and answer give the same result', async () => {
      script(modelAnswer);
      const none = await analyze('file:///boots.jpg', { wardrobeFor: null });
      script(modelAnswer);
      const women = await analyze('file:///boots.jpg', { wardrobeFor: 'women' });
      script(modelAnswer);
      const men = await analyze('file:///boots.jpg', { wardrobeFor: 'men' });
      expect(women).toEqual(none);
      expect(men).toEqual(none);
    });

    it('still reports what the model said the item is for', async () => {
      script(modelAnswer);
      const result = await analyze('file:///boots.jpg', { wardrobeFor: 'men' });
      expect(result.gender).toBe('women'); // the photo's own answer, not the owner's
    });
  });
});
