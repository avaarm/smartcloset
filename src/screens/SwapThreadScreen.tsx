/**
 * SwapThreadScreen — one swap: the pieces on both sides, where it stands, what the member can do
 * about it, and the conversation.
 *
 * The server decides what the member may do (`actions` from get_swap); this screen only draws the
 * buttons it is told about. It never shows why a swap became unavailable, and a swap with someone who
 * is blocked arrives as a closed shell (neutral label, no photos, no member messages, no actions), so
 * it needs no special case here.
 *
 * Network behaviour, in short:
 *  - loads on focus, and again by pull to refresh;
 *  - polls for news every SWAP_THREAD_POLL_MS while focused and the app is active, asking only for
 *    messages newer than the last one it has and merging them by id;
 *  - a write that fails keeps its input and, on retry, reuses its clientRef;
 *  - "We swapped!" runs the hand-off on this phone; if the app was killed halfway, opening the swap
 *    finishes what is left (every step is safe to repeat).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Input, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import { KeyboardActionBar, KeyboardSafeScrollView } from '../components/KeyboardSafe';
import SwapCompleteSheet, { joinNames } from '../components/SwapCompleteSheet';
import SwapSafetySheet from '../components/SwapSafetySheet';
import SwapTermsSheet from '../components/SwapTermsSheet';
import SwapTicket from '../components/SwapTicket';
import { useSwapAccess } from '../hooks/useSwapAccess';
import {
  cancelSwap,
  completeSwapHandoff,
  getSwap,
  respondToSwap,
  sendSwapMessage,
} from '../services/swapService';
import { swapErrorMessage, toSwapError } from '../services/swapErrors';
import { getClothingItem } from '../services/storage';
import {
  SWAP_LIMITS,
  SWAP_NOT_DEPLOYED_MESSAGE,
  SWAP_PAUSED_MESSAGE,
  SWAP_PAYMENT_WARNING,
  SWAP_PROPOSAL_EXPIRES_DAYS,
  SWAP_QUICK_REPLIES,
  SWAP_SAFETY_TIPS,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_THREAD_POLL_MS,
  SWAP_UPDATE_REQUIRED_MESSAGE,
  looksLikePaymentTalk,
} from '../config/swapRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import { closedExplanation, newClientRef, systemLineText } from '../utils/swapFormat';
import type { SwapDetail, SwapMessage } from '../types/swap';

/**
 * The composer's own keyboard accessory. SwapSafetySheet, which this screen opens while the composer is
 * mounted, renders the shared Done bar; two accessory views with one id on screen can leave the composer
 * without its bar when the sheet closes, so the composer does not use the shared id.
 */
export const SWAP_MESSAGE_ACCESSORY_ID = 'smartcloset-swap-message-done';

type Phase = 'loading' | 'ready' | 'gone' | 'failed';
type Busy = 'accept' | 'decline' | 'cancel' | 'complete' | null;
type Retry = { run: () => Promise<void>; fallback: string };

const mergeMessages = (a: SwapMessage[], b: SwapMessage[]): SwapMessage[] => {
  const byId = new Map<number, SwapMessage>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
};

/** Nothing about a swap in these states can change any more, so the thread stops asking. */
const isTerminal = (d: SwapDetail): boolean =>
  d.status === 'declined' || d.status === 'cancelled' || d.status === 'expired';

/** The calm line under the ticket: why it ended, or what is being waited for. */
const statusLine = (d: SwapDetail): string | null => {
  const closed = closedExplanation({ status: d.status, closedReason: d.closedReason, role: d.role, iDone: d.iDone });
  if (closed) {
    if (d.status === 'completed' && d.autoCompleted && !d.iDone) {
      return `${d.otherLabel} tapped “We swapped!” and the swap was finished. You can still tap it to add your piece to your closet.`;
    }
    return closed;
  }
  if (d.status === 'proposed') {
    return d.role === 'recipient'
      ? `${d.otherLabel} would like to swap. Accept or decline below.`
      : `Waiting for ${d.otherLabel} to answer. Offers run out after ${SWAP_PROPOSAL_EXPIRES_DAYS} days.`;
  }
  return null;
};

const emailSupport = async () => {
  try {
    await Linking.openURL(SUPPORT_MAILTO);
  } catch {
    Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
  }
};

type BubbleProps = { message: SwapMessage; otherLabel: string; onReport: (messageId: number) => void };

const Bubble: React.FC<BubbleProps> = ({ message, otherLabel, onReport }) => {
  const { theme } = useTheme();
  const body = message.body ?? '';

  if (message.mine) {
    return (
      <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
        <View style={[styles.bubble, { backgroundColor: theme.colors.accentSubtle, borderColor: theme.colors.accent }]}>
          <Text variant="body">{body}</Text>
        </View>
      </View>
    );
  }

  const payment = looksLikePaymentTalk(body);
  return (
    <View style={styles.bubbleRow}>
      <View style={{ maxWidth: '85%' }}>
        {/* Long-press reports this message. The chip's button sits beside the bubble, not inside it. */}
        <Pressable
          onLongPress={() => onReport(message.id)}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`${otherLabel}: ${body}`}
          accessibilityHint="Press and hold to report this message"
          accessibilityActions={[{ name: 'report', label: 'Report this message' }]}
          onAccessibilityAction={e => {
            if (e.nativeEvent.actionName === 'report') onReport(message.id);
          }}
          style={[styles.bubble, { backgroundColor: theme.colors.muted, borderColor: theme.colors.border }]}
        >
          <Text variant="body">{body}</Text>
        </Pressable>
        {payment ? (
          <View style={[styles.warning, { backgroundColor: theme.colors.warningSubtle, borderRadius: theme.radius.md }]}>
            <Icon name="alert-circle-outline" size={16} color={theme.colors.warning} />
            <Text variant="caption" style={{ flex: 1, marginLeft: 6 }}>{SWAP_PAYMENT_WARNING}</Text>
            <Pressable
              onPress={() => onReport(message.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Report this message"
            >
              <Text variant="label" color="accent">Report</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const SwapThreadScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { access, refresh } = useSwapAccess();
  const swapId: string = route.params?.swapId;

  const [detail, setDetail] = useState<SwapDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyMessageId, setSafetyMessageId] = useState<number | undefined>(undefined);
  const [finishing, setFinishing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // The member's own choice about the safety card; until they make one it follows the swap (open once accepted).
  const [tipsOverride, setTipsOverride] = useState<boolean | null>(null);

  const alive = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const scrollAfterSend = useRef(false);
  // Responses can arrive out of order; one that started before an already-applied response is dropped.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const lastMessageId = useRef(0);
  const pollable = useRef(false);
  const autoTried = useRef(false);
  const finishingNow = useRef(false);
  const retryRef = useRef<Retry | null>(null);
  // The text and clientRef of the last message that was sent but not confirmed, so a retry of the same
  // text reuses the same clientRef (the server then returns the first message instead of a second).
  const attempt = useRef<{ body: string; ref: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    lastMessageId.current = detail ? detail.messages.reduce((max, m) => Math.max(max, m.id), 0) : 0;
    pollable.current = detail ? !isTerminal(detail) : false;
  }, [detail]);

  const canRead = access.state === 'ready' || access.state === 'suspended';

  const load = useCallback(
    async (mode: 'full' | 'poll') => {
      const mine = ++requestSeq.current;
      try {
        const next = await getSwap(swapId, mode === 'poll' ? lastMessageId.current : 0);
        if (!alive.current || mine < appliedSeq.current) return;
        appliedSeq.current = mine;
        setDetail(prev => (prev ? { ...next, messages: mergeMessages(prev.messages, next.messages) } : next));
        setPhase('ready');
        setRefreshFailed(false);
      } catch (e) {
        if (!alive.current || mine < appliedSeq.current) return;
        const code = toSwapError(e).code;
        if (code === 'swap_unavailable') {
          appliedSeq.current = mine;
          setPhase('gone');
          return;
        }
        if (code === 'not_authenticated' || code === 'swaps_disabled' || code === 'not_deployed') refresh();
        // A poll that fails stays quiet; the next one, or a pull to refresh, tries again.
        if (mode === 'poll') return;
        setRefreshFailed(true);
        setPhase(p => (p === 'loading' ? 'failed' : p));
      }
    },
    [swapId, refresh],
  );

  useFocusEffect(
    useCallback(() => {
      if (!canRead) return undefined;
      load('full');
      const isActive = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
      const timer = setInterval(() => {
        if (pollable.current && isActive()) load('poll');
      }, SWAP_THREAD_POLL_MS);
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active' && pollable.current) load('poll');
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [canRead, load]),
  );

  // The terms sheet opens by itself the first time the screen finds them unaccepted.
  useEffect(() => {
    if (access.state === 'needs_terms') setTermsOpen(true);
  }, [access.state]);

  /**
   * Runs a write. A failure becomes a short alert; a stale swap is reloaded; and if the server says the
   * terms moved on, the terms sheet opens and the same write runs again once the member has agreed.
   */
  const guarded = useCallback(
    async (run: () => Promise<void>, fallback: string): Promise<void> => {
      try {
        await run();
      } catch (e) {
        if (!alive.current) return;
        const err = toSwapError(e);
        if (err.code === 'swap_terms_required') {
          retryRef.current = { run, fallback };
          setCompleteOpen(false);
          setTermsOpen(true);
          return;
        }
        Alert.alert('Couldn’t do that', swapErrorMessage(err, fallback));
        if (err.code === 'swap_not_open' || err.code === 'swap_unavailable') load('full');
      }
    },
    [load],
  );

  const onTermsAccepted = () => {
    setTermsOpen(false);
    refresh();
    const retry = retryRef.current;
    retryRef.current = null;
    if (retry) guarded(retry.run, retry.fallback);
  };

  const onTermsClosed = () => {
    retryRef.current = null;
    setTermsOpen(false);
  };

  // ── answering, cancelling, finishing ───────────────────────────────────────

  const respond = (action: 'accept' | 'decline') => {
    if (busy) return;
    guarded(async () => {
      setBusy(action);
      try {
        const result = await respondToSwap(swapId, action);
        if (result === 'unavailable') Alert.alert('That piece is no longer available');
        await load('full');
      } finally {
        if (alive.current) setBusy(null);
      }
    }, 'Couldn’t send your answer. Please try again.');
  };

  const runCancel = () =>
    guarded(async () => {
      setBusy('cancel');
      try {
        await cancelSwap(swapId);
        await load('full');
      } finally {
        if (alive.current) setBusy(null);
      }
    }, 'Couldn’t cancel. Please try again.');

  const onCancel = () => {
    if (busy || !detail) return;
    if (detail.status === 'proposed') {
      runCancel();
      return;
    }
    Alert.alert(
      'Cancel this swap?',
      detail.theyDone
        ? 'They already tapped “We swapped!”. Cancel only if you didn’t hand your piece over.'
        : 'This ends the swap.',
      [
        { text: 'Keep swap', style: 'cancel' },
        { text: 'Cancel swap', style: 'destructive', onPress: runCancel },
      ],
    );
  };

  const confirmComplete = ({ keepGiven }: { keepGiven: boolean }) => {
    if (busy) return;
    guarded(async () => {
      setBusy('complete');
      try {
        await completeSwapHandoff(swapId, { keepGiven });
        if (alive.current) setCompleteOpen(false);
        await load('full');
      } finally {
        if (alive.current) setBusy(null);
      }
    }, 'Couldn’t finish the swap. Please try again.');
  };

  /** Repeats the unfinished steps of the hand-off. Safe to run again; returns whether anything is still open. */
  const finishUp = useCallback(async (): Promise<boolean> => {
    if (finishingNow.current) return false;
    finishingNow.current = true;
    setFinishing(true);
    try {
      const result = await completeSwapHandoff(swapId, { keepGiven: false });
      await load('full');
      return result.photosPending > 0 || result.removalsPending > 0;
    } finally {
      finishingNow.current = false;
      if (alive.current) setFinishing(false);
    }
  }, [swapId, load]);

  const onFinishUp = () =>
    guarded(async () => {
      if (await finishUp()) {
        Alert.alert('Not quite done', 'Some of it couldn’t finish. Check your connection and try again.');
      }
    }, 'Couldn’t finish up. Please try again.');

  // On open: if an earlier hand-off was interrupted, try to finish it once without asking.
  useEffect(() => {
    if (!detail || autoTried.current) return;
    autoTried.current = true;
    if (detail.items.some(i => i.photoPending || i.removalPending)) finishUp().catch(() => {});
  }, [detail, finishUp]);

  const openCloset = async (itemId: string) => {
    try {
      const item = await getClothingItem(itemId);
      if (item) navigation.navigate('ItemDetails', { item });
      else Alert.alert('Not in your closet', 'That piece is no longer in your closet.');
    } catch (e) {
      Alert.alert('Couldn’t open it', swapErrorMessage(e, 'Couldn’t open your closet. Please try again.'));
    }
  };

  // ── messages ───────────────────────────────────────────────────────────────

  const send = () => {
    const body = draft.trim();
    if (!body || sending || !detail?.actions.canMessage) return;
    const ref = attempt.current?.body === body ? attempt.current.ref : newClientRef();
    attempt.current = { body, ref };
    setSending(true);
    guarded(async () => {
      const id = await sendSwapMessage(swapId, body, ref);
      attempt.current = null;
      if (!alive.current) return;
      setDraft('');
      scrollAfterSend.current = true;
      setDetail(prev =>
        prev && !prev.messages.some(m => m.id === id)
          ? { ...prev, messages: [...prev.messages, { id, kind: 'text', body, mine: true, createdAt: new Date().toISOString() }] }
          : prev,
      );
      // The reply carries the new message allowance and anything the other member wrote meanwhile.
      load('poll');
    }, 'Couldn’t send your message. Please try again.').finally(() => {
      if (alive.current) setSending(false);
    });
  };

  const applyQuickReply = (text: string) =>
    setDraft(prev => {
      if (!prev) return text;
      return prev.length + 1 + text.length <= SWAP_LIMITS.message_max ? `${prev} ${text}` : prev;
    });

  const openReport = (messageId?: number) => {
    setSafetyMessageId(messageId);
    setSafetyOpen(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // The pull control only exists once the thread can be read. load() asks the access question
      // again itself when the server says the account changed; a settings call here would turn an
      // offline pull into a full-screen error that hides the thread.
      if (canRead) await load('full');
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  // ── pieces of the screen ───────────────────────────────────────────────────

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
        {phase === 'ready' && detail ? detail.otherLabel : 'Swap'}
      </Text>
      {phase === 'ready' && detail ? (
        <Pressable
          onPress={() => openReport(undefined)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Swap menu"
        >
          <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  const notice = (title: string, body?: string, actionLabel?: string, onAction?: () => void) => (
    <Screen scrollable padded header={header}>
      <EmptyState title={title} body={body} actionLabel={actionLabel} onAction={onAction} />
    </Screen>
  );

  if (access.state === 'loading') {
    return (
      <Screen scrollable padded header={header}>
        <Skeleton height={220} borderRadius={12} />
        <Skeleton height={14} width="60%" style={{ marginTop: 16 }} />
      </Screen>
    );
  }
  if (access.state === 'guest') return notice('Sign in to swap', 'Swap pieces with friends once you have an account.', 'Sign in', () => navigation.navigate('SignIn'));
  if (access.state === 'paused') return notice('Swaps are paused', SWAP_PAUSED_MESSAGE);
  if (access.state === 'not_deployed') return notice('Swaps aren’t available yet', SWAP_NOT_DEPLOYED_MESSAGE);
  if (access.state === 'update_required') {
    return access.appIsOlder
      ? notice('Update SmartCloset', SWAP_UPDATE_REQUIRED_MESSAGE)
      : notice('Swaps aren’t ready yet', SWAP_SERVER_BEHIND_MESSAGE);
  }
  if (access.state === 'needs_terms') {
    return (
      <Screen scrollable padded header={header}>
        <EmptyState
          title="Read the swap terms to get started"
          actionLabel="Read the swap terms"
          onAction={() => setTermsOpen(true)}
        />
        <SwapTermsSheet visible={termsOpen} onAccepted={onTermsAccepted} onClose={onTermsClosed} />
      </Screen>
    );
  }
  if (access.state === 'error') {
    return (
      <Screen scrollable padded header={header}>
        <LoadError what="swap" onRetry={refresh} />
      </Screen>
    );
  }
  if (phase === 'gone') {
    return notice('This swap is no longer available', undefined, 'Back to My swaps', () => navigation.navigate('MySwaps'));
  }
  if (phase === 'failed') {
    return (
      <Screen scrollable padded header={header}>
        <LoadError what="swap" onRetry={() => load('full')} />
      </Screen>
    );
  }
  if (phase === 'loading' || !detail) {
    return (
      <Screen scrollable padded header={header}>
        <Skeleton height={220} borderRadius={12} />
        <Skeleton height={14} width="60%" style={{ marginTop: 16 }} />
        <Skeleton height={14} width="40%" style={{ marginTop: 10 }} />
      </Screen>
    );
  }

  // From here the swap is on screen.
  const d = detail;
  const line = statusLine(d);
  const open = d.status === 'proposed' || d.status === 'accepted';
  const tipsOpen = tipsOverride ?? (d.status === 'accepted');
  const giveNames = d.items.filter(i => i.mine).map(i => i.name);
  const getNames = d.items.filter(i => !i.mine).map(i => i.name);
  const photoPending = d.items.some(i => i.photoPending);
  const removalPending = d.items.some(i => i.removalPending);
  const received = d.items.filter(i => !i.mine && i.claimedItemId);
  const showCloset = d.iDone && received.length > 0 && !photoPending && !removalPending;
  const a = d.actions;
  const hasButtons = a.canComplete || a.canAccept || a.canDecline || a.canCancel;

  const footer = a.canMessage ? (
    <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        {SWAP_QUICK_REPLIES.map(text => (
          <Pressable
            key={text}
            onPress={() => applyQuickReply(text)}
            accessibilityRole="button"
            accessibilityLabel={text}
            style={[styles.chip, { backgroundColor: theme.colors.muted, borderColor: theme.colors.border }]}
          >
            <Text variant="caption">{text}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.composeRow}>
        <View style={{ flex: 1 }}>
          <Input
            placeholder="Write a message"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={SWAP_LIMITS.message_max}
            inputStyle={styles.composeInput}
            helper={`${draft.length}/${SWAP_LIMITS.message_max}`}
            accessibilityLabel="Message"
            inputAccessoryViewID={SWAP_MESSAGE_ACCESSORY_ID}
          />
        </View>
        <Button
          label="Send"
          accessibilityLabel="Send message"
          onPress={send}
          loading={sending}
          disabled={!draft.trim()}
          style={{ marginLeft: 8, marginBottom: 22 }}
        />
      </View>
      <KeyboardActionBar nativeID={SWAP_MESSAGE_ACCESSORY_ID} label="Done" onPress={() => Keyboard.dismiss()} />
    </View>
  ) : (
    <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <Text variant="bodySmall" color="muted" align="center">
        {open ? 'You can’t send messages in this swap right now.' : 'This swap has ended'}
      </Text>
    </View>
  );

  return (
    <Screen keyboardAvoiding padded={false} header={header} footer={footer}>
      <KeyboardSafeScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onContentSizeChange={() => {
          if (scrollAfterSend.current) {
            scrollAfterSend.current = false;
            scrollRef.current?.scrollToEnd?.({ animated: true });
          }
        }}
      >
        {access.state === 'suspended' ? (
          <Card style={{ marginBottom: 12 }}>
            <Text variant="h4">Swapping is paused on your account</Text>
            <Text variant="body" color="muted" style={{ marginTop: 6 }}>
              You can still read this swap. Email support if you think this is a mistake.
            </Text>
            <Button label="Email support" variant="secondary" onPress={emailSupport} style={{ marginTop: 12 }} />
          </Card>
        ) : null}
        {refreshFailed ? (
          <View style={{ marginBottom: 12 }}>
            <LoadError what="swap" variant="banner" onRetry={() => load('full')} />
          </View>
        ) : null}

        <SwapTicket detail={d} />

        {line ? (
          <Text variant="body" color="muted" style={{ marginBottom: 12 }}>{line}</Text>
        ) : null}

        {photoPending || removalPending ? (
          <Card style={{ marginBottom: 12, backgroundColor: theme.colors.warningSubtle }}>
            <Text variant="h4">Finish up</Text>
            <Text variant="body" color="muted" style={{ marginTop: 4 }}>
              {photoPending && removalPending
                ? 'Your new piece’s photo and taking the piece you gave out of your closet are still to do.'
                : photoPending
                ? 'Your new piece’s photo is still being added to your closet.'
                : 'The piece you gave is still in your closet.'}
            </Text>
            <Button label="Finish up" onPress={onFinishUp} loading={finishing} style={{ marginTop: 12 }} />
          </Card>
        ) : null}

        {showCloset ? (
          <Card style={{ marginBottom: 12 }}>
            <Text variant="h3">Swapped!</Text>
            <Text variant="body" color="muted" style={{ marginTop: 4 }}>
              {`${joinNames(received.map(i => i.name))} ${received.length > 1 ? 'are' : 'is'} in your closet.`}
            </Text>
            <Button
              label="See it in my closet"
              variant="secondary"
              onPress={() => openCloset(received[0].claimedItemId as string)}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : null}

        {hasButtons ? (
          <View style={styles.actions}>
            {a.canComplete ? (
              <Button
                label="We swapped!"
                accessibilityLabel="We swapped"
                onPress={() => setCompleteOpen(true)}
                disabled={busy !== null}
                style={styles.action}
              />
            ) : null}
            {a.canAccept ? (
              <Button
                label="Accept"
                onPress={() => respond('accept')}
                loading={busy === 'accept'}
                disabled={busy !== null}
                style={styles.action}
              />
            ) : null}
            {a.canDecline ? (
              <Button
                label="Decline"
                variant="secondary"
                onPress={() => respond('decline')}
                loading={busy === 'decline'}
                disabled={busy !== null}
                style={styles.action}
              />
            ) : null}
            {a.canCancel ? (
              <Button
                label={d.status === 'proposed' ? 'Cancel offer' : 'Cancel swap'}
                variant="secondary"
                onPress={onCancel}
                loading={busy === 'cancel'}
                disabled={busy !== null}
                style={styles.action}
              />
            ) : null}
          </View>
        ) : null}

        {!isTerminal(d) ? (
          <View style={[styles.tips, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
            <Pressable
              onPress={() => setTipsOverride(!tipsOpen)}
              accessibilityRole="button"
              accessibilityLabel="Swap safely"
              accessibilityState={{ expanded: tipsOpen }}
              style={styles.tipsHeader}
            >
              <Icon name="shield-checkmark-outline" size={18} color={theme.colors.textMuted} />
              <Text variant="body" weight="600" style={{ flex: 1, marginLeft: 8 }}>Swap safely</Text>
              <Icon name={tipsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSubtle} />
            </Pressable>
            {tipsOpen ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                {SWAP_SAFETY_TIPS.map(tip => (
                  <View key={tip} style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <Text variant="bodySmall" style={{ width: 14 }}>•</Text>
                    <Text variant="bodySmall" color="muted" style={{ flex: 1 }}>{tip}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ marginTop: 8 }}>
          {d.messages.map(m =>
            m.kind === 'system' ? (
              systemLineText(m.code) ? (
                <Text key={m.id} variant="caption" color="subtle" align="center" style={styles.systemLine}>
                  {systemLineText(m.code)}
                </Text>
              ) : null
            ) : (
              <Bubble key={m.id} message={m} otherLabel={d.otherLabel} onReport={openReport} />
            ),
          )}
        </View>
      </KeyboardSafeScrollView>

      <SwapCompleteSheet
        visible={completeOpen}
        giveNames={giveNames}
        getNames={getNames}
        busy={busy === 'complete'}
        onConfirm={confirmComplete}
        onClose={() => setCompleteOpen(false)}
      />
      <SwapSafetySheet
        visible={safetyOpen}
        refType="swap"
        refId={d.id}
        label={d.otherLabel}
        messageId={safetyMessageId}
        onClose={() => setSafetyOpen(false)}
        onBlocked={() => {
          setSafetyOpen(false);
          navigation.goBack();
        }}
      />
      <SwapTermsSheet visible={termsOpen} onAccepted={onTermsAccepted} onClose={onTermsClosed} />
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  action: { flexGrow: 1, flexBasis: 140 },
  tips: { marginBottom: 12 },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  systemLine: { marginVertical: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, maxWidth: '85%' },
  warning: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  chips: { gap: 8, paddingBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end' },
  composeInput: { maxHeight: 120 },
});

export default SwapThreadScreen;
