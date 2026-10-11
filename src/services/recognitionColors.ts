/**
 * Decides what colour the ITEM in a photo is.
 *
 * Google Vision's IMAGE_PROPERTIES describes the whole frame, so a tan suede
 * boot on a red-brown hardwood floor came back "brown, red, ivory, green" with
 * the floor outvoting the boot. The vision model, which looks at the item
 * itself, is trusted first; Vision's pixel colours only back it up, or stand in
 * for it when it has no answer, after dropping the floor and any studio backdrop.
 *
 * Without the model the frame's pixels are a poor witness: on 55 real photos the
 * most prominent pixel colour named the item's colour about one time in four (the
 * rest named the wall, bed, floor or the other things in the shot), and red heels
 * on a warm wood floor came out "gold". So a pixel colour alone is only ever
 * offered, not confident, unless the picture's colour LABELS agree with it (Vision
 * says "Red" and a red cluster is there) or it is a vivid colour and the item fills
 * the frame.
 */

import type { DetectedColor } from './imageRecognition';
import {
  MULTICOLOR,
  colorFamily,
  distanceToName,
  hexForColorName,
  isWoodTone,
  nameDistance,
  nameForRgb,
  rgbToHex,
  type ColorFamily,
  type Rgb,
} from '../utils/colorNames';

export interface PixelColor extends Rgb {
  /** Fraction of the whole frame, 0..1. */
  weight: number;
}

export interface ColorScene {
  /** Vision saw a floor/table/wood surface, so wood-toned pixels are probably it. */
  woodSurface: boolean;
  /** Fraction of the frame the main item's boxes cover, overlaps counted once (undefined when nothing was localised). */
  coverage?: number;
  /** An item was localised, so near-black/white pixels may be a backdrop rather than the item. */
  hasSubject: boolean;
}

/** A colour word Vision put among the picture's labels ("Red", 0.98): a statement about the whole frame. */
export interface LabelColor {
  /** Palette name, e.g. "red", "pink", "yellow". */
  name: string;
  score: number;
}

export interface ColorEvidence {
  pixels: PixelColor[];
  scene: ColorScene;
  /** Palette names (or MULTICOLOR) from the vision model, most prominent first. */
  aiColors: string[];
  /** The vision model's own confidence, 0..1. */
  aiConfidence: number;
  /** How sure the model is of its colours specifically (it may be sure of the item and unsure of the shade). */
  aiColorConfidence?: number;
  /** Colour words among Vision's labels (neutral ones such as "Brown" or "White" are left out: they are usually the floor or wall). */
  labelColors?: LabelColor[];
  /** Colours a product title names (palette names), when a listing title was given. */
  titleColors?: string[];
}

export interface ResolvedColors {
  colors: DetectedColor[];
  color?: string;
  confidence?: number;
}

const MAX_SWATCHES = 4;
/** Pixels covering less than this are noise, not a colour of the item. */
const MIN_PIXEL_WEIGHT = 0.03;
/** A cluster this small can still back up a colour Vision also names in its labels. */
const LABEL_BACKING_MIN_WEIGHT = 0.005;
/** A measured colour this close to a named colour counts as the same colour (lighting shifts a shade). */
const AGREE_DISTANCE = 22;
/** Two named colours closer than this are one swatch (cream/beige, tan/camel). */
const NAME_MERGE_DISTANCE = 14;
/** An item covering this much of the frame is most of what the frame's pixels show. */
const FILLED_FRAME_COVERAGE = 0.6;
/** Rank score of the vision model's 1st, 2nd and 3rd colour. */
const AI_RANK_SCORE = [0.6, 0.3, 0.15];
/** A pixel-only swatch counts for less than one the model also named. */
const PIXEL_ONLY_FACTOR = 0.5;
/** Without the model's answer, a near-black or near-white pixel colour is as likely backdrop as item. */
const BACKDROP_FACTOR = 0.3;
/** A vivid pixel colour is likelier to be the item than a neutral one, which is usually the wall, bed or floor. */
const VIVID_FACTOR = 1.5;
/** What a pixel-only colour is worth when it may be the backdrop or what the floor left over: under any autofill bar. */
const DOUBTFUL_PIXEL_CONFIDENCE = 0.35;
/** A neutral pixel colour on its own (white, grey, black, beige, brown) is as often the surroundings as the item. */
const NEUTRAL_PIXEL_CEILING = 0.45;
/** A picture's colour word backed by a pixel cluster of the same hue. */
const LABEL_BACKED_CONFIDENCE = 0.62;
/** A picture's colour word nothing else backs: offered, not confident. */
const LABEL_ALONE_CONFIDENCE = 0.42;
/** A colour label has to be this sure to count at all. */
const LABEL_MIN_SCORE = 0.85;
/** Hues that shade into each other, so a label for one is backed by pixels of the other. */
const NEIGHBOUR_HUES: Partial<Record<ColorFamily, ColorFamily[]>> = {
  // Vision calls many deep reds "Pink" as well as "Red"; a red label is not backed by pink pixels (skin, a blush tone).
  pink: ['red'],
};
/** Applied to the model's colour when a vivid colour label of another hue contradicts it and no pixels back it. */
const CONTRADICTED_FACTOR = 0.75;

interface Candidate {
  name: string;
  hex: string;
  score: number;
  /** Named by the vision model. */
  ai: boolean;
  /** The vision model's first colour, which stays the answer whatever the pixels add. */
  primary: boolean;
  /** Both the model and the pixels point at it. */
  agreed: boolean;
  /** Only near-white or near-black pixels behind a localised item point at it: as likely the backdrop as the item. */
  backdrop: boolean;
  /** Vision's colour label of the same hue also points at it. */
  labelled: boolean;
}

const saturationAndLightness = ({ r, g, b }: Rgb): { s: number; l: number } => {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  if (mx === mn) return { s: 0, l };
  return { s: l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn), l };
};

const familyOfName = (name: string): ColorFamily | undefined => colorFamily(name);

/** The strongest colour label, if one is sure enough. */
const bestLabel = (labels: LabelColor[] | undefined): LabelColor | undefined =>
  (labels ?? []).filter(l => l.score >= LABEL_MIN_SCORE).sort((a, b) => b.score - a.score)[0];

/**
 * The model's colours lead; pixels then do three things, never more:
 *   - back a colour the model named (raising confidence),
 *   - add alternative swatches, but only when they describe the item: no model
 *     answer to go on, or the item fills the frame so the frame is the item,
 *   - never include the floor (wood tones under a wood surface label, whatever
 *     share of the frame the item covers: its boxes also hold floor) or a
 *     near-black/white backdrop behind a localised item.
 *
 * A colour that rests on pixels alone is only offered, never confident, unless
 * the picture's colour labels agree with it or it is a vivid colour on an item
 * that fills the frame. A colour the model gave is made less sure when a vivid
 * colour label of another hue contradicts it and no pixels back it.
 */
export const resolveItemColors = (evidence: ColorEvidence): ResolvedColors => {
  const { scene } = evidence;
  const aiNames = Array.from(new Set(evidence.aiColors)).filter(n => n === MULTICOLOR || !!hexForColorName(n));
  const aiPalette = aiNames.filter(n => n !== MULTICOLOR);

  const pixelsDescribeItem = aiPalette.length === 0 || (scene.coverage ?? 0) >= FILLED_FRAME_COVERAGE;
  // With a floor in view, a "Red" or "Brown" label is as likely the floor as the item.
  const label = scene.woodSurface ? undefined : bestLabel(evidence.labelColors);
  const labelFamily = label ? familyOfName(label.name) : undefined;

  const candidates: Candidate[] = [];
  aiNames.forEach((name, i) => {
    if (name === MULTICOLOR) return;
    candidates.push({
      name,
      hex: hexForColorName(name) as string,
      score: AI_RANK_SCORE[Math.min(i, AI_RANK_SCORE.length - 1)],
      ai: true,
      primary: i === 0,
      agreed: false,
      backdrop: false,
      labelled: false,
    });
  });

  const allPixels = [...evidence.pixels].sort((a, b) => b.weight - a.weight);
  const pixels = allPixels.filter(p => p.weight >= MIN_PIXEL_WEIGHT);

  let floorTakenOut = false;
  for (const p of pixels) {
    // The floor under the item, even when it happens to match a colour the model named.
    if (scene.woodSurface && isWoodTone(p)) {
      floorTakenOut = true;
      continue;
    }

    let nearest: Candidate | undefined;
    let nearestDistance = AGREE_DISTANCE;
    for (const c of candidates) {
      if (!c.ai) continue;
      const d = distanceToName(p, c.name);
      if (d <= nearestDistance) {
        nearest = c;
        nearestDistance = d;
      }
    }
    if (nearest) {
      nearest.score += p.weight;
      nearest.agreed = true;
      continue;
    }
    if (!pixelsDescribeItem) continue;
    // Once the model has answered, a wood tone it did not name is the table or floor, not a second colour.
    if (aiPalette.length > 0 && isWoodTone(p)) continue;

    const { s, l } = saturationAndLightness(p);
    const backdrop = scene.hasSubject && s < 0.08 && (l > 0.85 || l < 0.15);
    // A backdrop behind a localised item. With the model's answer in hand it is dropped outright.
    if (backdrop && aiPalette.length > 0) continue;
    const name = nameForRgb(p);
    const vivid = aiPalette.length === 0 && familyOfName(name) !== 'neutral';
    const weight = (backdrop ? p.weight * BACKDROP_FACTOR : p.weight) * (vivid ? VIVID_FACTOR : 1);

    const same = candidates.find(c => !c.ai && c.name === name);
    if (same) {
      same.score += weight;
      same.backdrop = same.backdrop && backdrop;
      continue;
    }
    candidates.push({
      name,
      hex: rgbToHex(p),
      score: weight * (aiPalette.length > 0 ? PIXEL_ONLY_FACTOR : 1),
      ai: false,
      primary: false,
      agreed: false,
      backdrop,
      labelled: false,
    });
  }

  // Without the model, a colour word among Vision's labels that a pixel cluster of the same hue backs
  // is the strongest evidence there is: two independent readings of the photo agree. The label's own word
  // names the colour ("Red"), since the cluster may be the shaded side of it ("maroon"); when the biggest
  // cluster is of a neighbouring hue (a burgundy one behind a "Pink" label), that cluster names it.
  let labelOnly = false;
  if (aiPalette.length === 0 && label && labelFamily && labelFamily !== 'neutral') {
    const hues: ColorFamily[] = [labelFamily, ...(NEIGHBOUR_HUES[labelFamily] ?? [])];
    const backing = allPixels.find(
      p =>
        p.weight >= LABEL_BACKING_MIN_WEIGHT &&
        !(scene.woodSurface && isWoodTone(p)) &&
        hues.includes(familyOfName(nameForRgb(p)) as ColorFamily),
    );
    if (backing) {
      const clusterName = nameForRgb(backing);
      const name = familyOfName(clusterName) === labelFamily ? label.name : clusterName;
      const existing = candidates.find(c => !c.ai && c.name === name);
      if (existing) {
        existing.labelled = true;
        existing.score += 1; // leads: the labels and the pixels both point at it
      } else {
        candidates.push({
          name, hex: hexForColorName(name) ?? rgbToHex(backing), score: 1 + backing.weight, ai: false, primary: false,
          agreed: false, backdrop: false, labelled: true,
        });
      }
    } else if (!candidates.some(c => familyOfName(c.name) === labelFamily)) {
      labelOnly = true;
      candidates.push({
        name: label.name, hex: hexForColorName(label.name) as string, score: 1, ai: false, primary: false,
        agreed: false, backdrop: false, labelled: false,
      });
    }
  }

  // Merge colours that are the same swatch (the model said both "tan" and "beige", or the
  // pixels measured a shade of it); the model's first colour leads and absorbs its twins.
  const kept: Candidate[] = [];
  const ranked = candidates.sort((a, b) => Number(b.primary) - Number(a.primary) || b.score - a.score);
  for (const c of ranked) {
    const twin = kept.find(k => nameDistance(k.name, c.name) < NAME_MERGE_DISTANCE);
    if (twin) {
      twin.agreed = twin.agreed || c.agreed;
      twin.labelled = twin.labelled || c.labelled;
      continue;
    }
    kept.push(c);
  }

  // When the colour rests on a label the pixels back, the other clusters (a warm floor behind red heels) have
  // nothing but their share of the frame to recommend them, so only shades of the same hue stay as swatches.
  const labelledFamily = kept[0]?.labelled ? familyOfName(kept[0].name) : undefined;
  const swatches = (labelledFamily ? kept.filter(c => c === kept[0] || familyOfName(c.name) === labelledFamily) : kept).slice(
    0,
    MAX_SWATCHES,
  );
  // Each swatch's share of what the item shows, so the weights stay comparable however many pixels backed them.
  const total = swatches.reduce((sum, c) => sum + c.score, 0);
  const colors: DetectedColor[] = swatches.map(c => ({
    name: c.name,
    hex: c.hex,
    weight: Math.max(0.05, Number((c.score / total).toFixed(3))),
  }));

  // The model's own first answer may be "multicolor", which is a colour name but not a swatch.
  if (aiNames[0] === MULTICOLOR) {
    return { colors, color: MULTICOLOR, confidence: Math.min(0.9, modelColorConfidence(evidence) * 0.8) };
  }
  if (colors.length === 0) return { colors };

  const primary = swatches[0];
  let confidence: number;
  if (primary.ai) {
    const base = modelColorConfidence(evidence) * 0.85;
    const primaryFamily = familyOfName(primary.name);
    // A colour word among the labels or in the title that names the same hue is a second witness.
    const labelBacks = !!label && !!primaryFamily && primaryFamily === labelFamily;
    const titleBacks = (evidence.titleColors ?? []).some(t => !!primaryFamily && familyOfName(t) === primaryFamily);
    // A vivid colour word of ANOTHER hue, from the labels or the title, with nothing backing the model.
    const contradicted =
      !primary.agreed &&
      !labelBacks &&
      !titleBacks &&
      ((!!label && !!labelFamily && labelFamily !== 'neutral' && primaryFamily !== 'neutral' && labelFamily !== primaryFamily) ||
        (evidence.titleColors ?? []).some(t => {
          const f = familyOfName(t);
          return !!f && f !== 'neutral' && !!primaryFamily && primaryFamily !== 'neutral' && f !== primaryFamily;
        }));
    confidence = primary.agreed || labelBacks || titleBacks ? 1 - (1 - base) * 0.4 : base;
    if (contradicted) confidence = base * CONTRADICTED_FACTOR;
  } else if (primary.labelled) {
    confidence = LABEL_BACKED_CONFIDENCE;
  } else if (labelOnly) {
    confidence = LABEL_ALONE_CONFIDENCE;
  } else {
    // Whole-frame pixels alone: only the part of the frame the item covers describes it,
    // and with no localised item there is nothing to say which part that is.
    confidence = 0.2 + 0.4 * (scene.coverage ?? 0);
    // Neutral colours are mostly the surroundings; only a vivid colour can be sure of itself this way.
    if (familyOfName(primary.name) === 'neutral') confidence = Math.min(confidence, NEUTRAL_PIXEL_CEILING);
    if (primary.backdrop || floorTakenOut) confidence = Math.min(confidence, DOUBTFUL_PIXEL_CONFIDENCE);
  }
  return { colors, color: primary.name, confidence: Math.min(0.95, confidence) };
};

/** The confidence in the model's colours: its overall one, held down by a lower one it gave for colour alone. */
const modelColorConfidence = (evidence: ColorEvidence): number =>
  evidence.aiColorConfidence === undefined
    ? evidence.aiConfidence
    : Math.min(evidence.aiConfidence, evidence.aiColorConfidence);

/** Pixel colours from a Vision IMAGE_PROPERTIES block. */
export const readPixelColors = (imageProperties: any): PixelColor[] => {
  const raw: any[] = imageProperties?.dominantColors?.colors ?? [];
  return raw.map(c => ({
    r: Number(c?.color?.red ?? 0),
    g: Number(c?.color?.green ?? 0),
    b: Number(c?.color?.blue ?? 0),
    weight: Number(c?.pixelFraction ?? c?.score ?? 0),
  }));
};
