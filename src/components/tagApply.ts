/**
 * What a scanned tag does to the Add/Edit form. Pure: the review sheet shows the rows, this decides what each
 * ticked row changes. Nothing is written to the database until the item itself is saved.
 */

import type { MaterialComponent } from '../types';
import type { FieldStatus, TagGroup, TagRead } from '../types/tag';
import { cleanCareInstructions, cleanSize } from '../utils/itemCondition';
import { toMaterialComponents } from '../utils/tagGrounding';

/** What the form holds right now. */
export interface TagCurrentValues {
  materials: MaterialComponent[];
  size: string;
  brand: string;
  originCountry: string;
  careInstructions: string[];
}

/** What to put into the form. A key is present only when that row is ticked and may be applied. */
export interface TagApplyChoice {
  /** Present only when the fabric row is ticked (and Replace chosen if the form already had materials). */
  materials?: MaterialComponent[];
  /** The care list after merging the scan into the existing one. */
  careInstructions?: string[];
  originCountry?: string;
  size?: string;
  brand?: string;
  /** Always the sanitised transcription of the latest scan. */
  tagText: string;
}

export interface TagTicks {
  fabric: boolean;
  care: boolean;
  origin: boolean;
  size: boolean;
  brand: boolean;
}

export const FABRIC_DISABLED_MESSAGE =
  'This tag lists more than one garment or only part of the fabric. Type the fabric in below.';
export const FABRIC_UNRELIABLE_MESSAGE = 'We couldn’t read the fabric reliably. Type it in below.';
export const SYMBOLS_ONLY_MESSAGE = 'This tag only shows symbols, which we can’t read yet.';
export const CHECK_ROW_MESSAGE = 'Not sure about this one. Tick it to use it, then fix it in the form.';

/** A brand is only a suggestion, and only a confident one from the neck label. */
export const BRAND_MIN_CONFIDENCE = 0.8;

/** The form's materials are empty, or are one entry without a percentage (what the photo analysis seeds): a scan may replace them. */
export const isReplaceableMaterials = (materials: readonly MaterialComponent[]): boolean =>
  materials.length === 0 || (materials.length === 1 && (materials[0].percentage === undefined || materials[0].percentage === null));

export interface FabricState {
  /** The groups that carry fibres, in the order read. */
  groups: TagGroup[];
  /** Read when every group is, Check otherwise, Not found when there is nothing. */
  status: FieldStatus;
  /** Why the row cannot be ticked, or null. */
  disabledReason: string | null;
  /** Can be ticked. */
  usable: boolean;
}

export const fabricState = (read: TagRead): FabricState => {
  const groups = read.groups.filter(g => g.fibres.length > 0);
  if (groups.length === 0) return { groups, status: 'missing', disabledReason: null, usable: false };
  const status: FieldStatus = groups.every(g => g.status === 'verified') ? 'verified' : 'check';
  let disabledReason: string | null = null;
  if (read.flags.includes('set_of_garments') || read.flags.includes('partial')) {
    disabledReason = FABRIC_DISABLED_MESSAGE;
  } else {
    // Curved or scrambled tags: many numbers and no list that adds up. The words stay in "As read".
    const percents = groups.reduce((n, g) => n + g.fibres.filter(f => f.percent !== null).length, 0);
    const someGroupAddsUp = groups.some(g => g.sum !== null && Math.abs(g.sum - 100) <= 0.5);
    if (percents > 3 && !someGroupAddsUp) disabledReason = FABRIC_UNRELIABLE_MESSAGE;
  }
  return { groups, status: disabledReason ? 'check' : status, disabledReason, usable: disabledReason === null };
};

/** The size row can be used only while the form's Size field is empty. */
export const sizeUsable = (read: TagRead, current: TagCurrentValues): boolean =>
  !!read.size.value && current.size.trim() === '';

/** A brand shows up only as a suggestion for an empty Brand field. */
export const brandOffered = (read: TagRead, current: TagCurrentValues): boolean =>
  !!read.brand.name &&
  read.brand.confidence >= BRAND_MIN_CONFIDENCE &&
  read.brand.whereSeen === 'neck_label' &&
  current.brand.trim() === '';

/** Rows that were Read are ticked for the person; Check rows wait for a tap. A field that already has a value is never overwritten unasked. */
export const defaultTicks = (read: TagRead, current: TagCurrentValues): TagTicks => {
  const fabric = fabricState(read);
  return {
    fabric: fabric.usable && fabric.status === 'verified',
    care: read.care.items.length > 0 && read.care.status === 'verified',
    origin: !!read.origin.country && read.origin.status === 'verified' && current.originCountry.trim() === '',
    size: sizeUsable(read, current) && read.size.status === 'verified',
    brand: false,
  };
};

/** "60% cotton, 40% polyester" for the "You have / Tag says" line. */
export const describeMaterials = (materials: readonly MaterialComponent[]): string =>
  materials
    .map(m => (m.percentage !== undefined && m.percentage !== null ? `${m.percentage}% ${m.name}` : m.name))
    .filter(text => text.trim() !== '')
    .join(', ');

/**
 * Turns the ticked rows into what the form should take.
 *
 * - Fabric replaces the form's materials only when they are empty or a single entry without a percentage, or when
 *   the person chose Replace. Percentages arrive as whole numbers that add up to 100 per group.
 * - Size fills only an empty Size field, and a brand only an empty Brand field, and only a confident neck-label one.
 * - Care merges into the existing list (no repeats, at most 20 lines of 80 characters).
 * - Made in fills the field when ticked.
 * - The transcription replaces the stored tag text whatever was ticked.
 */
export const applyTagRead = (
  read: TagRead,
  ticked: TagTicks,
  current: TagCurrentValues,
  opts: { replaceMaterials: boolean },
): TagApplyChoice => {
  const choice: TagApplyChoice = { tagText: read.transcription };

  const fabric = fabricState(read);
  if (ticked.fabric && fabric.usable && (isReplaceableMaterials(current.materials) || opts.replaceMaterials)) {
    const materials = toMaterialComponents(fabric.groups);
    if (materials.length > 0) choice.materials = materials;
  }

  if (ticked.care && read.care.items.length > 0) {
    choice.careInstructions = cleanCareInstructions([...current.careInstructions, ...read.care.items]);
  }

  if (ticked.origin && read.origin.country) {
    choice.originCountry = read.origin.country.slice(0, 60);
  }

  if (ticked.size && sizeUsable(read, current)) {
    const size = cleanSize(read.size.value);
    if (size) choice.size = size;
  }

  if (ticked.brand && brandOffered(read, current)) {
    choice.brand = read.brand.name as string;
  }

  return choice;
};
