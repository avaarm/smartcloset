/**
 * ItemQualityCard: how the person rates one piece, on Item Details under the value card
 * (documentation/design/quality-ratings.md, 3.3 and 3.7).
 *
 * An owned piece gets "How is it?" with five stars: one tap saves a private overall rating at once, "Say more"
 * opens the full sheet. A rated piece shows the rating, a line of what was chosen, whether it counts toward
 * brand insights, and Edit and Remove. A wishlist piece only gets the brand line. The card also nudges, once,
 * when the wear count reaches 3 (rate it) or 10 (is it still holding up) while the screen is open.
 *
 * Flag wrapper (design 6.1): with ratings off nothing renders and no hook runs. The consent hook only runs
 * when brand insights are on too, so a build with ratings alone makes no consent request.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { brandInsightsActive, ratingsActive } from '../config/ratingFlags';
import {
  FIT_LABELS,
  OVERALL_LABELS,
  TAG_LABELS,
  type BuyAgain,
  type Score,
} from '../config/ratingVocabulary';
import { deleteItemRating, loadMyBrandSummary, loadMyItemRating, saveItemRating } from '../services/ratingService';
import theme from '../styles/theme';
import type { ClothingItem } from '../types';
import type { ItemRating, Loaded, MyBrandSummary } from '../types/rating';
import RateItemSheet, { REMOVE_MESSAGE, REMOVE_TITLE } from './RateItemSheet';
import { useRatingConsent, type RatingConsentApi } from './RatingConsentSheet';
import RatingScale from './RatingScale';

export interface ItemQualityCardProps {
  item: ClothingItem;
  wearCount: number;
  onOpenBrand: (brand: string) => void;
  onRatingChange?: (hasRating: boolean) => void;
}

export const TITLE_UNRATED = 'How is it?';
export const TITLE_RATED = 'Your rating';
export const STAR_HELPER = 'Tap a star. It’s saved right away.';
export const GUEST_LINE = 'Sign in to rate your pieces and see what members say about brands.';
export const LOAD_FAILED = 'Couldn’t load your rating.';
export const SAVE_FAILED = 'Couldn’t save your rating. Check your connection and try again.';
export const REMOVE_FAILED = 'Couldn’t remove that. Check your connection and try again.';
export const STATUS_PRIVATE = 'Private to you';
export const STATUS_COUNTS = 'Counts toward brand insights';
export const NUDGE_THREE = 'Worn 3 times. How is it holding up?';
export const NUDGE_TEN = 'Worn 10 times. Still holding up?';

/** What the card needs from useRatingConsent. */
type CardConsent = Pick<RatingConsentApi, 'granted' | 'requestConsent' | 'sheet'>;

/** Used when brand insights are off: nothing to ask, nothing to show. */
const NO_CONSENT: CardConsent = { granted: null, requestConsent: async () => false, sheet: null };

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const BUY_AGAIN_PHRASES: Record<BuyAgain, string> = {
  yes: 'Would buy again',
  maybe: 'Might buy again',
  no: 'Wouldn’t buy again',
};

/** "Soft, True to size, Would buy again": the words the person picked, at most three descriptors. */
export const ratingSummary = (rating: ItemRating): string => {
  const words = [...rating.touchTags, ...rating.comfortTags, ...rating.holdsUpTags].slice(0, 3).map(tag => TAG_LABELS[tag]);
  if (rating.fit) {
    words.push(FIT_LABELS[rating.fit]);
  }
  if (rating.wouldBuyAgain) {
    words.push(BUY_AGAIN_PHRASES[rating.wouldBuyAgain]);
  }
  return words.join(', ');
};

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

function OwnedCard({ item, wearCount, onOpenBrand, onRatingChange, consent }: OwnedProps) {
  const itemId = item.id;
  const brand = (item.brand ?? '').trim();

  const [view, setView] = useState<CardView>({ kind: 'loading' });
  const [pending, setPending] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nudge, setNudge] = useState<'three' | 'ten' | null>(null);
  const [justRated, setJustRated] = useState(false);
  const [summaryKey, setSummaryKey] = useState(0);
  const [removing, setRemoving] = useState(false);

  const mounted = useRef(true);
  const loadId = useRef(0);
  const busy = useRef(false);
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
      await saveItemRating(itemId, { overall, createOnly: true });
      const next = await reload();
      if (mounted.current) {
        setPending(null);
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
  const counts = !!rating && rating.contributed && brandInsightsActive() && consent.granted !== false;

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
  } else if (!rating) {
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
        {pending === null ? <Text style={styles.helper}>{STAR_HELPER}</Text> : null}
        {errorLine}
      </View>
    );
  } else {
    const chosen = ratingSummary(rating);
    body = (
      <View>
        {banner}
        <RatingScale
          value={rating.overall}
          readOnly
          accessibilityLabel="Your overall rating"
          valueLabels={OVERALL_LABELS}
        />
        {chosen ? <Text style={styles.chosen}>{chosen}</Text> : null}
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
          <TextButton label="Edit" onPress={openSheet} disabled={removing} />
          <TextButton label="Remove" onPress={confirmRemove} danger disabled={removing} />
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
      {view.kind === 'ready' && brand ? <BrandLine brand={brand} summary={summary} onOpenBrand={onOpenBrand} /> : null}
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
  chosen: { marginTop: 8, fontSize: 14, lineHeight: 20, color: theme.colors.text },
  status: { marginTop: 4, fontSize: 12, color: theme.colors.mediumGray, textTransform: 'uppercase', letterSpacing: 0.5 },
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
