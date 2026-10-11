/**
 * Regression tests built from real responses: what Google Vision and gpt-4o actually returned for photos in the
 * accuracy corpus (public photos of items in awkward settings: a hoodie on a street stall, a crumpled knit on a
 * table, a pinafore dress worn with a hat, red heels on a warm wooden floor, a bag on a shoulder).
 *
 * Each fixture holds the Vision labels, boxes and pixels (trimmed), and the model's answer from before and after
 * the proxy prompt was rewritten, so the fusion is held to the same results without a network call.
 *
 * "before" answers matter because older app builds keep calling the model with whatever the proxy returns, and
 * because the fusion must stay correct when the model contradicts itself.
 */
import fs from 'fs';
import path from 'path';
import {
  analyzeVision,
  fuseRecognition,
  normalizeAiAnswer,
  parseAiContent,
  type AiAnswer,
} from '../../src/services/recognitionFusion';
import { colorFamily } from '../../src/utils/colorNames';

interface Fixture {
  vision: any;
  answers: { before: string | null; after: string | null };
}

const load = (name: string): Fixture =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/recognition', `${name}.json`), 'utf8'));

const answer = (content: string | null): AiAnswer | null => normalizeAiAnswer(parseAiContent(content));

describe('a hoodie hanging at a street stall under a t-shirt', () => {
  const f = load('hoodie_street_stall');
  const vision = analyzeVision(f.vision);

  it('is a top, not outerwear, even when the model filed its own "hoodie" under outerwear', () => {
    // before: {"category": "outerwear", "subcategory": "hoodie"}; the form was filled with Outerwear.
    const before = answer(f.answers.before) as AiAnswer;
    expect(before.category).toBe('tops');
    expect(before.contradicted).toBe(true);

    for (const content of [f.answers.before, f.answers.after]) {
      const r = fuseRecognition(vision, answer(content));
      expect(r?.category).toBe('tops');
      expect(r?.type).toBe('Hoodie');
      expect(r?.confidence.category).toBeGreaterThanOrEqual(0.6);
      expect(r?.color).toBe('black');
    }
  });

  it('is less sure of the category when the model had to be corrected than when it was consistent', () => {
    const corrected = fuseRecognition(vision, answer(f.answers.before));
    const consistent = fuseRecognition(vision, answer(f.answers.after));

    expect(corrected?.confidence.category as number).toBeLessThan(consistent?.confidence.category as number);
  });
});

describe('a crumpled cream knit on a wooden table in warm light', () => {
  const f = load('cream_knit_warm_light');
  const vision = analyzeVision(f.vision);

  it('is a sweater under tops, however the model filed it', () => {
    // before: {"category": "outerwear", "subcategory": "knit sweater"}
    for (const content of [f.answers.before, f.answers.after]) {
      const r = fuseRecognition(vision, answer(content));
      expect(r?.category).toBe('tops');
      expect(r?.type).toBe('Sweater');
      expect(['beige', 'cream', 'ivory']).toContain(r?.color);
    }
  });

  it('never takes the table\'s brown for the colour (Vision alone calls it brown or charcoal, and does not fill it in)', () => {
    const r = fuseRecognition(vision, null);

    expect(r?.confidence.color ?? 0).toBeLessThan(0.5);
  });
});

describe('a red pinafore dress worn with a straw hat', () => {
  const f = load('pinafore_street');
  const vision = analyzeVision(f.vision);

  it('is a dress to Vision: four boxes around one hat do not outweigh the dress', () => {
    // Vision boxed the hat as "Sun hat", "Fedora", "Hat" and "Straw hat" and the dress as "Overall".
    expect(vision.result.category).toBe('dresses');
    expect(vision.mainItem).not.toMatch(/hat/i);
  });

  it('is a dress when the model describes the dress, red, with the hat listed as another item', () => {
    const r = fuseRecognition(vision, answer(f.answers.after));

    expect(r?.category).toBe('dresses');
    expect(r?.color).toBe('red');
    expect(r?.confidence.category).toBeGreaterThanOrEqual(0.6);
  });

  it('says so with less confidence when the model picked the hat and Vision saw the dress', () => {
    const r = fuseRecognition(vision, answer(f.answers.before));

    expect(r?.confidence.category as number).toBeLessThanOrEqual(0.6);
  });
});

describe('red heels on a warm wooden floor, when the vision model is not available', () => {
  const f = load('red_heels_warm_wood');
  const vision = analyzeVision(f.vision);

  it('does not read the floor as the colour (it came out "gold" from the frame\'s pixels)', () => {
    const r = fuseRecognition(vision, null);

    expect(r?.category).toBe('shoes');
    expect(colorFamily(r?.color)).toBe('red');
    expect(r?.confidence.color).toBeGreaterThanOrEqual(0.5);
    for (const swatch of r?.colors ?? []) expect(['yellow', 'orange']).not.toContain(colorFamily(swatch.name));
  });

  it('is red with the model\'s answer too', () => {
    const r = fuseRecognition(vision, answer(f.answers.after));

    expect(colorFamily(r?.color)).toBe('red');
    expect(r?.category).toBe('shoes');
  });
});

describe('a messenger bag on the shoulder of a man in a chambray shirt', () => {
  const f = load('messenger_bag_worn');
  const vision = analyzeVision(f.vision);

  it('is a bag, not a top, with either answer or Vision alone', () => {
    for (const content of [f.answers.before, f.answers.after, null]) {
      const r = fuseRecognition(vision, answer(content));
      expect(r?.category).toBe('bags');
    }
  });

  it('is typed as a crossbody when the model says so', () => {
    expect(fuseRecognition(vision, answer(f.answers.after))?.type).toBe('Crossbody');
  });

  it('is not made less sure of the bag by the shirt the model also saw', () => {
    // The model listed "shirt" and "pants" as other items; they are garments and the bag is the answer.
    const r = fuseRecognition(vision, answer(f.answers.after));

    expect(r?.confidence.category).toBeGreaterThanOrEqual(0.5);
  });
});
