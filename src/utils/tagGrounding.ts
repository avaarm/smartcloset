/**
 * Turning what was read into groups the person can trust or check, and into the materials the form holds.
 *
 * Nothing a model says is believed until the same number and the same word are found in the OCR text
 * (groundModelRead). A group is "verified" (shown as Read) only if every rule in the design holds; the rules
 * are written once here, so the local parser and the optional model step cannot disagree about them.
 */
import type { MaterialComponent, MaterialTier } from '../types';
import type { FieldStatus, ModelTagRead, TagFibre, TagFlag, TagGroup, TagPart, TagRead } from '../types/tag';
import { brandFromText } from './brandNames';
import { CARE_PHRASES } from './careNames';
import { normalizeCountry } from './countries';
import {
  FIBRES,
  IMITATION_LEATHER_PHRASES,
  RECORDED_QUALIFIERS,
  resolveFibre,
} from './materialNames';
import { foldText, normalizeText } from './textFold';
import { extractIds, sanitizeTranscription } from './tagTranscription';

export const TAG_PARTS: readonly TagPart[] = ['shell', 'lining', 'fill', 'trim', 'upper', 'sole', 'hardware', 'other'];
export const TAG_FLAGS: readonly TagFlag[] = [
  'no_text', 'low_legibility', 'partial', 'symbols_only', 'multiple_labels', 'set_of_garments', 'composition_elsewhere', 'multiple_sizes',
];

/** A read with any of these flags has no group shown as Read: the text cannot be trusted to be the whole tag. */
export const BLOCKING_FLAGS: readonly TagFlag[] = ['low_legibility', 'partial', 'set_of_garments', 'composition_elsewhere'];

/** Parts whose single fibre needs no percentage ("upper: leather"). */
const SINGLETON_PARTS: ReadonlySet<TagPart> = new Set<TagPart>(['lining', 'upper', 'sole', 'fill', 'hardware', 'trim']);

export const MAX_FIBRES = 12;
const MAX_GROUPS_FROM_MODEL = 6;
const MAX_FIBRES_PER_MODEL_GROUP = 8;

export const ISSUE = {
  unknownPart: 'Unknown part',
  repaired: 'Read with corrections',
  over100: 'Percentage over 100',
  twoFibres: 'Two fibres for one percentage',
  notFound: 'Not found in the tag text',
  unknownFibre: 'Fibre not recognised',
  tooMany: 'More fibres than we can keep',
  misaligned: "Numbers and fibres don't line up",
  noPercentSigns: 'No percent signs on the tag',
  paddedNumber: 'Check the percentage',
} as const;

// ─── Rounding ───────────────────────────────────────────────────────────────

/**
 * Whole numbers that add up to exactly `total`, by the largest-remainder method. Ties go to the larger value, then
 * to the earlier one. When the values are too far from `total` for that to mean anything (the floors already
 * overshoot, or more than one unit per value is missing), each is rounded on its own instead.
 */
export const largestRemainderRound = (values: number[], total = 100): number[] => {
  const n = values.length;
  if (n === 0) return [];
  const v = values.map(x => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0));
  const floors = v.map(x => Math.floor(x + 1e-9));
  const left = total - floors.reduce((a, b) => a + b, 0);
  if (left < 0 || left > n) return v.map(x => Math.round(x));
  const remainder = (i: number) => Math.round((v[i] - Math.floor(v[i] + 1e-9)) * 1e6);
  const order = v.map((_, i) => i).sort((a, b) => remainder(b) - remainder(a) || v[b] - v[a] || a - b);
  const out = floors.slice();
  for (let k = 0; k < left; k++) out[order[k]] += 1;
  return out;
};

// ─── Grounding ──────────────────────────────────────────────────────────────

/** Every number printed in a folded text, as numbers ("100.0" and "100" are the same number). */
export const numbersIn = (foldedText: string): number[] => {
  const out: number[] = [];
  const re = /\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(foldedText)) !== null) out.push(parseFloat(m[0]));
  return out;
};

const fmtNumber = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/**
 * True when the number and the printed word of a fibre are both in the folded OCR text (and the qualifier word,
 * if one is claimed). `foldedText` comes from normalizeText.
 */
export const isFibreGrounded = (
  fibre: Pick<TagFibre, 'printed' | 'percent' | 'qualifier'>,
  foldedText: string,
): boolean => {
  const printed = foldText(fibre.printed || '').trim();
  // One character is a word in Japanese and Chinese ("綿"), but not in a script with letters.
  if (printed.length < (/[^\x00-\x7f]/.test(printed) ? 1 : 2)) return false;
  if (!foldedText.includes(printed)) return false;
  if (fibre.qualifier && !foldedText.includes(fibre.qualifier)) return false;
  if (fibre.percent !== null) {
    if (typeof fibre.percent !== 'number' || !Number.isFinite(fibre.percent)) return false;
    if (!numbersIn(foldedText).some(n => Math.abs(n - fibre.percent!) < 1e-9)) return false;
  }
  return true;
};

// ─── Groups ─────────────────────────────────────────────────────────────────

export interface GroupDraft {
  part: TagPart;
  label: string | null;
  fibres: TagFibre[];
  issues: string[];
  /** A letter or digit had to be repaired somewhere in this group's text. */
  repaired?: boolean;
}

/**
 * Sums a group, rounds it when it adds up, and decides its own status. Read-wide rules (flags, two lists for one
 * part) come afterwards in applyReadRules. A verified group has no issues.
 */
export const buildGroup = (draft: GroupDraft): TagGroup => {
  const issues = draft.issues.slice();
  const push = (text: string) => {
    if (!issues.includes(text)) issues.push(text);
  };
  if (draft.repaired) push(ISSUE.repaired);

  const fibres: TagFibre[] = draft.fibres.map(f => ({
    ...f,
    printed: (f.printed || '').slice(0, 40),
    evidence: (f.evidence || '').slice(0, 80),
  }));

  if (fibres.some(f => !f.grounded) && !draft.repaired) push(ISSUE.notFound);
  if (draft.part === 'other') push(ISSUE.unknownPart);

  const allPercent = fibres.length > 0 && fibres.every(f => f.percent !== null);
  let sum: number | null = null;
  let sumOk = false;
  if (allPercent) {
    const raw = fibres.reduce((total, f) => total + (f.percent as number), 0);
    sum = Math.round(raw * 100) / 100;
    if (Math.abs(sum - 100) <= 0.5) {
      const rounded = largestRemainderRound(fibres.map(f => f.percent as number), 100);
      fibres.forEach((f, i) => { f.percent = rounded[i]; });
      sum = 100;
      sumOk = true;
    } else {
      push(`Adds up to ${fmtNumber(sum)}`);
    }
  }

  const singleton = fibres.length === 1 && fibres[0].percent === null && SINGLETON_PARTS.has(draft.part);
  let status: FieldStatus;
  if (fibres.length === 0) status = 'missing';
  else if (issues.length === 0 && fibres.every(f => f.grounded) && (sumOk || singleton) && draft.part !== 'other') status = 'verified';
  else status = 'check';

  return {
    part: draft.part,
    label: draft.label ? draft.label.slice(0, 30) : null,
    fibres,
    sum,
    status,
    issues,
  };
};

/**
 * The rules that need the whole read: two lists for one part (a hang tag and a sewn tag) are all Check, and a flag
 * that says the text cannot be trusted as the whole tag leaves nothing verified. Never raises a status.
 */
export const applyReadRules = (groups: TagGroup[], flags: readonly TagFlag[]): TagGroup[] => {
  const blocked = flags.some(f => BLOCKING_FLAGS.includes(f));
  const counts = new Map<TagPart, number>();
  for (const g of groups) if (g.fibres.length > 0) counts.set(g.part, (counts.get(g.part) ?? 0) + 1);
  return groups.map(g => {
    const issues = g.issues.slice();
    let status = g.status;
    if (g.part !== 'trim' && g.part !== 'other' && (counts.get(g.part) ?? 0) > 1 && g.fibres.length > 0) {
      const text = `Two lists for ${g.part}`;
      if (!issues.includes(text)) issues.push(text);
      if (status === 'verified') status = 'check';
    }
    if (blocked && status === 'verified') status = 'check';
    return { ...g, issues, status };
  });
};

// ─── Materials ──────────────────────────────────────────────────────────────

const TIER_BY_PART: Record<Exclude<TagPart, 'shell' | 'trim' | 'other'>, MaterialTier> = {
  lining: 'lining',
  fill: 'fill',
  upper: 'upper',
  sole: 'sole',
  hardware: 'hardware',
};

const materialName = (f: TagFibre): string => {
  const printed = (f.printed || '').toLowerCase().trim();
  let base: string;
  if (FIBRES.includes(f.fibre)) {
    // Imitation leather files under polyurethane but keeps the words on the tag, so the person sees what it said.
    base = f.fibre === 'polyurethane' && IMITATION_LEATHER_PHRASES.includes(printed) ? printed : f.fibre;
  } else {
    base = (printed || f.fibre || '').slice(0, 40);
  }
  const prefix = f.qualifier && RECORDED_QUALIFIERS.includes(f.qualifier) ? `${f.qualifier} ` : '';
  return `${prefix}${base}`.trim();
};

/**
 * The materials for the form. Shell fibres are all `primary` (the blend convention); a second shell list, trim and
 * unknown parts become `trim`, since tiers cannot say "a second shell fabric". Percentages are whole numbers per
 * group: a group that adds up is rounded to exactly 100; one that does not keeps its printed numbers, so the
 * editor's own sum warning shows what the tag said.
 */
export const toMaterialComponents = (groups: TagGroup[]): MaterialComponent[] => {
  const out: MaterialComponent[] = [];
  let shellSeen = false;
  for (const group of groups) {
    if (!group.fibres || group.fibres.length === 0) continue;
    let tier: MaterialTier;
    if (group.part === 'shell') {
      tier = shellSeen ? 'trim' : 'primary';
      shellSeen = true;
    } else if (group.part === 'trim' || group.part === 'other') {
      tier = 'trim';
    } else {
      tier = TIER_BY_PART[group.part];
    }
    const percents = group.fibres.map(f => f.percent);
    const complete = percents.every(p => p !== null);
    const total = complete ? (percents as number[]).reduce((a, b) => a + b, 0) : 0;
    const rounded =
      complete && Math.abs(total - 100) <= 0.5
        ? largestRemainderRound(percents as number[], 100)
        : percents.map(p => (p === null ? null : Math.round(p)));
    group.fibres.forEach((fibre, i) => {
      const name = materialName(fibre);
      if (!name) return;
      const component: MaterialComponent = { name, tier };
      const pct = rounded[i];
      if (pct !== null && pct !== undefined) component.percentage = Math.max(0, Math.min(100, pct));
      out.push(component);
    });
  }
  return out;
};

// ─── The model's answer ─────────────────────────────────────────────────────

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isPart = (value: unknown): value is TagPart => typeof value === 'string' && (TAG_PARTS as readonly string[]).includes(value);

/**
 * The model step's answer, checked against the OCR text it was given. A fibre is grounded only if its number and
 * its printed word are both in the text; an ungrounded row is Check. The model's own fibre name is not trusted
 * where our dictionary reads the printed word differently. Care, origin, size and brand from a model are always
 * Check. The input is untrusted: any field may be missing or of the wrong type.
 */
export const groundModelRead = (model: ModelTagRead, ocrText: string): TagRead => {
  const folded = normalizeText(typeof ocrText === 'string' ? ocrText : '');
  const m = (model && typeof model === 'object' ? model : {}) as Partial<ModelTagRead>;

  const flags: TagFlag[] = [];
  for (const f of Array.isArray(m.flags) ? m.flags : []) {
    if ((TAG_FLAGS as readonly string[]).includes(f) && !flags.includes(f)) flags.push(f);
  }

  const drafts: GroupDraft[] = [];
  let kept = 0;
  const composition = Array.isArray(m.composition) ? m.composition.slice(0, MAX_GROUPS_FROM_MODEL) : [];
  for (const entry of composition) {
    if (!entry || typeof entry !== 'object') continue;
    const part: TagPart = isPart(entry.part) ? entry.part : 'other';
    const issues: string[] = [];
    const fibres: TagFibre[] = [];
    const rows = Array.isArray(entry.fibers) ? entry.fibers.slice(0, MAX_FIBRES_PER_MODEL_GROUP) : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      if (kept >= MAX_FIBRES) {
        if (!issues.includes(ISSUE.tooMany)) issues.push(ISSUE.tooMany);
        continue;
      }
      const printed = text(row.as_printed, 40);
      let percent: number | null = null;
      if (typeof row.percent === 'number' && Number.isFinite(row.percent)) {
        if (row.percent > 100) {
          if (!issues.includes(ISSUE.over100)) issues.push(ISSUE.over100);
          continue;
        }
        if (row.percent < 0) continue;
        percent = row.percent;
      }
      const qualifier = row.qualifier === 'organic' || row.qualifier === 'recycled' ? row.qualifier : null;
      const modelFibre = typeof row.fiber === 'string' ? row.fiber.trim().toLowerCase() : '';
      const ours = resolveFibre(foldText(printed));
      let fibre: string;
      if (ours) {
        fibre = ours;
        if (modelFibre && FIBRES.includes(modelFibre) && modelFibre !== ours) {
          issues.push(`Second opinion says ${modelFibre}; the tag says ${printed}`);
        }
      } else if (modelFibre && FIBRES.includes(modelFibre)) {
        fibre = modelFibre;
        issues.push(ISSUE.unknownFibre);
      } else {
        fibre = foldText(printed).slice(0, 40);
        issues.push(ISSUE.unknownFibre);
      }
      const fibreRow: TagFibre = {
        fibre,
        printed,
        percent,
        qualifier,
        evidence: text(row.evidence, 80),
        grounded: false,
      };
      fibreRow.grounded = isFibreGrounded(fibreRow, folded);
      fibres.push(fibreRow);
      kept += 1;
    }
    if (fibres.length === 0 && issues.length === 0) continue;
    drafts.push({ part, label: text(entry.part_label, 30) || null, fibres, issues: Array.from(new Set(issues)) });
  }

  const groups = applyReadRules(drafts.map(buildGroup), flags);

  const careItems: string[] = [];
  for (const phrase of Array.isArray(m.care) ? m.care : []) {
    if (typeof phrase === 'string' && CARE_PHRASES.includes(phrase) && !careItems.includes(phrase) && careItems.length < 12) careItems.push(phrase);
  }

  const originText = text(m.origin, 60);
  const origin = originText ? normalizeCountry(originText) : null;

  let sizeValue: string | null = null;
  const sizeAll = m.size && Array.isArray(m.size.all) ? m.size.all.filter(s => typeof s === 'string' && s.trim() !== '') : [];
  if (m.size && typeof m.size.primary === 'string' && m.size.primary.trim() !== '') sizeValue = m.size.primary.trim().slice(0, 20);
  if (sizeAll.length > 1) {
    sizeValue = null;
    if (!flags.includes('multiple_sizes')) flags.push('multiple_sizes');
  }

  // A brand is accepted only if it is one we know and it is printed in the text.
  let brandName: string | null = null;
  const claimed = m.brand && typeof m.brand.name === 'string' ? brandFromText(m.brand.name) : undefined;
  if (claimed && brandFromText(ocrText) === claimed) brandName = claimed;
  const where = m.brand && (m.brand.where_seen === 'neck_label' || m.brand.where_seen === 'care_tag' || m.brand.where_seen === 'hang_tag')
    ? m.brand.where_seen
    : 'neck_label';

  const languages = (Array.isArray(m.languages) ? m.languages : [])
    .filter((l): l is string => typeof l === 'string' && /^[a-z]{2}$/.test(l))
    .filter((l, i, all) => all.indexOf(l) === i)
    .slice(0, 6);

  return {
    readable: m.readable === true,
    flags,
    groups,
    care: { items: careItems, status: careItems.length > 0 ? 'check' : 'missing' },
    origin: origin
      ? { country: origin.country, known: origin.known, status: 'check' }
      : { country: null, known: false, status: 'missing' },
    size: { value: sizeValue, status: sizeValue ? 'check' : 'missing' },
    brand: brandName
      ? { name: brandName, whereSeen: where, confidence: 0.8, status: 'check' }
      : { name: null, whereSeen: null, confidence: 0, status: 'missing' },
    ids: extractIds(folded),
    languages,
    transcription: sanitizeTranscription(typeof ocrText === 'string' ? ocrText : ''),
    source: 'model',
  };
};
