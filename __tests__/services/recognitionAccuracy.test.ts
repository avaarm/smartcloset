/**
 * Photo analysis end to end with synthetic Google Vision + vision-model
 * answers modelled on a real report: tan suede knee-high boots worn over black
 * ballet flats, on a red-brown hardwood floor. The app showed "accessories
 * (97% confidence)", colour swatches "brown, red, ivory, green" and a brown
 * (floor) primary colour for it.
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

import { callAiProxy } from '../../src/services/aiProxy';
import { AI_CONSENT_ERROR } from '../../src/services/aiConsent';
import {
  analyzeClothingImage,
  generateNameFromRecognition,
  shouldAutofillPrediction,
  type RecognitionResult,
} from '../../src/services/imageRecognition';

const proxy = callAiProxy as jest.Mock;

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  normalizedVertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

const colorEntry = (r: number, g: number, b: number, pixelFraction: number) => ({
  color: { red: r, green: g, blue: b },
  score: pixelFraction,
  pixelFraction,
});

const BOOT_AND_SHOE_BOXES = [
  { name: 'Boot', score: 0.83, boundingPoly: box(0, 0, 0.6, 0.65) },
  { name: 'Shoe', score: 0.7, boundingPoly: box(0.25, 0.55, 0.6, 0.85) },
];

/** What Google Vision returned for the boots-on-hardwood photo. */
const bootsVision = (objects: Array<{ name: string; score: number; boundingPoly: unknown }> = BOOT_AND_SHOE_BOXES) => ({
  responses: [
    {
      labelAnnotations: [
        { description: 'Footwear', score: 0.97 },
        { description: 'Flooring', score: 0.97 },
        { description: 'Shoe', score: 0.96 },
        { description: 'Floor', score: 0.95 },
        { description: 'Boot', score: 0.94 },
        { description: 'Hardwood', score: 0.9 },
        { description: 'Wood stain', score: 0.86 },
        { description: 'Leather', score: 0.84 },
        { description: 'Suede', score: 0.72 },
      ],
      localizedObjectAnnotations: objects,
      imagePropertiesAnnotation: {
        dominantColors: {
          colors: [
            colorEntry(110, 42, 32, 0.22), // floor
            colorEntry(140, 58, 44, 0.2), // floor
            colorEntry(160, 70, 50, 0.15), // floor
            colorEntry(90, 30, 25, 0.12), // floor, in shade
            colorEntry(30, 28, 28, 0.08), // the black flats
            colorEntry(200, 168, 138, 0.07), // the tan suede boots
            colorEntry(222, 205, 176, 0.03), // boots, in light
          ],
        },
      },
    },
  ],
});

const ai = (over: Record<string, unknown> = {}) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          category: 'shoes',
          subcategory: 'knee-high boots',
          brand: null,
          colors: ['tan', 'black'],
          pattern: 'solid',
          material: 'suede',
          season: ['fall', 'winter'],
          occasion: 'casual',
          style: ['classic', 'minimalist'],
          gender: 'women',
          description: 'Tan suede knee-high boots with a buckled strap.',
          confidence: 0.92,
          ...over,
        }),
      },
    },
  ],
});

const FLOOR_COLOR_NAMES = ['maroon', 'burgundy', 'brown', 'red', 'rust', 'terracotta', 'green', 'ivory'];

const route = (handlers: { vision?: unknown; openai?: unknown }) =>
  proxy.mockImplementation(async (provider: string) => {
    const answer = provider === 'vision' ? handlers.vision : handlers.openai;
    if (answer instanceof Error) throw answer;
    return answer;
  });

beforeEach(() => {
  proxy.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('tan suede boots on a hardwood floor', () => {
  let result: RecognitionResult;
  beforeEach(async () => {
    route({ vision: bootsVision(), openai: ai() });
    result = await analyzeClothingImage('file:///boots.jpg');
  });

  it('is shoes, not an accessory, and honestly confident', () => {
    expect(result.isReal).toBe(true);
    expect(result.category).toBe('shoes');
    // Both analyses agree, so the confidence is high, but not certain.
    expect(result.confidence.category).toBeGreaterThan(0.9);
    expect(result.confidence.category).toBeLessThanOrEqual(0.97);
  });

  it('describes the boots: tan, not the floor behind them', () => {
    expect(result.color).toBe('tan');
    const names = (result.colors ?? []).map(c => c.name);
    expect(names[0]).toBe('tan');
    for (const floor of FLOOR_COLOR_NAMES) expect(names).not.toContain(floor);
    expect(names.length).toBeLessThanOrEqual(4);
    // Every swatch has a colour to draw.
    expect((result.colors ?? []).every(c => /^#[0-9A-F]{6}$/.test(c.hex))).toBe(true);
    expect(result.confidence.color).toBeGreaterThan(0.7);
  });

  it('keeps the specific material and type, and names the item naturally', () => {
    expect(result.material).toBe('suede');
    expect(result.subtype).toBe('knee-high boots');
    expect(generateNameFromRecognition(result)).toBe('Tan Suede Knee-High Boots');
  });

  it('keeps the model-only extras', () => {
    expect(result.season).toEqual(['fall', 'winter']);
    expect(result.occasion).toBe('casual');
    expect(result.gender).toBe('women');
    expect(result.gpt4Enhanced).toBe(true);
  });

  it('leaves the floor out of the labels it hands on', () => {
    expect(result.rawLabels).toEqual(expect.arrayContaining(['Boot', 'Shoe', 'Footwear']));
    for (const scene of ['Floor', 'Flooring', 'Hardwood', 'Wood stain']) {
      expect(result.rawLabels).not.toContain(scene);
    }
  });
});

describe('what the vision model is told', () => {
  it('asks Google Vision first, then tells the model what the main item and background are', async () => {
    route({ vision: bootsVision(), openai: ai() });
    await analyzeClothingImage('file:///boots.jpg');

    expect(proxy.mock.calls.map(c => c[0])).toEqual(['vision', 'openai-vision']);
    const payload = proxy.mock.calls[1][1];
    expect(payload.imageBase64).toBe('base64-photo');
    expect(payload.visionContext.mainItem).toBe('Boot');
    expect(payload.visionContext.background).toEqual(expect.arrayContaining(['Floor', 'Hardwood']));
    expect(payload.visionContext.labels).not.toContain('Floor');
    // The server refuses hints over 4000 characters.
    expect(JSON.stringify(payload.visionContext).length).toBeLessThan(3000);
  });

  it('restricts the answer to our eleven categories and our colour names, for the main item only', async () => {
    route({ vision: bootsVision(), openai: ai() });
    await analyzeClothingImage('file:///boots.jpg');

    const ctx = proxy.mock.calls[1][1].visionContext;
    expect(ctx.allowedCategories).toEqual([
      'tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'bags', 'jewelry', 'hats', 'activewear', 'swimwear',
      'accessories',
    ]);
    expect(ctx.allowedColors).toEqual(expect.arrayContaining(['tan', 'beige', 'camel', 'black', 'multicolor']));
    expect(ctx.focus).toMatch(/ONLY the single main garment/);
    expect(ctx.focus).toMatch(/Ignore floors/);
  });

  it('only asks Google Vision for features the proxy allows, without paying for ones nothing reads', async () => {
    route({ vision: bootsVision(), openai: ai() });
    await analyzeClothingImage('file:///boots.jpg');

    const features: Array<{ type: string }> = proxy.mock.calls[0][1].requests[0].features;
    const types = features.map(f => f.type);
    expect(types.length).toBeLessThanOrEqual(7);
    expect(types).toEqual(expect.arrayContaining(['LABEL_DETECTION', 'OBJECT_LOCALIZATION', 'IMAGE_PROPERTIES']));
    expect(types).not.toContain('CROP_HINTS');
  });

  it('still asks the model, with the vocabulary but no photo facts, when Google Vision fails', async () => {
    route({ vision: new Error('ai-proxy vision 500: boom'), openai: ai() });
    const result = await analyzeClothingImage('file:///boots.jpg');

    const ctx = proxy.mock.calls[1][1].visionContext;
    expect(ctx.allowedCategories).toContain('shoes');
    expect(ctx.mainItem).toBeUndefined();
    expect(ctx.labels).toBeUndefined();
    expect(result.isReal).toBe(true);
    expect(result.category).toBe('shoes');
  });
});

describe('with only Google Vision', () => {
  it('still gets the category right and never reports a floor colour', async () => {
    route({ vision: bootsVision(), openai: new Error('ai-proxy openai-vision 500') });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.isReal).toBe(true);
    expect(result.category).toBe('shoes');
    expect(result.subtype).toBe('boot');
    // Labels alone are one source: honest confidence stays below the two-source case.
    expect(result.confidence.category).toBeLessThanOrEqual(0.85);
    const names = (result.colors ?? []).map(c => c.name);
    for (const floor of FLOOR_COLOR_NAMES) expect(names).not.toContain(floor);
    expect(names.every(n => ['black', 'tan', 'beige', 'cream', 'charcoal'].includes(n))).toBe(true);
    // Pixels cover the whole frame, so they are not trusted as much as a model answer.
    expect(result.confidence.color).toBeLessThan(0.7);
    expect(result.material).toBe('suede');
  });
});

describe('with only the vision model', () => {
  it('uses its answer, with swatches that carry a colour to draw', async () => {
    route({ vision: new Error('ai-proxy vision 500'), openai: ai() });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.isReal).toBe(true);
    expect(result.category).toBe('shoes');
    expect(result.color).toBe('tan');
    expect(result.colors?.map(c => c.name)).toEqual(['tan', 'black']);
    expect(result.colors?.every(c => c.hex.startsWith('#'))).toBe(true);
    expect(result.rawLabels).toBeUndefined();
  });
});

describe('a bad model answer never reaches the form', () => {
  const junk = {
    category: 'wearables',
    subcategory: '<script>alert(1)</script>',
    brand: 'N/A',
    colors: ['sparkly unicorn', 42, null],
    pattern: 'wavy',
    material: 'unobtainium',
    season: ['monsoon'],
    occasion: 'karaoke',
    gender: 'robot',
    confidence: 7,
  };

  it('an answer with nothing usable in it is ignored; Google Vision decides', async () => {
    route({ vision: bootsVision(), openai: ai(junk) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.gpt4Enhanced).toBeUndefined();
    expect(result.category).toBe('shoes');
    expect(result.subtype).toBe('boot');
    expect(result.material).toBe('suede');
    expect(result.brand).toBeUndefined();
    expect(result.season).toBeUndefined();
    expect(result.gender).toBeUndefined();
    const names = (result.colors ?? []).map(c => c.name);
    for (const floor of FLOOR_COLOR_NAMES) expect(names).not.toContain(floor);
  });

  it('keeps only the valid parts of a partly bad answer', async () => {
    route({ vision: bootsVision(), openai: ai({ ...junk, colors: ['tan', 'sparkly unicorn'] }) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.gpt4Enhanced).toBe(true);
    expect(result.colors?.map(c => c.name)).toEqual(['tan']);
    expect(result.category).toBe('shoes'); // the unknown "wearables" is dropped; labels decide
    expect(result.subtype).toBe('boot'); // the junk subcategory is dropped
    expect(result.material).toBe('suede');
    expect(result.pattern).toBe('other'); // an unknown pattern word is the "other" bucket, never a free string
    expect(result.brand).toBeUndefined();
    expect(result.season).toBeUndefined();
    expect(result.gender).toBeUndefined();
    expect(result.occasion).toBeUndefined();
    // 7 is not a probability; a nonsense confidence must not turn into a certainty. The tan
    // pixels back the colour, so it is not nothing, but it stays under the "confident" bar.
    expect(result.confidence.color).toBeLessThan(0.7);
  });

  it('reads the obvious synonym for a category the model worded its own way', async () => {
    route({ vision: bootsVision(), openai: ai({ category: 'Handbag', subcategory: undefined, colors: ['tan'] }) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    // "Handbag" is a bag; it disagrees with Vision's shoes, so the model wins but says it is unsure.
    expect(result.category).toBe('bags');
    expect(result.confidence.category).toBeLessThanOrEqual(0.6);
  });

  it('maps a colour the model wrote as a hex code or a modifier to our names', async () => {
    route({ vision: bootsVision(), openai: ai({ colors: ['#C9A98A', 'Jet Black'] }) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.colors?.map(c => c.name)).toEqual(['tan', 'black']);
  });

  it('reads JSON the model wrapped in a code fence', async () => {
    route({
      vision: bootsVision(),
      openai: {
        choices: [{ message: { content: '```json\n{"category":"shoes","colors":["tan"],"confidence":0.9}\n```' } }],
      },
    });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.gpt4Enhanced).toBe(true);
    expect(result.color).toBe('tan');
  });

  it('ignores an unparsable answer and uses Google Vision alone', async () => {
    route({ vision: bootsVision(), openai: { choices: [{ message: { content: 'Sorry, I cannot help.' } }] } });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.isReal).toBe(true);
    expect(result.gpt4Enhanced).toBeUndefined();
    expect(result.category).toBe('shoes');
  });
});

describe('when the two analyses disagree', () => {
  it('trusts the model but says it is unsure', async () => {
    route({ vision: bootsVision(), openai: ai({ category: 'tops', subcategory: 'sweater' }) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.category).toBe('tops');
    expect(result.confidence.category).toBeLessThanOrEqual(0.6);
  });

  it('lets a specific Vision category beat the model\'s catch-all "accessories"', async () => {
    route({ vision: bootsVision(), openai: ai({ category: 'accessories', subcategory: undefined }) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.category).toBe('shoes');
  });
});

describe('the newer categories', () => {
  const handbagVision = {
    responses: [
      {
        labelAnnotations: [
          { description: 'Handbag', score: 0.95 },
          { description: 'Bag', score: 0.94 },
          { description: 'Fashion accessory', score: 0.9 },
          { description: 'Brown', score: 0.8 },
        ],
        localizedObjectAnnotations: [{ name: 'Handbag', score: 0.9, boundingPoly: box(0.1, 0.1, 0.9, 0.9) }],
        imagePropertiesAnnotation: {
          dominantColors: { colors: [colorEntry(120, 78, 45, 0.5), colorEntry(245, 245, 245, 0.35)] },
        },
        webDetection: { bestGuessLabels: [{ label: 'bottega veneta andiamo shopper bag' }], webEntities: [] },
      },
    ],
  };

  it('a handbag is bags even though the vision model only had "accessories" to say', async () => {
    route({
      vision: handbagVision,
      openai: ai({ category: 'accessories', subcategory: 'structured tote', colors: ['brown'], material: 'leather' }),
    });
    const result = await analyzeClothingImage('file:///bag.jpg');

    expect(result.category).toBe('bags');
    expect(result.subtype).toBe('structured tote');
    expect(result.brand).toBe('Bottega Veneta');
    expect(generateNameFromRecognition(result)).toBe('Bottega Veneta Brown Leather Structured Tote');
  });

  it('a brown bag on white keeps its own brown: the filled frame is the item', async () => {
    route({ vision: handbagVision, openai: new Error('offline') });
    const result = await analyzeClothingImage('file:///bag.jpg');

    expect(result.category).toBe('bags');
    expect(result.color).toBe('brown');
  });
});

describe('boots that are boxed more than once, or fill most of the frame', () => {
  // Google often boxes the same boot as "Boot", "Footwear" and "Shoe". Adding those areas up
  // reached 60% of the frame and switched the floor filter off, bringing the floor's colours back.
  const overlapping = [
    { name: 'Boot', score: 0.83, boundingPoly: box(0, 0, 0.6, 0.65) },
    { name: 'Footwear', score: 0.8, boundingPoly: box(0.02, 0.02, 0.58, 0.63) },
    { name: 'Shoe', score: 0.7, boundingPoly: box(0.1, 0.1, 0.55, 0.6) },
  ];
  const bigBox = [{ name: 'Boot', score: 0.83, boundingPoly: box(0, 0, 0.8, 0.85) }];

  it.each([
    ['three overlapping boxes', overlapping],
    ['one box over two thirds of the frame', bigBox],
  ])('keeps the floor out of the swatches with the model\'s answer: %s', async (_what, objects) => {
    route({ vision: bootsVision(objects), openai: ai() });
    const result = await analyzeClothingImage('file:///boots.jpg');

    const names = (result.colors ?? []).map(c => c.name);
    expect(result.color).toBe('tan');
    expect(names).toEqual(['tan', 'black']);
  });

  it.each([
    ['three overlapping boxes', overlapping],
    ['one box over two thirds of the frame', bigBox],
  ])('keeps the floor out with only Google Vision: %s', async (_what, objects) => {
    route({ vision: bootsVision(objects), openai: new Error('ai-proxy openai-vision 500') });
    const result = await analyzeClothingImage('file:///boots.jpg');

    const names = (result.colors ?? []).map(c => c.name);
    expect(result.color).toBe('tan');
    for (const floor of FLOOR_COLOR_NAMES) expect(names).not.toContain(floor);
  });
});

describe('a photo with no clothing in it', () => {
  const dogVision = (extraLabels: Array<{ description: string; score: number }> = []) => ({
    responses: [
      {
        labelAnnotations: [
          { description: 'Dog', score: 0.97 },
          { description: 'Mammal', score: 0.95 },
          { description: 'Grass', score: 0.9 },
          ...extraLabels,
        ],
        localizedObjectAnnotations: [{ name: 'Dog', score: 0.9, boundingPoly: box(0.1, 0.2, 0.9, 0.9) }],
        imagePropertiesAnnotation: {
          dominantColors: { colors: [colorEntry(60, 140, 70, 0.55), colorEntry(190, 150, 100, 0.2)] },
        },
      },
    ],
  });

  it('takes no colour from the grass and offers no name', async () => {
    route({ vision: dogVision(), openai: { choices: [{ message: { content: 'Sorry, I cannot help.' } }] } });
    const result = await analyzeClothingImage('file:///dog.jpg');

    expect(result.category).toBeUndefined();
    expect(result.color).toBeUndefined();
    expect(result.colors ?? []).toEqual([]);
    expect(generateNameFromRecognition(result)).toBe('');
  });

  it('does not trust a colour word among the labels either', async () => {
    const vision = dogVision([{ description: 'Green', score: 0.9 }]);
    vision.responses[0].imagePropertiesAnnotation.dominantColors.colors = [];
    route({ vision, openai: new Error('offline') });
    const result = await analyzeClothingImage('file:///dog.jpg');

    expect(result.color).toBeUndefined();
    expect(generateNameFromRecognition(result)).toBe('');
  });
});

describe('with only Google Vision, a colour that may be the backdrop is offered, not filled in', () => {
  const sunglassesOnWhite = {
    responses: [
      {
        labelAnnotations: [
          { description: 'Sunglasses', score: 0.96 },
          { description: 'Glasses', score: 0.95 },
          { description: 'Eyewear', score: 0.93 },
        ],
        localizedObjectAnnotations: [{ name: 'Sunglasses', score: 0.9, boundingPoly: box(0.2, 0.35, 0.8, 0.65) }],
        imagePropertiesAnnotation: {
          dominantColors: { colors: [colorEntry(250, 250, 250, 0.6), colorEntry(20, 20, 20, 0.3)] },
        },
      },
    ],
  };

  it('black sunglasses on white: white is not filled in, and the name has no colour', async () => {
    route({ vision: sunglassesOnWhite, openai: new Error('offline') });
    const result = await analyzeClothingImage('file:///sunglasses.jpg');

    expect(result.category).toBe('accessories');
    expect(shouldAutofillPrediction(result, 'color')).toBe(false);
    expect((result.colors ?? []).map(c => c.name)).toEqual(expect.arrayContaining(['white', 'black']));
    expect(generateNameFromRecognition(result)).toBe('Sunglasses');
  });

  it('a brown handbag on a wooden table: nothing left over from the table is filled in', async () => {
    const handbagOnTable = {
      responses: [
        {
          labelAnnotations: [
            { description: 'Handbag', score: 0.95 },
            { description: 'Bag', score: 0.94 },
            { description: 'Table', score: 0.9 },
            { description: 'Wood', score: 0.85 },
          ],
          localizedObjectAnnotations: [{ name: 'Handbag', score: 0.9, boundingPoly: box(0.25, 0.3, 0.75, 0.8) }],
          imagePropertiesAnnotation: {
            dominantColors: {
              colors: [
                colorEntry(110, 60, 40, 0.4), // the table
                colorEntry(122, 78, 45, 0.3), // the handbag, wood-toned too
                colorEntry(225, 215, 200, 0.1), // a highlight that survives the table filter
              ],
            },
          },
        },
      ],
    };
    route({ vision: handbagOnTable, openai: new Error('offline') });
    const result = await analyzeClothingImage('file:///handbag.jpg');

    expect(result.category).toBe('bags');
    expect(shouldAutofillPrediction(result, 'color')).toBe(false);
    expect(generateNameFromRecognition(result)).toBe('Handbag');
  });

  it('the model\'s own colour is still filled in for the same photos', async () => {
    route({ vision: sunglassesOnWhite, openai: ai({ category: 'accessories', subcategory: 'sunglasses', colors: ['black'] }) });
    const result = await analyzeClothingImage('file:///sunglasses.jpg');

    expect(result.color).toBe('black');
    expect(shouldAutofillPrediction(result, 'color')).toBe(true);
  });
});

describe('when nothing can run', () => {
  it('tags the cause and returns no values to autofill', async () => {
    route({ vision: new Error(AI_CONSENT_ERROR), openai: new Error(AI_CONSENT_ERROR) });
    const result = await analyzeClothingImage('file:///boots.jpg');

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('consent');
    expect(result.category).toBeUndefined();
  });
});
