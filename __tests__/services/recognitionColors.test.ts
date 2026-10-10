import {
  readPixelColors,
  resolveItemColors,
  type ColorEvidence,
  type ColorScene,
  type PixelColor,
} from '../../src/services/recognitionColors';
import { hexToRgb } from '../../src/utils/colorNames';

const px = (hex: string, weight: number): PixelColor => ({ ...(hexToRgb(hex) as { r: number; g: number; b: number }), weight });

// What Vision measured for tan suede boots over black flats on a red-brown hardwood floor.
const FLOOR = [px('#6E2A20', 0.22), px('#8C3A2C', 0.2), px('#A04632', 0.15), px('#5A1E19', 0.12)];
const FLATS = px('#1E1C1C', 0.08);
const BOOTS = [px('#C8A88A', 0.07), px('#DECDB0', 0.03)];

const evidence = (over: Omit<Partial<ColorEvidence>, 'scene'> & { scene?: Partial<ColorScene> } = {}): ColorEvidence => ({
  pixels: [...FLOOR, FLATS, ...BOOTS],
  aiColors: [],
  aiConfidence: 0.9,
  ...over,
  scene: { woodSurface: true, coverage: 0.5, hasSubject: true, ...over.scene },
});

const names = (r: ReturnType<typeof resolveItemColors>) => r.colors.map(c => c.name);

describe('with the vision model\'s answer', () => {
  it('leads with the model\'s colour and never lists the floor', () => {
    const r = resolveItemColors(evidence({ aiColors: ['tan', 'black'] }));

    expect(r.color).toBe('tan');
    expect(names(r)).toEqual(['tan', 'black']);
    expect(r.colors[0].hex).toBe('#C9A57B');
  });

  it('is surer of a colour the pixels also show than of one they do not', () => {
    const backed = resolveItemColors(evidence({ aiColors: ['tan'], aiConfidence: 0.8 }));
    const unbacked = resolveItemColors(evidence({ aiColors: ['navy'], aiConfidence: 0.8 }));

    expect(backed.confidence).toBeGreaterThan(unbacked.confidence as number);
    expect(unbacked.confidence).toBeCloseTo(0.68, 2);
  });

  it('does not count the floor as backing for a brown the model named', () => {
    // The floor is brown-ish too, but it is the floor: no boost for it.
    const r = resolveItemColors(evidence({ aiColors: ['dark brown'], aiConfidence: 0.8, pixels: [...FLOOR] }));

    expect(r.color).toBe('dark brown');
    expect(r.confidence).toBeCloseTo(0.68, 2);
  });

  it('adds no swatch of its own from the surroundings when the item is small in the frame', () => {
    // A green lawn behind a small item is not wood, so only the model's colours can speak for the item.
    const lawn = [px('#2F8F4E', 0.5), px('#C8A88A', 0.06)];
    const r = resolveItemColors(evidence({ aiColors: ['tan'], pixels: lawn, scene: { woodSurface: false, coverage: 0.2 } }));

    expect(names(r)).toEqual(['tan']);
  });

  it('never lists wood tones under a floor or table, however much of the frame the boxes cover', () => {
    const r = resolveItemColors(evidence({ aiColors: ['tan', 'black'], scene: { woodSurface: true, coverage: 0.9 } }));

    expect(names(r)).toEqual(['tan', 'black']);
  });

  it('adds no wood-toned swatch of its own once the model has answered', () => {
    const r = resolveItemColors(
      evidence({
        aiColors: ['tan'],
        pixels: [px('#C8A88A', 0.2), px('#7A4E2D', 0.4)],
        scene: { woodSurface: false, coverage: 0.8 },
      }),
    );

    expect(names(r)).toEqual(['tan']);
  });

  it('adds a measured colour when the item fills the frame', () => {
    const bagOnWhite = [px('#7A4E2D', 0.5), px('#2F5FB0', 0.1), px('#F8F8F8', 0.35)];
    const r = resolveItemColors(
      evidence({ aiColors: ['brown'], pixels: bagOnWhite, scene: { woodSurface: false, coverage: 0.8 } }),
    );

    // The blue lining is part of the item; the white backdrop is not.
    expect(names(r)).toEqual(['brown', 'blue']);
  });

  it('weighs each swatch by its share of the item, summing to about one', () => {
    const r = resolveItemColors(evidence({ aiColors: ['tan', 'black'] }));

    const [first, second] = r.colors.map(c => c.weight);
    expect(first).toBeGreaterThan(second);
    expect(first + second).toBeCloseTo(1, 1);
    expect(resolveItemColors(evidence({ aiColors: ['tan'], pixels: [] })).colors[0].weight).toBe(1);
  });

  it('merges the same colour named twice', () => {
    const r = resolveItemColors(evidence({ aiColors: ['cream', 'beige', 'black'], pixels: [] }));

    expect(names(r)).toEqual(['cream', 'black']);
  });

  it('keeps at most four swatches, most likely first', () => {
    const r = resolveItemColors(
      evidence({ aiColors: ['navy', 'red', 'mustard'], scene: { woodSurface: false, coverage: 0.9 }, pixels: [
        px('#1B2A4A', 0.3), px('#2F8F4E', 0.2), px('#6A3A8E', 0.15), px('#F3D43D', 0.1), px('#E8731A', 0.1),
      ] }),
    );

    expect(r.colors.length).toBeLessThanOrEqual(4);
    expect(r.color).toBe('navy');
    const weights = r.colors.map(c => c.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('ignores a name that is not in the palette instead of drawing an undefined swatch', () => {
    const r = resolveItemColors(evidence({ aiColors: ['sparkly unicorn', 'tan'], pixels: [] }));

    expect(names(r)).toEqual(['tan']);
    expect(r.colors.every(c => /^#[0-9A-F]{6}$/.test(c.hex))).toBe(true);
  });

  it('calls a multicolor item multicolor, keeping the colours it does list as swatches', () => {
    const r = resolveItemColors(evidence({ aiColors: ['multicolor', 'red'], pixels: [] }));

    expect(r.color).toBe('multicolor');
    expect(names(r)).toEqual(['red']);
  });
});

describe('without the vision model\'s answer', () => {
  it('drops the wood floor and reads the boots (the screenshot case)', () => {
    const r = resolveItemColors(evidence());

    expect(r.color).toBe('tan');
    const found = names(r);
    for (const floor of ['maroon', 'burgundy', 'brown', 'red', 'rust', 'terracotta', 'green', 'ivory']) {
      expect(found).not.toContain(floor);
    }
    expect(found).toEqual(expect.arrayContaining(['tan', 'black']));
    // Whole-frame pixels alone are not enough to be "confident".
    expect(r.confidence).toBeLessThan(0.7);
  });

  it('keeps the floor colours out only when a floor was seen', () => {
    const r = resolveItemColors(evidence({ scene: { woodSurface: false } }));

    expect(names(r)).toContain('maroon');
  });

  it('still lets a wood-toned item that fills the frame be itself when no floor was seen', () => {
    const r = resolveItemColors(evidence({ pixels: [px('#7A4E2D', 0.7)], scene: { woodSurface: false, coverage: 0.8 } }));

    expect(r.color).toBe('brown');
    expect(r.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('guesses no colour from wood tones once a floor or table was seen, however much of the frame the item fills', () => {
    const r = resolveItemColors(evidence({ pixels: [px('#7A4E2D', 0.7)], scene: { woodSurface: true, coverage: 0.8 } }));

    expect(r).toEqual({ colors: [] });
  });

  it('offers what is left after the floor was taken out, but not as a colour to fill in', () => {
    const r = resolveItemColors(evidence());

    expect(r.color).toBe('tan');
    expect(names(r)).toEqual(expect.arrayContaining(['tan', 'black']));
    expect(r.confidence).toBeLessThan(0.4);
  });

  it('offers white and black for black sunglasses on white, but fills in neither', () => {
    const r = resolveItemColors(
      evidence({ pixels: [px('#FAFAFA', 0.6), px('#141414', 0.3)], scene: { woodSurface: false, coverage: 0.3 } }),
    );

    expect(names(r)).toEqual(expect.arrayContaining(['white', 'black']));
    expect(r.confidence).toBeLessThan(0.4);
  });

  it('trusts a near-white pixel colour as before when nothing localised an item against it', () => {
    const r = resolveItemColors(
      evidence({ pixels: [px('#FAFAFA', 0.8)], scene: { woodSurface: false, coverage: undefined, hasSubject: false } }),
    );

    expect(r.color).toBe('white');
  });

  it('discounts a white or black backdrop behind a localised item', () => {
    const r = resolveItemColors(
      evidence({ pixels: [px('#FFFFFF', 0.6), px('#9A5B2E', 0.25)], scene: { woodSurface: false, coverage: 0.4 } }),
    );

    expect(r.color).toBe('brown');
  });

  it('is unsure when nothing says which part of the frame is the item', () => {
    const r = resolveItemColors(
      evidence({ pixels: [px('#9A5B2E', 0.4)], scene: { woodSurface: false, coverage: undefined, hasSubject: false } }),
    );

    expect(r.color).toBe('brown');
    expect(r.confidence).toBeLessThan(0.4);
  });

  it('says nothing when only noise remains', () => {
    const r = resolveItemColors(evidence({ pixels: [px('#9A5B2E', 0.01), ...FLOOR] }));

    expect(r).toEqual({ colors: [] });
  });
});

describe('readPixelColors', () => {
  it('reads Vision\'s dominant colours, treating the channels Vision leaves out as 0', () => {
    const out = readPixelColors({
      dominantColors: { colors: [{ color: { red: 200, green: 168 }, pixelFraction: 0.07, score: 0.5 }, { color: {}, score: 0.2 }] },
    });

    expect(out).toEqual([
      { r: 200, g: 168, b: 0, weight: 0.07 },
      { r: 0, g: 0, b: 0, weight: 0.2 },
    ]);
  });

  it('returns nothing when the block is missing', () => {
    expect(readPixelColors(undefined)).toEqual([]);
    expect(readPixelColors({})).toEqual([]);
  });
});
