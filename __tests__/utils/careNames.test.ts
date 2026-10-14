import { CARE_PHRASES, CARE_WORDS, analyzeCareLine, looksLikeCare, matchCareLine } from '../../src/utils/careNames';
import { foldText } from '../../src/utils/textFold';

const read = (line: string) => matchCareLine(foldText(line));

describe('CARE_PHRASES', () => {
  it('lists the 24 phrases in the design order', () => {
    expect(CARE_PHRASES).toEqual([
      'Machine wash cold', 'Machine wash warm', 'Gentle cycle', 'Hand wash', 'Do not wash', 'Wash inside out', 'Wash with like colors',
      'Wash separately', 'Wash before wearing', 'Do not wring', 'Do not bleach', 'Non-chlorine bleach only', 'Tumble dry low',
      'Tumble dry medium', 'Do not tumble dry', 'Remove promptly from dryer', 'Line dry', 'Dry flat', 'Iron low', 'Iron medium',
      'Iron inside out', 'Do not iron', 'Dry clean only', 'Do not dry clean',
    ]);
    expect(new Set(CARE_PHRASES).size).toBe(24);
  });

  it('has every phrase reachable from a plain English line, and that line maps to that phrase alone', () => {
    const lines: Record<string, string> = {
      'Machine wash cold': 'Machine wash cold',
      'Machine wash warm': 'Machine wash warm',
      'Gentle cycle': 'Gentle cycle',
      'Hand wash': 'Hand wash only',
      'Do not wash': 'Do not wash',
      'Wash inside out': 'Wash inside out',
      'Wash with like colors': 'Wash with like colors',
      'Wash separately': 'Wash separately',
      'Wash before wearing': 'Wash before wearing',
      'Do not wring': 'Do not wring',
      'Do not bleach': 'Do not bleach',
      'Non-chlorine bleach only': 'Non-chlorine bleach only',
      'Tumble dry low': 'Tumble dry low',
      'Tumble dry medium': 'Tumble dry medium',
      'Do not tumble dry': 'Do not tumble dry',
      'Remove promptly from dryer': 'Remove promptly from dryer',
      'Line dry': 'Line dry',
      'Dry flat': 'Dry flat',
      'Iron low': 'Iron low',
      'Iron medium': 'Iron medium',
      'Iron inside out': 'Iron inside out',
      'Do not iron': 'Do not iron',
      'Dry clean only': 'Dry clean only',
      'Do not dry clean': 'Do not dry clean',
    };
    for (const phrase of CARE_PHRASES) {
      expect(read(lines[phrase])).toContain(phrase);
      expect(read(phrase)).toEqual([phrase]); // a stored phrase reads back as itself, so it survives a re-scan
    }
  });
});

describe('matchCareLine', () => {
  it('maps the lines the design lists', () => {
    expect(read('wash cold')).toEqual(['Machine wash cold']);
    expect(read('cold wash')).toEqual(['Machine wash cold']);
    expect(read('machine wash cold/30')).toEqual(['Machine wash cold']);
    expect(read('warm iron')).toEqual(['Iron medium']);
    expect(read('medium iron')).toEqual(['Iron medium']);
    expect(read('cool iron')).toEqual(['Iron low']);
    expect(read('iron low')).toEqual(['Iron low']);
    expect(read('only non-chlorine bleach when needed')).toEqual(['Non-chlorine bleach only']);
    expect(read('hang to dry')).toEqual(['Line dry']);
    expect(read('air dry')).toEqual(['Line dry']);
    expect(read('line dry')).toEqual(['Line dry']);
    expect(read('lay flat')).toEqual(['Dry flat']);
    expect(read('nicht bugeln')).toEqual(['Do not iron']);
    expect(read('ne pas repasser')).toEqual(['Do not iron']);
    expect(read('no planchar')).toEqual(['Do not iron']);
  });

  it('returns several phrases for a line with several instructions, in the phrase order', () => {
    expect(read('Machine wash cold with like colors')).toEqual(['Machine wash cold', 'Wash with like colors']);
    expect(read('Tumble dry low, remove promptly')).toEqual(['Tumble dry low', 'Remove promptly from dryer']);
    expect(read('Machine wash cold, gentle cycle, only non-chlorine bleach, tumble dry low, warm iron')).toEqual([
      'Machine wash cold', 'Gentle cycle', 'Non-chlorine bleach only', 'Tumble dry low', 'Iron medium',
    ]);
  });

  it('does not read a "do not" instruction as its opposite', () => {
    expect(read('Do not tumble dry')).toEqual(['Do not tumble dry']);
    expect(read('Do not tumble dry low heat')).toEqual(['Do not tumble dry']);
    expect(read('Do not iron')).toEqual(['Do not iron']);
    expect(read('Do not dry clean')).toEqual(['Do not dry clean']);
    expect(read('Do not bleach')).toEqual(['Do not bleach']);
    expect(read('Do not wash')).toEqual(['Do not wash']);
    expect(read('Do not use bleach, do not iron')).toEqual(['Do not bleach', 'Do not iron']);
    expect(read('Only non-chlorine bleach')).toEqual(['Non-chlorine bleach only']);
  });

  it('does not map dry-in-shade, or an iron with no heat, to anything', () => {
    expect(read('dry in shade only when sun is strong')).toEqual([]);
    expect(read('iron if needed')).toEqual([]);
    expect(read('wash')).toEqual([]);
    expect(read('')).toEqual([]);
    expect(read('100% cotton')).toEqual([]);
  });

  it('reads inside out as washing or ironing from the verb on the line', () => {
    expect(read('Wash inside out')).toEqual(['Wash inside out']);
    expect(read('Turn inside out')).toEqual(['Wash inside out']);
    expect(read('Iron inside out')).toEqual(['Iron inside out']);
    expect(read('Iron on reverse side')).toEqual(['Iron inside out']);
    expect(read('Wash and iron inside out')).toEqual(['Wash inside out', 'Iron inside out']);
  });

  it('reads dry clean as "only" unless the line offers a choice', () => {
    expect(read('Dry clean')).toEqual(['Dry clean only']);
    expect(read('Professional dry clean only')).toEqual(['Dry clean only']);
    expect(read('Hand wash or dry clean')).toEqual(['Hand wash']);
    expect(read('Hand wash or dry clean only')).toEqual(['Hand wash', 'Dry clean only']);
  });

  it('reads French, Spanish and German care', () => {
    expect(read('Laver à la main')).toEqual(['Hand wash']);
    expect(read('Ne pas laver')).toEqual(['Do not wash']);
    expect(read('Nettoyage à sec')).toEqual(['Dry clean only']);
    expect(read('Ne pas nettoyer à sec')).toEqual(['Do not dry clean']);
    expect(read('Ne pas sécher en machine')).toEqual(['Do not tumble dry']);
    expect(read('Sécher à plat')).toEqual(['Dry flat']);
    expect(read('Lavar a mano')).toEqual(['Hand wash']);
    expect(read('No lavar')).toEqual(['Do not wash']);
    expect(read('No usar lejía')).toEqual(['Do not bleach']);
    expect(read('Secar en plano')).toEqual(['Dry flat']);
    expect(read('Nicht waschen')).toEqual(['Do not wash']);
    expect(read('Nicht bleichen')).toEqual(['Do not bleach']);
    expect(read('Nicht im Trockner trocknen')).toEqual(['Do not tumble dry']);
    expect(read('Handwäsche')).toEqual(['Hand wash']);
    expect(read('Chemisch reinigen')).toEqual(['Dry clean only']);
    expect(read('Nicht chemisch reinigen')).toEqual(['Do not dry clean']);
    expect(read('Feinwäsche')).toEqual(['Gentle cycle']);
    expect(read('Liegend trocknen')).toEqual(['Dry flat']);
  });

  it('reads wash temperatures as cold or warm', () => {
    expect(read('Wash at 30')).toEqual(['Machine wash cold']);
    expect(read('Wash at 40')).toEqual(['Machine wash warm']);
    expect(read('Laver à 30')).toEqual(['Machine wash cold']);
    expect(read('Wash in cold water')).toEqual(['Machine wash cold']);
    expect(read('Machine wash in warm water')).toEqual(['Machine wash warm']);
  });
});

describe('hand wash with a temperature', () => {
  it('is a hand wash and nothing else, in any word order and language', () => {
    for (const line of [
      'HAND WASH COLD', 'Hand wash in cold water', 'HAND WASH WARM', 'Hand wash 30', 'Hand wash cold water', 'Hand wash at 30', 'Handwash cold',
      'Wash by hand in cold water', 'Washing by hand cold', 'Cold hand wash', 'Lukewarm hand wash', 'Lavar a mano en agua fria',
      'Laver à la main à 30', 'Laver à la main à l\'eau froide', 'Handwäsche kalt', 'Von Hand waschen bei 30',
    ]) {
      expect({ line, phrases: read(line) }).toEqual({ line, phrases: ['Hand wash'] });
      expect({ line, leftover: analyzeCareLine(foldText(line)).leftover }).toEqual({ line, leftover: false });
    }
  });

  it('keeps the other instructions of the line', () => {
    expect(read('Hand wash cold, line dry')).toEqual(['Hand wash', 'Line dry']);
    expect(read('Hand wash cold, tumble dry low')).toEqual(['Hand wash', 'Tumble dry low']);
    expect(read('Hand wash with like colors')).toEqual(['Hand wash', 'Wash with like colors']);
  });

  it('still reads a choice between hand and machine wash as both', () => {
    expect(read('Hand wash or machine wash cold')).toEqual(['Machine wash cold', 'Hand wash']);
    expect(read('Machine wash cold')).toEqual(['Machine wash cold']);
  });
});

describe('a "do not" instruction that says more than the phrase', () => {
  const leftover = (line: string) => analyzeCareLine(foldText(line)).leftover;

  it('is left over for the person to read, not turned into the blanket phrase', () => {
    for (const line of [
      'DO NOT IRON ON PRINT', 'Do not iron decoration', 'Do not iron when wet', 'Do not wash with other colors', 'Do not wash with other garments',
      'Do not tumble dry with heat', 'Do not dry clean with trichloroethylene', 'Do not bleach colors', 'Do not tumble dry low heat',
    ]) {
      expect({ line, leftover: leftover(line) }).toEqual({ line, leftover: true });
    }
  });

  it('stays clean when the instruction stands alone, or only a joining word sits next to it', () => {
    for (const line of [
      'Do not iron', 'Do not bleach. Do not iron.', 'Do not wash, do not bleach', 'Do not use bleach', 'DO NOT TUMBLE DRY. DO NOT IRON',
      'Please do not iron', 'Do not iron - ever', 'Do not wring or twist', 'Do not bleach, do not tumble dry, do not iron',
    ]) {
      expect({ line, leftover: leftover(line) }).toEqual({ line, leftover: false });
    }
  });

  it('keeps the phrase for a line that stays clean', () => {
    expect(read('Do not bleach. Do not iron.')).toEqual(['Do not bleach', 'Do not iron']);
    expect(read('DO NOT TUMBLE DRY. DO NOT IRON')).toEqual(['Do not tumble dry', 'Do not iron']);
  });
});

describe('do not hand wash and do not machine wash', () => {
  const analyze = (line: string) => analyzeCareLine(foldText(line));

  it('are not "Do not wash" and not "Hand wash": they map to nothing and are left over', () => {
    for (const line of ['Do not hand wash', 'Never hand wash', 'Not hand washable', 'Do not machine wash', 'Not machine washable', 'Do not handwash']) {
      expect({ line, ...analyze(line) }).toEqual({ line, phrases: [], leftover: true });
    }
  });

  it('keeps what else the line says', () => {
    expect(analyze('Do not machine wash. Hand wash cold')).toEqual({ phrases: ['Hand wash'], leftover: true });
    expect(analyze('Do not hand wash, line dry')).toEqual({ phrases: ['Line dry'], leftover: true });
  });

  it('leaves a plain "do not wash" alone', () => {
    expect(analyze('Do not wash')).toEqual({ phrases: ['Do not wash'], leftover: false });
    expect(analyze('Never wash')).toEqual({ phrases: ['Do not wash'], leftover: false });
  });
});

describe('looksLikeCare', () => {
  it('spots a line about washing, drying, ironing, bleaching or cleaning in several languages', () => {
    for (const line of ['dry in shade', 'iron if needed', 'machine wash', 'no bleach', 'dry clean only', 'laver a la main', 'lavar', 'nicht waschen', 'bugeln', 'tumble']) {
      expect(looksLikeCare(foldText(line))).toBe(true);
    }
  });

  it('is false for lines about something else', () => {
    for (const line of ['100% cotton', 'made in italy', 'size m', 'rn 12345', 'lining: polyester']) expect(looksLikeCare(foldText(line))).toBe(false);
  });

  it('exports the words the letter repair may restore', () => {
    expect(CARE_WORDS.has('wash')).toBe(true);
    expect(CARE_WORDS.has('cotton')).toBe(false);
  });
});

describe('analyzeCareLine', () => {
  const leftover = (line: string) => analyzeCareLine(foldText(line)).leftover;

  it('has nothing left over when every care word is accounted for', () => {
    for (const line of [
      'Machine wash cold with like colors', 'Only non-chlorine bleach when needed', 'Tumble dry low', 'Warm iron if needed', 'Hand wash only',
      'Dry clean only', 'Machine wash cold/30', 'Wash separately', 'Turn inside out', 'Iron on reverse side',
      'Wash in cold water', 'Do not use bleach, do not iron', 'Gentle cycle', 'Lay flat to dry',
    ]) {
      expect({ line, leftover: leftover(line) }).toEqual({ line, leftover: false });
    }
  });

  it('leaves a care word over when part of the line says something no phrase covers', () => {
    for (const line of [
      'Machine wash cold. Tumble dry.', 'Dry in shade only when sun is strong', 'Iron if needed', 'Hand wash, tumble dry', 'Wash with bleach',
      'Do not wash with bleach', 'Hand wash or dry clean', 'Tumble dry hot', 'Do not tumble dry low heat',
    ]) {
      expect({ line, leftover: leftover(line) }).toEqual({ line, leftover: true });
    }
  });

  it('agrees with matchCareLine on the phrases', () => {
    for (const line of ['Machine wash cold. Tumble dry low', 'Wash and iron inside out', 'nicht bügeln']) {
      expect(analyzeCareLine(foldText(line)).phrases).toEqual(matchCareLine(foldText(line)));
    }
    expect(analyzeCareLine('')).toEqual({ phrases: [], leftover: false });
  });
});
