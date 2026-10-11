import {
  CLOTHING_COLORS,
  MULTICOLOR,
  colorFamily,
  colorsInFamily,
  distanceToName,
  familyForRgb,
  hexForColorName,
  hexToRgb,
  isWoodTone,
  nameDistance,
  nameForRgb,
  normalizeColorName,
  rgbDistance,
  rgbToHex,
} from '../../src/utils/colorNames';

const nameOfHex = (hex: string) => nameForRgb(hexToRgb(hex) as { r: number; g: number; b: number });

describe('the clothing palette', () => {
  it('has unique names and valid hex values', () => {
    const names = CLOTHING_COLORS.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of CLOTHING_COLORS) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('includes the everyday clothing colours a tan boot or a camel coat needs', () => {
    const names = CLOTHING_COLORS.map(c => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'tan', 'beige', 'camel', 'cream', 'khaki', 'taupe', 'burgundy', 'navy', 'olive', 'mustard', 'blush',
        'dark brown', 'charcoal',
      ]),
    );
  });

  it('names its own colours as themselves', () => {
    for (const c of CLOTHING_COLORS) expect(nameOfHex(c.hex)).toBe(c.name);
  });

  it('looks up a hex by name', () => {
    expect(hexForColorName('tan')).toBe('#C9A57B');
    expect(hexForColorName('sparkly unicorn')).toBeUndefined();
  });
});

describe('naming an RGB value by the nearest clothing colour', () => {
  // [description, hex, expected name]
  const table: Array<[string, string, string]> = [
    ['tan suede boot', '#C8A88A', 'tan'],
    ['tan suede boot, in light', '#DECDB0', 'beige'],
    ['light tan leather', '#D2B48C', 'tan'],
    ['khaki chino', '#BDB08A', 'khaki'],
    ['cream knit', '#F5EBD0', 'cream'],
    ['ivory silk', '#F6F1E4', 'ivory'],
    ['taupe suede', '#8F7F73', 'taupe'],
    ['cognac leather bag', '#9A5B2E', 'brown'],
    ['dark chocolate leather', '#3E2518', 'dark brown'],
    ['black ballet flat', '#1E1C1C', 'black'],
    ['charcoal sweater', '#444444', 'charcoal'],
    ['mid grey tee', '#9A9A9A', 'gray'],
    ['light grey hoodie', '#E0E0E0', 'light gray'],
    ['white tee', '#F7F7F7', 'white'],
    ['navy blazer', '#1F2A44', 'navy'],
    ['denim', '#4A6A9A', 'blue'],
    ['olive jacket', '#6B6B2F', 'olive'],
    ['sage cardigan', '#A3B18A', 'sage'],
    ['burgundy bag', '#5C1A2B', 'burgundy'],
    ['mustard scarf', '#D2A02A', 'mustard'],
    ['blush dress', '#F0CFC8', 'blush'],
    ['rust sweater', '#B04A22', 'rust'],
  ];

  it.each(table)('%s (%s) is %s', (_what, hex, expected) => {
    expect(nameOfHex(hex)).toBe(expected);
  });

  it('is the closest colour, not the first rule that fits (tan suede was "ivory")', () => {
    // The old if-chain called any light warm colour ivory.
    expect(nameOfHex('#C8A88A')).not.toBe('ivory');
    expect(nameOfHex('#C8A88A')).not.toBe('brown');
  });

  it('does not turn dark neutrals into a colour (dark greys were "green")', () => {
    for (const hex of ['#2B2B2B', '#3C3C3C', '#505050', '#5A5A50']) {
      expect(['charcoal', 'black']).toContain(nameOfHex(hex));
    }
  });

  it('formats and parses hex', () => {
    expect(rgbToHex({ r: 201, g: 165, b: 123 })).toBe('#C9A57B');
    expect(rgbToHex({ r: 300, g: -4, b: 12.4 })).toBe('#FF000C');
    expect(hexToRgb('#c9a57b')).toEqual({ r: 201, g: 165, b: 123 });
    expect(hexToRgb('c9a57b')).toEqual({ r: 201, g: 165, b: 123 });
    expect(hexToRgb('#c9a')).toBeNull();
    expect(hexToRgb('tan')).toBeNull();
  });
});

describe('perceptual distance', () => {
  it('is zero for the same colour and grows with difference', () => {
    const tan = hexToRgb('#C9A57B') as { r: number; g: number; b: number };
    expect(rgbDistance(tan, tan)).toBe(0);
    expect(distanceToName(tan, 'tan')).toBeLessThan(1);
    expect(distanceToName(tan, 'beige')).toBeLessThan(distanceToName(tan, 'navy'));
  });

  it('treats neighbouring shades as close and different hues as far', () => {
    expect(nameDistance('tan', 'camel')).toBeLessThan(14);
    expect(nameDistance('cream', 'beige')).toBeLessThan(14);
    expect(nameDistance('tan', 'navy')).toBeGreaterThan(40);
    expect(nameDistance('brown', 'olive')).toBeGreaterThan(20);
  });

  it('is Infinity for a name that is not in the palette', () => {
    expect(nameDistance('tan', 'sparkly unicorn')).toBe(Infinity);
    expect(distanceToName({ r: 0, g: 0, b: 0 }, 'sparkly unicorn')).toBe(Infinity);
  });
});

describe('isWoodTone', () => {
  it('is true for stained-wood reds and browns (a hardwood floor)', () => {
    for (const hex of ['#6E2A20', '#8C3A2C', '#A04632', '#5A3A24']) {
      expect(isWoodTone(hexToRgb(hex) as { r: number; g: number; b: number })).toBe(true);
    }
  });

  it('is false for the light warm tones of suede, canvas and leather, and for neutrals and blues', () => {
    for (const hex of ['#C8A88A', '#DECDB0', '#D2B48C', '#F5EBD0', '#1E1C1C', '#FFFFFF', '#9A9A9A', '#1F2A44']) {
      expect(isWoodTone(hexToRgb(hex) as { r: number; g: number; b: number })).toBe(false);
    }
  });
});

describe('normalizeColorName', () => {
  // [what the model wrote, our name]
  const table: Array<[string, string]> = [
    ['tan', 'tan'],
    ['Tan', 'tan'],
    ['  TAN  ', 'tan'],
    ['light tan', 'tan'],
    ['Dark Brown', 'dark brown'],
    ['espresso', 'dark brown'],
    ['chocolate brown', 'dark brown'],
    ['cognac', 'brown'],
    ['olive_green', 'olive'],
    ['olive-green', 'olive'],
    ['Jet Black', 'black'],
    ['grey', 'gray'],
    ['Light Grey', 'light gray'],
    ['dark gray', 'charcoal'],
    ['off-white', 'ivory'],
    ['Navy Blue', 'navy'],
    ['wine', 'burgundy'],
    ['natural', 'beige'],
    ['rose gold', 'gold'],
    ['hot pink', 'hot pink'],
    ['forest green', 'forest green'],
    ['#C9A98A', 'tan'],
    ['#141414', 'black'],
    // Several colours: the first named wins.
    ['tan/black', 'tan'],
    ['brown and tan', 'brown'],
    ['black, white', 'black'],
    ['tan leather with black trim', 'tan'],
    ['rich dark brown leather', 'dark brown'],
    ['light blue denim', 'light blue'],
    // The model's words for "several colours".
    ['multi', MULTICOLOR],
    ['multi-color', MULTICOLOR],
    ['Multicolor', MULTICOLOR],
    ['rainbow', MULTICOLOR],
  ];

  it.each(table)('%j is %s', (written, expected) => {
    expect(normalizeColorName(written)).toBe(expected);
  });

  it('returns null for anything that is not a colour we can place', () => {
    for (const bad of ['sparkly unicorn', '', '   ', 'x'.repeat(50), '#12345', 'leather', 42, null, undefined, {}, ['tan']]) {
      expect(normalizeColorName(bad)).toBeNull();
    }
  });

  it('maps every palette name to itself', () => {
    for (const c of CLOTHING_COLORS) expect(normalizeColorName(c.name)).toBe(c.name);
  });
});

describe('names for the colours a model writes next to red and yellow', () => {
  // [what the model wrote, our name]. The last colour word is the colour; the first only tints it.
  const table: Array<[string, string]> = [
    ['orange-red', 'red'],
    ['orange red', 'red'],
    ['red-orange', 'orange'],
    ['tomato red', 'red'],
    ['brick red', 'rust'],
    ['cranberry', 'burgundy'],
    ['raspberry', 'hot pink'],
    ['ochre', 'mustard'],
    ['mustard yellow', 'mustard'],
    ['saffron', 'mustard'],
    ['canary', 'yellow'],
    ['yellow-green', 'lime'],
    ['blue-green', 'teal'],
    ['dusty pink', 'blush'],
    ['mahogany', 'dark brown'],
  ];

  it.each(table)('%j is %s', (written, expected) => {
    expect(normalizeColorName(written)).toBe(expected);
  });

  it('keeps naming the first of several colours separated by a slash or "and"', () => {
    expect(normalizeColorName('red/orange')).toBe('red');
    expect(normalizeColorName('orange and red')).toBe('orange');
  });
});

describe('colour families', () => {
  it('puts every palette colour in exactly one family', () => {
    for (const c of CLOTHING_COLORS) expect(colorFamily(c.name)).toBeDefined();
  });

  it('keeps burgundy, maroon, rust and coral with red, and mustard and gold with yellow', () => {
    for (const name of ['red', 'burgundy', 'maroon', 'rust', 'terracotta', 'coral']) expect(colorFamily(name)).toBe('red');
    for (const name of ['yellow', 'mustard', 'gold']) expect(colorFamily(name)).toBe('yellow');
    expect(colorFamily('orange')).toBe('orange');
    expect(colorFamily('brown')).toBe('neutral');
    expect(colorFamily('beige')).toBe('neutral');
    expect(colorFamily('hot pink')).toBe('pink');
  });

  it('has no family for what is not a palette colour', () => {
    expect(colorFamily('multicolor')).toBeUndefined();
    expect(colorFamily('sparkly unicorn')).toBeUndefined();
    expect(colorFamily(undefined)).toBeUndefined();
  });

  it('lists the members of a family', () => {
    expect(colorsInFamily('yellow').sort()).toEqual(['gold', 'mustard', 'yellow']);
  });

  it('puts an RGB value in the family of its nearest colour', () => {
    expect(familyForRgb({ r: 200, g: 30, b: 40 })).toBe('red');
    expect(familyForRgb({ r: 240, g: 215, b: 60 })).toBe('yellow');
    expect(familyForRgb({ r: 120, g: 120, b: 124 })).toBe('neutral');
  });
});

describe('a red is never named as a yellow, whatever the light did to it', () => {
  // HSL -> RGB, for sweeping every red hue at every lightness and saturation.
  const rgbOf = (h: number, s: number, l: number) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  };

  it('names every vivid red hue (335 to 8 degrees) in the red family or a neutral, never orange, yellow, green or blue', () => {
    for (let h = 335; h <= 368; h += 2) {
      for (let s = 0.5; s <= 1; s += 0.1) {
        for (let l = 0.15; l <= 0.85; l += 0.05) {
          const name = nameForRgb(rgbOf(h % 360, s, l));
          expect(['yellow', 'orange', 'green', 'blue']).not.toContain(colorFamily(name));
        }
      }
    }
  });

  it('never calls a red-orange (up to 20 degrees) yellow, green or blue; at worst it is orange', () => {
    for (let h = 335; h <= 380; h += 2) {
      for (let s = 0.4; s <= 1; s += 0.1) {
        for (let l = 0.15; l <= 0.85; l += 0.05) {
          expect(['yellow', 'green', 'blue']).not.toContain(colorFamily(nameForRgb(rgbOf(h % 360, s, l))));
        }
      }
    }
  });

  it('keeps a red lit by a warm lamp (a pull toward orange) red-brown, never mustard, yellow or gold', () => {
    for (const hex of ['#C8321E', '#D2401F', '#B83A1C', '#A8321E', '#E0502A']) {
      expect(['mustard', 'yellow', 'gold']).not.toContain(nameOfHex(hex));
    }
  });
});
