/**
 * RateBrandSheet: rate a whole brand (documentation/design/quality-ratings.md, 3.4 and 6.2). Overall is required;
 * quality, size consistency and value are optional five-dot scales; a row at the bottom lets the rating count
 * toward brand insights. One rating per brand, so a rated brand opens with its stored values and offers
 * "Remove rating". There are no text fields here, so the keyboard guard has nothing to check.
 *
 * Saving always works: asking to count never makes a save fail. When the request cannot count (no agreement in
 * force, nothing of the brand worn) the server keeps the rating private and says why; the host receives that in
 * `onSaved` and tells the person (`blockedLine`).
 *
 * The sheet calls the rating service itself and reports back through callbacks; it never navigates. The default
 * export is a thin wrapper that returns null while ratings are off, so a build with the flag off mounts nothing.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { ratingsActive } from '../config/ratingFlags';
import { BRAND_SCALE_ENDS, type Score } from '../config/ratingVocabulary';
import { deleteBrandRating, saveBrandRating } from '../services/ratingService';
import type { BrandRating, ContributionBlocked } from '../types/rating';
import RatingScale from './RatingScale';

export const BRAND_SAVE_FAILED = 'Couldn’t save your rating. Check your connection and try again.';
export const BRAND_REMOVE_FAILED = 'Couldn’t remove that. Check your connection and try again.';

const NOT_WORN_NOTE = 'Brand insights count brands you have worn something from.';
const SHARED_NOTE = 'Shared without your name, photos or notes.';

/** What the server decided about a request to count, in the words shown to the person. Null when nothing to say. */
export const blockedLine = (blocked: ContributionBlocked | null | undefined): string | null => {
  if (blocked === 'no_consent') {
    return 'Saved privately. Agree to brand insights first to add it.';
  }
  if (blocked === 'not_worn' || blocked === 'no_brand') {
    return `Saved privately. ${NOT_WORN_NOTE}`;
  }
  return null;
};

/** How long to wait for the sheet to finish leaving before asking anyway (iOS reports it; this is only a net). */
const DISMISS_WAIT_MS = 1200;

/**
 * How long to keep this sheet away after the consent sheet answers (iOS only). The consent sheet is still sliding
 * out, and presenting this one in the same instant can be dropped by UIKit, which would leave it gone for good.
 * The slide takes about 0.4 s; this leaves margin over it.
 */
const RETURN_SETTLE_MS = 600;

export type BrandSaveOutcome = { contributed: boolean; blocked: ContributionBlocked | null };

export type RateBrandSheetProps = {
  visible: boolean;
  brand: string;
  /** The stored rating, or null for a first one. */
  initial: BrandRating | null;
  /** null while unknown (loading, guest, offline, function missing); false when not agreed or agreed to older wording. */
  consentGranted: boolean | null;
  /** Opens the consent sheet; resolves true if the person agreed. */
  onRequestConsent: () => Promise<boolean>;
  /**
   * False when the host knows nothing of the brand has been worn: the switch is then disabled with the reason.
   * Leave it out when that is not known; the server decides and a blocked request is saved privately.
   */
  hasWornPiece?: boolean;
  onClose: () => void;
  /** The rating was saved. The outcome says whether it counts and, if not, why. */
  onSaved: (outcome: BrandSaveOutcome) => void;
  onRemoved: () => void;
};

const RateBrandSheet: React.FC<RateBrandSheetProps> = props => (ratingsActive() ? <RateBrandSheetInner {...props} /> : null);

export default RateBrandSheet;

const errorText = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/** Starts work whose outcome the caller does not wait for; the work reports its own failures. */
const fire = (work: Promise<unknown>): void => {
  work.catch(() => {});
};

function RateBrandSheetInner({
  visible,
  brand,
  initial,
  consentGranted,
  onRequestConsent,
  hasWornPiece,
  onClose,
  onSaved,
  onRemoved,
}: RateBrandSheetProps) {
  const { theme } = useTheme();
  const label = brand.trim();

  const [overall, setOverall] = useState<Score | null>(initial?.overall ?? null);
  const [quality, setQuality] = useState<Score | null>(initial?.quality ?? null);
  const [fitConsistency, setFitConsistency] = useState<Score | null>(initial?.fitConsistency ?? null);
  const [value, setValue] = useState<Score | null>(initial?.value ?? null);
  // A new rating counts by default once the person has agreed; a stored one keeps the choice it was made with.
  const [counts, setCounts] = useState<boolean>(initial ? initial.contributed : true);
  const [agreedHere, setAgreedHere] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The sheet steps aside while the consent sheet is up: a phone shows one modal at a time.
  const [asking, setAsking] = useState(false);

  const mounted = useRef(true);
  const busyRef = useRef(false);
  const askingRef = useRef(false);
  const wasVisible = useRef(false);
  const afterDismiss = useRef<(() => void) | null>(null);
  // The wait after the consent sheet answers has its own timer and release: a stray onDismiss must not cut it short.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleRelease = useRef<(() => void) | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      afterDismiss.current?.();
      afterDismiss.current = null;
      if (settleTimer.current !== null) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      settleRelease.current?.();
      settleRelease.current = null;
    };
  }, []);

  // Every opening starts from what is stored; edits made while the sheet stays open are never overwritten.
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setOverall(initial?.overall ?? null);
      setQuality(initial?.quality ?? null);
      setFitConsistency(initial?.fitConsistency ?? null);
      setValue(initial?.value ?? null);
      setCounts(initial ? initial.contributed : true);
      setAgreedHere(false);
      setError(null);
    }
    wasVisible.current = visible;
  }, [visible, initial]);

  const granted = agreedHere || consentGranted === true;
  const noWornPiece = hasWornPiece === false;
  /** The switch can be used only with an agreement in force and something of the brand worn. */
  const switchLive = granted && !noWornPiece;

  const close = useCallback(() => {
    if (!busyRef.current && !askingRef.current) {
      onClose();
    }
  }, [onClose]);

  const save = async () => {
    if (busyRef.current || overall === null) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    let outcome: BrandSaveOutcome;
    try {
      outcome = await saveBrandRating(label, {
        overall,
        quality,
        fitConsistency,
        value,
        // Sent only when the person could choose; otherwise the stored choice is kept (a first save is private).
        ...(switchLive ? { contribute: counts } : {}),
      });
    } catch (thrown) {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setError(errorText(thrown, BRAND_SAVE_FAILED));
      }
      return;
    }
    busyRef.current = false;
    if (mounted.current) {
      setBusy(false);
      onSaved(outcome);
    }
  };

  const remove = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await deleteBrandRating(label);
    } catch (thrown) {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setError(errorText(thrown, BRAND_REMOVE_FAILED));
      }
      return;
    }
    busyRef.current = false;
    if (mounted.current) {
      setBusy(false);
      onRemoved();
    }
  };

  const confirmRemove = () => {
    if (busyRef.current) {
      return;
    }
    Alert.alert('Remove your rating?', `This deletes your rating of ${label}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => fire(remove()) },
    ]);
  };

  const askConsent = async () => {
    if (askingRef.current || busyRef.current) {
      return;
    }
    askingRef.current = true;
    setAsking(true);
    // iOS presents one modal at a time: wait until this one has left before the consent sheet comes up.
    if (Platform.OS === 'ios') {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, DISMISS_WAIT_MS);
        afterDismiss.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      afterDismiss.current = null;
    }
    // Unmounted while waiting: nothing is left to ask for.
    if (!mounted.current) {
      askingRef.current = false;
      return;
    }
    let agreed = false;
    try {
      agreed = await onRequestConsent();
    } catch {
      agreed = false;
    }
    if (!mounted.current) {
      askingRef.current = false;
      return;
    }
    // These touch no native modal, so they can show at once.
    if (agreed) {
      setAgreedHere(true);
      setCounts(true);
    }
    // iOS: the consent sheet is still leaving, so this one comes back only after it has settled. It stays "asking"
    // until then, which also keeps it from being closed in the gap.
    if (Platform.OS === 'ios') {
      await new Promise<void>(resolve => {
        settleRelease.current = resolve;
        settleTimer.current = setTimeout(resolve, RETURN_SETTLE_MS);
      });
      settleTimer.current = null;
      settleRelease.current = null;
    }
    askingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setAsking(false);
  };

  const scale = (
    title: string,
    scaleLabel: string,
    current: Score | null,
    set: (next: Score | null) => void,
    ends: readonly [string, string],
    optional: boolean,
  ) => (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text variant="h4" style={styles.grow}>{title}</Text>
        {optional ? <Text variant="caption" color="subtle">Optional</Text> : null}
      </View>
      <RatingScale
        value={current}
        // A scale that is being saved stops answering; the optional ones can be cleared by choosing the value again.
        onChange={busy ? undefined : next => set(optional && next === current ? null : next)}
        onClear={optional ? () => set(null) : undefined}
        variant="dots"
        size="lg"
        accessibilityLabel={scaleLabel}
        endLabels={ends}
        allowClear={optional}
      />
    </View>
  );

  let contributionRow: React.ReactNode = null;
  if (switchLive) {
    contributionRow = (
      <View style={[styles.switchRow, { borderTopColor: theme.colors.border }]}>
        <View style={styles.grow}>
          <Text variant="body" weight="500">Count toward brand insights</Text>
          <Text variant="caption" color="muted">{SHARED_NOTE}</Text>
        </View>
        <Switch
          value={counts}
          onValueChange={setCounts}
          disabled={busy}
          accessibilityLabel="Count toward brand insights"
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor="#FFFFFF"
        />
      </View>
    );
  } else if (granted) {
    // Agreed, but nothing of the brand has been worn: the switch is there, off, with the reason.
    contributionRow = (
      <View style={[styles.switchRow, { borderTopColor: theme.colors.border }]}>
        <View style={styles.grow}>
          <Text variant="body" weight="500" color="muted">Count toward brand insights</Text>
          <Text variant="caption" color="muted">{NOT_WORN_NOTE}</Text>
        </View>
        <Switch
          value={false}
          disabled
          accessibilityLabel="Count toward brand insights"
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor="#FFFFFF"
        />
      </View>
    );
  } else if (consentGranted === false) {
    contributionRow = (
      <View style={[styles.switchRow, { borderTopColor: theme.colors.border }]}>
        <Button
          label="Add to brand insights..."
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={() => fire(askConsent())}
          accessibilityLabel="Add to brand insights"
        />
      </View>
    );
  }

  return (
    <Modal
      visible={visible && !asking}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      onDismiss={() => {
        afterDismiss.current?.();
      }}
    >
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text variant="h3" numberOfLines={2}>{`Rate ${label}`}</Text>
          <Text variant="bodySmall" color="muted" style={styles.sub}>
            One rating for the whole brand. You can change or remove it any time.
          </Text>
        </View>

        <ScrollView style={styles.grow} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {scale('Overall', 'Overall rating', overall, setOverall, BRAND_SCALE_ENDS.overall, false)}
          {scale('Quality', 'Quality', quality, setQuality, BRAND_SCALE_ENDS.quality, true)}
          {scale('Size consistency', 'Size consistency', fitConsistency, setFitConsistency, BRAND_SCALE_ENDS.fitConsistency, true)}
          {scale('Value', 'Value', value, setValue, BRAND_SCALE_ENDS.value, true)}
          {contributionRow}
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
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Button
            label="Save"
            fullWidth
            disabled={overall === null}
            loading={busy}
            onPress={() => fire(save())}
            accessibilityLabel="Save"
          />
          <Button label="Cancel" variant="secondary" fullWidth disabled={busy} onPress={close} accessibilityLabel="Cancel" />
          {initial ? (
            <Button
              label="Remove rating"
              variant="ghost"
              fullWidth
              disabled={busy}
              onPress={confirmRemove}
              textStyle={{ color: theme.colors.danger }}
              accessibilityLabel="Remove rating"
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  grow: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sub: {
    marginTop: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  block: {
    marginBottom: 22,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  error: {
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
