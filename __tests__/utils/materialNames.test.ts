import fs from 'fs';
import path from 'path';
import {
  CANONICAL_ALIASES,
  CHANGER_WORDS,
  DICTIONARY_WORDS,
  FIBER_SYNONYMS,
  FIBRES,
  GARMENT_WORDS,
  IMITATION_LEATHER_PHRASES,
  MATERIAL_SUGGESTIONS,
  PART_WORDS,
  RECORDED_QUALIFIERS,
  STRIPPED_QUALIFIERS,
  canonicalFibre,
  lookup,
  resolveFibre,
} from '../../src/utils/materialNames';
import { foldText } from '../../src/utils/textFold';
import type { TagPart } from '../../src/types/tag';

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20261014000300_quality_ratings.sql');
const DESIGN = path.join(ROOT, 'documentation/design/quality-ratings.md');

/** The (alias, fibre) rows of the material_aliases seed in a piece of SQL, and the qualifier words canonical_fibre strips. */
const readSql = (sql: string) => {
  const noComments = sql.replace(/--[^\n]*/g, '');
  const seed = /insert into public\.material_aliases \(alias, fibre\) values([\s\S]*?)on conflict \(alias\) do nothing;/.exec(noComments);
  const rows: Array<[string, string]> = [];
  if (seed) {
    const re = /\('([^']+)'\s*,\s*'([^']+)'\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seed[1])) !== null) rows.push([m[1], m[2]]);
  }
  const fn = /create or replace function public\.canonical_fibre[\s\S]*?\$\$;/.exec(noComments);
  const strip = fn ? /'\^\(([a-z|]+)\)\\s\+'/.exec(fn[0]) : null;
  return { rows, qualifiers: strip ? strip[1].split('|') : [], functionText: fn ? fn[0] : '' };
};

const checkParity = (sql: string) => {
  const { rows, qualifiers, functionText } = readSql(sql);
  expect(rows.length).toBeGreaterThanOrEqual(50);
  // every alias of the server maps to the same fibre here, and nothing else is an alias here
  for (const [alias, fibre] of rows) {
    expect(canonicalFibre(alias)).toBe(fibre);
    expect(CANONICAL_ALIASES[alias]).toBe(fibre);
    expect(FIBER_SYNONYMS[alias]).toBe(fibre);
    expect(FIBRES).toContain(fibre);
    expect(alias).toBe(alias.toLowerCase());
  }
  expect(Object.keys(CANONICAL_ALIASES).sort()).toEqual(rows.map(r => r[0]).sort());
  // the qualifiers the server strips are the ones stripped here, and no others
  expect(qualifiers).toEqual([...STRIPPED_QUALIFIERS]);
  expect(functionText).not.toMatch(/vegan|faux/);
  expect(functionText).toMatch(/lower\(btrim\(coalesce\(p_name, ''\)\)\)/);
  expect(functionText).toMatch(/'other'/);
};

describe('FIBRES and the synonym tables', () => {
  it('lists the 28 canonical fibres once each, in the form the database check allows', () => {
    expect(FIBRES).toHaveLength(28);
    expect(new Set(FIBRES).size).toBe(28);
    for (const f of FIBRES) expect(f).toMatch(/^[a-z]{3,20}$/);
  });

  it('maps every synonym to a canonical fibre, and keeps every key in folded form', () => {
    for (const [word, fibre] of Object.entries(FIBER_SYNONYMS)) {
      expect(FIBRES).toContain(fibre);
      expect(foldText(word)).toBe(word);
    }
  });

  it('has the synonyms the design names, in every language it lists', () => {
    const expectations: Record<string, string[]> = {
      nylon: ['polyamide', 'polyamid', 'poliamida', 'ナイロン'],
      elastane: ['elastane', 'elastan', 'elastano', 'elasthanne', 'spandex', 'lycra', 'ポリウレタン'],
      viscose: ['viscose', 'viskose', 'rayon'],
      cotton: ['baumwolle', 'coton', 'algodon', 'algodao', 'cotone', 'katoen', 'pamuk', '綿', '棉'],
      lyocell: ['tencel'],
      leather: ['leder', 'cuir', 'piel', 'cuoio', '革'],
      rubber: ['gummi', 'caoutchouc', 'caucho'],
      down: ['daunen', 'duvet', 'plumon'],
    };
    for (const [fibre, words] of Object.entries(expectations)) {
      for (const w of words) expect(FIBER_SYNONYMS[w]).toBe(fibre);
    }
  });

  it('covers the common fibres in English, French, Spanish, German, Italian, Portuguese, Dutch, Turkish, Japanese and Chinese', () => {
    const cotton = ['cotton', 'coton', 'algodon', 'baumwolle', 'cotone', 'algodao', 'katoen', 'pamuk', '綿', '棉'];
    const wool = ['wool', 'laine', 'lana', 'wolle', 'wol', 'yun', 'ウール', '羊毛'];
    const silk = ['silk', 'soie', 'seda', 'seide', 'seta', 'zijde', 'ipek', 'シルク', '蚕丝'];
    const linen = ['linen', 'lin', 'lino', 'leinen', 'linho', 'linnen', 'keten', 'リネン', '亚麻'];
    for (const w of cotton) expect(FIBER_SYNONYMS[w]).toBe('cotton');
    for (const w of wool) expect(FIBER_SYNONYMS[w]).toBe('wool');
    for (const w of silk) expect(FIBER_SYNONYMS[w]).toBe('silk');
    for (const w of linen) expect(FIBER_SYNONYMS[w]).toBe('linen');
  });

  it('files imitation leather under polyurethane and never under leather', () => {
    for (const phrase of IMITATION_LEATHER_PHRASES) {
      expect(FIBER_SYNONYMS[phrase]).toBe('polyurethane');
      expect(canonicalFibre(phrase)).toBe('polyurethane');
    }
    expect(FIBER_SYNONYMS['pima cotton']).toBe('cotton');
    expect(FIBER_SYNONYMS.leather).toBe('leather');
    expect(resolveFibre('faux suede')).toBeUndefined();
    expect(resolveFibre('imitation leather')).toBeUndefined();
    expect(CHANGER_WORDS).toEqual(['vegan', 'faux', 'synthetic', 'imitation']);
  });

  it('has no prototype, so a printed "constructor" is not a fibre', () => {
    expect(lookup(FIBER_SYNONYMS, 'constructor')).toBeUndefined();
    expect(lookup(FIBER_SYNONYMS, '__proto__')).toBeUndefined();
    expect(lookup(PART_WORDS, 'toString')).toBeUndefined();
    expect(lookup(FIBER_SYNONYMS, 'cotton')).toBe('cotton');
  });
});

describe('resolveFibre', () => {
  it('reads a printed word or phrase, ignoring one run of the six harmless qualifiers', () => {
    expect(resolveFibre('baumwolle')).toBe('cotton');
    expect(resolveFibre('organic cotton')).toBe('cotton');
    expect(resolveFibre('recycled polyamide')).toBe('nylon');
    expect(resolveFibre('regenerated cellulose')).toBeUndefined();
    expect(resolveFibre('bamboo')).toBeUndefined();
    expect(resolveFibre(undefined as unknown as string)).toBeUndefined();
  });
});

describe('canonicalFibre', () => {
  it('strips one leading qualifier and nothing else, like the server', () => {
    expect(canonicalFibre('organic cotton')).toBe('cotton');
    expect(canonicalFibre('Recycled Polyester')).toBe('polyester');
    expect(canonicalFibre('  Egyptian   cotton ')).toBe('cotton'); // trimmed, and the whole run of spaces after the qualifier goes
    expect(canonicalFibre('virgin wool')).toBe('wool');
    expect(canonicalFibre('supima cotton')).toBe('cotton');
    expect(canonicalFibre('regenerated viscose')).toBe('viscose');
    expect(canonicalFibre('organic recycled cotton')).toBe('other'); // only one qualifier is stripped
  });

  it('never strips vegan or faux, so imitation leather is not leather', () => {
    expect(canonicalFibre('vegan leather')).toBe('polyurethane');
    expect(canonicalFibre('faux leather')).toBe('polyurethane');
    expect(canonicalFibre('vegan suede')).toBe('other');
    expect(canonicalFibre('faux fur')).toBe('other');
  });

  it('is "other" for anything unknown or not text', () => {
    expect(canonicalFibre('unobtainium')).toBe('other');
    expect(canonicalFibre('')).toBe('other');
    expect(canonicalFibre(undefined as unknown as string)).toBe('other');
    expect(canonicalFibre('constructor')).toBe('other');
  });

  it('agrees with the aliases the design wrote into the SQL (the text of the design document)', () => {
    checkParity(fs.readFileSync(DESIGN, 'utf8'));
  });

  if (fs.existsSync(MIGRATION)) {
    it('agrees with the material_aliases seed of the ratings migration', () => {
      checkParity(fs.readFileSync(MIGRATION, 'utf8'));
    });
  } else {
    it.todo('BLOCKED on Q1: supabase/migrations/20261014000300_quality_ratings.sql does not exist yet; the parity against the migration text runs once it does');
  }

  it('lists the qualifiers it records inside the ones it strips', () => {
    for (const q of RECORDED_QUALIFIERS) expect(STRIPPED_QUALIFIERS).toContain(q);
    expect(STRIPPED_QUALIFIERS).toHaveLength(6);
  });
});

describe('PART_WORDS', () => {
  const parts: TagPart[] = ['shell', 'lining', 'fill', 'trim', 'upper', 'sole', 'hardware', 'other'];

  it('maps folded headers to real parts', () => {
    for (const [word, part] of Object.entries(PART_WORDS)) {
      expect(parts).toContain(part);
      expect(foldText(word)).toBe(word);
    }
  });

  it('has the headers of English, French, Spanish, German, Italian, Portuguese, Dutch, Turkish and Japanese tags', () => {
    const shell = ['shell', 'coquille', 'tejido principal', 'obermaterial', 'esterno', 'tecido principal', 'buitenstof', 'dis kumas', '表地'];
    const lining = ['lining', 'doublure', 'forro', 'futter', 'fodera', 'voering', 'astar', '裏地'];
    const fill = ['fill', 'garnissage', 'relleno', 'fullung', 'imbottitura', 'enchimento', 'vulling', 'dolgu', '中綿'];
    const sole = ['sole', 'semelle', 'suela', 'sohle', 'suola', 'sola', 'zool', 'taban', '靴底'];
    for (const w of shell) expect(PART_WORDS[w]).toBe('shell');
    for (const w of lining) expect(PART_WORDS[w]).toBe('lining');
    for (const w of fill) expect(PART_WORDS[w]).toBe('fill');
    for (const w of sole) expect(PART_WORDS[w]).toBe('sole');
  });

  it('does not know garment words or sleeve as parts, so they start an "other" group', () => {
    for (const w of [...GARMENT_WORDS, 'sleeve', 'sleeves', 'front', 'back', 'collar', 'insole']) expect(lookup(PART_WORDS, w)).toBeUndefined();
    expect(GARMENT_WORDS).toEqual(['top', 'bottom', 'jacket', 'pants', 'trousers', 'skirt', 'shirt', 'dress', 'vest', 'shorts', 'haut', 'bas']);
  });

  it('has the dictionary the letter repair uses', () => {
    expect(DICTIONARY_WORDS.has('cotton')).toBe(true);
    expect(DICTIONARY_WORDS.has('lining')).toBe(true);
    expect(DICTIONARY_WORDS.has('liner')).toBe(false);
  });
});

describe('MATERIAL_SUGGESTIONS', () => {
  it('keeps everything the editor always offered, in order, and adds the new fibres', () => {
    const old = [
      'cotton', 'polyester', 'wool', 'cashmere', 'merino', 'linen', 'silk', 'leather', 'suede', 'nylon', 'spandex', 'elastane', 'viscose',
      'rayon', 'acrylic', 'denim', 'canvas', 'velvet', 'satin', 'fleece', 'rubber', 'gold-plated', 'silver-plated', 'brass',
    ];
    expect(MATERIAL_SUGGESTIONS.slice(0, old.length)).toEqual(old);
    for (const added of ['lyocell', 'modal', 'cupro', 'down', 'feathers', 'textile', 'synthetic', 'hemp']) {
      expect(MATERIAL_SUGGESTIONS).toContain(added);
    }
    expect(new Set(MATERIAL_SUGGESTIONS).size).toBe(MATERIAL_SUGGESTIONS.length);
  });
});
