/**
 * ProClientDetailScreen — one client, as the stylist sees them: the name the client chose, the way into the
 * thread, the client's shared closet and a new look, the looks written for them and the sessions between the
 * two. The menu holds Report or block and End connection.
 *
 * The server decides what is allowed (get_pro_connection returns the actions); the screen only draws the
 * buttons. When the role's own gate would refuse (the feature is paused, the account is suspended, the terms
 * are out of date) the server answers with safetyOnly, and the screen shows the ways out and nothing else: End
 * connection, Report or block. An ended connection is read-only history. A connection that was closed by a block
 * reads as a "Former client" with no content; the screen never says why.
 *
 * Navigation goes through callbacks to routes of the Clients stack (ProThread, ProClientCloset, ProLookEditor,
 * ProRecommendation). Sheets are never nested: a report started from the session sheet closes it first.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProAppointmentRow from '../components/ProAppointmentRow';
import ProAppointmentSheet from '../components/ProAppointmentSheet';
import ProLookCard from '../components/ProLookCard';
import ProSafetySheet from '../components/ProSafetySheet';
import ProStatusBadge from '../components/ProStatusBadge';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess } from '../hooks/useProAccess';
import {
  endProConnection,
  getProConnection,
  listProLooks,
  listProSessions,
} from '../services/proService';
import { proClosetNotShared } from '../config/proRules';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import { closedExplanation, connectionTitle } from '../utils/proFormat';
import type { ProClientsStackParamList } from '../types/proRoutes';
import type { ProAppointment, ProConnectionDetail, ProLookSummary, ProReportRefType } from '../types/pro';

/** How many looks one page holds. */
const LOOK_PAGE = 20;
/** A sheet that is leaving is hidden first and the next one is shown after this wait, on iOS (two modals changing at once are unreliable). */
const HANDOFF_MS = 600;

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'pro_terms_required', 'not_deployed',
]);

type Phase = 'loading' | 'ready' | 'failed' | 'gone';
type SheetState = { mode: 'propose' } | { mode: 'view'; appointment: ProAppointment };
type SafetyTarget = { refType: ProReportRefType; refId: string; label: string };

const shortDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const DetailSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading this client">
    <Skeleton width="40%" height={14} />
    <Skeleton height={44} style={{ marginTop: 16 }} />
    <Skeleton height={64} style={{ marginTop: 20 }} />
    <Skeleton height={64} style={{ marginTop: 10 }} />
  </View>
);

const ProClientDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ProClientsStackParamList, 'ProClientDetail'>>();
  const { connectionId } = route.params;
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();

  const [phase, setPhase] = useState<Phase>('loading');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [detail, setDetail] = useState<ProConnectionDetail | null>(null);
  const [looks, setLooks] = useState<ProLookSummary[]>([]);
  const [moreLooks, setMoreLooks] = useState(false);
  const [loadingMoreLooks, setLoadingMoreLooks] = useState(false);
  const [sessions, setSessions] = useState<ProAppointment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ mode: 'propose' });
  const [sheetOpen, setSheetOpen] = useState(false);
  // The target is kept after the sheet closes so it can slide out with its content.
  const [safety, setSafety] = useState<SafetyTarget | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const alive = useRef(true);
  const loadSeq = useRef(0);
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (handoff.current !== null) clearTimeout(handoff.current);
    };
  }, []);

  const ready = access.state === 'ready' ? access : null;
  // Reading a connection needs only a sign-in; guests, a server without the functions and a failed status read have nothing to read.
  const canRead = access.state === 'ready' || access.state === 'paused' || access.state === 'suspended';

  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    try {
      const d = await getProConnection(connectionId);
      if (!alive.current || mine !== loadSeq.current) return;
      // This page is the stylist's. A connection in which the person is the client is read from Home > Stylists.
      if (d.myRole !== 'stylist') {
        setPhase('gone');
        return;
      }
      // The history of an ended connection is readable under any gate; the content of an open one needs the role's own.
      let nextLooks: ProLookSummary[] = [];
      let nextSessions: ProAppointment[] = [];
      if (d.status === 'ended' || !d.safetyOnly) {
        [nextLooks, nextSessions] = await Promise.all([
          listProLooks(connectionId, { limit: LOOK_PAGE }),
          listProSessions({ connectionId, scope: d.status === 'ended' ? 'past' : 'upcoming' }),
        ]);
        if (!alive.current || mine !== loadSeq.current) return;
      }
      setDetail(d);
      setLooks(nextLooks);
      setMoreLooks(nextLooks.length >= LOOK_PAGE);
      setSessions(nextSessions);
      setPhase('ready');
      setRefreshFailed(false);
    } catch (e) {
      if (!alive.current || mine !== loadSeq.current) return;
      const err = toProError(e);
      if (err.code === 'pro_unavailable') {
        setPhase('gone');
        return;
      }
      if (ACCESS_CODES.has(err.code)) refresh();
      // A failed re-read leaves what is on screen; only a first load that fails replaces the screen.
      setRefreshFailed(true);
      setPhase(p => (p === 'ready' ? 'ready' : 'failed'));
    }
  }, [connectionId, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (canRead) load();
    }, [canRead, load]),
  );

  const loadOlderLooks = async () => {
    if (loadingMoreLooks || looks.length === 0) return;
    setLoadingMoreLooks(true);
    try {
      const page = await listProLooks(connectionId, { before: looks[looks.length - 1].updatedAt, limit: LOOK_PAGE });
      if (!alive.current) return;
      setLooks(cur => {
        const seen = new Set(cur.map(l => l.id));
        return [...cur, ...page.filter(l => !seen.has(l.id))];
      });
      setMoreLooks(page.length >= LOOK_PAGE);
    } catch (e) {
      if (alive.current) Alert.alert('Couldn’t load more looks', proErrorMessage(e, 'Please try again.'));
    } finally {
      if (alive.current) setLoadingMoreLooks(false);
    }
  };

  // ── derived ──

  const label = detail ? connectionTitle({ otherLabel: detail.otherLabel, myRole: 'stylist' }) : 'Client';
  const actions = detail?.actions;
  const ended = detail?.status === 'ended';
  // Drafts first, then the server's order (newest change first).
  const orderedLooks = [...looks].sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft'));
  const safetyOnly = Boolean(detail?.safetyOnly) || (ready !== null && ready.stylist !== 'available');

  // ── actions ──

  const openAfterSheet = (open: () => void) => {
    setSheetOpen(false);
    if (Platform.OS !== 'ios') {
      open();
      return;
    }
    if (handoff.current !== null) clearTimeout(handoff.current);
    handoff.current = setTimeout(() => {
      handoff.current = null;
      open();
    }, HANDOFF_MS);
  };

  const openSafety = (target: SafetyTarget) => {
    setSafety(target);
    setSafetyOpen(true);
  };

  const openLook = (look: ProLookSummary) => {
    if (look.status === 'draft') {
      // A draft of an ended connection can no longer be sent or changed.
      if (actions?.canRecommend) navigation.navigate('ProLookEditor', { connectionId, recId: look.id });
      return;
    }
    navigation.navigate('ProRecommendation', { recId: look.id, connectionId });
  };

  const confirmEnd = () => {
    setMenuOpen(false);
    Alert.alert(
      'End connection',
      `Your connection with ${label} ends. You won’t be able to message them or see their closet. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End connection',
          style: 'destructive',
          onPress: async () => {
            if (ending) return;
            setEnding(true);
            try {
              await endProConnection(connectionId);
              if (alive.current) await load();
            } catch (e) {
              if (alive.current) Alert.alert('Couldn’t end the connection', proErrorMessage(e, 'Please try again.'));
            } finally {
              if (alive.current) setEnding(false);
            }
          },
        },
      ],
    );
  };

  // ── header ──

  const menuRow = (icon: string, text: string, onPress: () => void, danger = false) => (
    <Pressable
      key={text}
      onPress={() => {
        setMenuOpen(false);
        onPress();
      }}
      style={[styles.menuRow, { borderBottomColor: theme.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={text}
    >
      <Icon name={icon} size={20} color={danger ? theme.colors.danger : theme.colors.text} />
      <Text variant="body" color={danger ? 'danger' : 'primary'} style={{ marginLeft: 12 }}>{text}</Text>
    </Pressable>
  );

  const header = (
    <View>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3" style={styles.title} numberOfLines={1}>{label}</Text>
        {detail ? (
          <Pressable
            onPress={() => setMenuOpen(o => !o)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Client menu"
            accessibilityState={{ expanded: menuOpen }}
          >
            <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
          </Pressable>
        ) : null}
      </View>
      {menuOpen && detail ? (
        // Rows in the header block, not a modal: the sheets they open are modals themselves.
        <View style={{ paddingHorizontal: 20, backgroundColor: theme.colors.surface }}>
          {menuRow('flag-outline', `Report or block ${label}`, () => openSafety({ refType: 'connection', refId: connectionId, label }))}
          {actions?.canEnd ? menuRow('close-circle-outline', 'End connection', confirmEnd, true) : null}
        </View>
      ) : null}
    </View>
  );

  // ── body ──

  // Paused, suspended, out of date or the terms not accepted: the notice says so; the ways out below it stay.
  const roleNotice = () => (
    <ProAccessNotice access={access} role="stylist" onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} />
  );

  const statusLine = detail ? (
    <View style={styles.statusLine}>
      <ProStatusBadge kind="connection" status={detail.status} />
      <Text variant="caption" color="muted" style={styles.statusText}>
        {ended
          ? closedExplanation(detail.endedBy)
          : shortDate(detail.startedAt) ? `Connected ${shortDate(detail.startedAt)}` : 'Connected'}
      </Text>
    </View>
  ) : null;

  const content = () => {
    if (!detail) return null;
    const closetNote = (() => {
      if (ended || safetyOnly) return null;
      if (actions?.canViewCloset) {
        const until = shortDate(detail.closet.expiresAt);
        return until ? `${label} has shared their closet until ${until}.` : `${label} has shared their closet.`;
      }
      return proClosetNotShared(label);
    })();

    return (
      <View>
        {statusLine}

        {!safetyOnly || ended ? (
          <View style={styles.buttons}>
            <Button
              label="Message"
              onPress={() => navigation.navigate('ProThread', { connectionId })}
              style={styles.flexButton}
              accessibilityLabel="Message"
            />
            {!ended ? (
              <Button
                label="Closet"
                variant="secondary"
                disabled={!actions?.canViewCloset}
                onPress={() => navigation.navigate('ProClientCloset', { connectionId })}
                style={styles.flexButton}
                accessibilityLabel="Closet"
              />
            ) : null}
            {actions?.canRecommend ? (
              <Button
                label="New look"
                variant="secondary"
                onPress={() => navigation.navigate('ProLookEditor', { connectionId })}
                style={styles.flexButton}
                accessibilityLabel="New look"
              />
            ) : null}
          </View>
        ) : null}
        {closetNote ? <Text variant="caption" color="muted" style={styles.closetNote}>{closetNote}</Text> : null}

        {!safetyOnly || ended ? (
          <View>
            <View style={styles.section}>
              <Text variant="overline" color="muted" style={styles.sectionTitle}>Looks</Text>
              {orderedLooks.length === 0 ? (
                <Text variant="bodySmall" color="muted">
                  {ended ? 'No looks.' : 'No looks yet. Create one from the pieces your client shares.'}
                </Text>
              ) : (
                orderedLooks.map(look => (
                  <ProLookCard key={look.id} look={look} mine connectionId={connectionId} onPress={() => openLook(look)} />
                ))
              )}
              {moreLooks ? (
                <Button
                  label="Show older looks"
                  variant="secondary"
                  size="sm"
                  loading={loadingMoreLooks}
                  onPress={loadOlderLooks}
                  style={styles.centered}
                />
              ) : null}
            </View>

            <View style={styles.section}>
              <Text variant="overline" color="muted" style={styles.sectionTitle}>
                {ended ? 'Past sessions' : 'Sessions'}
              </Text>
              {sessions.length === 0 ? (
                <Text variant="bodySmall" color="muted">{ended ? 'No sessions.' : 'No upcoming sessions.'}</Text>
              ) : (
                sessions.map(a => (
                  <ProAppointmentRow
                    key={a.id}
                    appointment={a}
                    onPress={() => {
                      setSheet({ mode: 'view', appointment: a });
                      setSheetOpen(true);
                    }}
                  />
                ))
              )}
              {actions?.canPropose ? (
                <Button
                  label="Propose a session"
                  variant="secondary"
                  onPress={() => {
                    setSheet({ mode: 'propose' });
                    setSheetOpen(true);
                  }}
                  style={styles.proposeButton}
                  accessibilityLabel="Propose a session"
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const body = () => {
    if (access.state === 'loading') return <DetailSkeleton />;
    if (!canRead) return <ProAccessNotice access={access} role="stylist" onRefresh={refresh} />;
    if (phase === 'gone') {
      return (
        <EmptyState
          icon={<Icon name="person-remove-outline" size={32} color={theme.colors.textSubtle} />}
          title={proErrorMessage(new ProError('pro_unavailable'))}
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      );
    }
    if (phase === 'loading') return <DetailSkeleton />;
    if (phase === 'failed') return <LoadError what="client" title="Couldn’t load this client" onRetry={load} />;
    return (
      <View>
        {refreshFailed ? (
          <View style={styles.errorBanner}>
            <LoadError what="client" title="Couldn’t refresh this client" variant="banner" onRetry={load} />
          </View>
        ) : null}
        {roleNotice()}
        {content()}
      </View>
    );
  };

  return (
    <Screen scrollable padded header={header}>
      {body()}
      <ProAppointmentSheet
        visible={sheetOpen}
        mode={sheet.mode}
        connectionId={connectionId}
        appointment={sheet.mode === 'view' ? sheet.appointment : undefined}
        onClose={() => setSheetOpen(false)}
        onChanged={() => {
          setSheetOpen(false);
          load();
        }}
        onReport={a => openAfterSheet(() => openSafety({ refType: 'appointment', refId: a.id, label }))}
      />
      {safety ? (
        <ProSafetySheet
          visible={safetyOpen}
          refType={safety.refType}
          refId={safety.refId}
          label={safety.label}
          connectionId={connectionId}
          onClose={() => setSafetyOpen(false)}
          onBlocked={() => {
            setSafetyOpen(false);
            navigation.goBack();
          }}
        />
      ) : null}
      {ready?.stylist === 'needs_terms' ? (
        <ProTermsSheet
          visible={termsOpen}
          role="stylist"
          needsAdult={!ready.status.adultConfirmed}
          onAccepted={() => {
            setTermsOpen(false);
            refresh();
          }}
          onClose={() => setTermsOpen(false)}
        />
      ) : null}
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
  title: { flex: 1, marginLeft: 12, marginRight: 12 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  errorBanner: { marginBottom: 12 },
  statusLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  statusText: { marginLeft: 10, flex: 1 },
  buttons: { flexDirection: 'row', gap: 8 },
  flexButton: { flex: 1, alignSelf: 'stretch' },
  closetNote: { marginTop: 10 },
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 10 },
  centered: { alignSelf: 'center', marginTop: 4 },
  proposeButton: { marginTop: 8, alignSelf: 'stretch' },
});

export default ProClientDetailScreen;
