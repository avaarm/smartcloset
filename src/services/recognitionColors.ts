/**
 * Decides what colour the ITEM in a photo is.
 *
 * Google Vision's IMAGE_PROPERTIES describes the whole frame, so a tan suede
 * boot on a red-brown hardwood floor came back "brown, red, ivory, green" with
 * the floor outvoting the boot. The vision model, which looks at the item
 * itself, is trusted first; Vision's pixel colours only back it up, or stand in
 * for it when it has no answer, after dropping the floor and any studio backdrop.
 */

import type { DetectedColor } from './imageRecognition';
import {
  MULTICOLOR,
  distanceToName,
  hexForColorName,
  isWoodTone,
  nameDistance,
  nameForRgb,
  rgbToHex,
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

export interface ColorEvidence {
  pixels: PixelColor[];
  scene: ColorScene;
  /** Palette names (or MULTICOLOR) from the vision model, most prominent first. */
  aiColors: string[];
  /** The vision model's own confidence, 0..1. */
  aiConfidence: number;
}

export interface ResolvedColors {
  colors: DetectedColor[];
  color?: string;
  confidence?: number;
}

const MAX_SWATCHES = 4;
/** Pixels covering less than this are noise, not a colour of the item. */
const MIN_PIXEL_WEIGHT = 0.03;
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
/** What a pixel-only colour is worth when it may be the backdrop or what the floor left over: under any autofill bar. */
const DOUBTFUL_PIXEL_CONFIDENCE = 0.35;

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
}

const saturationAndLightness = ({ r, g, b }: Rgb): { s: number; l: number } => {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  if (mx === mn) return { s: 0, l };
  return { s: l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn), l };
};

/**
 * The model's colours lead; pixels then do three things, never more:
 *   - back a colour the model named (raising confidence),
 *   - add alternative swatches, but only when they describe the item: no model
 *     answer to go on, or the item fills the frame so the frame is the item,
 *   - never include the floor (wood tones under a wood surface label, whatever
 *     share of the frame the item covers: its boxes also hold floor) or a
 *     near-black/white backdrop behind a localised item.
 *
 * A colour that rests on pixels alone is only offered, never confident, when it
 * may be the backdrop or is what remained after the floor was taken out.
 */
export const resolveItemColors = (evidence: ColorEvidence): ResolvedColors => {
  const { scene } = evidence;
  const aiNames = Array.from(new Set(evidence.aiColors)).filter(n => n === MULTICOLOR || !!hexForColorName(n));
  const aiPalette = aiNames.filter(n => n !== MULTICOLOR);

  const pixelsDescribeItem = aiPalette.length === 0 || (scene.coverage ?? 0) >= FILLED_FRAME_COVERAGE;

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
    });
  });

  const pixels = evidence.pixels
    .filter(p => p.weight >= MIN_PIXEL_WEIGHT)
    .sort((a, b) => b.weight - a.weight);

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
    const weight = backdrop ? p.weight * BACKDROP_FACTOR : p.weight;

    const name = nameForRgb(p);
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
    });
  }

  // Merge colours that are the same swatch (the model said both "tan" and "beige", or the
  // pixels measured a shade of it); the model's first colour leads and absorbs its twins.
  const kept: Candidate[] = [];
  const ranked = candidates.sort((a, b) => Number(b.primary) - Number(a.primary) || b.score - a.score);
  for (const c of ranked) {
    const twin = kept.find(k => nameDistance(k.name, c.name) < NAME_MERGE_DISTANCE);
    if (twin) {
      twin.agreed = twin.agreed || c.agreed;
      continue;
    }
    kept.push(c);
  }

  const swatches = kept.slice(0, MAX_SWATCHES);
  // Each swatch's share of what the item shows, so the weights stay comparable however many pixels backed them.
  const total = swatches.reduce((sum, c) => sum + c.score, 0);
  const colors: DetectedColor[] = swatches.map(c => ({
    name: c.name,
    hex: c.hex,
    weight: Math.max(0.05, Number((c.score / total).toFixed(3))),
  }));

  // The model's own first answer may be "multicolor", which is a colour name but not a swatch.
  if (aiNames[0] === MULTICOLOR) {
    return { colors, color: MULTICOLOR, confidence: Math.min(0.9, evidence.aiConfidence * 0.8) };
  }
  if (colors.length === 0) return { colors };

  const primary = swatches[0];
  let confidence: number;
  if (primary.ai) {
    const base = evidence.aiConfidence * 0.85;
    // Pixels that back the model's colour make it much more likely.
    confidence = primary.agreed ? 1 - (1 - base) * 0.4 : base;
  } else {
    // Whole-frame pixels alone: only the part of the frame the item covers describes it,
    // and with no localised item there is nothing to say which part that is.
    confidence = 0.35 + 0.45 * (scene.coverage ?? 0);
    if (primary.backdrop || floorTakenOut) confidence = Math.min(confidence, DOUBTFUL_PIXEL_CONFIDENCE);
  }
  return { colors, color: primary.name, confidence: Math.min(0.95, confidence) };
};

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
