import {
  applyReadRules,
  buildGroup,
  groundModelRead,
  isFibreGrounded,
  largestRemainderRound,
  numbersIn,
  toMaterialComponents,
} from '../../src/utils/tagGrounding';
import { normalizeText } from '../../src/utils/textFold';
import type { ModelTagRead, TagFibre, TagGroup, TagPart } from '../../src/types/tag';

const fibre = (extra: Partial<TagFibre> = {}): TagFibre => ({
  fibre: 'cotton', printed: 'cotton', percent: 100, qualifier: null, evidence: '100% cotton', grounded: true, ...extra,
});
const group = (extra: Partial<TagGroup> = {}): TagGroup => ({
  part: 'shell', label: null, fibres: [fibre()], sum: 100, status: 'verified', issues: [], ...extra,
});

describe('largestRemainderRound', () => {
  it('rounds to whole numbers that add up to exactly 100', () => {
    expect(largestRemainderRound([97.5, 2.5])).toEqual([98, 2]);
    expect(largestRemainderRound([33.4, 33.3, 33.3])).toEqual([34, 33, 33]);
    expect(largestRemainderRound([33.3, 33.3, 33.3])).toEqual([34, 33, 33]);
    expect(largestRemainderRound([60, 40])).toEqual([60, 40]);
    expect(largestRemainderRound([100])).toEqual([100]);
    expect(largestRemainderRound([99.6])).toEqual([100]);
  });

  it('gives a tie to the larger value, then to the earlier one', () => {
    expect(largestRemainderRound([2.5, 97.5])).toEqual([2, 98]);
    expect(largestRemainderRound([50.5, 49.5])).toEqual([51, 49]);
    expect(largestRemainderRound([49.5, 50.5])).toEqual([49, 51]);
    expect(largestRemainderRound([25.5, 25.5, 24.5, 24.5])).toEqual([26, 26, 24, 24]);
  });

  it('rounds each value alone when the values are nowhere near the total', () => {
    expect(largestRemainderRound([55, 40])).toEqual([55, 40]);
    expect(largestRemainderRound([55.4, 40.4])).toEqual([55, 40]);
    expect(largestRemainderRound([80, 80])).toEqual([80, 80]);
  });

  it('works for another total, for nothing, and for odd numbers', () => {
    expect(largestRemainderRound([0.5, 0.5], 1)).toEqual([1, 0]);
    expect(largestRemainderRound([])).toEqual([]);
    expect(largestRemainderRound([NaN, 100])).toEqual([0, 100]);
    expect(largestRemainderRound([-5, 105], 100)).toEqual([0, 105]);
  });

  it('always adds up to the total, and moves no value by a whole unit, for any split of 100 into up to six parts', () => {
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 400; run++) {
      const n = 1 + Math.floor(next() * 6);
      const cuts = Array.from({ length: n - 1 }, () => next() * 100).sort((a, b) => a - b);
      const parts = [...cuts, 100].map((c, i) => c - (i === 0 ? 0 : cuts[i - 1]));
      const tenths = parts.map(p => Math.round(p * 10) / 10);
      const sum = tenths.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.5) continue;
      const out = largestRemainderRound(tenths);
      expect(out.reduce((a, b) => a + b, 0)).toBe(100);
      out.forEach((v, i) => expect(Math.abs(v - tenths[i])).toBeLessThan(1 + 1e-9));
    }
  });
});

describe('isFibreGrounded', () => {
  const text = normalizeText('60% COTTON 40% POLYESTER\nORGANIC WOOL 100.0%');

  it('needs the printed word and the number in the text', () => {
    expect(isFibreGrounded({ printed: 'cotton', percent: 60, qualifier: null }, text)).toBe(true);
    expect(isFibreGrounded({ printed: 'cotton', percent: 50, qualifier: null }, text)).toBe(false);
    expect(isFibreGrounded({ printed: 'silk', percent: 60, qualifier: null }, text)).toBe(false);
    expect(isFibreGrounded({ printed: 'cotton', percent: null, qualifier: null }, text)).toBe(true);
  });

  it('compares numbers as numbers, not as pieces of text', () => {
    expect(isFibreGrounded({ printed: 'wool', percent: 100, qualifier: null }, text)).toBe(true); // "100.0"
    expect(isFibreGrounded({ printed: 'cotton', percent: 6, qualifier: null }, text)).toBe(false); // not the 6 of "60"
    expect(isFibreGrounded({ printed: 'cotton', percent: 0, qualifier: null }, text)).toBe(false);
    expect(numbersIn('97.5% 2.5% 160 0.60')).toEqual([97.5, 2.5, 160, 0.6]);
  });

  it('needs a claimed qualifier word to be printed too, and folds the printed word', () => {
    expect(isFibreGrounded({ printed: 'wool', percent: 100, qualifier: 'organic' }, text)).toBe(true);
    expect(isFibreGrounded({ printed: 'cotton', percent: 60, qualifier: 'recycled' }, text)).toBe(false);
    expect(isFibreGrounded({ printed: 'COTTON', percent: 60, qualifier: null }, text)).toBe(true);
    expect(isFibreGrounded({ printed: '', percent: 60, qualifier: null }, text)).toBe(false);
    expect(isFibreGrounded({ printed: 'c', percent: null, qualifier: null }, text)).toBe(false);
  });

  it('accepts a single Japanese or Chinese character as a word', () => {
    expect(isFibreGrounded({ printed: '綿', percent: 100, qualifier: null }, normalizeText('綿100%'))).toBe(true);
    expect(isFibreGrounded({ printed: '綿', percent: 100, qualifier: null }, normalizeText('毛100%'))).toBe(false);
  });
});

describe('buildGroup', () => {
  const draft = (fibres: TagFibre[], extra: Record<string, unknown> = {}) => buildGroup({ part: 'shell', label: null, fibres, issues: [], ...extra });

  it('is Read when grounded, adding up to 100, with a known part and nothing to report', () => {
    const g = draft([fibre({ percent: 60 }), fibre({ fibre: 'polyester', printed: 'polyester', percent: 40 })]);
    expect(g.status).toBe('verified');
    expect(g.sum).toBe(100);
    expect(g.issues).toEqual([]);
  });

  it('rounds a group that adds up within half a point to exactly 100', () => {
    const g = draft([fibre({ percent: 97.5 }), fibre({ fibre: 'elastane', printed: 'elastane', percent: 2.5 })]);
    expect(g.fibres.map(f => f.percent)).toEqual([98, 2]);
    expect(g.sum).toBe(100);
  });

  it('is Check, with the sum in words, when it does not add up (99 and 101 are not tolerated)', () => {
    for (const [a, b, said] of [[60, 39, 'Adds up to 99'], [60, 41, 'Adds up to 101'], [55, 40, 'Adds up to 95'], [60.5, 39, 'Adds up to 99.5']] as const) {
      const g = draft([fibre({ percent: a }), fibre({ percent: b })]);
      if (said === 'Adds up to 99.5') {
        expect(g.status).toBe('verified'); // within half a point
        continue;
      }
      expect(g.status).toBe('check');
      expect(g.issues).toContain(said);
      expect(g.fibres.map(f => f.percent)).toEqual([a, b]); // the printed numbers are left alone
    }
  });

  it('is Check when any fibre is not grounded, or a repair was needed, or the part is unknown', () => {
    expect(draft([fibre({ grounded: false })]).status).toBe('check');
    expect(draft([fibre({ grounded: false })]).issues).toContain('Not found in the tag text');
    const repaired = draft([fibre()], { repaired: true });
    expect(repaired.status).toBe('check');
    expect(repaired.issues).toEqual(['Read with corrections']);
    const other = buildGroup({ part: 'other', label: 'sleeve', fibres: [fibre()], issues: [] });
    expect(other.status).toBe('check');
    expect(other.issues).toContain('Unknown part');
  });

  it('is Check when it carries any issue at all', () => {
    expect(draft([fibre()], { issues: ['Two fibres for one percentage'] }).status).toBe('check');
  });

  it('accepts one fibre with no percentage only under lining, upper, sole, fill, hardware or trim', () => {
    for (const part of ['lining', 'upper', 'sole', 'fill', 'hardware', 'trim'] as TagPart[]) {
      expect(buildGroup({ part, label: part, fibres: [fibre({ percent: null })], issues: [] }).status).toBe('verified');
    }
    expect(draft([fibre({ percent: null })]).status).toBe('check');
    expect(buildGroup({ part: 'lining', label: null, fibres: [fibre({ percent: null }), fibre({ percent: null })], issues: [] }).status).toBe('check');
    expect(buildGroup({ part: 'lining', label: null, fibres: [fibre({ percent: null }), fibre({ percent: 50 })], issues: [] }).status).toBe('check');
  });

  it('is missing when it has no fibre, and caps the strings it carries', () => {
    expect(draft([]).status).toBe('missing');
    const g = buildGroup({ part: 'shell', label: 'L'.repeat(80), fibres: [fibre({ printed: 'p'.repeat(90), evidence: 'e'.repeat(200) })], issues: [] });
    expect(g.label).toHaveLength(30);
    expect(g.fibres[0].printed).toHaveLength(40);
    expect(g.fibres[0].evidence).toHaveLength(80);
  });

  it('does not change the draft it was given', () => {
    const f = fibre({ percent: 97.5 });
    draft([f, fibre({ percent: 2.5 })]);
    expect(f.percent).toBe(97.5);
  });
});

describe('applyReadRules', () => {
  it('makes every group of a part with two lists Check, except trim and other', () => {
    const out = applyReadRules([group(), group(), group({ part: 'lining' }), group({ part: 'trim' }), group({ part: 'trim' })], []);
    expect(out.map(g => g.status)).toEqual(['check', 'check', 'verified', 'verified', 'verified']);
    expect(out[0].issues).toEqual(['Two lists for shell']);
    expect(out[2].issues).toEqual([]);
  });

  it('leaves no group Read when the read has a blocking flag', () => {
    for (const flag of ['low_legibility', 'partial', 'set_of_garments', 'composition_elsewhere'] as const) {
      expect(applyReadRules([group()], [flag])[0].status).toBe('check');
    }
    for (const flag of ['multiple_labels', 'symbols_only', 'multiple_sizes', 'no_text'] as const) {
      expect(applyReadRules([group()], [flag])[0].status).toBe('verified');
    }
  });

  it('never raises a status and never changes its input', () => {
    const g = group({ status: 'check' });
    const out = applyReadRules([g], []);
    expect(out[0].status).toBe('check');
    expect(g.issues).toEqual([]);
    expect(applyReadRules([group({ status: 'missing', fibres: [] })], ['partial'])[0].status).toBe('missing');
  });
});

describe('toMaterialComponents', () => {
  const shell = (fibres: TagFibre[], extra: Partial<TagGroup> = {}) => group({ fibres, ...extra });
  const f = (name: string, percent: number | null, extra: Partial<TagFibre> = {}) => fibre({ fibre: name, printed: name, percent, ...extra });

  it('makes every fibre of the shell primary, with whole percentages', () => {
    expect(toMaterialComponents([shell([f('cotton', 60), f('polyester', 40)])])).toEqual([
      { name: 'cotton', tier: 'primary', percentage: 60 },
      { name: 'polyester', tier: 'primary', percentage: 40 },
    ]);
  });

  it('maps each part to its tier', () => {
    const parts: Array<[TagPart, string]> = [['lining', 'lining'], ['fill', 'fill'], ['upper', 'upper'], ['sole', 'sole'], ['hardware', 'hardware'], ['trim', 'trim'], ['other', 'trim']];
    for (const [part, tier] of parts) {
      expect(toMaterialComponents([group({ part, fibres: [f('cotton', 100)] })])).toEqual([{ name: 'cotton', tier, percentage: 100 }]);
    }
  });

  it('puts a second shell list in trim, since tiers cannot say "a second shell fabric"', () => {
    const out = toMaterialComponents([shell([f('cotton', 100)]), shell([f('wool', 100)])]);
    expect(out.map(m => m.tier)).toEqual(['primary', 'trim']);
  });

  it('rounds each group to exactly 100 by largest remainder, so 97.5 and 2.5 are 98 and 2', () => {
    const out = toMaterialComponents([shell([f('cotton', 97.5), f('elastane', 2.5)])]);
    expect(out.map(m => m.percentage)).toEqual([98, 2]);
    const thirds = toMaterialComponents([shell([f('cotton', 33.4), f('wool', 33.3), f('silk', 33.3)])]);
    expect(thirds.map(m => m.percentage)).toEqual([34, 33, 33]);
  });

  it('leaves a group that does not add up as printed, so the editor shows its own sum warning', () => {
    const out = toMaterialComponents([shell([f('cotton', 55.4), f('polyester', 40.4)], { status: 'check' })]);
    expect(out.map(m => m.percentage)).toEqual([55, 40]);
  });

  it('omits the percentage when there is none', () => {
    expect(toMaterialComponents([group({ part: 'upper', fibres: [f('leather', null)] })])).toEqual([{ name: 'leather', tier: 'upper' }]);
  });

  it('names a fibre in lower case, prefixed organic or recycled when printed', () => {
    const out = toMaterialComponents([shell([f('cotton', 50, { qualifier: 'organic' }), f('polyester', 50, { qualifier: 'recycled' })])]);
    expect(out.map(m => m.name)).toEqual(['organic cotton', 'recycled polyester']);
  });

  it('keeps the printed phrase for imitation leather, and the plain fibre for real leather', () => {
    const phrases = ['vegan leather', 'faux leather', 'pleather', 'synthetic leather', 'pu leather'];
    for (const phrase of phrases) {
      expect(toMaterialComponents([shell([f('polyurethane', 100, { printed: phrase })])])[0].name).toBe(phrase);
    }
    expect(toMaterialComponents([shell([f('polyurethane', 100, { printed: 'pu' })])])[0].name).toBe('polyurethane');
    expect(toMaterialComponents([shell([f('leather', 100, { printed: 'leder' })])])[0].name).toBe('leather');
  });

  it('keeps the printed word, lowercased and at most 40 characters, for a fibre we do not know', () => {
    const out = toMaterialComponents([shell([f('bamboo', 60, { printed: 'BAMBOO' }), f('cotton', 40)])]);
    expect(out[0].name).toBe('bamboo');
    expect(toMaterialComponents([shell([f('x'.repeat(60), 100, { printed: 'X'.repeat(60) })])])[0].name).toHaveLength(40);
  });

  it('skips groups with no fibre', () => {
    expect(toMaterialComponents([group({ fibres: [], status: 'missing' })])).toEqual([]);
    expect(toMaterialComponents([])).toEqual([]);
  });

  it('adds no field to a material beyond name, tier and percentage', () => {
    for (const m of toMaterialComponents([shell([f('cotton', 100)])])) expect(Object.keys(m).sort()).toEqual(['name', 'percentage', 'tier']);
  });
});

describe('groundModelRead', () => {
  const base = (extra: Partial<ModelTagRead> = {}): ModelTagRead => ({
    readable: true, composition: [], care: [], origin: null, size: null, brand: null, languages: [], flags: [], ...extra,
  });
  const row = (fiber: string, as_printed: string, percent: number | null, extra: Record<string, unknown> = {}) =>
    ({ fiber, as_printed, percent, qualifier: null, evidence: `${percent}% ${as_printed}`, ...extra }) as ModelTagRead['composition'][number]['fibers'][number];
  const comp = (fibers: ModelTagRead['composition'][number]['fibers'], part: TagPart = 'shell', part_label: string | null = null) => ({ part, part_label, fibers });
  const text = '60% COTTON 40% POLYESTER\nMADE IN ITALY';

  it('grounds a fibre whose number and printed word are in the text, and calls the group Read when it adds up', () => {
    const read = groundModelRead(base({ composition: [comp([row('cotton', 'COTTON', 60), row('polyester', 'polyester', 40)])] }), text);
    expect(read.source).toBe('model');
    expect(read.groups[0].fibres.map(x => x.grounded)).toEqual([true, true]);
    expect(read.groups[0].status).toBe('verified');
  });

  it('leaves a fibre ungrounded, and the group Check, when its number is not in the text', () => {
    const read = groundModelRead(base({ composition: [comp([row('cotton', 'cotton', 70), row('polyester', 'polyester', 30)])] }), text);
    expect(read.groups[0].fibres.map(x => x.grounded)).toEqual([false, false]);
    expect(read.groups[0].status).toBe('check');
  });

  it('leaves a fibre ungrounded when the printed word is not a substring of the text', () => {
    const read = groundModelRead(base({ composition: [comp([row('silk', 'silk', 60), row('polyester', 'polyester', 40)])] }), text);
    expect(read.groups[0].fibres[0].grounded).toBe(false);
    expect(read.groups[0].fibres[1].grounded).toBe(true);
    expect(read.groups[0].status).toBe('check');
  });

  it('does not take the model\'s word for what a printed word means: our dictionary wins, and a difference is shown', () => {
    const read = groundModelRead(base({ composition: [comp([row('silk', 'cotton', 60), row('polyester', 'polyester', 40)])] }), text);
    expect(read.groups[0].fibres[0].fibre).toBe('cotton');
    expect(read.groups[0].issues.join(' ')).toMatch(/Second opinion says silk; the tag says cotton/);
    expect(read.groups[0].status).toBe('check');
  });

  it('keeps an unknown printed word as printed, and Check', () => {
    const read = groundModelRead(base({ composition: [comp([row('other', 'bamboo', 100)])] }), '100% BAMBOO');
    expect(read.groups[0].fibres[0].fibre).toBe('bamboo');
    expect(read.groups[0].status).toBe('check');
    expect(groundModelRead(base({ composition: [comp([row('wool', 'bamboo', 100)])] }), '100% BAMBOO').groups[0].status).toBe('check');
  });

  it('rejects a percent above 100 and keeps the reason on a group with no fibre', () => {
    const read = groundModelRead(base({ composition: [comp([row('cotton', 'cotton', 120)])] }), '120% COTTON');
    expect(read.groups).toHaveLength(1);
    expect(read.groups[0]).toMatchObject({ status: 'missing', fibres: [] });
    expect(read.groups[0].issues).toContain('Percentage over 100');
  });

  it('keeps at most 12 fibres in all, 8 per group, and 6 groups', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => row('cotton', 'cotton', (i % 9) + 1));
    const read = groundModelRead(
      base({ composition: Array.from({ length: 9 }, () => comp(many(10))) }),
      '1% 2% 3% 4% 5% 6% 7% 8% 9% COTTON',
    );
    expect(read.groups.length).toBeLessThanOrEqual(6);
    expect(read.groups.reduce((n, g) => n + g.fibres.length, 0)).toBeLessThanOrEqual(12);
    expect(Math.max(...read.groups.map(g => g.fibres.length))).toBeLessThanOrEqual(8);
  });

  it('drops a negative percent, and reads a part that is not in the list as other', () => {
    expect(groundModelRead(base({ composition: [comp([row('cotton', 'cotton', -5)])] }), '5% COTTON').groups).toEqual([]);
    const read = groundModelRead(base({ composition: [comp([row('cotton', 'cotton', 100)], 'sleeve' as TagPart, 'sleeve')] }), 'SLEEVE: 100% COTTON');
    expect(read.groups[0]).toMatchObject({ part: 'other', label: 'sleeve', status: 'check' });
    expect(read.groups[0].issues).toContain('Unknown part');
  });

  it('requires a claimed qualifier word to be printed', () => {
    const read = groundModelRead(base({ composition: [comp([row('cotton', 'cotton', 100, { qualifier: 'organic' })])] }), '100% COTTON');
    expect(read.groups[0].fibres[0].grounded).toBe(false);
    expect(groundModelRead(base({ composition: [comp([row('cotton', 'cotton', 100, { qualifier: 'organic' })])] }), '100% ORGANIC COTTON').groups[0].fibres[0].grounded).toBe(true);
  });

  it('accepts only care phrases from the list of 24, once each', () => {
    const read = groundModelRead(base({ care: ['Hand wash', 'Hand wash', 'Wash on the moon', 'Do not iron', 5 as unknown as string] }), text);
    expect(read.care).toEqual({ items: ['Hand wash', 'Do not iron'], status: 'check' });
    expect(groundModelRead(base(), text).care).toEqual({ items: [], status: 'missing' });
  });

  it('reads origin and size from the model as Check, and a size grid as no size with a flag', () => {
    const read = groundModelRead(base({ origin: 'viet nam', size: { primary: 'M', all: ['M'] } }), text);
    expect(read.origin).toEqual({ country: 'Vietnam', known: true, status: 'check' });
    expect(read.size).toEqual({ value: 'M', status: 'check' });
    const grid = groundModelRead(base({ size: { primary: 'M', all: ['S', 'M', 'L'] } }), text);
    expect(grid.size).toEqual({ value: null, status: 'missing' });
    expect(grid.flags).toContain('multiple_sizes');
  });

  it('accepts a brand only if it is a known brand printed in the text, and then as a Check suggestion', () => {
    expect(groundModelRead(base({ brand: { name: 'Everlane', where_seen: 'neck_label' } }), 'EVERLANE\n100% COTTON').brand).toEqual({
      name: 'Everlane', whereSeen: 'neck_label', confidence: 0.8, status: 'check',
    });
    expect(groundModelRead(base({ brand: { name: 'Everlane', where_seen: 'neck_label' } }), '100% COTTON').brand.name).toBeNull();
    expect(groundModelRead(base({ brand: { name: 'Nobody Co', where_seen: 'neck_label' } }), 'NOBODY CO').brand.name).toBeNull();
  });

  it('keeps only known flags and two-letter language codes', () => {
    const read = groundModelRead(base({ flags: ['partial', 'nonsense' as never, 'partial'], languages: ['en', 'fr', 'english', 'e', 'en'] }), text);
    expect(read.flags).toEqual(['partial']);
    expect(read.languages).toEqual(['en', 'fr']);
  });

  it('leaves no group Read when the model reports a blocking flag', () => {
    const read = groundModelRead(base({ composition: [comp([row('cotton', 'cotton', 60), row('polyester', 'polyester', 40)])], flags: ['set_of_garments'] }), text);
    expect(read.groups[0].status).toBe('check');
  });

  it('carries the sanitised transcription and the identifiers of the OCR text, never the model\'s', () => {
    const read = groundModelRead(base(), 'RN 12345\nwww.example.com\n+1 (555) 123-4567\n100% COTTON');
    expect(read.transcription).toBe('RN 12345\n100% COTTON');
    expect(read.ids).toEqual({ rn: '12345' });
  });

  it('survives a model answer of the wrong shape', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { composition: 'nope', care: 7, flags: 'x', size: 4, brand: 'b' }, { composition: [null, 5, { part: 'shell', fibers: 'x' }, { fibers: [null, 3, {}] }] }]) {
      const read = groundModelRead(bad as unknown as ModelTagRead, text);
      expect(Array.isArray(read.groups)).toBe(true);
      expect(read.source).toBe('model');
    }
    expect(groundModelRead(base(), undefined as unknown as string).transcription).toBe('');
  });
});
