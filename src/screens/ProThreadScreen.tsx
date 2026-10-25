/**
 * ProThreadScreen: the text thread of one connection, between a stylist and a client
 * (documentation/design/pro-accounts.md 7.7). Plain text only; links are never rendered.
 *
 * The server decides whether the person may write (`canSend` from get_pro_thread); this screen only draws the
 * composer when it is told to. A connection that ended, or that is a closed shell after a block, arrives with
 * `canSend` false and no messages to show, so it needs no special case here and never says why.
 *
 * Network behaviour, in short:
 *  - loads on focus: the connection (for the label and how it ended) and the latest page of messages;
 *  - polls every PRO_POLL_MS while focused and the app is active, asking only for messages after the last one it
 *    has (oldest first, paging forward while there are more) and merging them by id;
 *  - "Load earlier messages" pages backwards from the oldest message on screen;
 *  - an answer that arrives out of order is dropped;
 *  - a message that fails to send keeps its text and, on retry, reuses its clientRef.
 *
 * Reading a connection that is still active is refused while professional features are paused, the account is
 * suspended or the terms are out of date; reading an ended one never is (the safety gate, 4.1). The report and
 * block menu stays available in every one of those states.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
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
import ProAccessNotice from '../components/ProAccessNotice';
import ProSafetySheet from '../components/ProSafetySheet';
import ProTermsSheet from '../components/ProTermsSheet';
import { proUpdateMessage, useProAccess } from '../hooks/useProAccess';
import { getProConnection, getProThread, sendProMessage } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import {
  PRO_PAYMENT_WARNING,
  PRO_PAUSED_MESSAGE,
  PRO_POLL_MS,
  PRO_QUICK_REPLIES,
  PRO_SUSPENDED_MESSAGE,
  PRO_TEXT_LIMITS,
  looksLikePaymentTalk,
} from '../config/proRules';
import { closedExplanation, connectionTitle, newClientRef, systemLineText } from '../utils/proFormat';
import type { ProConnectionDetail, ProMessage, ProRole, ProThread } from '../types/pro';
import type { ProThreadParams } from '../types/proRoutes';

/**
 * The composer's own keyboard accessory. ProSafetySheet, which this screen opens while the composer is mounted,
 * renders the shared Done bar; two accessory views with one id on screen can leave the composer without its bar
 * when the sheet closes, so the composer does not use the shared id.
 */
export const PRO_MESSAGE_ACCESSORY_ID = 'smartcloset-pro-message-done';

/** How many messages the first page holds. */
const PAGE = 50;
/** A poll that finds more than this many new pages stops; the next poll carries on from the last id. */
const MAX_POLL_PAGES = 5;

type Phase = 'loading' | 'ready' | 'gone' | 'failed' | 'restricted';
type Restriction = 'pro_disabled' | 'pro_suspended' | 'pro_terms_required';
type Retry = { run: () => Promise<void>; fallback: string };
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  );

const mergeMessages = (a: ProMessage[], b: ProMessage[]): ProMessage[] => {
  const byId = new Map<number, ProMessage>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
};

const newestId = (messages: ProMessage[], floor = 0): number => messages.reduce((max, m) => Math.max(max, m.id), floor);

type BubbleProps = { message: ProMessage; label: string; onReport: (messageId: number) => void };

const Bubble: React.FC<BubbleProps> = ({ message, label, onReport }) => {
  const { theme } = useTheme();

  if (message.from === 'system') {
    const line = systemLineText(message.code);
    return line ? (
      <Text variant="caption" color="subtle" align="center" style={styles.systemLine}>{line}</Text>
    ) : null;
  }

  if (message.from === 'me') {
    return (
      <View style={[styles.bubbleRow, styles.mineRow]}>
        <View style={[styles.bubble, { backgroundColor: theme.colors.accentSubtle, borderColor: theme.colors.accent }]}>
          <Text variant="body">{message.body}</Text>
        </View>
      </View>
    );
  }

  const payment = looksLikePaymentTalk(message.body);
  return (
    <View style={styles.bubbleRow}>
      <View style={styles.theirs}>
        {/* Long-press reports this message. The chip's button sits beside the bubble, not inside it. */}
        <Pressable
          onLongPress={() => onReport(message.id)}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${message.body}`}
          accessibilityHint="Press and hold to report this message"
          accessibilityActions={[{ name: 'report', label: 'Report this message' }]}
          onAccessibilityAction={e => {
            if (e.nativeEvent.actionName === 'report') onReport(message.id);
          }}
          style={[styles.bubble, { backgroundColor: theme.colors.muted, borderColor: theme.colors.border }]}
        >
          <Text variant="body">{message.body}</Text>
        </Pressable>
        {payment ? (
          <View style={[styles.warning, { backgroundColor: theme.colors.warningSubtle, borderRadius: theme.radius.md }]}>
            <Icon name="alert-circle-outline" size={16} color={theme.colors.warning} />
            <Text variant="caption" style={styles.warningText}>{PRO_PAYMENT_WARNING}</Text>
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

const ProThreadScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();
  const connectionId: string | undefined = (route.params as Partial<ProThreadParams> | undefined)?.connectionId;

  const [detail, setDetail] = useState<ProConnectionDetail | null>(null);
  const [messages, setMessages] = useState<ProMessage[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [restricted, setRestricted] = useState<Restriction | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyMessageId, setSafetyMessageId] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const alive = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const stickToEnd = useRef(false);
  const nearBottom = useRef(true);
  // The first page that arrives starts scrolled to the newest message.
  const firstScroll = useRef(true);
  // Responses can arrive out of order; one that started before an already-applied response is dropped.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const lastMessageId = useRef(0);
  const oldestMessageId = useRef(0);
  const pollable = useRef(false);
  const retryRef = useRef<Retry | null>(null);
  const accessRef = useRef(access);
  accessRef.current = access;
  const detailRef = useRef(detail);
  detailRef.current = detail;
  // The text and clientRef of the last message that was sent but not confirmed, so a retry of the same text
  // reuses the same clientRef (the server then returns the first message instead of a second).
  const attempt = useRef<{ body: string; ref: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    lastMessageId.current = newestId(messages);
    oldestMessageId.current = messages.length ? messages[0].id : 0;
  }, [messages]);

  useEffect(() => {
    pollable.current = phase === 'ready' && canSend;
  }, [phase, canSend]);

  // The thread and the connection can be read while paused or suspended (an ended connection stays readable);
  // the server says when an active one cannot.
  // An access check that fails while the thread is on screen (offline) does not take the thread away.
  const canRead =
    access.state === 'ready' || access.state === 'paused' || access.state === 'suspended' ||
    (access.state === 'error' && phase === 'ready');

  /** Puts a page of messages on screen. `latest` says the page is the newest one, so its `hasMore` means older ones exist. */
  const applyThread = useCallback((thread: ProThread, kind: 'latest' | 'poll') => {
    if (kind === 'poll' && nearBottom.current && thread.messages.some(m => m.id > lastMessageId.current)) {
      stickToEnd.current = true;
    }
    setMessages(prev => mergeMessages(prev, thread.messages));
    setCanSend(thread.canSend);
    if (kind === 'latest') {
      // Older pages already on screen stay counted: only the window below the oldest one is in question.
      const olderOnScreen =
        oldestMessageId.current > 0 && thread.messages.length > 0 && oldestMessageId.current < thread.messages[0].id;
      if (!olderOnScreen) setHasEarlier(thread.hasMore);
    }
  }, []);

  /** What a failed read means. `quiet` is a poll: it says nothing unless the situation really changed. */
  const readFailed = useCallback((error: unknown, quiet: boolean) => {
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
    if (quiet) return;
    setRefreshFailed(true);
    setPhase(p => (p === 'loading' ? 'failed' : p));
  }, [refresh]);

  const load = useCallback(
    async (mode: 'full' | 'poll') => {
      if (!connectionId) {
        setPhase('gone');
        return;
      }
      const mine = ++requestSeq.current;
      const stale = () => !alive.current || mine < appliedSeq.current;

      if (mode === 'poll' && lastMessageId.current > 0) {
        let after = lastMessageId.current;
        let closed = false;
        try {
          for (let page = 0; page < MAX_POLL_PAGES; page++) {
            const thread = await getProThread(connectionId, { afterId: after });
            if (stale()) return;
            appliedSeq.current = mine;
            applyThread(thread, 'poll');
            closed = !thread.canSend;
            const newest = newestId(thread.messages, after);
            if (!thread.hasMore || newest === after) break;
            after = newest;
          }
          // The connection ended while the thread was open: read how, for the line under the messages.
          if (closed && !stale() && detailRef.current?.status === 'active') {
            const fresh = await settle(getProConnection(connectionId));
            if (fresh.ok && alive.current && fresh.value.status === 'ended') setDetail(fresh.value);
          }
        } catch (e) {
          if (!stale()) readFailed(e, true);
        }
        return;
      }

      const [connection, thread] = await Promise.all([
        settle(getProConnection(connectionId)),
        settle(getProThread(connectionId, { limit: PAGE })),
      ]);
      if (stale()) return;
      appliedSeq.current = mine;
      if (connection.ok) setDetail(connection.value);
      else if (toProError(connection.error).code === 'pro_unavailable') {
        setPhase('gone');
        return;
      }
      if (thread.ok) {
        if (firstScroll.current) {
          firstScroll.current = false;
          stickToEnd.current = true;
        }
        applyThread(thread.value, 'latest');
        setRestricted(null);
        setPhase('ready');
        setRefreshFailed(false);
      } else {
        readFailed(thread.error, false);
      }
    },
    [connectionId, applyThread, readFailed],
  );

  useFocusEffect(
    useCallback(() => {
      if (!canRead) return undefined;
      load('full');
      const isActive = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
      const timer = setInterval(() => {
        if (pollable.current && isActive()) load('poll');
      }, PRO_POLL_MS);
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active' && pollable.current) load('poll');
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [canRead, load]),
  );

  /** The newest update message when the build is older or newer than the server's terms, else null. */
  const updateMessage = useCallback((): string | null => {
    const a = accessRef.current;
    if (a.state !== 'ready') return null;
    const role: ProRole = detailRef.current?.myRole ?? 'client';
    return a[role] === 'update_required' ? proUpdateMessage(a.status, role) : null;
  }, []);

  /**
   * Runs a write. A failure becomes a short alert; a thread that moved on is reloaded; and if the server says the
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
        if (err.code === 'connection_ended') load('full');
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
    else load('full');
  };

  const onTermsClosed = () => {
    retryRef.current = null;
    setTermsOpen(false);
  };

  // ── messages ───────────────────────────────────────────────────────────────

  const send = () => {
    const body = draft.trim();
    if (!connectionId || !body || sending || !canSend) return;
    const ref = attempt.current?.body === body ? attempt.current.ref : newClientRef();
    attempt.current = { body, ref };
    setSending(true);
    guarded(async () => {
      const sent = await sendProMessage(connectionId, body, ref);
      attempt.current = null;
      if (!alive.current) return;
      setDraft('');
      stickToEnd.current = true;
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : mergeMessages(prev, [{ id: sent.id, from: 'me', body, at: sent.at }])));
      // The answer carries anything the other person wrote meanwhile.
      load('poll');
    }, "Couldn't send your message. Please try again.").finally(() => {
      if (alive.current) setSending(false);
    });
  };

  const loadEarlier = () => {
    if (!connectionId || loadingEarlier || !oldestMessageId.current) return;
    setLoadingEarlier(true);
    guarded(async () => {
      const thread = await getProThread(connectionId, { beforeId: oldestMessageId.current, limit: PAGE });
      if (!alive.current) return;
      // Messages merge by id, so a late answer cannot undo anything; only older ones are added.
      setMessages(prev => mergeMessages(prev, thread.messages));
      setHasEarlier(thread.hasMore);
    }, "Couldn't load earlier messages. Please try again.").finally(() => {
      if (alive.current) setLoadingEarlier(false);
    });
  };

  const applyQuickReply = (text: string) =>
    setDraft(prev => {
      if (!prev) return text;
      return prev.length + 1 + text.length <= PRO_TEXT_LIMITS.message ? `${prev} ${text}` : prev;
    });

  const openReport = (messageId?: number) => {
    setSafetyMessageId(messageId);
    setSafetyOpen(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (canRead) await load('full');
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  // ── pieces of the screen ───────────────────────────────────────────────────

  const label = detail ? connectionTitle(detail) : 'Messages';

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={styles.headerTitle} numberOfLines={1}>{label}</Text>
      {detail ? (
        <Pressable
          onPress={() => openReport(undefined)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${label}`}
        >
          <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  const safetySheet = connectionId && detail ? (
    <ProSafetySheet
      visible={safetyOpen}
      refType="connection"
      refId={connectionId}
      label={label}
      messageId={safetyMessageId}
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

  const skeleton = (
    <Screen scrollable padded header={header}>
      <Skeleton height={44} borderRadius={14} style={styles.skeletonRow} />
      <Skeleton height={44} width="70%" borderRadius={14} style={styles.skeletonRow} />
      <Skeleton height={44} width="55%" borderRadius={14} style={styles.skeletonRow} />
    </Screen>
  );

  if (access.state === 'loading') return skeleton;
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
        <LoadError what="messages" onRetry={() => load('full')} />
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
    return notice("Messages aren't available right now", proErrorMessage(new ProError(restricted ?? 'unknown')));
  }
  if (phase === 'loading') return skeleton;

  // From here the thread is on screen.
  const open = canSend;
  const closedText = detail && detail.status === 'active'
    ? "You can't send messages in this conversation right now."
    : closedExplanation(detail?.endedBy ?? null);
  const accessNote = access.state === 'paused' ? PRO_PAUSED_MESSAGE : access.state === 'suspended' ? PRO_SUSPENDED_MESSAGE : null;

  const footer = open ? (
    <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        {PRO_QUICK_REPLIES.map(text => (
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
        <View style={styles.flex}>
          <Input
            placeholder="Write a message"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={PRO_TEXT_LIMITS.message}
            inputStyle={styles.composeInput}
            helper={`${draft.length}/${PRO_TEXT_LIMITS.message}`}
            accessibilityLabel="Message"
            inputAccessoryViewID={PRO_MESSAGE_ACCESSORY_ID}
          />
        </View>
        <Button
          label="Send"
          accessibilityLabel="Send message"
          onPress={send}
          loading={sending}
          disabled={!draft.trim()}
          style={styles.sendButton}
        />
      </View>
      <KeyboardActionBar nativeID={PRO_MESSAGE_ACCESSORY_ID} label="Done" onPress={() => Keyboard.dismiss()} />
    </View>
  ) : (
    <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <Text variant="bodySmall" color="muted" align="center">{closedText}</Text>
    </View>
  );

  return (
    <Screen keyboardAvoiding padded={false} header={header} footer={footer}>
      <KeyboardSafeScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEventThrottle={100}
        onScroll={e => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
        }}
        onContentSizeChange={() => {
          if (stickToEnd.current) {
            stickToEnd.current = false;
            scrollRef.current?.scrollToEnd?.({ animated: false });
          }
        }}
      >
        {accessNote ? (
          <Card style={styles.noteCard}>
            <Text variant="bodySmall" color="muted">{accessNote}</Text>
          </Card>
        ) : null}
        {refreshFailed ? (
          <View style={styles.banner}>
            <LoadError what="messages" variant="banner" onRetry={() => load('full')} />
          </View>
        ) : null}

        {hasEarlier ? (
          <Button
            label="Load earlier messages"
            variant="ghost"
            size="sm"
            loading={loadingEarlier}
            onPress={loadEarlier}
            style={styles.earlier}
          />
        ) : null}

        {messages.length === 0 ? (
          <Text variant="body" color="muted" align="center" style={styles.empty}>
            {open ? 'No messages yet. Say hello.' : 'There are no messages to show.'}
          </Text>
        ) : (
          messages.map(m => <Bubble key={m.id} message={m} label={label} onReport={openReport} />)
        )}
      </KeyboardSafeScrollView>

      {safetySheet}
      {termsSheet}
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, marginLeft: 12 },
  skeletonRow: { marginBottom: 12 },
  content: { padding: 16, paddingBottom: 24 },
  noteCard: { marginBottom: 12 },
  banner: { marginBottom: 12 },
  earlier: { alignSelf: 'center', marginBottom: 8 },
  empty: { marginVertical: 24 },
  systemLine: { marginVertical: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  mineRow: { justifyContent: 'flex-end' },
  theirs: { maxWidth: '85%' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, maxWidth: '85%' },
  warning: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  warningText: { flex: 1, marginLeft: 6 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  chips: { gap: 8, paddingBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end' },
  composeInput: { maxHeight: 120 },
  sendButton: { marginLeft: 8, marginBottom: 22 },
});

export default ProThreadScreen;
