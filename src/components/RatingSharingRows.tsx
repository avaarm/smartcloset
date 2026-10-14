/**
 * RatingSharingRows: the rating rows of Settings > Community (documentation/design/quality-ratings.md, 3.5).
 *
 * Phase 2 (ratings on) shows "Delete all my ratings". Phase 3 (brand insights on) adds the switch and
 * "Remove what I’ve added". With ratings off nothing renders and nothing runs: the default export is a thin
 * wrapper and the hooks live in the inner components, so no consent read or session call happens until a
 * flag is on. The host renders it for signed-in people only.
 *
 * Look: Settings still uses hard-coded colours, so the rows copy its toggle-row metrics.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { brandInsightsActive, ratingsActive } from '../config/ratingFlags';
import { RATINGS_POLICY_VERSION } from '../config/ratingVocabulary';
import { setConsent } from '../services/consentService';
import { deleteAllMyRatings, withdrawContributions } from '../services/ratingService';
import { announceConsent, useRatingConsent } from './RatingConsentSheet';

const GOLD = '#C4975A';
const INK = '#100E0B';
const IVORY = '#FDFAF5';
const BORDER = '#EDE5D8';
const TEXT_MUTED = '#6B5F52';
const DANGER = '#C0392B';

const GENERIC_FAILURE = 'Couldn’t save that. Check your connection and try again.';

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : GENERIC_FAILURE;

/** Starts work whose outcome the caller does not wait for; the work reports its own failures. */
const fire = (work: Promise<unknown>): void => {
  work.catch(() => {});
};

const RatingSharingRows: React.FC = () => (ratingsActive() ? <RatingSharingRowsInner /> : null);
export default RatingSharingRows;

function RatingSharingRowsInner() {
  return brandInsightsActive() ? <InsightRows /> : <DeleteAllOnly />;
}

// ─── What the rows do ────────────────────────────────────────────────────────

/** The agreement is gone but the delete failed: said differently from a plain failure. */
class PartialStop extends Error {}

type Notice = { title: string; message: string };

/** Runs one change at a time, tells the person how it went, and never sets state after unmount. */
function useSharingActions(afterChange?: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (work: () => Promise<void>, done?: Notice) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      let failure: Notice | null = null;
      try {
        await work();
      } catch (error) {
        failure =
          error instanceof PartialStop
            ? { title: 'Stopped, but not deleted', message: error.message }
            : { title: 'Couldn’t save that', message: messageOf(error) };
      }
      try {
        // Whatever happened, show what the server now holds: a partial change must not look like none.
        await afterChange?.();
      } catch {
        // The change itself is what matters; a failed refresh only leaves the old picture until the next read.
      }
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
      }
      const notice = failure ?? done;
      if (notice) {
        Alert.alert(notice.title, notice.message);
      }
    },
    [afterChange],
  );

  const removeAdded = useCallback(
    () =>
      run(() => withdrawContributions(), {
        title: 'Removed',
        message: 'Your ratings no longer count toward brand insights. They are still saved for you.',
      }),
    [run],
  );

  const deleteAll = useCallback(
    () => run(() => deleteAllMyRatings(), { title: 'Ratings deleted', message: 'All your ratings were deleted.' }),
    [run],
  );

  /** Withdraws the agreement (which takes every contribution out of the scores); optionally deletes the ratings too. */
  const stopAdding = useCallback(
    (alsoDelete: boolean) =>
      run(async () => {
        await setConsent('share_ratings', false, { policyVersion: RATINGS_POLICY_VERSION });
        // The agreement is gone on the server. Tell every screen now, so a delete that fails below, or a read
        // that fails afterwards, cannot leave one of them showing it as still on.
        announceConsent(false);
        if (!alsoDelete) {
          return;
        }
        try {
          await deleteAllMyRatings();
        } catch {
          throw new PartialStop(
            'Your ratings no longer count toward brand insights, but they couldn’t be deleted. Try Delete all my ratings again.',
          );
        }
      }),
    [run],
  );

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      'Delete all your ratings?',
      'This deletes every item and brand rating you’ve made, including any added to brand insights. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete all', style: 'destructive', onPress: () => fire(deleteAll()) },
      ],
    );
  }, [deleteAll]);

  const confirmStop = useCallback(() => {
    Alert.alert(
      'Stop adding your ratings?',
      'Your ratings stop counting toward brand insights right away. They stay private to you unless you delete them too. Scores others have already seen can’t be recalled.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop adding', onPress: () => fire(stopAdding(false)) },
        { text: 'Stop and delete my ratings', style: 'destructive', onPress: () => fire(stopAdding(true)) },
      ],
    );
  }, [stopAdding]);

  return { busy, removeAdded, confirmDeleteAll, confirmStop };
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function DeleteAllOnly() {
  const actions = useSharingActions();
  return <DeleteAllRow busy={actions.busy} onPress={actions.confirmDeleteAll} />;
}

function InsightRows() {
  const consent = useRatingConsent();
  const { refresh } = consent;
  // After a change, a read that fails must not turn an answer we know into "off".
  const reread = useCallback(() => refresh({ keepKnown: true }), [refresh]);
  const actions = useSharingActions(reread);

  // The consent functions are not on the server yet: the rows would only fail.
  if (!consent.available) {
    return null;
  }

  const onSwitch = (next: boolean) => {
    if (next) {
      fire(consent.requestConsent());
    } else {
      actions.confirmStop();
    }
  };

  return (
    <>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>Add my ratings to brand insights</Text>
          <Text style={styles.toggleDesc}>
            Off by default. Includes your star ratings and the feel, comfort and fit choices you pick, never your name, photos or notes.
          </Text>
        </View>
        <Switch
          value={consent.granted === true}
          onValueChange={onSwitch}
          // Disabled only while the answer is on its way. If it could not be loaded the switch reads off and a
          // tap tries again through the consent sheet, which says why when it fails.
          disabled={consent.loading === true || actions.busy}
          accessibilityLabel="Add my ratings to brand insights"
          trackColor={{ false: BORDER, true: GOLD }}
          thumbColor={IVORY}
        />
      </View>
      <ActionRow
        label="Remove what I’ve added"
        description="Takes your ratings out of brand insights. They stay saved for you."
        busy={actions.busy}
        onPress={() => fire(actions.removeAdded())}
      />
      <DeleteAllRow busy={actions.busy} onPress={actions.confirmDeleteAll} />
      {consent.sheet}
    </>
  );
}

function DeleteAllRow({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <ActionRow
      label="Delete all my ratings"
      description="Deletes every rating you’ve made."
      destructive
      busy={busy}
      onPress={onPress}
    />
  );
}

function ActionRow({
  label,
  description,
  destructive,
  busy,
  onPress,
}: {
  label: string;
  description: string;
  destructive?: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      style={[styles.actionRow, busy && styles.busy]}
    >
      <Text style={[styles.toggleLabel, destructive && styles.destructiveLabel]}>{label}</Text>
      <Text style={styles.toggleDesc}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  toggleText: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: INK,
    marginBottom: 3,
  },
  toggleDesc: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },
  actionRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  destructiveLabel: {
    color: DANGER,
  },
  busy: {
    opacity: 0.5,
  },
});
