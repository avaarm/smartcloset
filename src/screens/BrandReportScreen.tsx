/**
 * BrandReportScreen: what members say about one brand, and the person's own take on it
 * (documentation/design/quality-ratings.md, 3.4 and 6.2). Route `BrandReport`, param `{ brand: string }`.
 *
 * Every number on this screen comes from `get_brand_insight`, which only answers once enough different,
 * established members have added their ratings. Nothing here can show a count, a histogram below the server's
 * threshold or a name learned from another member: the brand is always the text the caller passed in, and the
 * member count is only ever one of four bucket phrases. A brand with too few ratings, an unknown brand and a
 * brand nobody has contributed to all look the same.
 *
 * The route is reachable only while brand insights are on (the host screens show no entry point otherwise), so
 * this screen has no flag wrapper. It never navigates anywhere except back.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import { useRatingConsent } from '../components/RatingConsentSheet';
import RateBrandSheet, { blockedLine, type BrandSaveOutcome } from '../components/RateBrandSheet';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import {
  BUCKET_LABELS,
  FIT_LABELS,
  TAG_LABELS,
  type InsightReportReason,
  type Score,
} from '../config/ratingVocabulary';
import { reportBrandInsight, loadBrandInsight } from '../services/brandInsightService';
import { loadMyBrandSummary } from '../services/ratingService';
import type { BrandInsight, BrandInsightOk, BrandRating, Loaded, MyBrandSummary } from '../types/rating';
import { brandKeyRaw } from '../utils/brandKey';

// ─── Words ───────────────────────────────────────────────────────────────────

const GUEST_TEXT = 'Sign in to see what members say about brands.';
const PAUSED_TEXT = 'Brand scores are paused right now.';
const NOT_ENOUGH_TEXT = 'Not enough ratings yet. Add yours.';
const NOTHING_TEXT = 'There’s nothing to show for this brand yet.';
const LOAD_FAILED_TITLE = 'Couldn’t load what members say';
/** The brand insight service's own wording for "something went wrong"; anything else it says is a specific reason. */
const GENERIC_READ_FAILURE = 'Couldn’t load what members say.';
const FOOTER_TEXT =
  'Members’ opinions, not verified. Based on ratings from members who chose to share them. Updated about once a day.';
const REPORT_THANKS = 'Thanks. We’ll take a look.';

const REPORT_REASONS: ReadonlyArray<{ reason: InsightReportReason; label: string }> = [
  { reason: 'looks_manipulated', label: 'Looks manipulated' },
  { reason: 'inaccurate', label: 'Looks inaccurate' },
  { reason: 'other', label: 'Something else' },
];

// ─── What is on screen ───────────────────────────────────────────────────────

type InsightView =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'ok'; insight: BrandInsightOk }
  | { kind: 'insufficient' }
  | { kind: 'paused' }
  /** A specific, already friendly reason (for example the daily limit). */
  | { kind: 'message'; message: string }
  /** Offline or an unexplained error: offered with Try again. */
  | { kind: 'failed' };

type TakeView =
  | { kind: 'loading' }
  /** Nothing to show: a guest, or a server without the rating functions. */
  | { kind: 'hidden' }
  | { kind: 'ok'; summary: MyBrandSummary }
  | { kind: 'failed' };

/** Starts work whose outcome the caller does not wait for; the work reports its own failures. */
const fire = (work: Promise<unknown>): void => {
  work.catch(() => {});
};

/** A service call that must not take the screen down, even when something unexpected comes back. */
const settled = async <T,>(read: () => Promise<Loaded<T>>): Promise<Loaded<T>> => {
  try {
    const result = await read();
    return result && typeof result === 'object' && 'state' in result ? result : { state: 'error' };
  } catch {
    return { state: 'error' };
  }
};

const insightViewOf = (result: Loaded<BrandInsight>): InsightView => {
  switch (result.state) {
    case 'guest':
      return { kind: 'guest' };
    case 'unavailable':
      return { kind: 'paused' };
    case 'offline':
      return { kind: 'failed' };
    case 'error': {
      const message = result.message?.trim();
      return message && message !== GENERIC_READ_FAILURE ? { kind: 'message', message } : { kind: 'failed' };
    }
    case 'ok':
      if (result.value.status === 'ok') {
        return { kind: 'ok', insight: result.value };
      }
      return result.value.status === 'unavailable' ? { kind: 'paused' } : { kind: 'insufficient' };
    default:
      return { kind: 'failed' };
  }
};

const takeViewOf = (result: Loaded<MyBrandSummary>): TakeView => {
  switch (result.state) {
    case 'ok':
      return { kind: 'ok', summary: result.value };
    case 'guest':
    case 'unavailable':
      return { kind: 'hidden' };
    default:
      return { kind: 'failed' };
  }
};

/** "cotton" -> "Cotton", "knit_tops" -> "Knit tops". */
const niceKey = (key: string): string => {
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
};

const oneDecimal = (value: number): string => value.toFixed(1);

// ─── Small pieces ────────────────────────────────────────────────────────────

/** Five dots filled to the nearest whole score. The number beside it carries the exact value. */
const Dots: React.FC<{ value: number; size?: number }> = ({ value, size = 10 }) => {
  const { theme } = useTheme();
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {[1, 2, 3, 4, 5].map(position => (
        <View
          key={position}
          style={[
            position < 5 ? { marginRight: size / 2 } : null,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: position <= filled ? theme.colors.accent : theme.colors.border,
            },
          ]}
        />
      ))}
    </View>
  );
};

const SectionTitle: React.FC<{ children: string }> = ({ children }) => (
  <Text variant="overline" color="muted" style={styles.sectionTitle}>
    {children}
  </Text>
);

const ScoreRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <View style={styles.row} accessible accessibilityLabel={`${label} ${oneDecimal(value)} out of 5`}>
    <Text variant="body" style={styles.grow}>{label}</Text>
    <Dots value={value} />
    <Text variant="body" weight="600" style={styles.scoreNumber}>{oneDecimal(value)}</Text>
  </View>
);

const PercentRow: React.FC<{ label: string; percent: number }> = ({ label, percent }) => (
  <View style={styles.row} accessible accessibilityLabel={`${label} ${percent} percent`}>
    <Text variant="body" style={styles.grow}>{label}</Text>
    <Text variant="body" weight="600">{`${percent}%`}</Text>
  </View>
);

const FitBar: React.FC<{ fit: NonNullable<BrandInsightOk['item']['fit']> }> = ({ fit }) => {
  const { theme } = useTheme();
  const parts = [
    { label: FIT_LABELS.runs_small, share: fit.runsSmall, color: theme.colors.borderStrong },
    { label: FIT_LABELS.true_to_size, share: fit.trueToSize, color: theme.colors.accent },
    { label: FIT_LABELS.runs_large, share: fit.runsLarge, color: theme.colors.textSubtle },
  ];
  return (
    <View>
      <View style={[styles.fitBar, { backgroundColor: theme.colors.border }]}>
        {parts.filter(part => part.share > 0).map(part => (
          <View key={part.label} style={{ flex: part.share, backgroundColor: part.color }} />
        ))}
      </View>
      {parts.map(part => (
        <View key={part.label} style={styles.legendRow} accessible accessibilityLabel={`${part.label} ${part.share} percent`}>
          <View style={[styles.legendSwatch, { backgroundColor: part.color }]} />
          <Text variant="body" style={styles.grow}>{part.label}</Text>
          <Text variant="body" weight="600">{`${part.share}%`}</Text>
        </View>
      ))}
    </View>
  );
};

const SliceRows: React.FC<{ slices: BrandInsightOk['slices'] }> = ({ slices }) => {
  const { theme } = useTheme();
  return (
    <Card padding={0}>
      {slices.map((slice, index) => {
        const extras = [
          slice.feel !== undefined ? `Feel ${oneDecimal(slice.feel)}` : null,
          slice.holdsUp !== undefined ? `Holding up ${oneDecimal(slice.holdsUp)}` : null,
        ].filter((part): part is string => part !== null);
        return (
          <View
            key={`${slice.kind}-${slice.key}`}
            style={[
              styles.sliceRow,
              index > 0 ? { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
            ]}
            accessible
            accessibilityLabel={`${niceKey(slice.key)} ${oneDecimal(slice.overall)} out of 5${extras.length ? `, ${extras.join(', ')}` : ''}`}
          >
            <View style={styles.grow}>
              <Text variant="body" weight="500">{niceKey(slice.key)}</Text>
              {extras.length ? <Text variant="caption" color="muted">{extras.join(' · ')}</Text> : null}
            </View>
            <Dots value={slice.overall} />
            <Text variant="body" weight="600" style={styles.scoreNumber}>{oneDecimal(slice.overall)}</Text>
          </View>
        );
      })}
    </Card>
  );
};

/** Everything the server said about the brand, in the order of the spec. A score under 10 members shows only the hero. */
const InsightBody: React.FC<{ brand: string; insight: BrandInsightOk }> = ({ brand, insight }) => {
  const { theme } = useTheme();
  const headlineOnly = insight.nBucket === 'under_10';
  const { item, brand: onBrand, traits, slices } = insight;

  const pieces: Array<{ label: string; node: React.ReactNode }> = [];
  if (!headlineOnly) {
    if (item.feel !== undefined) {
      pieces.push({ label: 'Feel', node: <ScoreRow label="Feel" value={item.feel} /> });
    }
    if (item.comfort !== undefined) {
      pieces.push({ label: 'Comfort', node: <ScoreRow label="Comfort" value={item.comfort} /> });
    }
    if (item.holdsUp !== undefined) {
      pieces.push({ label: 'Holding up', node: <ScoreRow label="Holding up" value={item.holdsUp} /> });
    }
    if (item.wouldBuyAgainPct !== undefined) {
      pieces.push({ label: 'Would buy again', node: <PercentRow label="Would buy again" percent={item.wouldBuyAgainPct} /> });
    }
  }
  const brandRows: Array<{ label: string; node: React.ReactNode }> = [];
  if (!headlineOnly) {
    if (onBrand.quality !== undefined) {
      brandRows.push({ label: 'Quality', node: <ScoreRow label="Quality" value={onBrand.quality} /> });
    }
    if (onBrand.fitConsistency !== undefined) {
      brandRows.push({ label: 'Size consistency', node: <ScoreRow label="Size consistency" value={onBrand.fitConsistency} /> });
    }
    if (onBrand.value !== undefined) {
      brandRows.push({ label: 'Value', node: <ScoreRow label="Value" value={onBrand.value} /> });
    }
  }
  const chips = headlineOnly
    ? []
    : traits.flatMap(trait => {
        const name = (TAG_LABELS as Record<string, string | undefined>)[trait.tag];
        return name ? [`${name} ${trait.pct}%`] : [];
      });
  const fabric = headlineOnly ? [] : slices.filter(slice => slice.kind === 'material');
  const types = headlineOnly ? [] : slices.filter(slice => slice.kind === 'category');
  const fit = headlineOnly ? undefined : item.fit;

  return (
    <>
      <Card style={styles.hero}>
        <Text variant="h2" align="center" numberOfLines={2}>{brand}</Text>
        <Text
          variant="display"
          align="center"
          style={styles.heroScore}
          accessibilityLabel={`Score ${oneDecimal(insight.score)} out of 5`}
        >
          {oneDecimal(insight.score)}
        </Text>
        <Dots value={insight.score} size={16} />
        <Text variant="caption" color="muted" align="center" style={styles.heroBasis}>
          {BUCKET_LABELS[insight.nBucket]}
        </Text>
      </Card>

      {pieces.length > 0 ? (
        <>
          <SectionTitle>On the pieces</SectionTitle>
          <Card>
            {pieces.map(piece => <React.Fragment key={piece.label}>{piece.node}</React.Fragment>)}
          </Card>
        </>
      ) : null}

      {fit ? (
        <>
          <SectionTitle>How it fits</SectionTitle>
          <Card>
            <FitBar fit={fit} />
          </Card>
        </>
      ) : null}

      {brandRows.length > 0 ? (
        <>
          <SectionTitle>On the brand</SectionTitle>
          <Card>
            {brandRows.map(row => <React.Fragment key={row.label}>{row.node}</React.Fragment>)}
          </Card>
        </>
      ) : null}

      {chips.length > 0 ? (
        <>
          <SectionTitle>People say</SectionTitle>
          <View style={styles.chips}>
            {chips.map(text => (
              <View
                key={text}
                style={[styles.chip, { backgroundColor: theme.colors.accentSubtle, borderColor: theme.colors.border }]}
              >
                <Text variant="bodySmall" weight="500">{text}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {fabric.length > 0 ? (
        <>
          <SectionTitle>By fabric</SectionTitle>
          <SliceRows slices={fabric} />
        </>
      ) : null}

      {types.length > 0 ? (
        <>
          <SectionTitle>By type</SectionTitle>
          <SliceRows slices={types} />
        </>
      ) : null}
    </>
  );
};

// ─── Your take ───────────────────────────────────────────────────────────────

const RatedLines: React.FC<{ rating: BrandRating }> = ({ rating }) => {
  const lines: Array<{ label: string; value: Score | null }> = [
    { label: 'Overall', value: rating.overall },
    { label: 'Quality', value: rating.quality },
    { label: 'Size consistency', value: rating.fitConsistency },
    { label: 'Value', value: rating.value },
  ];
  return (
    <View>
      {lines.map(line =>
        line.value === null ? null : <ScoreRow key={line.label} label={line.label} value={line.value} />,
      )}
    </View>
  );
};

type YourTakeProps = {
  brand: string;
  take: TakeView;
  /** The insight itself failed to load, so one Try again above already covers this card. */
  insightFailed: boolean;
  notice: string | null;
  onRate: () => void;
  onRetry: () => Promise<unknown>;
};

const YourTake: React.FC<YourTakeProps> = ({ brand, take, insightFailed, notice, onRate, onRetry }) => {
  const { theme } = useTheme();
  if (take.kind === 'hidden') {
    return null;
  }

  let content: React.ReactNode;
  if (take.kind === 'loading') {
    content = <Skeleton height={16} width="60%" />;
  } else if (take.kind === 'failed') {
    content = insightFailed ? (
      <Text variant="bodySmall" color="muted">Couldn’t load your rating.</Text>
    ) : (
      <LoadError what="rating" variant="banner" onRetry={onRetry} />
    );
  } else {
    const { summary } = take;
    const rating = summary.brandRating;
    content = (
      <>
        <Text variant="body">
          {summary.itemsRated > 0 && summary.avgOverall !== null
            ? `Your ${brand} pieces: ${oneDecimal(summary.avgOverall)} across ${summary.itemsRated} rated`
            : `You haven’t rated any ${brand} pieces yet.`}
        </Text>
        {rating ? (
          <View style={styles.takeRated}>
            <Text variant="label" color="muted" style={styles.takeLabel}>Your rating</Text>
            <RatedLines rating={rating} />
            <Text variant="caption" color="muted" style={styles.takeStatus}>
              {rating.contributed ? 'Counts toward brand insights' : 'Private to you'}
            </Text>
            <Button
              label="Edit your rating"
              variant="secondary"
              size="md"
              onPress={onRate}
              style={styles.takeButton}
              accessibilityLabel={`Edit your rating of ${brand}`}
            />
          </View>
        ) : summary.canRateBrand ? (
          <Button
            label={`Rate ${brand}`}
            size="md"
            onPress={onRate}
            style={styles.takeButton}
            accessibilityLabel={`Rate ${brand}`}
          />
        ) : (
          <Text variant="bodySmall" color="muted" style={styles.takeLabel}>
            {`Rate ${brand} once you own something from it.`}
          </Text>
        )}
      </>
    );
  }

  return (
    <>
      <SectionTitle>Your take</SectionTitle>
      <Card>
        {content}
        {notice ? (
          <Text
            variant="bodySmall"
            color="muted"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { borderTopColor: theme.colors.border }]}
          >
            {notice}
          </Text>
        ) : null}
      </Card>
    </>
  );
};

// ─── The screen ──────────────────────────────────────────────────────────────

const BrandReportScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { theme } = useTheme();
  const consent = useRatingConsent();

  const rawBrand = (route.params as { brand?: unknown } | undefined)?.brand;
  const brand = typeof rawBrand === 'string' ? rawBrand.trim() : '';
  const key = brandKeyRaw(brand);
  const usable = key !== null && key.length >= 2;

  const [insight, setInsight] = useState<InsightView>({ kind: 'loading' });
  const [take, setTake] = useState<TakeView>({ kind: 'loading' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Learned from a save the server answered with "not worn"; it lasts as long as this screen does.
  const [knownNotWorn, setKnownNotWorn] = useState(false);

  const mounted = useRef(true);
  const loadId = useRef(0);
  const summaryId = useRef(0);
  const reporting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSummary = useCallback(async (): Promise<void> => {
    summaryId.current += 1;
    const id = summaryId.current;
    const result = await settled(() => loadMyBrandSummary(brand));
    if (mounted.current && id === summaryId.current) {
      setTake(takeViewOf(result));
    }
  }, [brand]);

  const load = useCallback(async (): Promise<void> => {
    loadId.current += 1;
    const id = loadId.current;
    summaryId.current += 1;
    const summaryTicket = summaryId.current;
    setInsight({ kind: 'loading' });
    setTake({ kind: 'loading' });
    const [insightResult, summaryResult] = await Promise.all([
      settled(() => loadBrandInsight(brand)),
      settled(() => loadMyBrandSummary(brand)),
    ]);
    if (!mounted.current || id !== loadId.current) {
      return;
    }
    setInsight(insightViewOf(insightResult));
    if (summaryTicket === summaryId.current) {
      setTake(takeViewOf(summaryResult));
    }
  }, [brand]);

  useEffect(() => {
    setKnownNotWorn(false);
    setNotice(null);
    setSheetOpen(false);
    load().catch(() => {});
  }, [load]);

  const openSheet = () => {
    setNotice(null);
    setSheetOpen(true);
  };

  const handleSaved = (outcome: BrandSaveOutcome) => {
    setSheetOpen(false);
    setNotice(blockedLine(outcome.blocked));
    if (outcome.blocked === 'not_worn') {
      setKnownNotWorn(true);
    } else if (outcome.contributed) {
      setKnownNotWorn(false);
    }
    // The cached agreement was out of date: read it again so the sheet offers the right row next time.
    if (outcome.blocked === 'no_consent') {
      consent.refresh().catch(() => {});
    }
    loadSummary().catch(() => {});
  };

  const handleRemoved = () => {
    setSheetOpen(false);
    setNotice(null);
    loadSummary().catch(() => {});
  };

  // ─── "Something look wrong?" ───────────────────────────────────────────────

  const emailSupport = () => {
    const failed = () => Alert.alert('Couldn’t open mail', `You can write to ${SUPPORT_EMAIL}.`);
    try {
      Promise.resolve(Linking.openURL(SUPPORT_MAILTO)).catch(failed);
    } catch {
      failed();
    }
  };

  const sendReport = async (reason: InsightReportReason) => {
    if (reporting.current) {
      return;
    }
    reporting.current = true;
    try {
      await reportBrandInsight(brand, reason);
      Alert.alert(REPORT_THANKS);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Please try again.';
      Alert.alert('Couldn’t send that', message, [
        { text: 'Email us', onPress: emailSupport },
        { text: 'OK', style: 'cancel' },
      ]);
    } finally {
      reporting.current = false;
    }
  };

  const askReport = () => {
    Alert.alert(
      'Something look wrong?',
      'What’s the problem with this score?',
      [
        ...REPORT_REASONS.map(({ reason, label }) => ({ text: label, onPress: () => fire(sendReport(reason)) })),
        // Android shows at most three buttons; a tap outside closes the dialog there.
        ...(Platform.OS === 'ios' ? [{ text: 'Cancel', style: 'cancel' as const }] : []),
      ],
      { cancelable: true },
    );
  };

  // ─── Layout ────────────────────────────────────────────────────────────────

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={styles.headerTitle}>Brand report</Text>
    </View>
  );

  if (insight.kind === 'guest') {
    return (
      <Screen scrollable padded header={header}>
        <Text variant="body" color="muted" style={styles.plain}>{GUEST_TEXT}</Text>
      </Screen>
    );
  }

  if (insight.kind === 'loading') {
    return (
      <Screen scrollable padded header={header}>
        <View accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton height={150} borderRadius={theme.radius.xl} />
          <Skeleton height={20} width="40%" style={styles.skeletonGap} />
          <Skeleton height={110} borderRadius={theme.radius.xl} style={styles.skeletonGap} />
          <Skeleton height={20} width="40%" style={styles.skeletonGap} />
          <Skeleton height={80} borderRadius={theme.radius.xl} style={styles.skeletonGap} />
        </View>
      </Screen>
    );
  }

  const initialRating = take.kind === 'ok' ? take.summary.brandRating : null;

  return (
    <Screen scrollable padded header={header}>
      {!usable ? (
        <Text variant="body" color="muted" style={styles.plain}>{NOTHING_TEXT}</Text>
      ) : (
        <>
          {insight.kind === 'ok' ? <InsightBody brand={brand} insight={insight.insight} /> : null}
          {insight.kind === 'insufficient' ? (
            <Card>
              <Text variant="h4">{NOT_ENOUGH_TEXT}</Text>
            </Card>
          ) : null}
          {insight.kind === 'paused' ? (
            <Card>
              <Text variant="h4">{PAUSED_TEXT}</Text>
            </Card>
          ) : null}
          {insight.kind === 'message' ? (
            <Card>
              <Text variant="body" accessibilityRole="alert">{insight.message}</Text>
            </Card>
          ) : null}
          {insight.kind === 'failed' ? (
            <LoadError what="brand report" title={LOAD_FAILED_TITLE} onRetry={load} />
          ) : null}

          <YourTake
            brand={brand}
            take={take}
            insightFailed={insight.kind === 'failed'}
            notice={notice}
            onRate={openSheet}
            onRetry={loadSummary}
          />

          {insight.kind === 'ok' ? (
            <View style={styles.footer}>
              <Text variant="caption" color="muted">{FOOTER_TEXT}</Text>
              <Pressable
                onPress={askReport}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Something look wrong?"
                style={styles.reportLink}
              >
                <Text variant="bodySmall" color="accent" weight="600">Something look wrong?</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {usable && take.kind === 'ok' ? (
        <RateBrandSheet
          visible={sheetOpen}
          brand={brand}
          initial={initialRating}
          consentGranted={consent.granted}
          onRequestConsent={consent.requestConsent}
          hasWornPiece={knownNotWorn ? false : undefined}
          onClose={() => setSheetOpen(false)}
          onSaved={handleSaved}
          onRemoved={handleRemoved}
        />
      ) : null}
      {consent.sheet}
    </Screen>
  );
};

export default BrandReportScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
  },
  grow: {
    flex: 1,
  },
  plain: {
    marginTop: 24,
    textAlign: 'center',
  },
  skeletonGap: {
    marginTop: 16,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroScore: {
    marginTop: 8,
    marginBottom: 8,
  },
  heroBasis: {
    marginTop: 12,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  scoreNumber: {
    width: 36,
    textAlign: 'right',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  fitBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sliceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  takeRated: {
    marginTop: 12,
  },
  takeLabel: {
    marginTop: 8,
    marginBottom: 4,
  },
  takeStatus: {
    marginTop: 6,
  },
  takeButton: {
    marginTop: 12,
  },
  notice: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    marginTop: 24,
  },
  reportLink: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
    marginTop: 8,
  },
});
