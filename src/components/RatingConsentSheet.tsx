/**
 * RatingConsentSheet and useRatingConsent: the one place a person agrees to add their ratings to brand
 * insights (documentation/design/quality-ratings.md, 3.5 and 6.2).
 *
 * The sheet only presents; the hook owns the server-held answer (`share_ratings` in user_consents), loads it,
 * opens the sheet on request and records the agreement. Nothing opens the sheet by itself, so "Not now" needs
 * no stored state to avoid nagging: it records nothing and the sheet only comes back when the person asks.
 * No text fields here, so the keyboard guard has nothing to check.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { PRIVACY_POLICY_URL } from '../config/legal';
import { RATING_GUIDELINES } from '../config/ratingGuidelines';
import { RATINGS_POLICY_VERSION } from '../config/ratingVocabulary';
import { getConsent, setConsent, type ConsentStatus } from '../services/consentService';
import { loadMyRatingCounts } from '../services/ratingService';
import type { Loaded, RatingCounts } from '../types/rating';

const TITLE = 'Add your ratings to brand insights?';
const BODY =
  'Members can see how a brand’s pieces feel, wear and fit, using ratings from people who choose to add theirs. ' +
  'Your scores and chosen words are included, never your name, photos or notes. ' +
  'A score appears only once at least 10 established members have added theirs.';
const SMALL_PRINT =
  'You can stop any time in Settings. Scores others have already seen can’t be recalled.';
const NOT_AVAILABLE = 'This isn’t available yet.';
const SAVE_FAILED = 'Couldn’t save that. Check your connection and try again.';

export type RatingConsentSheetProps = {
  visible: boolean;
  requiresAdult: boolean;
  /** Ratings the person already made that are not contributing; the third button shows only when above 0. */
  pastRatings: number;
  busy: boolean;
  error: string | null;
  onAgree: (opts: { includeExisting: boolean }) => void;
  onNotNow: () => void;
};

export const RatingConsentSheet: React.FC<RatingConsentSheetProps> = ({
  visible,
  requiresAdult,
  pastRatings,
  busy,
  error,
  onAgree,
  onNotNow,
}) => {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const [adult, setAdult] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [chosen, setChosen] = useState<'new' | 'past' | null>(null);

  // Every opening starts clean: the 18+ answer is never carried over from an earlier look at the sheet.
  useEffect(() => {
    if (visible) {
      setAdult(false);
      setGuidelinesOpen(false);
      setChosen(null);
    }
  }, [visible]);

  const canAgree = !busy && (!requiresAdult || adult);

  const agree = (includeExisting: boolean) => {
    if (!canAgree) {
      return;
    }
    setChosen(includeExisting ? 'past' : 'new');
    onAgree({ includeExisting });
  };

  // A backdrop tap or the Android back button must not walk away from a save in progress.
  const dismiss = () => {
    if (!busy) {
      onNotNow();
    }
  };

  const openPrivacy = () => {
    const failed = () =>
      Alert.alert('Couldn’t open the page', `You can read it at ${PRIVACY_POLICY_URL}.`);
    try {
      Promise.resolve(Linking.openURL(PRIVACY_POLICY_URL)).catch(failed);
    } catch {
      failed();
    }
  };

  return (
    <Sheet visible={visible} onClose={dismiss} title={TITLE}>
      <ScrollView style={{ maxHeight: Math.round(height * 0.4) }}>
        <Text variant="body">{BODY}</Text>
        <Text variant="caption" color="muted" style={styles.smallPrint}>{SMALL_PRINT}</Text>
        <Pressable
          onPress={openPrivacy}
          accessibilityRole="link"
          accessibilityLabel="How this works"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.linkRow}
        >
          <Text variant="bodySmall" color="accent" weight="600">How this works</Text>
        </Pressable>

        <Pressable
          onPress={() => setGuidelinesOpen(open => !open)}
          accessibilityRole="button"
          accessibilityLabel="Rating guidelines"
          accessibilityState={{ expanded: guidelinesOpen }}
          style={[styles.guidelinesRow, { borderTopColor: theme.colors.border }]}
        >
          <Text variant="body" weight="500" style={styles.grow}>Rating guidelines</Text>
          <Icon name={guidelinesOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
        </Pressable>
        {guidelinesOpen ? (
          <View style={styles.rules}>
            <Text variant="label" color="muted" style={styles.rulesTitle}>{RATING_GUIDELINES.title}</Text>
            {RATING_GUIDELINES.rules.map(rule => (
              <View key={rule} style={styles.ruleRow}>
                <Text variant="body" style={styles.bullet}>•</Text>
                <Text variant="body" style={styles.grow}>{rule}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {requiresAdult ? (
        <View style={[styles.adultRow, { borderTopColor: theme.colors.border }]}>
          <Text variant="body" weight="500" style={styles.adultLabel}>I’m 18 or older</Text>
          <Switch
            value={adult}
            onValueChange={setAdult}
            disabled={busy}
            accessibilityLabel="I’m 18 or older"
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      ) : null}

      {error ? (
        <Text
          variant="bodySmall"
          color="danger"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {error}
        </Text>
      ) : null}

      <View style={styles.buttons}>
        <Button label="Not now" variant="secondary" fullWidth disabled={busy} onPress={dismiss} />
        <Button
          label="Add new ratings"
          variant="secondary"
          fullWidth
          disabled={!canAgree}
          loading={busy && chosen === 'new'}
          onPress={() => agree(false)}
        />
        {pastRatings > 0 ? (
          <Button
            label={`Add new and past ratings (${pastRatings})`}
            variant="secondary"
            fullWidth
            disabled={!canAgree}
            loading={busy && chosen === 'past'}
            onPress={() => agree(true)}
          />
        ) : null}
      </View>
    </Sheet>
  );
};

export default RatingConsentSheet;

// ─── The hook ────────────────────────────────────────────────────────────────

export interface RatingConsentApi {
  /**
   * null while loading, for guests, when the first read failed (offline or error), or when the server function is
   * missing. false when not agreed OR agreed to older wording.
   */
  granted: boolean | null;
  /** The person agreed to older wording: ask again with the same sheet. */
  needsReconsent: boolean;
  /** False only when the server function is missing. */
  available: boolean;
  requiresAdult: boolean;
  /** True until the first answer (or failure) arrives; lets a host tell "still loading" from "could not load". */
  loading: boolean;
  /**
   * Reads the answer again. Plain, a failed read reports "unknown" (null), which is right after a block that proved
   * the cached answer wrong. keepKnown is for a caller that only confirms a change it just made: if the read
   * fails it keeps the answer already shown, because a failed read says nothing about the answer.
   */
  refresh: (opts?: { keepKnown?: boolean }) => Promise<void>;
  /** Opens the sheet; resolves true if the person agreed. */
  requestConsent: () => Promise<boolean>;
  /** Render once in the host component. */
  sheet: React.ReactElement | null;
}

interface ConsentView {
  loading: boolean;
  granted: boolean | null;
  needsReconsent: boolean;
  available: boolean;
  requiresAdult: boolean;
  pastRatings: number;
}

// Until the server says otherwise the adult confirmation is assumed to apply: the sheet asks, never skips.
const INITIAL_VIEW: ConsentView = {
  loading: true,
  granted: null,
  needsReconsent: false,
  available: true,
  requiresAdult: true,
  pastRatings: 0,
};

/** A read that failed in any way, including a mock that returns nothing, is just an error state. */
const settled = async <T,>(read: () => Promise<Loaded<T>>): Promise<Loaded<T>> => {
  try {
    const result = await read();
    return result && typeof result === 'object' && 'state' in result ? result : { state: 'error' };
  } catch {
    return { state: 'error' };
  }
};

const fromConsent = (prev: ConsentView, result: Loaded<ConsentStatus | null>, keepKnown: boolean): ConsentView => {
  if (result.state === 'ok') {
    const status = result.value;
    // The server answered but does not know this purpose: nothing can be agreed to here.
    if (!status) {
      return { ...prev, granted: null, needsReconsent: false, available: false };
    }
    return {
      ...prev,
      // An agreement to older wording counts as not agreed.
      granted: status.granted === true && !status.needsReconsent,
      needsReconsent: status.needsReconsent,
      available: true,
      requiresAdult: status.requiresAdult,
    };
  }
  if (result.state === 'unavailable') {
    return { ...prev, granted: null, needsReconsent: false, available: false };
  }
  // Only a caller that just changed the answer asks for this; the first load and a guest still show "unknown".
  if (keepKnown && !prev.loading && result.state !== 'guest') {
    return prev;
  }
  return { ...prev, granted: null, needsReconsent: false, available: true };
};

const fromCounts = (prev: ConsentView, result: Loaded<RatingCounts>): ConsentView =>
  result.state === 'ok' ? { ...prev, pastRatings: result.value.notContributing } : prev;

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : SAVE_FAILED;

// Every mounted host keeps its own copy of the answer, and a tab stays mounted after its first visit. A change the
// server has confirmed is passed to all of them, so none keeps showing the old answer. Nothing runs at import time.
const listeners = new Set<(granted: boolean) => void>();

/** Tells every mounted host that the server now holds this answer. No network call. */
export const announceConsent = (granted: boolean): void => {
  listeners.forEach(listener => listener(granted));
};

export function useRatingConsent(): RatingConsentApi {
  const [view, setView] = useState<ConsentView>(INITIAL_VIEW);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewRef = useRef<ConsentView>(INITIAL_VIEW);
  const mounted = useRef(true);
  const loadId = useRef(0);
  const busyRef = useRef(false);
  const pending = useRef<{ promise: Promise<boolean>; settle: (agreed: boolean) => void } | null>(null);

  const apply = useCallback((update: (prev: ConsentView) => ConsentView) => {
    viewRef.current = update(viewRef.current);
    setView(viewRef.current);
  }, []);

  const refresh = useCallback(async (opts?: { keepKnown?: boolean }): Promise<void> => {
    const keepKnown = opts?.keepKnown === true;
    loadId.current += 1;
    const id = loadId.current;
    const [consent, counts] = await Promise.all([
      settled(() => getConsent('share_ratings')),
      settled(() => loadMyRatingCounts()),
    ]);
    // A newer load, or an unmounted host, wins over this answer.
    if (!mounted.current || id !== loadId.current) {
      return;
    }
    apply(prev => ({ ...fromCounts(fromConsent(prev, consent, keepKnown), counts), loading: false }));
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    const onAnnounced = (granted: boolean) => {
      if (!mounted.current) {
        return;
      }
      // A read that started before this change must not put the old answer back. Such a read may be the first
      // one, so the host is no longer loading either, or its switch would stay disabled.
      loadId.current += 1;
      apply(prev => ({ ...prev, granted, needsReconsent: false, available: true, loading: false }));
    };
    listeners.add(onAnnounced);
    refresh().catch(() => {});
    return () => {
      listeners.delete(onAnnounced);
      mounted.current = false;
      loadId.current += 1;
      // Nobody is left to read the answer; do not leave a caller waiting on it.
      pending.current?.settle(false);
      pending.current = null;
    };
  }, [refresh, apply]);

  const closeSheet = useCallback((agreed: boolean) => {
    const waiting = pending.current;
    pending.current = null;
    if (mounted.current) {
      setOpen(false);
    }
    waiting?.settle(agreed);
  }, []);

  const requestConsent = useCallback((): Promise<boolean> => {
    if (!mounted.current) {
      return Promise.resolve(false);
    }
    // A second request while the sheet is up shares the answer of the first.
    if (pending.current) {
      return pending.current.promise;
    }
    let settle: (agreed: boolean) => void = () => {};
    const promise = new Promise<boolean>(resolve => {
      settle = resolve;
    });
    pending.current = { promise, settle };
    busyRef.current = false;
    setBusy(false);
    setError(viewRef.current.available ? null : NOT_AVAILABLE);
    setOpen(true);
    // Ratings may have been made since this screen loaded; keep the "past ratings" count current.
    const id = loadId.current;
    settled(() => loadMyRatingCounts()).then(counts => {
      if (mounted.current && id === loadId.current) {
        apply(prev => fromCounts(prev, counts));
      }
    });
    return promise;
  }, [apply]);

  const onAgree = useCallback(
    async ({ includeExisting }: { includeExisting: boolean }): Promise<void> => {
      if (busyRef.current || !pending.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        await setConsent('share_ratings', true, {
          policyVersion: RATINGS_POLICY_VERSION,
          adult: true,
          includeExisting,
        });
      } catch (thrown) {
        busyRef.current = false;
        if (mounted.current) {
          setBusy(false);
          setError(messageOf(thrown));
        }
        return;
      }
      busyRef.current = false;
      // Before the unmount check: the other screens should hear of it even if this one was left meanwhile. This
      // host hears it too, which also ends its own "loading" when the first read is still out.
      announceConsent(true);
      if (!mounted.current) {
        return;
      }
      // The server has the answer now. Show it without another round trip that could fail and blank the
      // state, and drop any read that started before the agreement so it cannot put the old answer back.
      loadId.current += 1;
      apply(prev => ({
        ...prev,
        granted: true,
        needsReconsent: false,
        available: true,
        pastRatings: includeExisting ? 0 : prev.pastRatings,
      }));
      setBusy(false);
      closeSheet(true);
    },
    [apply, closeSheet],
  );

  // "Not now" records nothing, anywhere.
  const onNotNow = useCallback(() => {
    if (busyRef.current) {
      return;
    }
    closeSheet(false);
  }, [closeSheet]);

  const sheet = (
    <RatingConsentSheet
      visible={open}
      requiresAdult={view.requiresAdult}
      pastRatings={view.pastRatings}
      busy={busy}
      error={error}
      onAgree={opts => {
        onAgree(opts).catch(() => {});
      }}
      onNotNow={onNotNow}
    />
  );

  return {
    granted: view.granted,
    needsReconsent: view.needsReconsent,
    available: view.available,
    requiresAdult: view.requiresAdult,
    loading: view.loading,
    refresh,
    requestConsent,
    sheet,
  };
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  smallPrint: {
    marginTop: 12,
  },
  linkRow: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  guidelinesRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  rules: {
    paddingBottom: 8,
  },
  rulesTitle: {
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    width: 16,
  },
  adultRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    marginBottom: 8,
  },
  adultLabel: {
    flex: 1,
    marginRight: 12,
  },
  error: {
    marginBottom: 8,
  },
  buttons: {
    gap: 10,
  },
});
