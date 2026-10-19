/**
 * AddRatingSection: the rating of a piece on Add/Edit item, so it is in the form instead of only on Item Details
 * (documentation/design/quality-ratings.md, 3.3 and 3.4).
 *
 * Two parts, both optional and both private to the person:
 *  - "How does it feel?": overall stars, hand feel, how it wears, fit and whether they would buy it again;
 *  - AddBrandRatingRow: five stars for the brand typed in the Brand field, with a link to the full brand sheet.
 *
 * The parts only edit a draft. Nothing is sent until the item itself is saved, and the screen then calls
 * saveItemRating / saveBrandRating, so a rating of a new piece can use the id the piece got. A rating failure is
 * the screen's to report; it never undoes the save of the item.
 *
 * The hooks keep the draft and read the stored rating of the item (edit) or brand once; they are inert, and ask
 * the network for nothing, while ratings are off, for a guest, or on a wishlist (`active` false). The components are
 * flag wrappers (design 6.1): with ratings off they render nothing.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { brandInsightsActive, ratingsActive } from '../config/ratingFlags';
import {
  BUY_AGAIN,
  BUY_AGAIN_LABELS,
  COMFORT_TAGS,
  FIT_LABELS,
  FIT_VERDICTS,
  MAX_TAGS_PER_GROUP,
  OVERALL_LABELS,
  TAG_LABELS,
  TOUCH_TAGS,
  type BuyAgain,
  type ComfortTag,
  type FitVerdict,
  type Score,
  type TouchTag,
} from '../config/ratingVocabulary';
import { loadMyBrandSummary, loadMyItemRating, saveBrandRating } from '../services/ratingService';
import theme from '../styles/theme';
import type { BrandRating, ItemRating, ItemRatingInput } from '../types/rating';
import { brandKeyRaw } from '../utils/brandKey';
import ChoiceChip from './ChoiceChip';
import RateBrandSheet from './RateBrandSheet';
import { useRatingConsent } from './RatingConsentSheet';
import RatingScale from './RatingScale';

export const RATING_SECTION_TITLE = 'How does it feel?';
export const RATING_SECTION_HINT = 'Optional. Private to you. You can also rate it later from the item.';
export const GUEST_RATING_LINE = 'Sign in to rate your pieces.';
export const RATING_LOADING_LINE = 'Loading your rating...';
export const RATING_LOAD_FAILED_LINE = 'Couldn’t load your rating. You can rate it from the item.';
export const NEEDS_STARS_LINE = 'Choose a star rating to save this.';
export const TAG_LIMIT_LINE = 'Up to four. Tap a chosen word to remove it.';
/** The one gentle message when the item saved but its rating did not: "Saved. We couldn’t save the rating; ...". */
export const RATING_NOT_SAVED_TITLE = 'Saved';
export const RATING_NOT_SAVED_BODY = 'We couldn’t save the rating; you can rate it from the item.';
/** Typing in the Brand field pauses this long before the stored brand rating is read. */
export const BRAND_LOOKUP_DEBOUNCE_MS = 600;

// ─── The draft ──────────────────────────────────────────────────────────────

/** What the form asks: the same words and scores as the rating sheet, without the scales and the note. */
export interface RatingDraft {
  overall: Score | null;
  touchTags: TouchTag[];
  comfortTags: ComfortTag[];
  fit: FitVerdict | null;
  wouldBuyAgain: BuyAgain | null;
}

export const EMPTY_RATING_DRAFT: RatingDraft = {
  overall: null,
  touchTags: [],
  comfortTags: [],
  fit: null,
  wouldBuyAgain: null,
};

export const draftFromRating = (rating: ItemRating | null): RatingDraft =>
  rating
    ? {
        overall: rating.overall,
        touchTags: [...rating.touchTags],
        comfortTags: [...rating.comfortTags],
        fit: rating.fit,
        wouldBuyAgain: rating.wouldBuyAgain,
      }
    : EMPTY_RATING_DRAFT;

const sameWords = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every(word => b.includes(word));

export const sameRatingDraft = (a: RatingDraft, b: RatingDraft): boolean =>
  a.overall === b.overall &&
  a.fit === b.fit &&
  a.wouldBuyAgain === b.wouldBuyAgain &&
  sameWords(a.touchTags, b.touchTags) &&
  sameWords(a.comfortTags, b.comfortTags);

/** Something other than the stars was chosen. */
export const hasDetail = (draft: RatingDraft): boolean =>
  draft.touchTags.length > 0 || draft.comfortTags.length > 0 || draft.fit !== null || draft.wouldBuyAgain !== null;

/**
 * What to send for a draft. A rating needs the overall score, so a draft without one is nothing to save. A save
 * replaces the whole stored rating, so what the form does not ask (the dot scales, how it is holding up, the
 * private note) is repeated from the stored one. `contribute` is left out: a first save is private and an
 * existing rating keeps its choice.
 */
export const ratingInputFromDraft = (draft: RatingDraft, stored: ItemRating | null): ItemRatingInput | null => {
  if (draft.overall === null) return null;
  return {
    overall: draft.overall,
    touch: stored?.touch ?? null,
    touchTags: draft.touchTags,
    comfort: stored?.comfort ?? null,
    comfortTags: draft.comfortTags,
    holdsUp: stored?.holdsUp ?? null,
    holdsUpTags: stored?.holdsUpTags ?? [],
    fit: draft.fit,
    wouldBuyAgain: draft.wouldBuyAgain,
    note: stored?.note ?? null,
  };
};

const toggleTag = <T extends string>(list: readonly T[], tag: T): T[] =>
  list.includes(tag) ? list.filter(t => t !== tag) : list.length >= MAX_TAGS_PER_GROUP ? [...list] : [...list, tag];

// ─── The item's draft ───────────────────────────────────────────────────────

/** off: nothing to show; guest: one line; loading and failed: one line while the stored rating is read; ready: the controls. */
export type ItemRatingStatus = 'off' | 'guest' | 'loading' | 'failed' | 'ready';

export interface ItemRatingDraftApi {
  status: ItemRatingStatus;
  draft: RatingDraft;
  setDraft: (next: RatingDraft) => void;
  /** The stored rating of the item being edited, or null. */
  stored: ItemRating | null;
  /** What to save, or null when there is nothing to: no stars yet, or nothing changed from the stored rating. */
  toInput: () => ItemRatingInput | null;
}

type StoredState = 'idle' | 'loading' | 'ready' | 'failed' | 'none';

/**
 * The draft rating of the item in the form. `itemId` is the item being edited, or null for a new one (nothing to
 * read). `active` is false for a build with ratings off and for a wishlist item; `signedIn` is null until the
 * session is known.
 */
export function useItemRatingDraft(opts: {
  itemId: string | null;
  active: boolean;
  signedIn: boolean | null;
}): ItemRatingDraftApi {
  const { itemId, active, signedIn } = opts;
  const [draft, setDraft] = useState<RatingDraft>(EMPTY_RATING_DRAFT);
  const [stored, setStored] = useState<ItemRating | null>(null);
  const [state, setState] = useState<StoredState>('idle');

  useEffect(() => {
    if (!active || signedIn !== true || !itemId) return undefined;
    let cancelled = false;
    setState('loading');
    loadMyItemRating(itemId)
      .then(loaded => {
        if (cancelled) return;
        if (loaded?.state === 'ok') {
          setStored(loaded.value);
          setDraft(draftFromRating(loaded.value));
          setState('ready');
        } else if (loaded?.state === 'offline' || loaded?.state === 'error') {
          setState('failed');
        } else {
          // A local-only item or a server without the function: it cannot be rated from here.
          setState('none');
        }
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [active, signedIn, itemId]);

  let status: ItemRatingStatus;
  if (!active || signedIn === null) status = 'off';
  else if (signedIn === false) status = 'guest';
  else if (!itemId) status = 'ready';
  else if (state === 'ready') status = 'ready';
  else if (state === 'failed') status = 'failed';
  else if (state === 'none') status = 'off';
  else status = 'loading';

  const toInput = useCallback((): ItemRatingInput | null => {
    if (status !== 'ready') return null;
    if (stored && sameRatingDraft(draft, draftFromRating(stored))) return null;
    return ratingInputFromDraft(draft, stored);
  }, [status, stored, draft]);

  return { status, draft, setDraft, stored, toInput };
}

// ─── The brand's draft ──────────────────────────────────────────────────────

export interface BrandRatingDraftApi {
  /** The brand the stars are for: the Brand field, trimmed. */
  brand: string;
  /** True when the Brand field holds something that can be rated and the stars should show. */
  usable: boolean;
  /** The person's stored rating of this brand, if it has been read. */
  stored: BrandRating | null;
  /** The stars: what was chosen here, else the stored rating's. */
  score: Score | null;
  setScore: (next: Score | null) => void;
  /** Stars were chosen that differ from the stored rating. */
  dirty: boolean;
  /** Saves the chosen stars, keeping the detail scores of an existing brand rating. Throws an Error with a friendly message. */
  commit: () => Promise<void>;
  /** Reads the stored rating again and drops the unsaved stars. */
  reload: () => Promise<void>;
}

const SAVE_FAILED = 'Couldn’t save your rating. Check your connection and try again.';

/** The brand rating of the Brand field. `enabled` is false for ratings off, a guest or a wishlist item. */
export function useBrandRatingDraft(brandText: string, enabled: boolean): BrandRatingDraftApi {
  const brand = brandText.trim();
  const key = brandKeyRaw(brand);
  const usable = enabled && key !== null && key.length >= 2;

  const [stored, setStored] = useState<{ key: string; rating: BrandRating | null } | null>(null);
  const [chosen, setChosen] = useState<{ key: string; score: Score | null } | null>(null);

  const mounted = useRef(true);
  const brandRef = useRef(brand);
  brandRef.current = brand;
  const loadId = useRef(0);
  const loadedOnce = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Reads the stored rating of the brand now typed. A newer read, or an unmounted form, wins over this answer. */
  const read = useCallback(async (forKey: string): Promise<void> => {
    loadId.current += 1;
    const id = loadId.current;
    let loaded: Awaited<ReturnType<typeof loadMyBrandSummary>> | undefined;
    try {
      loaded = await loadMyBrandSummary(brandRef.current);
    } catch {
      loaded = undefined;
    }
    if (!mounted.current || id !== loadId.current) return;
    setStored(loaded?.state === 'ok' ? { key: forKey, rating: loaded.value.brandRating } : null);
  }, []);

  useEffect(() => {
    if (!usable || key === null) {
      loadId.current += 1;
      setStored(null);
      return undefined;
    }
    // The first read is at once (an edited item's brand); later ones wait for a pause in the typing.
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      read(key).catch(() => {});
      return undefined;
    }
    const timer = setTimeout(() => {
      read(key).catch(() => {});
    }, BRAND_LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [usable, key, read]);

  const storedRating = stored && stored.key === key ? stored.rating : null;
  const mine = chosen && chosen.key === key ? chosen : null;
  const score: Score | null = mine ? mine.score : storedRating?.overall ?? null;
  const dirty = !!mine && mine.score !== null && mine.score !== storedRating?.overall;

  const setScore = useCallback(
    (next: Score | null) => {
      if (key !== null) setChosen({ key, score: next });
    },
    [key],
  );

  const commit = useCallback(async (): Promise<void> => {
    if (!mine || mine.score === null || !dirty) return;
    // Read the stored rating fresh: a save replaces the whole rating, so its detail scores are repeated.
    const loaded = await loadMyBrandSummary(brand);
    if (loaded.state !== 'ok') throw new Error(SAVE_FAILED);
    const previous = loaded.value.brandRating;
    await saveBrandRating(brand, {
      overall: mine.score,
      quality: previous?.quality ?? null,
      fitConsistency: previous?.fitConsistency ?? null,
      value: previous?.value ?? null,
    });
  }, [mine, dirty, brand]);

  const reload = useCallback(async (): Promise<void> => {
    setChosen(null);
    if (key !== null) await read(key);
  }, [key, read]);

  return { brand, usable, stored: storedRating, score, setScore, dirty, commit, reload };
}

// ─── Small parts ────────────────────────────────────────────────────────────

const Block = ({ label, aside, children }: { label: string; aside?: string; children: React.ReactNode }) => (
  <View style={styles.block}>
    <View style={styles.blockHead}>
      <Text style={styles.blockLabel}>{label}</Text>
      {aside ? <Text style={styles.aside}>{aside}</Text> : null}
    </View>
    {children}
  </View>
);

function WordChips<T extends keyof typeof TAG_LABELS>({
  group,
  options,
  selected,
  onToggle,
}: {
  /** Read out before each word: "Hand feel: Soft". */
  group: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (tag: T) => void;
}) {
  const full = selected.length >= MAX_TAGS_PER_GROUP;
  return (
    <View>
      <View style={styles.chips}>
        {options.map(tag => (
          <ChoiceChip
            key={tag}
            role="checkbox"
            label={TAG_LABELS[tag]}
            a11yLabel={`${group}: ${TAG_LABELS[tag]}`}
            selected={selected.includes(tag)}
            disabled={full && !selected.includes(tag)}
            onPress={() => onToggle(tag)}
          />
        ))}
      </View>
      {full ? <Text style={styles.hint}>{TAG_LIMIT_LINE}</Text> : null}
    </View>
  );
}

// ─── How does it feel? ──────────────────────────────────────────────────────

export interface AddRatingSectionProps {
  status: ItemRatingStatus;
  draft: RatingDraft;
  onChange: (next: RatingDraft) => void;
  /** The stars can be taken back only while no rating is stored; removing a stored one is done from the item. */
  canClear: boolean;
}

function AddRatingSectionInner({ status, draft, onChange, canClear }: AddRatingSectionProps) {
  if (status === 'off') return null;

  let body: React.ReactNode;
  if (status === 'guest') {
    body = <Text style={styles.quiet}>{GUEST_RATING_LINE}</Text>;
  } else if (status === 'loading') {
    body = <Text style={styles.quiet}>{RATING_LOADING_LINE}</Text>;
  } else if (status === 'failed') {
    body = <Text style={styles.quiet}>{RATING_LOAD_FAILED_LINE}</Text>;
  } else {
    const set = (patch: Partial<RatingDraft>) => onChange({ ...draft, ...patch });
    body = (
      <View style={styles.blocks}>
        <Block label="Overall">
          <RatingScale
            value={draft.overall}
            onChange={overall => set({ overall })}
            onClear={() => set({ overall: null })}
            allowClear={canClear}
            size="lg"
            accessibilityLabel="Overall rating"
            valueLabels={OVERALL_LABELS}
          />
        </Block>
        <Block label="Hand feel" aside="Pick up to four">
          <WordChips
            group="Hand feel"
            options={TOUCH_TAGS}
            selected={draft.touchTags}
            onToggle={tag => set({ touchTags: toggleTag(draft.touchTags, tag) })}
          />
        </Block>
        <Block label="How it wears" aside="Pick up to four">
          <WordChips
            group="How it wears"
            options={COMFORT_TAGS}
            selected={draft.comfortTags}
            onToggle={tag => set({ comfortTags: toggleTag(draft.comfortTags, tag) })}
          />
        </Block>
        <Block label="Fit">
          <View style={styles.chips}>
            {FIT_VERDICTS.map(verdict => (
              <ChoiceChip
                key={verdict}
                label={FIT_LABELS[verdict]}
                a11yLabel={`Fit: ${FIT_LABELS[verdict]}`}
                selected={draft.fit === verdict}
                onPress={() => set({ fit: draft.fit === verdict ? null : verdict })}
              />
            ))}
          </View>
        </Block>
        <Block label="Would you buy it again?">
          <View style={styles.chips}>
            {BUY_AGAIN.map(answer => (
              <ChoiceChip
                key={answer}
                label={BUY_AGAIN_LABELS[answer]}
                a11yLabel={`Would buy again: ${BUY_AGAIN_LABELS[answer]}`}
                selected={draft.wouldBuyAgain === answer}
                onPress={() => set({ wouldBuyAgain: draft.wouldBuyAgain === answer ? null : answer })}
              />
            ))}
          </View>
        </Block>
        {draft.overall === null && hasDetail(draft) ? (
          <Text style={styles.quiet} accessibilityLiveRegion="polite">
            {NEEDS_STARS_LINE}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader} accessibilityRole="header">
        {RATING_SECTION_TITLE}
      </Text>
      <Text style={styles.sectionHint}>{RATING_SECTION_HINT}</Text>
      {body}
    </View>
  );
}

const AddRatingSection: React.FC<AddRatingSectionProps> = props =>
  ratingsActive() ? <AddRatingSectionInner {...props} /> : null;

export default AddRatingSection;

// ─── Rate <Brand> ───────────────────────────────────────────────────────────

export interface AddBrandRatingRowProps {
  brand: string;
  score: Score | null;
  onChange: (next: Score | null) => void;
  /** The stars can be taken back only while no rating is stored. */
  canClear: boolean;
  /** Opens the full brand sheet; left out when it cannot be used yet (a new item has no piece of the brand to rate from). */
  onMore?: () => void;
}

function AddBrandRatingRowInner({ brand, score, onChange, canClear, onMore }: AddBrandRatingRowProps) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandHead}>
        <Text style={styles.brandLabel} numberOfLines={1}>{`Rate ${brand}`}</Text>
        {onMore ? (
          <Pressable
            onPress={onMore}
            accessibilityRole="link"
            accessibilityLabel={`More about your ${brand} rating`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.more}>More</Text>
          </Pressable>
        ) : null}
      </View>
      <RatingScale
        value={score}
        onChange={next => onChange(next)}
        onClear={() => onChange(null)}
        allowClear={canClear}
        size="sm"
        accessibilityLabel={`Rate ${brand}`}
        valueLabels={OVERALL_LABELS}
      />
    </View>
  );
}

/** The row under the Brand field. Renders nothing while ratings are off. */
export const AddBrandRatingRow: React.FC<AddBrandRatingRowProps> = props =>
  ratingsActive() ? <AddBrandRatingRowInner {...props} /> : null;

// ─── The brand sheet behind "More" ──────────────────────────────────────────

export interface BrandSheetHostProps {
  visible: boolean;
  brand: string;
  /** The stored rating, so the sheet opens on it. */
  initial: BrandRating | null;
  onClose: () => void;
  /** The sheet saved or removed the rating; the host reads it again. */
  onChanged: () => void;
}

function BrandSheetBody({
  visible,
  brand,
  initial,
  onClose,
  onChanged,
  consentGranted,
  onRequestConsent,
}: BrandSheetHostProps & { consentGranted: boolean | null; onRequestConsent: () => Promise<boolean> }) {
  return (
    <RateBrandSheet
      visible={visible}
      brand={brand}
      initial={initial}
      consentGranted={consentGranted}
      onRequestConsent={onRequestConsent}
      onClose={onClose}
      onSaved={() => {
        onChanged();
        onClose();
      }}
      onRemoved={() => {
        onChanged();
        onClose();
      }}
    />
  );
}

const NO_CONSENT = async (): Promise<boolean> => false;

/** Only a build with brand insights on reads or asks for the agreement; ratings alone make no consent request. */
function BrandSheetWithConsent(props: BrandSheetHostProps) {
  const consent = useRatingConsent();
  return (
    <>
      <BrandSheetBody {...props} consentGranted={consent.granted} onRequestConsent={consent.requestConsent} />
      {consent.sheet}
    </>
  );
}

export const BrandSheetHost: React.FC<BrandSheetHostProps> = props => {
  if (!ratingsActive()) return null;
  return brandInsightsActive() ? (
    <BrandSheetWithConsent {...props} />
  ) : (
    <BrandSheetBody {...props} consentGranted={null} onRequestConsent={NO_CONSENT} />
  );
};

const styles = StyleSheet.create({
  // The same look as the screen's FormSection, so this reads as one more section of the form.
  section: { marginBottom: 24 },
  sectionHeader: {
    fontSize: 13,
    color: '#8B8B8B',
    marginBottom: 2,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHint: { fontSize: 13, color: '#6B7280', marginBottom: 8, marginLeft: 4 },
  blocks: { gap: 18 },
  block: { gap: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: 4 },
  blockLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: theme.colors.text },
  aside: { fontSize: 12, color: theme.colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted, marginTop: 6, marginLeft: 4 },
  quiet: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted, marginLeft: 4 },

  brandRow: { gap: 2 },
  brandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4 },
  brandLabel: { flex: 1, marginRight: 12, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  more: { fontSize: 14, fontWeight: '600', color: '#7A5A22' },
});
