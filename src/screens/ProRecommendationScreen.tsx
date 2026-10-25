/**
 * ProRecommendationScreen: one look, written by a stylist for a client (documentation/design/pro-accounts.md 7.7).
 *
 * The client reads it (opening a sent look is what marks it viewed, on the server), rates it, says what they
 * thought and says whether they wore it. The stylist reads a sent look with the client's rating and comment, if
 * there are any. What each person may do comes from `actions` in the answer; this screen only draws the controls
 * it is told about, and an ended connection arrives with all of them off.
 *
 * Feedback saves as it is given: a rating on a tap, "I wore this" on the switch, the comment with its own
 * button. After each save the look is read again, so the screen shows what the server holds.
 *
 * Reading a look on a connection that is still active is refused while professional features are paused, the
 * account is suspended or the terms are out of date; an ended one is never refused (the safety gate, 4.1). The
 * report and block menu stays available in every one of those states.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Input, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import { KeyboardActionBar } from '../components/KeyboardSafe';
import ProAccessNotice from '../components/ProAccessNotice';
import ProItemTile from '../components/ProItemTile';
import ProPhoto from '../components/ProPhoto';
import ProSafetySheet from '../components/ProSafetySheet';
import ProStatusBadge from '../components/ProStatusBadge';
import ProTermsSheet from '../components/ProTermsSheet';
import RatingScale from '../components/RatingScale';
import { proUpdateMessage, useProAccess } from '../hooks/useProAccess';
import { getProConnection, getProLook, giveLookFeedback } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import { PRO_PAUSED_MESSAGE, PRO_SUSPENDED_MESSAGE, PRO_TEXT_LIMITS } from '../config/proRules';
import { closedExplanation, connectionTitle } from '../utils/proFormat';
import type { Score } from '../config/ratingVocabulary';
import type { ProConnectionDetail, ProLookDetail, ProRole } from '../types/pro';
import type { ProRecommendationParams } from '../types/proRoutes';

/**
 * The comment field's own keyboard accessory. ProSafetySheet, which this screen opens while the field is
 * mounted, renders the shared Done bar; two accessory views with one id on screen can leave the field without
 * its bar when the sheet closes, so the field does not use the shared id.
 */
export const PRO_COMMENT_ACCESSORY_ID = 'smartcloset-pro-comment-done';

type Phase = 'loading' | 'ready' | 'gone' | 'failed' | 'restricted';
type Restriction = 'pro_disabled' | 'pro_suspended' | 'pro_terms_required';
type Busy = 'rating' | 'comment' | 'worn' | null;
type Retry = { run: () => Promise<void>; fallback: string };
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  );

const validScore = (value: number | undefined): Score | null =>
  value !== undefined && Number.isInteger(value) && value >= 1 && value <= 5 ? (value as Score) : null;

const sentOn = (iso: string | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `Sent ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

const ProRecommendationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();
  const { recId, connectionId } = (route.params ?? {}) as Partial<ProRecommendationParams>;

  const [look, setLook] = useState<ProLookDetail | null>(null);
  const [detail, setDetail] = useState<ProConnectionDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [restricted, setRestricted] = useState<Restriction | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const alive = useRef(true);
  // Responses can arrive out of order; one that started before an already-applied response is dropped.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const retryRef = useRef<Retry | null>(null);
  // True once the person has typed in the comment field: a reload then leaves their words alone.
  const commentDirty = useRef(false);
  const accessRef = useRef(access);
  accessRef.current = access;
  const detailRef = useRef(detail);
  detailRef.current = detail;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // The look and the connection can be read while paused or suspended (an ended connection stays readable); the
  // server says when an active one cannot. An access check that fails while the look is on screen (offline) does
  // not take the look away.
  const canRead =
    access.state === 'ready' || access.state === 'paused' || access.state === 'suspended' ||
    (access.state === 'error' && phase === 'ready');

  const readFailed = useCallback((error: unknown) => {
    const err = toProError(error);
    if (err.code === 'pro_unavailable') {
      setPhase('gone');
      return;
    }
    if (err.code === 'pro_disabled' || err.code === 'pro_suspended' || err.code === 'pro_terms_required') {
      setRestricted(err.code);
      setPhase('restricted');
      refresh();
      return;
    }
    if (err.code === 'not_authenticated' || err.code === 'not_deployed') refresh();
    setRefreshFailed(true);
    setPhase(p => (p === 'loading' ? 'failed' : p));
  }, [refresh]);

  const load = useCallback(async () => {
    if (!recId || !connectionId) {
      setPhase('gone');
      return;
    }
    const mine = ++requestSeq.current;
    const [lookResult, connection] = await Promise.all([
      settle(getProLook(recId)),
      settle(getProConnection(connectionId)),
    ]);
    if (!alive.current || mine < appliedSeq.current) return;
    appliedSeq.current = mine;
    if (connection.ok) setDetail(connection.value);
    else if (toProError(connection.error).code === 'pro_unavailable') {
      setPhase('gone');
      return;
    }
    if (lookResult.ok) {
      setLook(lookResult.value);
      if (!commentDirty.current) setCommentDraft(lookResult.value.feedback?.comment ?? '');
      setRestricted(null);
      setPhase('ready');
      setRefreshFailed(false);
    } else {
      readFailed(lookResult.error);
    }
  }, [recId, connectionId, readFailed]);

  useFocusEffect(
    useCallback(() => {
      if (canRead) load();
      return undefined;
    }, [canRead, load]),
  );

  /** The update line when the build's terms are older or newer than the server's, else null. */
  const updateMessage = useCallback((): string | null => {
    const a = accessRef.current;
    if (a.state !== 'ready') return null;
    const role: ProRole = detailRef.current?.myRole ?? 'client';
    return a[role] === 'update_required' ? proUpdateMessage(a.status, role) : null;
  }, []);

  /**
   * Runs a write. A failure becomes a short alert; a look that moved on is reloaded; and if the server says the
   * terms moved on, the terms sheet opens and the same write runs again once the person has agreed.
   */
  const guarded = useCallback(
    async (run: () => Promise<void>, fallback: string): Promise<void> => {
      try {
        await run();
      } catch (e) {
        if (!alive.current) return;
        const err = toProError(e);
        if (err.code === 'pro_terms_required') {
          const update = updateMessage();
          if (update) {
            Alert.alert("Couldn't do that", update);
            return;
          }
          retryRef.current = { run, fallback };
          setTermsOpen(true);
          return;
        }
        Alert.alert("Couldn't do that", proErrorMessage(err, fallback));
        if (err.code === 'connection_ended') load();
        else if (err.code === 'pro_unavailable') setPhase('gone');
      }
    },
    [load, updateMessage],
  );

  const onTermsAccepted = () => {
    setTermsOpen(false);
    refresh();
    const retry = retryRef.current;
    retryRef.current = null;
    if (retry) guarded(retry.run, retry.fallback);
    else load();
  };

  const onTermsClosed = () => {
    retryRef.current = null;
    setTermsOpen(false);
  };

  // ── feedback ───────────────────────────────────────────────────────────────

  const saveFeedback = (input: { rating?: number; comment?: string; worn?: boolean }, which: Exclude<Busy, null>, fallback: string) => {
    if (!recId || busy) return;
    guarded(async () => {
      setBusy(which);
      try {
        await giveLookFeedback(recId, input);
        if (which === 'comment') commentDirty.current = false;
        await load();
      } finally {
        if (alive.current) setBusy(null);
      }
    }, fallback);
  };

  const rate = (score: Score) => saveFeedback({ rating: score }, 'rating', "Couldn't save your rating. Please try again.");
  const saveComment = () => saveFeedback({ comment: commentDraft.trim() }, 'comment', "Couldn't save your comment. Please try again.");
  const markWorn = (worn: boolean) => saveFeedback({ worn }, 'worn', "Couldn't save that. Please try again.");

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (canRead) await load();
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  // ── pieces of the screen ───────────────────────────────────────────────────

  const label = detail ? connectionTitle(detail) : 'Look';
  const isStylist = detail?.myRole === 'stylist';

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={styles.headerTitle} numberOfLines={1}>{label}</Text>
      {detail ? (
        <Pressable
          onPress={() => setSafetyOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${label}`}
        >
          <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  const safetySheet = recId && connectionId && detail ? (
    <ProSafetySheet
      visible={safetyOpen}
      refType="recommendation"
      refId={recId}
      label={label}
      connectionId={connectionId}
      onClose={() => setSafetyOpen(false)}
      onBlocked={() => {
        setSafetyOpen(false);
        navigation.goBack();
      }}
    />
  ) : null;

  // Mounted only while open: the sheet reads the account's status when it appears.
  const termsSheet = termsOpen ? (
    <ProTermsSheet
      visible
      role={detail?.myRole ?? 'client'}
      needsAdult={access.state === 'ready' && !access.status.adultConfirmed}
      onAccepted={onTermsAccepted}
      onClose={onTermsClosed}
    />
  ) : null;

  const notice = (title: string, body?: string, actionLabel?: string, onAction?: () => void) => (
    <Screen scrollable padded header={header}>
      <EmptyState title={title} body={body} actionLabel={actionLabel} onAction={onAction} />
      {safetySheet}
    </Screen>
  );

  if (access.state === 'loading') {
    return (
      <Screen scrollable padded header={header}>
        <Skeleton height={28} width="60%" borderRadius={8} style={styles.skeletonRow} />
        <Skeleton height={80} borderRadius={12} style={styles.skeletonRow} />
        <Skeleton height={160} borderRadius={12} />
      </Screen>
    );
  }
  if (access.state === 'guest' || access.state === 'not_deployed' || (access.state === 'error' && phase !== 'ready')) {
    return (
      <Screen scrollable padded header={header}>
        <ProAccessNotice access={access} onRefresh={refresh} />
      </Screen>
    );
  }
  if (phase === 'gone') {
    return notice(proErrorMessage(new ProError('pro_unavailable')), undefined, 'Back', () => navigation.goBack());
  }
  if (phase === 'failed') {
    return (
      <Screen scrollable padded header={header}>
        <LoadError what="look" onRetry={load} />
      </Screen>
    );
  }
  if (phase === 'restricted') {
    // Paused, suspended, terms out of date or the build out of date: ProAccessNotice says which, and the report
    // and block menu stays in the header.
    const role: ProRole = detail?.myRole ?? 'client';
    if (access.state !== 'ready' || access[role] !== 'available') {
      return (
        <Screen scrollable padded header={header}>
          <ProAccessNotice access={access} role={role} onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} />
          {termsSheet}
          {safetySheet}
        </Screen>
      );
    }
    return notice("This look isn't available right now", proErrorMessage(new ProError(restricted ?? 'unknown')));
  }
  if (phase === 'loading' || !look) {
    return (
      <Screen scrollable padded header={header}>
        <Skeleton height={28} width="60%" borderRadius={8} style={styles.skeletonRow} />
        <Skeleton height={80} borderRadius={12} style={styles.skeletonRow} />
        <Skeleton height={160} borderRadius={12} />
      </Screen>
    );
  }

  // From here the look is on screen.
  const accessNote = access.state === 'paused' ? PRO_PAUSED_MESSAGE : access.state === 'suspended' ? PRO_SUSPENDED_MESSAGE : null;
  const rating = validScore(look.feedback?.rating);
  const savedComment = look.feedback?.comment ?? '';
  const sent = sentOn(look.sentAt);
  const editing = look.actions.canGiveFeedback;
  const commentChanged = commentDraft.trim() !== savedComment;
  const worn = look.status === 'implemented';
  const showFeedback = !editing && (rating !== null || savedComment !== '');

  const subtitleFor = (item: ProLookDetail['items'][number]): string => {
    if (!item.available) return isStylist ? 'No longer available' : 'No longer in your closet';
    return [item.category, item.color].filter(Boolean).join(', ');
  };

  const photoFor = (item: ProLookDetail['items'][number]): React.ReactNode => {
    if (!item.available) return <ProPhoto hasPhoto={false} />;
    if (isStylist) return <ProPhoto connectionId={connectionId} itemId={item.itemId} hasPhoto={item.hasPhoto} />;
    return <ProPhoto ownPath={item.photoPath ?? null} hasPhoto={item.hasPhoto && Boolean(item.photoPath)} />;
  };

  return (
    <Screen
      scrollable
      padded
      header={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {accessNote ? (
        <Card style={styles.block}>
          <Text variant="bodySmall" color="muted">{accessNote}</Text>
        </Card>
      ) : null}
      {refreshFailed ? (
        <View style={styles.block}>
          <LoadError what="look" variant="banner" onRetry={load} />
        </View>
      ) : null}

      <View style={styles.titleRow}>
        <Text variant="h2" style={styles.title}>{look.title}</Text>
        <ProStatusBadge kind="look" status={look.status} mine={isStylist} />
      </View>
      {sent ? <Text variant="caption" color="muted" style={styles.sent}>{sent}</Text> : null}
      {look.body ? <Text variant="body" style={styles.note}>{look.body}</Text> : null}

      <Text variant="overline" color="muted" style={styles.sectionLabel}>Pieces</Text>
      {look.items.length === 0 ? (
        <Text variant="body" color="muted">This look has no pieces, only a note.</Text>
      ) : (
        <View style={styles.grid}>
          {look.items.map(item => (
            <View key={item.position} style={styles.cell}>
              <ProItemTile
                name={item.name}
                subtitle={subtitleFor(item)}
                photo={photoFor(item)}
                accessibilityLabel={[item.name, subtitleFor(item)].filter(Boolean).join(', ')}
              />
            </View>
          ))}
        </View>
      )}

      {editing ? (
        <Card style={styles.feedback}>
          <Text variant="h4">How did it go?</Text>
          <View style={styles.rating}>
            <RatingScale value={rating} onChange={rate} adjustable={false} size="lg" accessibilityLabel="Rating" />
          </View>
          <Input
            label="Comment"
            placeholder="Tell your stylist what you thought"
            value={commentDraft}
            onChangeText={t => {
              commentDirty.current = true;
              setCommentDraft(t);
            }}
            multiline
            maxLength={PRO_TEXT_LIMITS.comment}
            editable={busy !== 'comment'}
            helper={`${commentDraft.length}/${PRO_TEXT_LIMITS.comment}`}
            accessibilityLabel="Comment"
            inputAccessoryViewID={PRO_COMMENT_ACCESSORY_ID}
          />
          <Button
            label="Save comment"
            variant="secondary"
            onPress={saveComment}
            loading={busy === 'comment'}
            disabled={!commentChanged || busy !== null}
            style={styles.saveComment}
          />
          {look.actions.canMarkWorn ? (
            <View style={styles.wornRow}>
              <Text variant="body" style={styles.wornLabel}>I wore this</Text>
              <Switch
                value={worn}
                onValueChange={markWorn}
                disabled={busy !== null}
                accessibilityLabel="I wore this"
              />
            </View>
          ) : null}
          <KeyboardActionBar nativeID={PRO_COMMENT_ACCESSORY_ID} label="Done" onPress={() => Keyboard.dismiss()} />
        </Card>
      ) : null}

      {showFeedback ? (
        <Card style={styles.feedback}>
          <Text variant="h4">{isStylist ? `Feedback from ${label}` : 'Your feedback'}</Text>
          {rating !== null ? (
            <View style={styles.rating}>
              <RatingScale value={rating} readOnly size="md" accessibilityLabel="Rating" />
            </View>
          ) : null}
          {savedComment ? <Text variant="body" style={styles.savedComment}>{savedComment}</Text> : null}
        </Card>
      ) : null}

      {detail?.status === 'ended' ? (
        <Text variant="bodySmall" color="muted" align="center" style={styles.ended}>
          {closedExplanation(detail.endedBy)}
        </Text>
      ) : null}

      {safetySheet}
      {termsSheet}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, marginLeft: 12 },
  skeletonRow: { marginBottom: 12 },
  block: { marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1 },
  sent: { marginTop: 4 },
  note: { marginTop: 12 },
  sectionLabel: { marginTop: 20, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cell: { width: '50%', padding: 6 },
  feedback: { marginTop: 20 },
  rating: { marginTop: 8, marginBottom: 12 },
  saveComment: { marginTop: 10 },
  wornRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  wornLabel: { flex: 1 },
  savedComment: { marginTop: 4 },
  ended: { marginTop: 20 },
});

export default ProRecommendationScreen;
