import {
  analyzeVision,
  buildVisionContext,
  fuseRecognition,
  normalizeAiAnswer,
  parseAiContent,
  type AiAnswer,
} from '../../src/services/recognitionFusion';

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  normalizedVertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

const bootsVision = () =>
  analyzeVision({
    labelAnnotations: [
      { description: 'Footwear', score: 0.97 },
      { description: 'Flooring', score: 0.97 },
      { description: 'Boot', score: 0.94 },
      { description: 'Hardwood', score: 0.9 },
      { description: 'Suede', score: 0.72 },
    ],
    localizedObjectAnnotations: [{ name: 'Boot', score: 0.83, boundingPoly: box(0, 0, 0.6, 0.65) }],
    imagePropertiesAnnotation: {
      dominantColors: {
        colors: [
          { color: { red: 110, green: 42, blue: 32 }, pixelFraction: 0.5, score: 0.5 },
          { color: { red: 200, green: 168, blue: 138 }, pixelFraction: 0.07, score: 0.07 },
        ],
      },
    },
  });

const answer = (over: Partial<AiAnswer> = {}): AiAnswer => ({
  category: 'shoes',
  subtype: 'knee-high boots',
  colors: ['tan'],
  material: 'suede',
  confidence: 0.9,
  ...over,
});

describe('parseAiContent', () => {
  it('reads JSON text, JSON in a code fence or prose, and an object', () => {
    expect(parseAiContent('{"a":1}')).toEqual({ a: 1 });
    expect(parseAiContent('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseAiContent('Here you go: {"a":1} Hope that helps')).toEqual({ a: 1 });
    expect(parseAiContent({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns null for anything else', () => {
    expect(parseAiContent('Sorry, I cannot help.')).toBeNull();
    expect(parseAiContent('{broken')).toBeNull();
    expect(parseAiContent(undefined)).toBeNull();
    expect(parseAiContent(42)).toBeNull();
  });
});

describe('normalizeAiAnswer', () => {
  it('passes a clean answer through', () => {
    const a = normalizeAiAnswer({
      category: 'shoes', subcategory: 'Knee-High Boots', brand: null, colors: ['Tan', 'black'], pattern: 'solid',
      material: 'suede', season: ['fall', 'Winter'], occasion: 'casual', style: ['Classic'], gender: 'women',
      description: 'Tan boots.', confidence: 0.92,
    });

    expect(a).toEqual({
      category: 'shoes', subtype: 'knee-high boots', brand: undefined, colors: ['tan', 'black'], pattern: 'solid',
      material: 'suede', season: ['fall', 'winter'], occasion: 'casual', style: ['classic'], gender: 'women',
      description: 'Tan boots.', confidence: 0.92,
    });
  });

  it('returns null when nothing in it is usable', () => {
    expect(normalizeAiAnswer(null)).toBeNull();
    expect(normalizeAiAnswer('shoes')).toBeNull();
    expect(normalizeAiAnswer({ category: 'wearables', colors: ['sparkly unicorn'], material: 'unobtainium' })).toBeNull();
  });

  describe('category', () => {
    it.each([
      ['shoes', 'shoes'],
      ['Bags', 'bags'],
      ['footwear', 'shoes'],
      ['handbag', 'bags'],
      ['Jewellery', 'jewelry'],
      ['headwear', 'hats'],
      ['sportswear', 'activewear'],
      ['top', 'tops'],
      ['accessory', 'accessories'],
    ])('%j becomes %s', (written, expected) => {
      expect(normalizeAiAnswer({ category: written, colors: ['tan'] })?.category).toBe(expected);
    });

    it.each(['wearables', 'clothing', '', 42, null, 'x'.repeat(40)])('%j is dropped', written => {
      expect(normalizeAiAnswer({ category: written, colors: ['tan'] })?.category).toBeUndefined();
    });

    it('a coarse category yields to a sub-category that names a newer one', () => {
      expect(normalizeAiAnswer({ category: 'accessories', subcategory: 'structured tote' })?.category).toBe('bags');
      expect(normalizeAiAnswer({ category: 'accessories', subcategory: 'knee-high boots' })?.category).toBe('shoes');
      expect(normalizeAiAnswer({ category: 'shoes', subcategory: 'crossbody bag' })?.category).toBe('bags');
      expect(normalizeAiAnswer({ category: 'tops', subcategory: 'sweater' })?.category).toBe('tops');
    });
  });

  describe('colours', () => {
    it('become palette names, at most three, without repeats', () => {
      const a = normalizeAiAnswer({ colors: ['Tan', 'light tan', '#C9A98A', 'Jet Black', 'navy', 'red'] });

      expect(a?.colors).toEqual(['tan', 'black', 'navy']);
    });

    it('accept a single colour under any of the keys a model uses', () => {
      expect(normalizeAiAnswer({ color: 'Navy Blue' })?.colors).toEqual(['navy']);
      expect(normalizeAiAnswer({ colors: 'olive green' })?.colors).toEqual(['olive']);
      expect(normalizeAiAnswer({ dominantColor: 'burgundy' })?.colors).toEqual(['burgundy']);
    });

    it('drop what is not a colour', () => {
      expect(normalizeAiAnswer({ colors: ['sparkly unicorn', 42, null, 'tan'] })?.colors).toEqual(['tan']);
    });

    it('keep multicolor', () => {
      expect(normalizeAiAnswer({ colors: ['multi-color'] })?.colors).toEqual(['multicolor']);
    });
  });

  describe('confidence', () => {
    it.each([
      [0.9, 0.9],
      [1, 1],
      [0, 0],
      [92, 0.92],
      [7, 0.07],
      [-3, 0],
      [250, 1],
      ['high', 0.8],
      [undefined, 0.8],
      [Number.NaN, 0.8],
    ])('%j is read as %s', (written, expected) => {
      const a = normalizeAiAnswer({ category: 'shoes', confidence: written });

      expect(a?.confidence).toBeCloseTo(expected as number, 5);
    });
  });

  it('keeps only seasons, occasions, patterns, genders and brands we know', () => {
    const a = normalizeAiAnswer({
      category: 'shoes', season: ['autumn', 'monsoon'], occasion: 'karaoke', pattern: 'wavy', gender: 'robot', brand: 'N/A',
    });

    expect(a?.season).toEqual(['fall']);
    expect(a?.occasion).toBeUndefined();
    expect(a?.pattern).toBe('other');
    expect(a?.gender).toBeUndefined();
    expect(a?.brand).toBeUndefined();
  });

  it('reads "all seasons" as the four seasons', () => {
    expect(normalizeAiAnswer({ category: 'shoes', season: ['all seasons'] })?.season).toEqual([
      'spring', 'summer', 'fall', 'winter',
    ]);
  });

  it('refuses a subcategory that is not a plain item name', () => {
    expect(normalizeAiAnswer({ category: 'shoes', subcategory: '<script>alert(1)</script>' })?.subtype).toBeUndefined();
    expect(normalizeAiAnswer({ category: 'shoes', subcategory: 'a very long winded description of boots' })?.subtype).toBeUndefined();
  });
});

describe('fuseRecognition', () => {
  it('is null when neither analysis ran', () => {
    expect(fuseRecognition(null, null)).toBeNull();
  });

  it('agreement between Vision and the model raises category confidence above either alone', () => {
    const vision = bootsVision();
    const both = fuseRecognition(vision, answer());
    const visionOnly = fuseRecognition(vision, null);
    const modelOnly = fuseRecognition(null, answer());

    expect(both?.category).toBe('shoes');
    const conf = (r: typeof both) => r?.confidence.category as number;
    expect(conf(both)).toBeGreaterThan(conf(visionOnly));
    expect(conf(both)).toBeGreaterThan(conf(modelOnly));
    expect(conf(both)).toBeLessThanOrEqual(0.95);
  });

  it('disagreement lowers category confidence and the model wins', () => {
    const r = fuseRecognition(bootsVision(), answer({ category: 'tops', subtype: 'sweater' }));

    expect(r?.category).toBe('tops');
    expect(r?.confidence.category).toBeLessThanOrEqual(0.6);
  });

  it('a specific Vision category beats the model\'s catch-all accessories; any other category the model names wins', () => {
    const vision = bootsVision();

    expect(fuseRecognition(vision, answer({ category: 'accessories', subtype: undefined }))?.category).toBe('shoes');
    expect(fuseRecognition(vision, answer({ category: 'bags', subtype: undefined }))?.category).toBe('bags');
  });

  it('prefers the specific material over its family', () => {
    const r = fuseRecognition(bootsVision(), answer({ material: 'leather' }));

    expect(r?.material).toBe('suede');
  });

  it('takes the model\'s colour over the floor and strips colour and material from the type', () => {
    const r = fuseRecognition(bootsVision(), answer({ subtype: 'tan suede knee-high boots' }));

    expect(r?.color).toBe('tan');
    expect(r?.subtype).toBe('knee-high boots');
  });

  it('ignores a model type that belongs to another category', () => {
    const r = fuseRecognition(bootsVision(), answer({ subtype: 'sweater' }));

    expect(r?.category).toBe('shoes');
    expect(r?.subtype).toBe('boot');
  });

  it('does not name the item after Vision\'s type when the model put it in another category', () => {
    // Vision saw a boot, the model says a top without saying which: no "boot" in a tops name.
    const r = fuseRecognition(bootsVision(), answer({ category: 'tops', subtype: undefined }));

    expect(r?.category).toBe('tops');
    expect(r?.subtype).toBeUndefined();
  });

  it('falls back to a colour word among Vision\'s labels when no colour was measured', () => {
    const vision = analyzeVision({
      labelAnnotations: [{ description: 'Handbag', score: 0.9 }, { description: 'Burgundy', score: 0.8 }],
    });
    const r = fuseRecognition(vision, null);

    expect(r?.color).toBe('burgundy');
    expect(r?.colors?.[0]).toMatchObject({ name: 'burgundy', hex: '#6D1F32' });
    expect(r?.confidence.color).toBe(0.5);
  });

  it('does not trust a colour label when a floor is in the frame (it may be the floor\'s)', () => {
    const vision = analyzeVision({
      labelAnnotations: [
        { description: 'Boot', score: 0.9 },
        { description: 'Red', score: 0.9 },
        { description: 'Floor', score: 0.9 },
      ],
    });

    expect(fuseRecognition(vision, null)?.color).toBeUndefined();
  });

  it('survives a response with missing or malformed lists', () => {
    const vision = analyzeVision({ labelAnnotations: 'nope', localizedObjectAnnotations: null, webDetection: { webEntities: {} } });

    expect(vision.result.category).toBeUndefined();
    expect(fuseRecognition(vision, answer())?.category).toBe('shoes');
  });

  it('does not read a colour out of a product name (Red Wing is a brand, not a colour)', () => {
    const vision = analyzeVision({
      labelAnnotations: [{ description: 'Boot', score: 0.9 }],
      webDetection: { bestGuessLabels: [{ label: 'red wing iron ranger boots' }], webEntities: [{ description: 'Red Wing Shoes', score: 0.9 }] },
    });

    expect(fuseRecognition(vision, null)?.color).toBeUndefined();
  });

  it('the model\'s explicit "solid" is not overruled by a Graphics label', () => {
    const vision = analyzeVision({
      labelAnnotations: [{ description: 'Boot', score: 0.9 }, { description: 'Graphic design', score: 0.9 }],
    });
    const r = fuseRecognition(vision, answer({ pattern: 'solid' }));

    expect(r?.pattern).toBe('solid');
  });

  it('a logo detection is not a pattern', () => {
    const vision = analyzeVision({
      labelAnnotations: [{ description: 'Sneakers', score: 0.9 }, { description: 'Logo', score: 0.8 }],
    });

    expect(vision.result.pattern).toBe('solid');
  });

  it('marks a result enhanced only when the model contributed', () => {
    expect(fuseRecognition(bootsVision(), null)?.gpt4Enhanced).toBeUndefined();
    expect(fuseRecognition(bootsVision(), answer())?.gpt4Enhanced).toBe(true);
  });
});

describe('buildVisionContext', () => {
  it('names the main item and the room to ignore', () => {
    const ctx = buildVisionContext(bootsVision());

    expect(ctx.mainItem).toBe('Boot');
    expect(ctx.labels).toEqual(['Footwear', 'Boot', 'Suede']);
    expect(ctx.background).toEqual(['Flooring', 'Hardwood']);
  });

  it('always carries the vocabulary the answer must use', () => {
    const ctx = buildVisionContext(null);

    expect(ctx.allowedCategories).toHaveLength(11);
    expect(ctx.allowedColors).toContain('tan');
    expect(ctx.focus).toEqual(expect.any(String));
    expect(ctx.mainItem).toBeUndefined();
  });

  it('stays far under the 4000 characters the server accepts, even with long labels', () => {
    const long = 'x'.repeat(200);
    const vision = analyzeVision({
      labelAnnotations: Array.from({ length: 30 }, (_, i) => ({ description: `${long}${i} boot`, score: 0.9 })),
      webDetection: { bestGuessLabels: [{ label: long }] },
    });

    expect(JSON.stringify(buildVisionContext(vision)).length).toBeLessThan(3000);
  });
});

describe('how much of the frame the item covers', () => {
  const withBoxes = (boxes: Array<[string, ReturnType<typeof box>]>) =>
    analyzeVision({
      labelAnnotations: [{ description: 'Boot', score: 0.9 }],
      localizedObjectAnnotations: boxes.map(([name, boundingPoly]) => ({ name, score: 0.8, boundingPoly })),
    });

  it('counts boxes around the same boot once', () => {
    const vision = withBoxes([
      ['Boot', box(0, 0, 0.6, 0.65)],
      ['Footwear', box(0.02, 0.02, 0.58, 0.63)],
      ['Shoe', box(0.1, 0.1, 0.55, 0.6)],
    ]);

    expect(vision.scene.coverage).toBeCloseTo(0.39, 2);
  });

  it('counts only the part two boxes share once', () => {
    const vision = withBoxes([
      ['Boot', box(0, 0, 0.6, 0.65)],
      ['Shoe', box(0.25, 0.55, 0.6, 0.85)],
    ]);

    // 0.39 + 0.105 - the 0.035 where they overlap
    expect(vision.scene.coverage).toBeCloseTo(0.46, 3);
  });

  it('adds up boxes that do not touch', () => {
    const vision = withBoxes([
      ['Boot', box(0, 0, 0.2, 0.5)],
      ['Boot', box(0.5, 0.5, 0.8, 1)],
    ]);

    expect(vision.scene.coverage).toBeCloseTo(0.25, 3);
  });

  it('never exceeds the whole frame', () => {
    const vision = withBoxes([['Boot', box(-0.2, -0.2, 1.4, 1.3)]]);

    expect(vision.scene.coverage).toBe(1);
  });
});

describe('brand', () => {
  const brandOf = (raw: Record<string, unknown>) => analyzeVision(raw).result;

  describe('a garment word is not a brand', () => {
    const poloShirt = {
      labelAnnotations: [{ description: 'Polo shirt', score: 0.95 }, { description: 'Sleeve', score: 0.9 }],
      webDetection: {
        webEntities: [{ description: 'Polo shirt', score: 0.9 }],
        bestGuessLabels: [{ label: 'navy polo shirt' }],
      },
    };

    it('a navy polo shirt has no brand', () => {
      const r = brandOf(poloShirt);

      expect(r.brand).toBeUndefined();
      expect(r.confidence.brand).toBeUndefined();
    });

    it('so the model\'s brand fills it in', () => {
      const r = fuseRecognition(analyzeVision(poloShirt), answer({ category: 'tops', subtype: 'polo shirt', brand: 'Ralph Lauren' }));

      expect(r?.brand).toBe('Ralph Lauren');
    });

    it('Polo Ralph Lauren is still a brand', () => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Polo shirt', score: 0.95 }],
        webDetection: { webEntities: [{ description: 'Polo Ralph Lauren', score: 0.9 }] },
      });

      expect(r.brand).toBe('Polo Ralph Lauren');
    });

    it.each([
      ['a bus', 'tour coach'],
      ['a person called Jordan', 'Michael Jordan'],
      ['a bag, named by its type', 'coach tabby bag'],
      ['shoes, named by their type', 'Vince Camuto shoes'],
      ['a colour of dress', 'mulberry silk dress'],
    ])('web text about %s ("%s") is not a brand', (_what, text) => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        webDetection: { webEntities: [{ description: text, score: 0.9 }], bestGuessLabels: [{ label: text }] },
      });

      expect(r.brand).toBeUndefined();
    });

    it('"Made in Jordan" on a tag is a country, not a brand', () => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Jacket', score: 0.9 }],
        textAnnotations: [{ description: '100% polyester\nMADE IN JORDAN\nRN 12345' }],
      });

      expect(r.brand).toBeUndefined();
    });
  });

  describe('a brand that is also a word still counts when something vouches for it', () => {
    it('a web entity that is the brand itself', () => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        webDetection: { webEntities: [{ description: 'Coach', score: 0.9 }] },
      });

      expect(r.brand).toBe('Coach');
    });

    it('a web entity that leads with the brand and names no garment', () => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        webDetection: { webEntities: [{ description: 'Gap Inc.', score: 0.9 }] },
      });

      expect(r.brand).toBe('Gap');
    });

    it('the name read off the item (OCR)', () => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        textAnnotations: [{ description: 'COACH\nNEW YORK' }],
        webDetection: { bestGuessLabels: [{ label: 'brown leather tabby bag' }] },
      });

      expect(r.brand).toBe('Coach');
      expect(r.confidence.brand).toBeGreaterThanOrEqual(0.5);
    });

    it('a detected logo', () => {
      const r = brandOf({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        logoAnnotations: [{ description: 'Coach', score: 0.92 }],
      });

      expect(r.brand).toBe('Coach');
      expect(r.confidence.brand).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('against the model', () => {
    const coachEntity = {
      labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
      webDetection: { webEntities: [{ description: 'Coach', score: 0.9 }] },
    };

    it('the model can correct a brand that only a web entity named', () => {
      const r = fuseRecognition(analyzeVision(coachEntity), answer({ category: 'bags', subtype: 'tote', brand: 'Michael Kors' }));

      expect(r?.brand).toBe('Michael Kors');
    });

    it('but not one the item itself shows', () => {
      const withLogo = { ...coachEntity, logoAnnotations: [{ description: 'Coach', score: 0.95 }] };
      const r = fuseRecognition(analyzeVision(withLogo), answer({ category: 'bags', subtype: 'tote', brand: 'Michael Kors' }));

      expect(r?.brand).toBe('Coach');
    });

    it('agreement raises the confidence', () => {
      const alone = fuseRecognition(analyzeVision(coachEntity), null);
      const agreed = fuseRecognition(analyzeVision(coachEntity), answer({ category: 'bags', subtype: 'tote', brand: 'Coach' }));

      expect(agreed?.brand).toBe('Coach');
      expect(agreed?.confidence.brand).toBeGreaterThan(alone?.confidence.brand as number);
    });

    it('a shorter name for the same brand does not replace the full one', () => {
      const vision = analyzeVision({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        webDetection: { webEntities: [{ description: 'Bottega Veneta', score: 0.9 }] },
      });
      const r = fuseRecognition(vision, answer({ category: 'bags', subtype: 'tote', brand: 'Bottega' }));

      expect(r?.brand).toBe('Bottega Veneta');
    });
  });
});

describe('a photo with no clothing in it', () => {
  const dog = () =>
    analyzeVision({
      labelAnnotations: [{ description: 'Dog', score: 0.97 }, { description: 'Grass', score: 0.9 }],
      localizedObjectAnnotations: [{ name: 'Dog', score: 0.9, boundingPoly: box(0.1, 0.2, 0.9, 0.9) }],
      imagePropertiesAnnotation: {
        dominantColors: { colors: [{ color: { red: 60, green: 140, blue: 70 }, pixelFraction: 0.55, score: 0.55 }] },
      },
    });

  it('has no colour or swatches of its own to offer', () => {
    const r = fuseRecognition(dog(), null);

    expect(r?.category).toBeUndefined();
    expect(r?.color).toBeUndefined();
    expect(r?.colors).toBeUndefined();
    expect(r?.confidence.color).toBeUndefined();
  });

  it('keeps the model\'s colour when it gave one without a category', () => {
    const r = fuseRecognition(dog(), answer({ category: undefined, subtype: undefined, colors: ['green'] }));

    expect(r?.color).toBe('green');
  });

  it('an item that was found keeps the pixel colour', () => {
    const r = fuseRecognition(
      analyzeVision({
        labelAnnotations: [{ description: 'Handbag', score: 0.9 }],
        localizedObjectAnnotations: [{ name: 'Handbag', score: 0.9, boundingPoly: box(0.1, 0.1, 0.9, 0.9) }],
        imagePropertiesAnnotation: {
          dominantColors: { colors: [{ color: { red: 122, green: 78, blue: 45 }, pixelFraction: 0.6, score: 0.6 }] },
        },
      }),
      null,
    );

    expect(r?.color).toBe('brown');
  });
});

describe('materials of jewelry, hats and bags', () => {
  it.each([
    ['jewelry', 'gold'],
    ['jewelry', 'silver'],
    ['jewelry', 'sterling silver'],
    ['jewelry', 'pearl'],
    ['jewelry', 'metal'],
    ['jewelry', 'brass'],
    ['jewelry', 'crystal'],
    ['jewelry', 'enamel'],
    ['jewelry', 'resin'],
    ['hats', 'felt'],
    ['hats', 'wool felt'],
    ['hats', 'straw'],
    ['hats', 'sequin'],
    ['bags', 'cork'],
    ['bags', 'neoprene'],
    ['bags', 'tulle'],
    ['bags', 'calfskin'],
    ['bags', 'patent leather'],
    ['bags', 'canvas'],
    ['bags', 'rubber'],
    ['bags', 'plastic'],
    ['bags', 'acrylic'],
    ['accessories', 'ceramic'],
    ['accessories', 'wood'],
    ['accessories', 'glass'],
  ])('%s: "%s" is kept', (category, material) => {
    expect(normalizeAiAnswer({ category, material })?.material).toBe(material);
  });

  it('finds the material in a longer answer', () => {
    expect(normalizeAiAnswer({ category: 'jewelry', material: '14k Gold-plated brass' })?.material).toBe('gold');
    expect(normalizeAiAnswer({ category: 'hats', material: 'Wool Felt' })?.material).toBe('wool felt');
  });

  it('still drops a material that is not one', () => {
    expect(normalizeAiAnswer({ category: 'jewelry', material: 'unobtainium' })?.material).toBeUndefined();
  });

  it('is not read off Vision\'s labels, where a colour or hardware would pass for the material', () => {
    const vision = analyzeVision({
      labelAnnotations: [{ description: 'Sandal', score: 0.9 }, { description: 'Metal', score: 0.8 }],
      webDetection: { bestGuessLabels: [{ label: 'silver strappy sandals' }] },
    });

    expect(vision.result.material).toBeUndefined();
  });

  it('a Vision "Leather" label and a model "calfskin" are one material, named by the specific word', () => {
    const vision = analyzeVision({
      labelAnnotations: [{ description: 'Handbag', score: 0.9 }, { description: 'Leather', score: 0.8 }],
    });
    const r = fuseRecognition(vision, answer({ category: 'bags', subtype: 'tote', material: 'calfskin' }));

    expect(r?.material).toBe('calfskin');
  });
});
