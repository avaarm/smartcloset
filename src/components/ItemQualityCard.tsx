/**
 * ItemQualityCard: how the person rates one piece, on Item Details under the value card
 * (documentation/design/quality-ratings.md, 3.3 and 3.7).
 *
 * An owned piece gets "How is it?" with the rating questions in plain view, nothing to open first: five stars
 * (one tap saves a private overall rating at once), "Hand feel" and "How it wears" word chips, and "Fit". Once a
 * piece is rated, a tap on a star or a chip saves that change at once (a save replaces the whole rating, so the
 * stored rating is sent again with the one change; a quick run of taps is sent as one save). Words chosen before
 * a star wait for it: nothing is rated by a word alone. A rated piece also shows a labelled breakdown of what was
 * chosen, whether it counts toward brand insights, and Edit and Remove; "Say more" opens the full sheet.
 *
 * Any piece with a brand also gets the person's own rating of the brand: "Rate <Brand>", or their stored stars
 * with Edit. That works with brand insights off; the report of what members say is a separate link that only
 * exists when insights are on. A wishlist piece only gets the brand line. The card also nudges, once, when the
 * wear count reaches 3 (rate it) or 10 (is it still holding up) while the screen is open.
 *
 * Flag wrapper (design 6.1): with ratings off nothing renders and no hook runs. The consent hook only runs
 * when brand insights are on too, so a build with ratings alone makes no consent request.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { brandInsightsActive, ratingsActive } from '../config/ratingFlags';
import {
  COMFORT_TAGS,
  FIT_LABELS,
  FIT_VERDICTS,
  MAX_TAGS_PER_GROUP,
  OVERALL_LABELS,
  TAG_LABELS,
  TOUCH_TAGS,
  type ComfortTag,
  type FitVerdict,
  type Score,
  type TouchTag,
} from '../config/ratingVocabulary';
import { deleteItemRating, loadMyBrandSummary, loadMyItemRating, saveItemRating } from '../services/ratingService';
import theme from '../styles/theme';
import type { ClothingItem } from '../types';
import type { ItemRating, ItemRatingInput, Loaded, MyBrandSummary } from '../types/rating';
import BrandRatingRow from './BrandRatingRow';
import RateBrandSheet, { blockedLine, type BrandSaveOutcome } from './RateBrandSheet';
import RateItemSheet, { REMOVE_MESSAGE, REMOVE_TITLE } from './RateItemSheet';
import { ChipGroup } from './RatingChips';
import RatingBreakdown from './RatingBreakdown';
import { useRatingConsent, type RatingConsentApi } from './RatingConsentSheet';
import RatingScale from './RatingScale';

export interface ItemQualityCardProps {
  item: ClothingItem;
  wearCount: number;
  onOpenBrand: (brand: string) => void;
  onRatingChange?: (hasRating: boolean) => void;
  /**
   * Changes each time the screen comes back into view. The rating is read again then, so one made on the edit form
   * shows up here instead of a stale copy that a tap would save over.
   */
  reloadKey?: number;
  /**
   * The brand badge at the top of the screen opens the same brand rating sheet. The card hands over the opener
   * while the person can rate the brand (signed in, a brand, the server can take it) and null when they cannot.
   */
  onBrandRatingOpener?: (open: (() => void) | null) => void;
}

export const TITLE_UNRATED = 'How is it?';
export const TITLE_RATED = 'Your rating';
export const STAR_HELPER = 'Tap a star. It’s saved right away.';
export const WORDS_WAIT_HELPER = 'Pick a star to save the words you chose.';
export const WORDS_SAVED_HELPER = 'Tap a word to add or change it. It’s saved right away.';
export const GUEST_LINE = 'Sign in to rate your pieces and see what members say about brands.';
export const LOAD_FAILED = 'Couldn’t load your rating.';
export const SAVE_FAILED = 'Couldn’t save your rating. Check your connection and try again.';
export const REMOVE_FAILED = 'Couldn’t remove that. Check your connection and try again.';
export const STATUS_PRIVATE = 'Private to you';
export const STATUS_COUNTS = 'Counts toward brand insights';
export const NUDGE_THREE = 'Worn 3 times. How is it holding up?';
export const NUDGE_TEN = 'Worn 10 times. Still holding up?';

/** What the card needs from useRatingConsent. */
type CardConsent = Pick<RatingConsentApi, 'granted' | 'requestConsent' | 'sheet' | 'refresh'>;

/** Used when brand insights are off: nothing to ask, nothing to show. */
const NO_CONSENT: CardConsent = { granted: null, requestConsent: async () => false, sheet: null, refresh: async () => {} };

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

// ─── Quick inputs ───────────────────────────────────────────────────────────

/** The words the chips hold: a few for hand feel and for how it wears, one fit. */
interface Words {
  touchTags: TouchTag[];
  comfortTags: ComfortTag[];
  fit: FitVerdict | null;
}

const NO_WORDS: Words = { touchTags: [], comfortTags: [], fit: null };

const hasWords = (words: Words): boolean => words.touchTags.length > 0 || words.comfortTags.length > 0 || words.fit !== null;

/** What a tap on a chip did to the list: chosen words are removed, new ones are added up to the group limit. */
const toggled = <T extends string>(list: readonly T[], tag: T): T[] =>
  list.includes(tag) ? list.filter(t => t !== tag) : list.length >= MAX_TAGS_PER_GROUP ? [...list] : [...list, tag];

/** The fields a quick tap can change on a stored rating. */
type QuickChange = Partial<Pick<ItemRating, 'overall' | 'touchTags' | 'comfortTags' | 'fit'>>;

/**
 * A save replaces the whole rating, so one changed word sends everything the stored rating holds, the note
 * included. `contribute` is left out: the server then keeps the choice the person made in the sheet.
 */
const ratedInput = (rating: ItemRating, change: QuickChange): ItemRatingInput => ({
  overall: rating.overall,
  touch: rating.touch,
  touchTags: rating.touchTags,
  comfort: rating.comfort,
  comfortTags: rating.comfortTags,
  holdsUp: rating.holdsUp,
  holdsUpTags: rating.holdsUpTags,
  fit: rating.fit,
  wouldBuyAgain: rating.wouldBuyAgain,
  note: rating.note,
  ...change,
});

// ─── What the card knows ────────────────────────────────────────────────────

type CardView =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'ready'; rating: ItemRating | null };

const toView = (loaded: Loaded<ItemRating | null> | undefined): CardView => {
  switch (loaded?.state) {
    case 'ok':
      return { kind: 'ready', rating: loaded.value };
    case 'guest':
      return { kind: 'guest' };
    case 'unavailable':
      return { kind: 'unavailable' };
    default:
      return { kind: 'failed' };
  }
};

type SummaryView =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'failed' }
  | { kind: 'ready'; value: MyBrandSummary };

/** The person's own pieces of a brand, from their own ratings. Silent when it cannot be read. */
function useBrandSummary(brand: string, enabled: boolean, refreshKey: number): SummaryView {
  const [view, setView] = useState<SummaryView>({ kind: 'loading' });
  useEffect(() => {
    if (!enabled || brand === '') {
      setView({ kind: 'hidden' });
      return undefined;
    }
    let cancelled = false;
    loadMyBrandSummary(brand)
      .then(loaded => {
        if (cancelled) {
          return;
        }
        if (loaded?.state === 'ok') {
          setView({ kind: 'ready', value: loaded.value });
        } else if (loaded?.state === 'offline' || loaded?.state === 'error') {
          setView({ kind: 'failed' });
        } else {
          setView({ kind: 'hidden' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setView({ kind: 'failed' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brand, enabled, refreshKey]);
  return view;
}

// ─── The brand line ─────────────────────────────────────────────────────────

/** What the brand line has to say: the person's own average, and whether the report link is offered. */
const brandLineParts = (summary: SummaryView): { own: { average: number; rated: number } | null; showLink: boolean } => {
  const own =
    summary.kind === 'ready' && summary.value.itemsRated > 0 && summary.value.avgOverall !== null
      ? { average: summary.value.avgOverall, rated: summary.value.itemsRated }
      : null;
  // The report is for members who are signed in; a guest or a missing server function gets neither line.
  const showLink = brandInsightsActive() && (summary.kind === 'ready' || summary.kind === 'failed');
  return { own, showLink };
};

function BrandLine({
  brand,
  summary,
  onOpenBrand,
  flush,
}: {
  brand: string;
  summary: SummaryView;
  onOpenBrand: (brand: string) => void;
  /** No space above: the line is the whole section. */
  flush?: boolean;
}) {
  const { own, showLink } = brandLineParts(summary);
  if (!own && !showLink) {
    return null;
  }
  return (
    <View style={flush ? undefined : styles.brandLine}>
      {own ? <Text style={styles.brandOwn}>{`Your ${brand} pieces: ${own.average.toFixed(1)} across ${own.rated} rated`}</Text> : null}
      {showLink ? (
        <Pressable
          onPress={() => onOpenBrand(brand)}
          accessibilityRole="link"
          accessibilityLabel={`See what members say about ${brand}`}
          hitSlop={{ top: 8, bottom: 8 }}
          style={styles.brandLink}
        >
          <Text style={styles.brandLinkText}>{`See what members say about ${brand}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A wishlist piece has no rating of its own, so the brand line is all there is. */
function WishlistBrandLine({ brand, onOpenBrand }: { brand: string; onOpenBrand: (brand: string) => void }) {
  const summary = useBrandSummary(brand, true, 0);
  const { own, showLink } = brandLineParts(summary);
  if (!own && !showLink) {
    return null;
  }
  return (
    <View style={styles.section}>
      <BrandLine brand={brand} summary={summary} onOpenBrand={onOpenBrand} flush />
    </View>
  );
}

// ─── The card ───────────────────────────────────────────────────────────────

const TextButton = ({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    style={styles.textButton}
  >
    <Text style={[styles.textButtonText, danger && styles.textButtonDanger]}>{label}</Text>
  </Pressable>
);

type OwnedProps = ItemQualityCardProps & { consent: CardConsent };

function OwnedCard({ item, wearCount, onOpenBrand, onRatingChange, reloadKey, onBrandRatingOpener, consent }: OwnedProps) {
  const itemId = item.id;
  const brand = (item.brand ?? '').trim();

  const [view, setView] = useState<CardView>({ kind: 'loading' });
  const [pending, setPending] = useState<Score | null>(null);
  // Words chosen before there is a star to save them with.
  const [words, setWords] = useState<Words>(NO_WORDS);
  // What a tap on a rated piece asked for and is still being saved: shown at once, dropped when it is read back.
  const [draft, setDraft] = useState<QuickChange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nudge, setNudge] = useState<'three' | 'ten' | null>(null);
  const [justRated, setJustRated] = useState(false);
  const [summaryKey, setSummaryKey] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandNotice, setBrandNotice] = useState<string | null>(null);
  // Learned from a save the server answered with "not worn"; it lasts as long as this card does.
  const [brandNotWorn, setBrandNotWorn] = useState(false);

  const mounted = useRef(true);
  const loadId = useRef(0);
  const busy = useRef(false);
  const draftRef = useRef<QuickChange | null>(null);
  const draftVersion = useRef(0);
  const flushing = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  /** Reads the stored rating. A newer read, or an unmounted card, wins over this answer. */
  const reload = useCallback(async (): Promise<CardView | null> => {
    loadId.current += 1;
    const id = loadId.current;
    let loaded: Loaded<ItemRating | null> | undefined;
    try {
      loaded = await loadMyItemRating(itemId);
    } catch {
      loaded = undefined;
    }
    if (!mounted.current || id !== loadId.current) {
      return null;
    }
    const next = toView(loaded);
    setView(next);
    return next;
  }, [itemId]);

  useEffect(() => {
    mounted.current = true;
    setView({ kind: 'loading' });
    reload().catch(() => {});
    return () => {
      mounted.current = false;
      loadId.current += 1;
    };
  }, [reload]);

  // The screen came back into view (the edit form may have rated the piece): read it again, keeping what is shown.
  const seenReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey === seenReloadKey.current) {
      return;
    }
    seenReloadKey.current = reloadKey;
    setSummaryKey(key => key + 1);
    reload().catch(() => {});
  }, [reloadKey, reload]);

  // Tell the screen whether a rating exists (for the delete message).
  const hasRating = view.kind === 'ready' && view.rating !== null;
  const reported = useRef<boolean | null>(null);
  const onRatingChangeRef = useRef(onRatingChange);
  onRatingChangeRef.current = onRatingChange;
  useEffect(() => {
    if (reported.current === hasRating) {
      return;
    }
    reported.current = hasRating;
    onRatingChangeRef.current?.(hasRating);
  }, [hasRating]);

  // The nudge (design 3.7): only when the count goes up by one to 3 or 10 while the screen is open.
  const previousWears = useRef(wearCount);
  useEffect(() => {
    const previous = previousWears.current;
    previousWears.current = wearCount;
    if (wearCount === previous) {
      return;
    }
    const current = viewRef.current;
    if (wearCount === previous + 1 && current.kind === 'ready') {
      if (wearCount === 3 && current.rating === null) {
        setNudge('three');
        return;
      }
      if (wearCount === 10 && current.rating !== null && current.rating.holdsUp === null) {
        setNudge('ten');
        return;
      }
    }
    setNudge(null);
  }, [wearCount]);

  const summary = useBrandSummary(brand, view.kind === 'ready', summaryKey);
  const brandRating = summary.kind === 'ready' ? summary.value.brandRating : null;
  // The server allows a brand rating for a brand the person owns something from, or has already rated.
  const canRateBrand =
    brand !== '' && summary.kind === 'ready' && (summary.value.canRateBrand || brandRating !== null);

  const openBrandSheet = useCallback(() => {
    setBrandNotice(null);
    setBrandOpen(true);
  }, []);

  // The brand badge at the top of the screen opens the same sheet, while there is something it can open.
  const brandOpenerRef = useRef(onBrandRatingOpener);
  brandOpenerRef.current = onBrandRatingOpener;
  useEffect(() => {
    if (!canRateBrand) {
      return undefined;
    }
    brandOpenerRef.current?.(openBrandSheet);
    return () => brandOpenerRef.current?.(null);
  }, [canRateBrand, openBrandSheet]);

  const openSheet = () => {
    setJustRated(false);
    setNudge(null);
    setError(null);
    setSheetOpen(true);
  };

  const onStar = async (overall: Score) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setPending(overall);
    setError(null);
    setNudge(null);
    try {
      // createOnly: a card that is out of date can never overwrite a fuller rating made elsewhere.
      await saveItemRating(itemId, {
        overall,
        createOnly: true,
        ...(words.touchTags.length > 0 ? { touchTags: words.touchTags } : {}),
        ...(words.comfortTags.length > 0 ? { comfortTags: words.comfortTags } : {}),
        ...(words.fit ? { fit: words.fit } : {}),
      });
      const next = await reload();
      if (mounted.current) {
        setPending(null);
        setWords(NO_WORDS);
        if (next?.kind === 'ready' && next.rating) {
          setJustRated(true);
        }
        setSummaryKey(key => key + 1);
      }
    } catch (thrown) {
      if (mounted.current) {
        setPending(null);
        setError(messageOf(thrown, SAVE_FAILED));
      }
    } finally {
      busy.current = false;
    }
  };

  const storedRating = (): ItemRating | null => {
    const current = viewRef.current;
    return current.kind === 'ready' ? current.rating : null;
  };

  /** The stored rating with the taps that are still on their way to the server laid over it. */
  const latestRating = (): ItemRating | null => {
    const stored = storedRating();
    return stored ? { ...stored, ...draftRef.current } : null;
  };

  /**
   * Sends the taps made on a rated piece. A tap made while a save is running is folded into the draft and goes
   * out as one more save, so no tap is lost and a quick run of taps is not a write each.
   */
  const flushDraft = async (): Promise<void> => {
    flushing.current = true;
    let overallChanged = false;
    try {
      while (draftRef.current) {
        const base = storedRating();
        if (!base) {
          draftRef.current = null;
          break;
        }
        const version = draftVersion.current;
        overallChanged = overallChanged || draftRef.current.overall !== undefined;
        await saveItemRating(itemId, ratedInput(base, draftRef.current));
        if (!mounted.current) {
          return;
        }
        if (version !== draftVersion.current) {
          continue;
        }
        await reload();
        if (!mounted.current) {
          return;
        }
        if (version === draftVersion.current) {
          draftRef.current = null;
        }
      }
      if (overallChanged) {
        setSummaryKey(key => key + 1);
      }
    } catch (thrown) {
      draftRef.current = null;
      if (mounted.current) {
        setError(messageOf(thrown, SAVE_FAILED));
      }
    } finally {
      flushing.current = false;
      if (mounted.current) {
        setDraft(draftRef.current);
      }
    }
  };

  const requestChange = (change: QuickChange) => {
    if (!storedRating() || busy.current) {
      return;
    }
    draftVersion.current += 1;
    draftRef.current = { ...draftRef.current, ...change };
    setDraft(draftRef.current);
    setError(null);
    setNudge(null);
    if (!flushing.current) {
      flushDraft().catch(() => {});
    }
  };

  /** A tap on a word: saved at once for a rated piece, held until a star is chosen for one that is not. */
  const changeWords = (apply: (current: Words) => Partial<Words>) => {
    const latest = latestRating();
    if (latest) {
      requestChange(apply(latest));
    } else {
      setWords(current => ({ ...current, ...apply(current) }));
    }
  };
  const toggleTouch = (tag: TouchTag) => changeWords(current => ({ touchTags: toggled(current.touchTags, tag) }));
  const toggleComfort = (tag: ComfortTag) => changeWords(current => ({ comfortTags: toggled(current.comfortTags, tag) }));
  const toggleFit = (verdict: FitVerdict) => changeWords(current => ({ fit: current.fit === verdict ? null : verdict }));

  const remove = async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setRemoving(true);
    setError(null);
    try {
      await deleteItemRating(itemId);
      if (mounted.current) {
        loadId.current += 1;
        setView({ kind: 'ready', rating: null });
        setJustRated(false);
        setNudge(null);
        setSummaryKey(key => key + 1);
      }
    } catch (thrown) {
      if (mounted.current) {
        setError(messageOf(thrown, REMOVE_FAILED));
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setRemoving(false);
      }
    }
  };

  const confirmRemove = () => {
    Alert.alert(REMOVE_TITLE, REMOVE_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
          remove().catch(() => {});
        },
      },
    ]);
  };

  const retry = () => {
    setView({ kind: 'loading' });
    reload().catch(() => {});
  };

  const brandSaved = (outcome: BrandSaveOutcome) => {
    setBrandOpen(false);
    setBrandNotice(blockedLine(outcome.blocked));
    if (outcome.blocked === 'not_worn') {
      setBrandNotWorn(true);
    } else if (outcome.contributed) {
      setBrandNotWorn(false);
    }
    // The cached agreement was out of date: read it again so the sheet offers the right row next time.
    if (outcome.blocked === 'no_consent') {
      consent.refresh().catch(() => {});
    }
    setSummaryKey(key => key + 1);
  };

  const brandRemoved = () => {
    setBrandOpen(false);
    setBrandNotice(null);
    setSummaryKey(key => key + 1);
  };

  if (view.kind === 'guest') {
    return (
      <View style={styles.quiet}>
        <Text style={styles.quietText}>{GUEST_LINE}</Text>
      </View>
    );
  }
  // The server functions are not there yet: the rating part stays out of sight and nothing else breaks.
  if (view.kind === 'unavailable') {
    return null;
  }

  const rating = view.kind === 'ready' ? view.rating : null;
  const shown: ItemRating | null = rating ? { ...rating, ...draft } : null;
  const picked: Words = shown ?? words;
  const saving = draft !== null;
  const counts = !!rating && rating.contributed && brandInsightsActive() && consent.granted !== false;
  const brandCounts = !!brandRating && brandRating.contributed && brandInsightsActive() && consent.granted !== false;

  const banner = nudge ? (
    <View style={styles.nudge} accessibilityRole="alert">
      <Text style={styles.nudgeText}>{nudge === 'three' ? NUDGE_THREE : NUDGE_TEN}</Text>
      <View style={styles.nudgeButtons}>
        <TextButton label="Rate it" onPress={openSheet} />
        <TextButton label="Not now" onPress={() => setNudge(null)} />
      </View>
    </View>
  ) : null;

  const errorLine = error ? (
    <Text style={styles.error} accessibilityRole="alert">
      {error}
    </Text>
  ) : null;

  // The same questions whether or not the piece is rated yet: only what a tap does differs (see changeWords).
  const chips = (
    <>
      <ChipGroup
        title="Hand feel"
        options={TOUCH_TAGS}
        labelOf={tag => TAG_LABELS[tag]}
        selected={picked.touchTags}
        onToggle={toggleTouch}
        max={MAX_TAGS_PER_GROUP}
        actionLabel="Rate hand feel"
        busy={removing || pending !== null}
      />
      <ChipGroup
        title="How it wears"
        options={COMFORT_TAGS}
        labelOf={tag => TAG_LABELS[tag]}
        selected={picked.comfortTags}
        onToggle={toggleComfort}
        max={MAX_TAGS_PER_GROUP}
        actionLabel="Rate how it wears"
        busy={removing || pending !== null}
      />
      <ChipGroup
        title="Fit"
        options={FIT_VERDICTS}
        labelOf={verdict => FIT_LABELS[verdict]}
        selected={picked.fit ? [picked.fit] : []}
        onToggle={toggleFit}
        actionLabel="Rate fit"
        busy={removing || pending !== null}
      />
    </>
  );

  let body: React.ReactNode;
  if (view.kind === 'loading') {
    body = <View style={styles.skeleton} accessibilityLabel="Loading your rating" />;
  } else if (view.kind === 'failed') {
    body = (
      <View>
        <Text style={styles.failedText}>{LOAD_FAILED}</Text>
        <TextButton label="Try again" onPress={retry} />
      </View>
    );
  } else if (!rating || !shown) {
    body = (
      <View>
        {banner}
        {/* A tap saves at once, so a screen reader must pick a star itself, not step an adjustable control. */}
        <RatingScale
          value={pending}
          onChange={onStar}
          readOnly={pending !== null}
          adjustable={false}
          accessibilityLabel="Rate this piece"
          valueLabels={OVERALL_LABELS}
        />
        {pending === null ? <Text style={styles.helper}>{hasWords(words) ? WORDS_WAIT_HELPER : STAR_HELPER}</Text> : null}
        {chips}
        <View style={styles.actions}>
          <TextButton label="Say more" onPress={openSheet} disabled={pending !== null} />
        </View>
        {errorLine}
      </View>
    );
  } else {
    body = (
      <View>
        {banner}
        <RatingScale
          value={shown.overall}
          onChange={overall => requestChange({ overall })}
          readOnly={removing}
          adjustable={false}
          accessibilityLabel="Your overall rating"
        />
        <RatingBreakdown rating={shown} />
        <Text style={[styles.helper, styles.helperBlock]}>{WORDS_SAVED_HELPER}</Text>
        {chips}
        <Text style={styles.status}>{counts ? STATUS_COUNTS : STATUS_PRIVATE}</Text>
        {justRated ? (
          <Pressable
            onPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel="Say more"
            style={styles.sayMore}
          >
            <Text style={styles.sayMoreText}>Say more</Text>
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          <TextButton label="Edit" onPress={openSheet} disabled={removing || saving} />
          <TextButton label="Remove" onPress={confirmRemove} danger disabled={removing || saving} />
        </View>
        {errorLine}
      </View>
    );
  }

  const title = rating ? TITLE_RATED : TITLE_UNRATED;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{body}</View>
      {view.kind === 'ready' && brand ? (
        <>
          {canRateBrand ? (
            <BrandRatingRow
              brand={brand}
              rating={brandRating}
              counts={brandCounts}
              onPress={openBrandSheet}
              notice={brandNotice}
            />
          ) : null}
          <BrandLine brand={brand} summary={summary} onOpenBrand={onOpenBrand} />
        </>
      ) : null}
      <RateItemSheet
        visible={sheetOpen}
        item={{ id: itemId, name: item.name, brand: item.brand, size: item.size }}
        wearCount={wearCount}
        initial={rating}
        consentGranted={consent.granted}
        onRequestConsent={consent.requestConsent}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setNudge(null);
          setJustRated(false);
          setSummaryKey(key => key + 1);
          reload().catch(() => {});
        }}
        onRemoved={() => {
          loadId.current += 1;
          setView({ kind: 'ready', rating: null });
          setJustRated(false);
          setNudge(null);
          setSummaryKey(key => key + 1);
        }}
        consentSheet={consent.sheet}
      />
      {canRateBrand ? (
        <RateBrandSheet
          visible={brandOpen}
          brand={brand}
          initial={brandRating}
          consentGranted={consent.granted}
          onRequestConsent={consent.requestConsent}
          hasWornPiece={brandNotWorn ? false : undefined}
          onClose={() => setBrandOpen(false)}
          onSaved={brandSaved}
          onRemoved={brandRemoved}
        />
      ) : null}
      {/* The brand sheet steps aside while the person agrees, so the agreement is shown from here, only then. */}
      {brandOpen ? consent.sheet : null}
    </View>
  );
}

function OwnedCardWithConsent(props: ItemQualityCardProps) {
  const consent = useRatingConsent();
  return <OwnedCard {...props} consent={consent} />;
}

function ItemQualityCardInner(props: ItemQualityCardProps) {
  const brand = (props.item.brand ?? '').trim();
  if (props.item.isWishlist) {
    return brand ? <WishlistBrandLine brand={brand} onOpenBrand={props.onOpenBrand} /> : null;
  }
  return brandInsightsActive() ? <OwnedCardWithConsent {...props} /> : <OwnedCard {...props} consent={NO_CONSENT} />;
}

const ItemQualityCard: React.FC<ItemQualityCardProps> = props => (ratingsActive() ? <ItemQualityCardInner {...props} /> : null);

export default ItemQualityCard;

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 32 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 16, letterSpacing: -0.3 },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    ...theme.shadows.subtle,
  },
  quiet: { paddingHorizontal: 20, marginBottom: 24 },
  quietText: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  skeleton: { height: 28, borderRadius: 8, backgroundColor: theme.colors.mutedBackground },
  failedText: { fontSize: 15, color: theme.colors.text },
  helper: { marginTop: 4, fontSize: 13, color: theme.colors.textMuted },
  helperBlock: { marginTop: 14 },
  status: { marginTop: 14, fontSize: 12, color: theme.colors.mediumGray, textTransform: 'uppercase', letterSpacing: 0.5 },
  error: { marginTop: 8, fontSize: 13, lineHeight: 18, color: theme.colors.error },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: -6 },
  textButton: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  textButtonText: { fontSize: 15, fontWeight: '600', color: '#7A5A22' },
  textButtonDanger: { color: '#B91C1C' },
  sayMore: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  sayMoreText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  nudge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    marginBottom: 12,
  },
  nudgeText: { fontSize: 15, fontWeight: '600', color: '#92400E' },
  nudgeButtons: { flexDirection: 'row', gap: 8, marginLeft: -6 },
  brandLine: { marginTop: 12 },
  brandOwn: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  brandLink: { minHeight: 44, justifyContent: 'center' },
  brandLinkText: { fontSize: 15, fontWeight: '600', color: '#7A5A22' },
});
