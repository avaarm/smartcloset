/**
 * The ai-proxy Edge Function is Deno code that jest cannot import, so the
 * openai-vision prompt is read out of the source and compared with the
 * vocabulary the app validates the model's answer against. A prompt that
 * offers fewer categories or other colour names than the app accepts makes the
 * model answer in words the form then throws away.
 */
import fs from 'fs';
import path from 'path';
import { buildVisionContext } from '../../src/services/recognitionFusion';
import { CLOTHING_COLORS, MULTICOLOR } from '../../src/utils/colorNames';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';

const source = fs.readFileSync(
  path.join(__dirname, '../../supabase/functions/ai-proxy/index.ts'),
  'utf8',
);

// The openai-vision route, from its prompt to the end of the upstream call.
const visionRoute = source.slice(source.indexOf('const callOpenAIVision'), source.indexOf('// Brave Search'));

describe('ai-proxy openai-vision prompt', () => {
  it('offers all eleven categories', () => {
    const line = visionRoute.match(/"category": ([^\n]*)/)?.[1] ?? '';
    const offered = Array.from(line.matchAll(/"([a-z]+)"/g), m => m[1]);

    expect(offered).toEqual([...CLOTHING_CATEGORIES]);
  });

  it('offers the colour names the app understands, for the item itself, at most three', () => {
    const line = visionRoute.match(/"colors": \[([^\n]*)\]/)?.[1] ?? '';

    expect(line).toMatch(/up to 3 colours of the item itself/);
    const list = line.match(/each from this list: ([^>"]*)/)?.[1] ?? '';
    expect(list.split(', ')).toEqual([...CLOTHING_COLORS.map(c => c.name), MULTICOLOR]);
  });

  it('describes only the main item, and says where boots and handbags belong', () => {
    expect(visionRoute).toContain(
      'Describe ONLY the single main garment or accessory; ignore floors, walls, furniture, hands, people, mannequins and other items.',
    );
    expect(visionRoute).toContain(
      'Boots, sneakers, heels and flats are shoes; handbags, totes and backpacks are bags.',
    );
  });

  it('agrees with the hints the app sends along with the photo', () => {
    const focus = String(buildVisionContext(null).focus);

    for (const sentence of [
      'ignore floors, walls, furniture, hands, people, mannequins',
      'boots, sneakers, heels and flats are shoes; handbags, totes and backpacks are bags',
    ]) {
      expect(focus.toLowerCase()).toContain(sentence);
      expect(visionRoute.toLowerCase()).toContain(sentence);
    }
  });

  it('still returns the same JSON keys, in the same order', () => {
    const keys = Array.from(visionRoute.matchAll(/^ {2}"([a-z]+)": /gm), m => m[1]);

    expect(keys).toEqual([
      'category', 'subcategory', 'brand', 'colors', 'pattern', 'material', 'season', 'occasion', 'style',
      'gender', 'description', 'confidence',
    ]);
    expect(visionRoute).toContain('${ctxHint}');
  });

  it('keeps the route\'s validation and limits', () => {
    expect(visionRoute).toContain('if (imageBase64.length > MAX_IMAGE_B64_CHARS) return json({ error: "image too large" }, 413);');
    expect(visionRoute).toContain('if (ctxJson.length > 4000) return json({ error: "visionContext too large" }, 400);');
    expect(visionRoute).toContain('["image/jpeg", "image/png", "image/webp"]');
    expect(visionRoute).toContain('model: "gpt-4o"');
    expect(visionRoute).toContain('detail: "high"');
    expect(visionRoute).toContain('max_tokens: 600');
    expect(visionRoute).toContain('response_format: { type: "json_object" }');
    expect(source).toMatch(/"openai-vision": \{ perMin: 10, perDay: 200 \}/);
  });
});
