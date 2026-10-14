/**
 * The release gate of the tag parser (quality-ratings.md 7.13, step 5), run on the sealed set of real tags in
 * __tests__/fixtures/tags/gate/.
 *
 * Until there are 40 real, sealed tags and a FROZEN.json, this reports a todo while TAG_SCAN_ENABLED is false, and it
 * FAILS (never skips) as soon as the flag is true: switching the flag on without the evidence cannot give a green run.
 *
 * What a "Read field" is: a group, the care list, the country or the size that the parser shows as verified. A wrong green
 * is a Read field that differs from `expected`, which a person wrote from the physical tag. `expected` for a real tag:
 *   { category?: string,        // the item's category, if the tag depends on it (a German "Obermaterial" on shoes)
 *     clean?: boolean,          // the tag has one legible composition block (it counts towards the 70 percent rule)
 *     groups: [{ part, fibres: [{ fibre, percent, qualifier? }] }],   // percents as printed, decimals allowed
 *     care: string[],           // phrases from CARE_PHRASES the tag really says, [] for none
 *     origin: string | null,    // the country as the app names it, null when the tag has none
 *     size: string | null }
 *
 * FROZEN.json, written by the lead when the development set passes (7.13 step 4), next to the sealed tags:
 *   { frozenAt: 'YYYY-MM-DD',
 *     files: { 'src/utils/tagParser.ts': '<sha256>', ... },   // the seven files in FROZEN_FILES below; `shasum -a 256 <file>`
 *     expectedChecked: { by: '<second person>', date: 'YYYY-MM-DD' } }   // who checked `expected` against the photos
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { TAG_SCAN_ENABLED } from '../../src/config/ratingFlags';
import { parseTagText } from '../../src/utils/tagParser';
import { largestRemainderRound } from '../../src/utils/tagGrounding';
import type { TagGroup, TagRead } from '../../src/types/tag';

const ROOT = path.resolve(__dirname, '../..');
const GATE_DIR = path.join(ROOT, '__tests__/fixtures/tags/gate');

const MIN_TAGS = 40;
const MIN_READ_FIELDS = 100;
const MIN_CLEAN_GREEN_SHARE = 0.7;
/** The files whose hashes are frozen with the sealed set (7.13 step 4). */
const FROZEN_FILES = [
  'src/utils/tagParser.ts',
  'src/utils/materialNames.ts',
  'src/utils/countries.ts',
  'src/utils/careNames.ts',
  'src/utils/tagGrounding.ts',
  'src/utils/textFold.ts',
  'src/utils/tagTranscription.ts',
];

type ExpectedGroup = { part: string; fibres: Array<{ fibre: string; percent: number | null; qualifier?: 'organic' | 'recycled' | null }> };
type GateExpected = {
  category?: string;
  clean?: boolean;
  groups: ExpectedGroup[];
  care: string[];
  origin: string | null;
  size: string | null;
};
type GateFixture = {
  file: string;
  about: string;
  ocrText: string;
  meanConfidence: number | null;
  medianWordHeight: number | null;
  expected: GateExpected | null;
};
type Frozen = { frozenAt?: string; files?: Record<string, string>; expectedChecked?: { by?: string; date?: string } };

// ─── Scoring ────────────────────────────────────────────────────────────────

/** The groups of the physical tag as the parser would write them: percents of a group that adds up are rounded to exactly 100. */
const normalisedExpected = (g: ExpectedGroup): string => {
  const percents = g.fibres.map(f => f.percent);
  const complete = percents.every(p => p !== null);
  const total = complete ? (percents as number[]).reduce((a, b) => a + b, 0) : 0;
  const rounded = complete && Math.abs(total - 100) <= 0.5 ? largestRemainderRound(percents as number[], 100) : percents;
  return groupKey(g.part, g.fibres.map((f, i) => ({ fibre: f.fibre, percent: rounded[i], qualifier: f.qualifier ?? null })));
};
const groupKey = (part: string, fibres: Array<{ fibre: string; percent: number | null; qualifier: string | null }>): string =>
  `${part}:${fibres.map(f => `${f.fibre}/${f.percent}/${f.qualifier ?? ''}`).sort().join('|')}`;
const parsedKey = (g: TagGroup): string => groupKey(g.part, g.fibres.map(f => ({ fibre: f.fibre, percent: f.percent, qualifier: f.qualifier })));

type FieldScore = { field: string; ok: boolean };

/** Every field the parser shows as Read for this tag, and whether it matches what the tag says. */
const scoreReadFields = (read: TagRead, expected: GateExpected): FieldScore[] => {
  const out: FieldScore[] = [];
  const wanted = new Set(expected.groups.map(normalisedExpected));
  read.groups.forEach((g, i) => {
    if (g.status === 'verified') out.push({ field: `group ${i} (${g.part})`, ok: wanted.has(parsedKey(g)) });
  });
  if (read.care.status === 'verified') {
    const a = read.care.items.slice().sort().join('|');
    const b = expected.care.slice().sort().join('|');
    out.push({ field: 'care', ok: a === b });
  }
  if (read.origin.status === 'verified') out.push({ field: 'origin', ok: read.origin.country === expected.origin });
  if (read.size.status === 'verified') out.push({ field: 'size', ok: read.size.value === expected.size });
  return out;
};

/** Every expected group has a verified, matching group, and no verified group is anything else. */
const compositionFullyGreen = (read: TagRead, expected: GateExpected): boolean => {
  if (expected.groups.length === 0) return false;
  const verified = read.groups.filter(g => g.status === 'verified').map(parsedKey).sort();
  const wanted = expected.groups.map(normalisedExpected).sort();
  return read.groups.every(g => g.status === 'verified') && verified.length === wanted.length && verified.every((k, i) => k === wanted[i]);
};

/** The one-sided 95 percent upper bound on the wrong-green rate when none of n Read fields was wrong. */
const upperBound = (n: number): number => (n > 0 ? 1 - Math.pow(0.05, 1 / n) : 1);

// ─── The gate ───────────────────────────────────────────────────────────────

type GateInput = {
  flagOn: boolean;
  fixtures: GateFixture[];
  frozen: Frozen | null;
  /** sha256 of each frozen file as it is now, by repo-relative path */
  currentHashes: Record<string, string>;
};
type GateOutcome = {
  status: 'todo' | 'fail' | 'pass';
  failures: string[];
  tags: number;
  readFields: number;
  wrongGreens: number;
  upperBound: number;
  cleanTags: number;
  cleanFullyGreen: number;
};

const evaluateGate = (input: GateInput): GateOutcome => {
  const { flagOn, fixtures, frozen, currentHashes } = input;
  const empty = { tags: fixtures.length, readFields: 0, wrongGreens: 0, upperBound: 1, cleanTags: 0, cleanFullyGreen: 0 };
  const incomplete = fixtures.length < MIN_TAGS || !frozen;
  if (incomplete && !flagOn) return { status: 'todo', failures: [], ...empty };

  const failures: string[] = [];
  if (fixtures.length < MIN_TAGS) failures.push(`the sealed set has ${fixtures.length} tags; at least ${MIN_TAGS} are needed`);
  if (!frozen) failures.push('gate/FROZEN.json is missing, so the parser was never frozen');

  if (frozen) {
    const recorded = frozen.files ?? {};
    for (const file of FROZEN_FILES) {
      if (!recorded[file]) failures.push(`FROZEN.json has no hash for ${file}`);
      else if (currentHashes[file] !== recorded[file]) failures.push(`${file} changed after the sealed set was frozen; a new sealed set of ${MIN_TAGS} is needed`);
    }
    if (!frozen.expectedChecked || !frozen.expectedChecked.by || !frozen.expectedChecked.date) {
      failures.push('FROZEN.json does not say who checked the sealed answers against the photos');
    }
  }

  let readFields = 0;
  let wrongGreens = 0;
  let cleanTags = 0;
  let cleanFullyGreen = 0;
  let unanswered = 0;
  for (const fx of fixtures) {
    if (!/\bset: gate\b/.test(fx.about) || !/\breal\b/.test(fx.about)) failures.push(`${fx.file}: about must say "set: gate" and "real"`);
    if (!fx.expected) {
      unanswered += 1;
      continue;
    }
    const read = parseTagText(fx.ocrText, { category: fx.expected.category, ocr: { meanConfidence: fx.meanConfidence } });
    for (const score of scoreReadFields(read, fx.expected)) {
      readFields += 1;
      if (!score.ok) {
        wrongGreens += 1;
        failures.push(`wrong green in ${fx.file}: ${score.field}`);
      }
    }
    if (fx.expected.clean) {
      cleanTags += 1;
      if (compositionFullyGreen(read, fx.expected)) cleanFullyGreen += 1;
    }
  }
  if (unanswered > 0) failures.push(`${unanswered} sealed tags have no expected values`);
  if (readFields < MIN_READ_FIELDS) failures.push(`only ${readFields} Read fields in the sealed set; at least ${MIN_READ_FIELDS} are needed to bound the wrong-green rate`);
  if (cleanTags === 0) failures.push('no sealed tag is marked clean, so the 70 percent rule cannot be checked');
  else if (cleanFullyGreen / cleanTags < MIN_CLEAN_GREEN_SHARE) {
    failures.push(`only ${cleanFullyGreen} of ${cleanTags} clean tags have a fully green and correct composition; at least ${Math.round(MIN_CLEAN_GREEN_SHARE * 100)} percent are needed`);
  }

  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
    tags: fixtures.length,
    readFields,
    wrongGreens,
    upperBound: wrongGreens === 0 ? upperBound(readFields) : 1,
    cleanTags,
    cleanFullyGreen,
  };
};

// ─── Reading the repository ─────────────────────────────────────────────────

const loadSealedSet = (): { fixtures: GateFixture[]; frozen: Frozen | null } => {
  if (!fs.existsSync(GATE_DIR)) return { fixtures: [], frozen: null };
  const names = fs.readdirSync(GATE_DIR).filter(n => n.endsWith('.json'));
  const frozenPath = path.join(GATE_DIR, 'FROZEN.json');
  const frozen: Frozen | null = fs.existsSync(frozenPath) ? JSON.parse(fs.readFileSync(frozenPath, 'utf8')) : null;
  const fixtures = names
    .filter(n => n !== 'FROZEN.json')
    .map(n => {
      const raw = JSON.parse(fs.readFileSync(path.join(GATE_DIR, n), 'utf8'));
      return {
        file: n,
        about: String(raw.about ?? ''),
        ocrText: String(raw.ocrText ?? ''),
        meanConfidence: typeof raw.meanConfidence === 'number' ? raw.meanConfidence : null,
        medianWordHeight: typeof raw.medianWordHeight === 'number' ? raw.medianWordHeight : null,
        expected: raw.expected ?? null,
      } as GateFixture;
    });
  return { fixtures, frozen };
};

const hashFrozenFiles = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const file of FROZEN_FILES) {
    out[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
  }
  return out;
};

// ─── The sealed set, run once ───────────────────────────────────────────────

describe('release gate on the sealed set of real tags', () => {
  const sealed = loadSealedSet();
  // The gate decides whether the feature may go to the App Store. TestFlight builds carry the flag on so the
  // owner can scan real tags; for an App Store release run the suite with SMARTCLOSET_RELEASE_GATE=appstore.
  const gateEnforced = TAG_SCAN_ENABLED && process.env.SMARTCLOSET_RELEASE_GATE === 'appstore';
  const outcome = evaluateGate({ flagOn: gateEnforced, fixtures: sealed.fixtures, frozen: sealed.frozen, currentHashes: hashFrozenFiles() });

  if (outcome.status === 'todo') {
    it.todo(
      `sealed set has ${outcome.tags} of ${MIN_TAGS} real tags or no FROZEN.json: the gate is not run unless SMARTCLOSET_RELEASE_GATE=appstore, and then it fails until the set exists`,
    );
  } else {
    it('has zero wrong greens, enough evidence, 70 percent of clean tags fully green, and an unchanged parser', () => {
        console.info(
        `tag gate: ${outcome.tags} tags, ${outcome.readFields} Read fields, ${outcome.wrongGreens} wrong; ` +
          `95 percent upper bound on the wrong-green rate per Read field: ${(outcome.upperBound * 100).toFixed(2)} percent; ` +
          `clean tags fully green: ${outcome.cleanFullyGreen} of ${outcome.cleanTags}`,
      );
      expect(outcome.failures).toEqual([]);
    });
  }
});

// ─── The gate's own logic, on made-up tags ──────────────────────────────────

describe('the gate logic', () => {
  const GOOD_TEXT = '60% COTTON 40% POLYESTER\nMADE IN ITALY\nMACHINE WASH COLD';
  const goodExpected = (): GateExpected => ({
    clean: true,
    groups: [{ part: 'shell', fibres: [{ fibre: 'cotton', percent: 60 }, { fibre: 'polyester', percent: 40 }] }],
    care: ['Machine wash cold'],
    origin: 'Italy',
    size: null,
  });
  const fixture = (i: number, extra: Partial<GateFixture> = {}): GateFixture => ({
    file: `tag-${i}.json`, about: 'set: gate; kind: us-english; real', ocrText: GOOD_TEXT, meanConfidence: 0.9, medianWordHeight: 30, expected: goodExpected(), ...extra,
  });
  const set = (n: number) => Array.from({ length: n }, (_, i) => fixture(i));
  const hashes = (): Record<string, string> => Object.fromEntries(FROZEN_FILES.map(f => [f, `hash-of-${f}`]));
  const frozen = (): Frozen => ({ frozenAt: '2026-11-01', files: hashes(), expectedChecked: { by: 'second person', date: '2026-11-02' } });
  const run = (extra: Partial<GateInput> = {}) => evaluateGate({ flagOn: false, fixtures: set(40), frozen: frozen(), currentHashes: hashes(), ...extra });

  it('is a todo, not a pass, while the flag is off and the set is incomplete', () => {
    expect(run({ fixtures: [], frozen: null }).status).toBe('todo');
    expect(run({ fixtures: set(39) }).status).toBe('todo');
    expect(run({ frozen: null }).status).toBe('todo');
  });

  it('FAILS, with the reason, when the flag is on and there is no sealed set or no FROZEN.json', () => {
    const none = run({ flagOn: true, fixtures: [], frozen: null });
    expect(none.status).toBe('fail');
    expect(none.failures.join(' ')).toMatch(/at least 40 are needed/);
    expect(none.failures.join(' ')).toMatch(/FROZEN\.json is missing/);
    const thin = run({ flagOn: true, fixtures: set(39) });
    expect(thin.status).toBe('fail');
    expect(thin.failures.join(' ')).toMatch(/39 tags/);
    expect(run({ flagOn: true, frozen: null }).failures.join(' ')).toMatch(/FROZEN\.json is missing/);
  });

  it('passes a complete, frozen, correct set, with the bound reported', () => {
    const outcome = run();
    expect(outcome.failures).toEqual([]);
    expect(outcome.status).toBe('pass');
    expect(outcome.tags).toBe(40);
    expect(outcome.readFields).toBe(120); // the group, the care list and the country of each tag
    expect(outcome.wrongGreens).toBe(0);
    expect(outcome.upperBound).toBeCloseTo(1 - Math.pow(0.05, 1 / 120), 10);
    expect(outcome.cleanFullyGreen).toBe(40);
    expect(run({ flagOn: true }).status).toBe('pass');
  });

  it('runs a complete set even while the flag is off, and fails it when it is wrong', () => {
    const wrong = set(40);
    wrong[3] = fixture(3, { expected: { ...goodExpected(), groups: [{ part: 'shell', fibres: [{ fibre: 'cotton', percent: 65 }, { fibre: 'polyester', percent: 35 }] }] } });
    const outcome = run({ fixtures: wrong });
    expect(outcome.status).toBe('fail');
    expect(outcome.wrongGreens).toBe(1);
    expect(outcome.failures).toContain('wrong green in tag-3.json: group 0 (shell)');
    expect(outcome.upperBound).toBe(1);
  });

  it('counts a Read care list, country or size that differs as a wrong green', () => {
    const wrongCare = set(40);
    wrongCare[0] = fixture(0, { expected: { ...goodExpected(), care: ['Hand wash'] } });
    expect(run({ fixtures: wrongCare }).failures).toContain('wrong green in tag-0.json: care');
    const wrongOrigin = set(40);
    wrongOrigin[1] = fixture(1, { expected: { ...goodExpected(), origin: 'Portugal' } });
    expect(run({ fixtures: wrongOrigin }).failures).toContain('wrong green in tag-1.json: origin');
    const wrongSize = set(40);
    wrongSize[2] = fixture(2, { ocrText: 'SIZE M\n100% COTTON', expected: { ...goodExpected(), size: 'L', care: [], origin: null, groups: [{ part: 'shell', fibres: [{ fibre: 'cotton', percent: 100 }] }] } });
    expect(run({ fixtures: wrongSize }).failures).toContain('wrong green in tag-2.json: size');
  });

  it('does not count a Check field against the parser, however wrong it is', () => {
    const uncertain = set(40);
    uncertain[5] = fixture(5, { ocrText: '55% COTTON 40% POLYESTER', expected: { ...goodExpected(), care: [], origin: null } });
    const outcome = run({ fixtures: uncertain });
    expect(outcome.wrongGreens).toBe(0);
    expect(outcome.readFields).toBe(120 - 3);
  });

  it('needs at least 100 Read fields', () => {
    const outcome = run({ fixtures: Array.from({ length: 40 }, (_, i) => fixture(i, { ocrText: '60% COTTON 40% POLYESTER', expected: { ...goodExpected(), care: [], origin: null } })) });
    expect(outcome.readFields).toBe(40);
    expect(outcome.status).toBe('fail');
    expect(outcome.failures.join(' ')).toMatch(/only 40 Read fields/);
  });

  it('needs 70 percent of the clean tags to be fully green and correct', () => {
    const fixtures = set(40).map((fx, i) => (i < 13 ? { ...fx, ocrText: '55% COTTON 40% POLYESTER\nMADE IN ITALY\nMACHINE WASH COLD' } : fx));
    const outcome = run({ fixtures });
    expect(outcome.cleanFullyGreen).toBe(27);
    expect(outcome.status).toBe('fail');
    expect(outcome.failures.join(' ')).toMatch(/27 of 40 clean tags/);
    const enough = set(40).map((fx, i) => (i < 12 ? { ...fx, ocrText: '55% COTTON 40% POLYESTER\nMADE IN ITALY\nMACHINE WASH COLD' } : fx));
    expect(run({ fixtures: enough }).failures.join(' ')).not.toMatch(/clean tags/);
    expect(run({ fixtures: set(40).map(fx => ({ ...fx, expected: { ...fx.expected!, clean: false } })) }).failures.join(' ')).toMatch(/no sealed tag is marked clean/);
  });

  it('fails when a parser file changed after the freeze, or a hash is missing, or nobody checked the answers', () => {
    const changed = run({ currentHashes: { ...hashes(), 'src/utils/tagParser.ts': 'other' } });
    expect(changed.status).toBe('fail');
    expect(changed.failures.join(' ')).toMatch(/src\/utils\/tagParser\.ts changed after the sealed set was frozen/);
    const files = hashes();
    delete files['src/utils/countries.ts'];
    expect(run({ frozen: { ...frozen(), files } }).failures.join(' ')).toMatch(/no hash for src\/utils\/countries\.ts/);
    expect(run({ frozen: { ...frozen(), expectedChecked: undefined } }).failures.join(' ')).toMatch(/who checked the sealed answers/);
  });

  it('fails when a sealed tag has no expected values, or is not marked as a real tag of the gate set', () => {
    const open = set(40);
    open[7] = fixture(7, { expected: null });
    expect(run({ fixtures: open }).failures.join(' ')).toMatch(/1 sealed tags have no expected values/);
    const dev = set(40);
    dev[9] = fixture(9, { about: 'set: dev; kind: us-english; real' });
    expect(run({ fixtures: dev }).failures.join(' ')).toMatch(/tag-9\.json: about must say "set: gate" and "real"/);
    const synthetic = set(40);
    synthetic[9] = fixture(9, { about: 'set: gate; kind: us-english; synthetic' });
    expect(run({ fixtures: synthetic }).failures.join(' ')).toMatch(/tag-9\.json: about must say/);
  });

  it('computes the upper bound as 1 - 0.05^(1/n): about 3 percent at 100 Read fields, about 7 percent at 40', () => {
    expect(upperBound(100)).toBeCloseTo(0.0295, 4);
    expect(upperBound(40)).toBeCloseTo(0.0722, 4);
    expect(upperBound(0)).toBe(1);
  });

  it('rounds the expected percentages of a group that adds up before comparing, like the parser does', () => {
    const read = parseTagText('97,5% BAUMWOLLE\n2,5% ELASTAN');
    const expected: GateExpected = { groups: [{ part: 'shell', fibres: [{ fibre: 'cotton', percent: 97.5 }, { fibre: 'elastane', percent: 2.5 }] }], care: [], origin: null, size: null };
    expect(scoreReadFields(read, expected)).toEqual([{ field: 'group 0 (shell)', ok: true }]);
    expect(compositionFullyGreen(read, expected)).toBe(true);
  });

  it('does not count a tag as fully green when it has no expected group, or a group the parser could not read', () => {
    expect(compositionFullyGreen(parseTagText('100% COTTON'), { groups: [], care: [], origin: null, size: null })).toBe(false);
    const two: GateExpected = { groups: [{ part: 'shell', fibres: [{ fibre: 'cotton', percent: 100 }] }, { part: 'lining', fibres: [{ fibre: 'polyester', percent: 100 }] }], care: [], origin: null, size: null };
    expect(compositionFullyGreen(parseTagText('100% COTTON'), two)).toBe(false);
    expect(compositionFullyGreen(parseTagText('100% COTTON\nSOMETHING: 5% POLYESTER'), { groups: two.groups.slice(0, 1), care: [], origin: null, size: null })).toBe(false);
  });
});

describe('the sealed set directory', () => {
  it('holds only real tags of the gate set and a FROZEN.json, or does not exist yet', () => {
    if (!fs.existsSync(GATE_DIR)) return;
    for (const name of fs.readdirSync(GATE_DIR)) expect(name).toMatch(/\.json$/);
  });
});
