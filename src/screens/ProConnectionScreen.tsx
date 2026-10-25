/**
 * ProConnectionScreen — a client's page for one stylist: who they are, what they can see of the closet, the
 * looks they sent, the sessions, the conversation, and the ways to rename, end, report or block.
 *
 * The server decides what is allowed: `actions` from get_pro_connection says which buttons exist, and the screen
 * only draws them. When the person's own gate would refuse (the feature is paused, the account is suspended, the
 * terms are out of date or this build is older than the server) the page shrinks to what needs no terms and no
 * switch: the sharing summary with "Stop sharing", "End connection" and the Report or block menu, under the same
 * plain notice every pro screen uses. An ended connection reads as history: the sentence that says who ended it,
 * and the looks, sessions and messages that are still kept, read-only.
 *
 * Network behaviour, in short:
 *  - the connection is read on focus (a sequence number drops an answer that arrives after a newer request);
 *  - looks and sessions are read after it, only when the person may use them, and a failure there shows a banner
 *    in its own section instead of taking the page down;
 *  - a write that fails keeps what was typed; one that needs the terms opens them and repeats itself once agreed.
 *
 * Navigation goes through routes registered next to this one in HomeStack (ProShare, ProRecommendation,
 * ProThread). The shared components take callbacks. Nothing about the stylist is stored on the device.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Input, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProAppointmentRow from '../components/ProAppointmentRow';
import ProAppointmentSheet from '../components/ProAppointmentSheet';
import ProLookCard from '../components/ProLookCard';
import ProSafetySheet from '../components/ProSafetySheet';
import ProStylistCard from '../components/ProStylistCard';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess, type ProAccess } from '../hooks/useProAccess';
import {
  PRO_ALIAS_RANGE,
  PRO_LIMITS,
  PRO_SAFETY_TIPS,
  PRO_SAFETY_TIPS_TITLE,
} from '../config/proRules';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import {
  endProConnection,
  getProConnection,
  listProLooks,
  listProSessions,
  setProAlias,
  setProGrant,
} from '../services/proService';
import type { ProAppointment, ProConnectionDetail, ProLookSummary, ProReportRefType } from '../types/pro';
import type { ProConnectionParams } from '../types/proRoutes';
import { closedExplanation } from '../utils/proFormat';

type Phase = 'loading' | 'ready' | 'gone' | 'failed';
type Gate = 'loading' | 'blocked' | 'safety' | 'full';
type Busy = 'alias' | 'end' | 'stop' | null;
type SheetName = 'safety' | 'propose' | 'session';
type SafetyTarget = { refType: ProReportRefType; refId: string; label: string };

/** Looks are read this many at a time. */
const LOOKS_PAGE = 20;
/** How long one modal is given to leave on iOS before the next is shown. */
const HANDOFF_MS = 700;

// Connections whose stylist card has been opened in this run of the app. The first visit shows the whole card;
// later visits show it collapsed. In memory only, and only connection ids.
const visited = new Set<string>();

const gateOf = (access: ProAccess): Gate => {
  switch (access.state) {
    case 'loading': return 'loading';
    case 'guest':
    case 'not_deployed':
    case 'error': return 'blocked';
    case 'paused':
    case 'suspended': return 'safety';
    default: return access.client === 'available' ? 'full' : 'safety';
  }
};

const piecesText = (n: number) => (n === 1 ? '1 piece' : `${n} pieces`);

const dayText = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

/** One plain sentence for what is shared: "All your pieces are shared.", "3 pieces you chose are shared." */
const sharedLine = (c: ProConnectionDetail['closet']): string => {
  if (c.itemMode === 'all') return 'All your pieces are shared.';
  if (c.itemMode === 'selected') {
    const n = c.itemCount ?? 0;
    return `${piecesText(n)} you chose ${n === 1 ? 'is' : 'are'} shared.`;
  }
  return 'Your closet is shared.';
};

/** Messages stay readable this long after a connection ends (the server deletes them then). */
const messagesStillThere = (d: ProConnectionDetail): boolean => {
  if (!d.endedAt) return true;
  const ended = new Date(d.endedAt).getTime();
  if (Number.isNaN(ended)) return true;
  return Date.now() - ended < PRO_LIMITS.ended_message_retention_days * 24 * 60 * 60 * 1000;
};

const ProConnectionScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { connectionId } = (route.params || {}) as Partial<ProConnectionParams>;
  const { theme } = useTheme();
  const { access, refresh: refreshAccess } = useProAccess();
  const gate = gateOf(access);
  const listable = access.state === 'ready' || access.state === 'paused' || access.state === 'suspended';

  const [phase, setPhase] = useState<Phase>(connectionId ? 'loading' : 'gone');
  const [banner, setBanner] = useState(false);
  const [detail, setDetail] = useState<ProConnectionDetail | null>(null);

  const [looks, setLooks] = useState<ProLookSummary[]>([]);
  const [moreLooks, setMoreLooks] = useState(false);
  const [needsMe, setNeedsMe] = useState<ProAppointment[]>([]);
  const [upcoming, setUpcoming] = useState<ProAppointment[]>([]);
  const [past, setPast] = useState<ProAppointment[]>([]);
  const [workFailed, setWorkFailed] = useState(false);
  // False until looks and sessions have been read once, so "no looks yet" is never said while they load.
  const [workReady, setWorkReady] = useState(false);

  const [open, setOpen] = useState<SheetName | null>(null);
  // The targets are kept after their sheets close so they can slide out with their content.
  const [safety, setSafety] = useState<SafetyTarget | null>(null);
  const [session, setSession] = useState<ProAppointment | null>(null);
  // Which form the appointment sheet shows. Kept after it closes so it does not change shape while sliding out.
  const [sheetMode, setSheetMode] = useState<'propose' | 'view'>('propose');

  const [aboutOpen, setAboutOpen] = useState(() => !(connectionId && visited.has(connectionId)));
  const [tipsOpen, setTipsOpen] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [aliasText, setAliasText] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [termsOpen, setTermsOpen] = useState(true);
  const [retry, setRetry] = useState<{ run: () => void } | null>(null);

  const alive = useRef(true);
  const busyRef = useRef(false);
  const loaded = useRef(false);
  // A number per request: an answer that arrives after a newer request started is dropped.
  const requestId = useRef(0);
  const workId = useRef(0);
  const moreBusy = useRef(false);
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const detailRef = useRef<ProConnectionDetail | null>(null);
  detailRef.current = detail;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (handoff.current !== null) clearTimeout(handoff.current);
    };
  }, []);

  // ── reading ──

  /** Looks and sessions. Only what the person may use is asked for; an ended connection is history and needs only a sign-in. */
  const loadWork = useCallback(async (d: ProConnectionDetail) => {
    const id = ++workId.current;
    if (!connectionId) return;
    const ended = d.status === 'ended';
    const allowed = ended || (!d.safetyOnly && gateRef.current === 'full');
    if (!allowed) {
      setLooks([]);
      setMoreLooks(false);
      setNeedsMe([]);
      setUpcoming([]);
      setPast([]);
      setWorkFailed(false);
      setWorkReady(true);
      return;
    }
    try {
      const [lookRows, mine, soon, earlier] = await Promise.all([
        listProLooks(connectionId, { limit: LOOKS_PAGE }),
        ended ? Promise.resolve([] as ProAppointment[]) : listProSessions({ connectionId, scope: 'needs_me' }),
        ended ? Promise.resolve([] as ProAppointment[]) : listProSessions({ connectionId, scope: 'upcoming' }),
        ended ? listProSessions({ connectionId, scope: 'past' }) : Promise.resolve([] as ProAppointment[]),
      ]);
      if (id !== workId.current || !alive.current) return;
      setLooks(lookRows);
      setMoreLooks(lookRows.length >= LOOKS_PAGE);
      setNeedsMe(mine);
      setUpcoming(soon);
      setPast(earlier);
      setWorkFailed(false);
      setWorkReady(true);
    } catch {
      if (id === workId.current && alive.current) {
        setWorkFailed(true);
        setWorkReady(true);
      }
    }
  }, [connectionId]);

  const load = useCallback(async () => {
    if (!connectionId) return;
    const id = ++requestId.current;
    try {
      const d = await getProConnection(connectionId);
      if (id !== requestId.current || !alive.current) return;
      // The stylist's side of a connection has its own screens; this page is the client's.
      if (d.myRole !== 'client') {
        setPhase('gone');
        return;
      }
      loaded.current = true;
      visited.add(connectionId);
      setDetail(d);
      setPhase('ready');
      setBanner(false);
      // The server's own gate says the ways out only; make this screen's idea of the person's access catch up.
      if (d.safetyOnly && gateRef.current === 'full') refreshAccess();
      await loadWork(d);
    } catch (e) {
      if (id !== requestId.current || !alive.current) return;
      const code = toProError(e).code;
      if (code === 'pro_unavailable') {
        setPhase('gone');
        return;
      }
      // What this person may do may have changed (paused, signed out, terms): ask again.
      if (code === 'not_authenticated' || code === 'pro_disabled' || code === 'pro_suspended' || code === 'not_deployed') {
        refreshAccess();
      }
      if (loaded.current) setBanner(true);
      else setPhase('failed');
    }
  }, [connectionId, loadWork, refreshAccess]);

  useFocusEffect(
    useCallback(() => {
      if (!listable) {
        requestId.current++;
        return undefined;
      }
      load();
      return undefined;
    }, [listable, load]),
  );

  // The person's access changed under a page that is already showing (terms agreed, a pause lifted): what they
  // may read changed with it, so look and session are read again.
  useEffect(() => {
    if (detailRef.current) loadWork(detailRef.current);
  }, [gate, loadWork]);

  const pullToRefresh = async () => {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  };

  const showMoreLooks = async () => {
    const last = looks[looks.length - 1];
    if (!connectionId || !last || moreBusy.current) return;
    moreBusy.current = true;
    try {
      const rows = await listProLooks(connectionId, { before: last.updatedAt, limit: LOOKS_PAGE });
      if (!alive.current) return;
      setLooks(cur => {
        const seen = new Set(cur.map(l => l.id));
        return [...cur, ...rows.filter(l => !seen.has(l.id))];
      });
      setMoreLooks(rows.length >= LOOKS_PAGE);
    } catch {
      if (alive.current) setWorkFailed(true);
    } finally {
      moreBusy.current = false;
    }
  };

  const reloadWork = () => {
    if (detailRef.current) loadWork(detailRef.current);
  };

  // ── sheets ──

  /** One modal at a time; on iOS the one that is leaving gets time to go before the next is shown. */
  const show = (name: SheetName | null, afterLeaving = false) => {
    if (handoff.current !== null) {
      clearTimeout(handoff.current);
      handoff.current = null;
    }
    if (!name || !afterLeaving || Platform.OS !== 'ios') {
      setOpen(name);
      return;
    }
    setOpen(null);
    handoff.current = setTimeout(() => {
      handoff.current = null;
      if (alive.current) setOpen(name);
    }, HANDOFF_MS);
  };

  const label = detail?.otherLabel || 'Stylist';

  const openConnectionMenu = () => {
    if (!connectionId) return;
    setSafety({ refType: 'connection', refId: connectionId, label });
    show('safety');
  };

  const reportSession = (appointment: ProAppointment) => {
    setSafety({ refType: 'appointment', refId: appointment.id, label });
    show('safety', true);
  };

  // ── writing ──

  /** Runs one change. A write that needs the terms opens them and repeats itself once they are agreed. */
  const runWrite = async (kind: Exclude<Busy, null>, job: () => Promise<unknown>, fallback: string, repeat: () => void): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      await job();
      return true;
    } catch (e) {
      if (!alive.current) return false;
      const err = toProError(e);
      if (err.code === 'pro_terms_required') setRetry({ run: repeat });
      else if (kind === 'alias') setAliasError(proErrorMessage(err, fallback));
      else setError(proErrorMessage(err, fallback));
      if (err.code === 'connection_ended' || err.code === 'pro_unavailable') load();
      return false;
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const stopSharing = async () => {
    if (!connectionId) return;
    if (await runWrite('stop', () => setProGrant(connectionId, { enabled: false }), "Couldn't stop sharing. Please try again.", stopSharing)) {
      load();
    }
  };

  const endConnection = async () => {
    if (!connectionId) return;
    if (await runWrite('end', () => endProConnection(connectionId), "Couldn't end this connection. Please try again.", endConnection)) {
      load();
    }
  };

  const confirmEnd = () =>
    Alert.alert(
      'End connection?',
      `You'll stop sharing with ${label} and your connection ends. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End connection', style: 'destructive', onPress: endConnection },
      ],
    );

  const startRename = () => {
    setAliasText(detail?.myAlias ?? '');
    setAliasError(null);
    setRenaming(true);
  };

  const saveAlias = async () => {
    if (!connectionId) return;
    const next = aliasText.trim();
    if (next.length < PRO_ALIAS_RANGE.min || next.length > PRO_ALIAS_RANGE.max) {
      setAliasError(proErrorMessage(new ProError('invalid_alias')));
      return;
    }
    setAliasError(null);
    if (await runWrite('alias', () => setProAlias(connectionId, next), "Couldn't change your name. Please try again.", saveAlias)) {
      if (alive.current) setRenaming(false);
      load();
    }
  };

  // ── terms ──

  const termsNeeded = access.state === 'ready' && access.client === 'needs_terms';
  const adultMissing = !(access.state === 'ready' && access.status.adultConfirmed);
  const termsSheet = (
    <ProTermsSheet
      visible={((termsNeeded && termsOpen) || retry !== null) && open === null}
      role="client"
      needsAdult={adultMissing}
      onAccepted={() => {
        const again = retry;
        setRetry(null);
        setTermsOpen(true);
        refreshAccess();
        again?.run();
      }}
      onClose={() => {
        setRetry(null);
        setTermsOpen(false);
      }}
    />
  );

  // ── pieces of the page ──

  const goBack = () => navigation.goBack();

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>{label}</Text>
      {detail ? (
        <Pressable
          onPress={openConnectionMenu}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${label}`}
        >
          <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  const sheets = (
    <>
      {safety ? (
        <ProSafetySheet
          visible={open === 'safety'}
          refType={safety.refType}
          refId={safety.refId}
          label={safety.label}
          connectionId={connectionId}
          onClose={() => show(null)}
          onBlocked={() => {
            show(null);
            goBack();
          }}
        />
      ) : null}
      <ProAppointmentSheet
        visible={open === 'propose' || open === 'session'}
        mode={sheetMode}
        connectionId={connectionId}
        appointment={sheetMode === 'view' ? session ?? undefined : undefined}
        onClose={() => show(null)}
        onChanged={reloadWork}
        onReport={reportSession}
      />
      {termsSheet}
    </>
  );

  const errorText = error ? (
    <Text variant="caption" color="danger" style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
  ) : null;

  const openSession = (appointment: ProAppointment) => {
    setSession(appointment);
    setSheetMode('view');
    show('session');
  };

  const openPropose = () => {
    setSheetMode('propose');
    show('propose');
  };

  /** What this stylist can see of the closet right now, and the ways to change or stop it. */
  const sharingCard = (d: ProConnectionDetail, full: boolean) => {
    const c = d.closet;
    return (
      <Card style={styles.section}>
        <Text variant="h4">{`What ${d.otherLabel} can see`}</Text>
        {c.shared ? (
          <View style={styles.lines}>
            <Text variant="body">{sharedLine(c)}</Text>
            {c.expiresAt ? <Text variant="bodySmall" color="muted">{`Sharing ends on ${dayText(c.expiresAt)}.`}</Text> : null}
            {c.expiresSoon ? (
              <Text variant="bodySmall" weight="600" style={{ color: theme.colors.warning }}>
                {`Your stylist's access ends on ${dayText(c.expiresAt)}. Keep sharing?`}
              </Text>
            ) : null}
            <Text variant="bodySmall" color="muted">
              {c.lastViewedAt ? `Last viewed ${dayText(c.lastViewedAt)}.` : 'Not viewed yet.'}
            </Text>
            <Text variant="bodySmall" color="muted">{`Closet pages viewed in the last 30 days: ${c.views30d}.`}</Text>
          </View>
        ) : (
          <Text variant="body" color="muted" style={styles.lines}>{`${d.otherLabel} can't see your closet.`}</Text>
        )}
        {errorText}
        <View style={styles.buttons}>
          {c.shared && d.actions.canShare && full ? (
            <Button label="Change" variant="secondary" onPress={() => navigation.navigate('ProShare', { connectionId })} style={{ flex: 1 }} />
          ) : null}
          {!c.shared && d.actions.canShare && full ? (
            <Button label="Choose what to share" onPress={() => navigation.navigate('ProShare', { connectionId })} style={{ flex: 1 }} />
          ) : null}
          {c.shared && d.actions.canStopSharing ? (
            <Button
              label="Stop sharing"
              variant="secondary"
              onPress={stopSharing}
              loading={busy === 'stop'}
              disabled={busy !== null}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      </Card>
    );
  };

  const endButton = (d: ProConnectionDetail) =>
    d.actions.canEnd ? (
      <Button
        label="End connection"
        variant="secondary"
        onPress={confirmEnd}
        loading={busy === 'end'}
        disabled={busy !== null}
        fullWidth
        style={styles.section}
      />
    ) : null;

  /** Looks the stylist sent. Read-only history on an ended connection. */
  const looksSection = (d: ProConnectionDetail) => {
    const ended = d.status === 'ended';
    if (ended && looks.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text variant="overline" color="muted" style={styles.sectionTitle}>Looks</Text>
        {!workReady ? (
          <Skeleton height={60} borderRadius={12} />
        ) : looks.length === 0 ? (
          workFailed ? null : <Text variant="body" color="muted">No looks yet. Your stylist will send them here.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {looks.map(look => (
              <ProLookCard
                key={look.id}
                look={look}
                mine={false}
                onPress={() => navigation.navigate('ProRecommendation', { recId: look.id, connectionId })}
              />
            ))}
          </View>
        )}
        {moreLooks ? <Button label="Show older looks" variant="ghost" size="sm" onPress={showMoreLooks} style={{ marginTop: 8 }} /> : null}
      </View>
    );
  };

  /** Sessions: the ones that wait for an answer first, then the rest. */
  const sessionsSection = (d: ProConnectionDetail) => {
    const ended = d.status === 'ended';
    const waiting = new Set(needsMe.map(a => a.id));
    const rest = (ended ? past : upcoming).filter(a => !waiting.has(a.id));
    if (ended && rest.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text variant="overline" color="muted" style={styles.sectionTitle}>Sessions</Text>
        {needsMe.length > 0 ? (
          <View style={{ gap: 10, marginBottom: 10 }}>
            <Text variant="bodySmall" weight="600">Needs your answer</Text>
            {needsMe.map(a => <ProAppointmentRow key={a.id} appointment={a} onPress={() => openSession(a)} />)}
          </View>
        ) : null}
        {rest.length > 0 ? (
          <View style={{ gap: 10 }}>
            {rest.map(a => <ProAppointmentRow key={a.id} appointment={a} onPress={() => openSession(a)} />)}
          </View>
        ) : !workReady ? (
          <Skeleton height={60} borderRadius={12} />
        ) : needsMe.length === 0 && !workFailed ? (
          <Text variant="body" color="muted">No sessions yet.</Text>
        ) : null}
        {d.actions.canPropose ? (
          <Button
            label="Request a session"
            variant="secondary"
            onPress={openPropose}
            fullWidth
            style={{ marginTop: 12 }}
          />
        ) : null}
      </View>
    );
  };

  const renameCard = (d: ProConnectionDetail) => (
    <Card style={styles.section}>
      <Text variant="h4">{`Name shown to ${d.otherLabel}`}</Text>
      {renaming ? (
        <View style={{ marginTop: 10 }}>
          <Input
            value={aliasText}
            onChangeText={text => {
              setAliasText(text);
              setAliasError(null);
            }}
            maxLength={PRO_ALIAS_RANGE.max}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={saveAlias}
            error={aliasError ?? undefined}
            helper={`${PRO_ALIAS_RANGE.min} to ${PRO_ALIAS_RANGE.max} characters`}
            accessibilityLabel={`Name shown to ${d.otherLabel}`}
          />
          <View style={[styles.buttons, { marginTop: 12 }]}>
            <Button label="Cancel" variant="secondary" onPress={() => setRenaming(false)} disabled={busy !== null} style={{ flex: 1 }} />
            <Button label="Save name" onPress={saveAlias} loading={busy === 'alias'} disabled={busy !== null} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <View style={styles.lines}>
          <Text variant="body">{d.myAlias || 'No name set'}</Text>
          <Button label="Rename" variant="secondary" size="sm" onPress={startRename} style={{ marginTop: 10 }} />
        </View>
      )}
    </Card>
  );

  const tipsCard = (
    <Card style={styles.section} padding={0}>
      <Pressable
        onPress={() => setTipsOpen(open => !open)}
        style={styles.tipsHeader}
        accessibilityRole="button"
        accessibilityLabel={PRO_SAFETY_TIPS_TITLE}
        accessibilityState={{ expanded: tipsOpen }}
      >
        <Text variant="h4" style={{ flex: 1 }}>{PRO_SAFETY_TIPS_TITLE}</Text>
        <Icon name={tipsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textSubtle} />
      </Pressable>
      {tipsOpen ? (
        <View style={styles.tips}>
          {PRO_SAFETY_TIPS.map(tip => (
            <Text key={tip} variant="bodySmall" color="muted" style={{ marginBottom: 6 }}>{`• ${tip}`}</Text>
          ))}
        </View>
      ) : null}
    </Card>
  );

  const messageButton = (d: ProConnectionDetail) => {
    const ended = d.status === 'ended';
    if (ended ? !messagesStillThere(d) : !d.actions.canMessage) return null;
    return (
      <Button
        label={ended ? 'View messages' : 'Message'}
        variant={ended ? 'secondary' : 'primary'}
        onPress={() => navigation.navigate('ProThread', { connectionId })}
        fullWidth
        style={styles.section}
      />
    );
  };

  // ── the page ──

  let content: React.ReactNode;
  if (gate === 'loading' || (listable && phase === 'loading')) {
    content = (
      <View accessibilityLabel="Loading connection">
        <Skeleton height={96} borderRadius={16} />
        <Skeleton height={120} borderRadius={16} style={{ marginTop: 16 }} />
        <Skeleton height={64} borderRadius={16} style={{ marginTop: 16 }} />
      </View>
    );
  } else if (gate === 'blocked') {
    content = <ProAccessNotice access={access} onRefresh={refreshAccess} />;
  } else if (phase === 'gone') {
    content = (
      <EmptyState
        icon={<Icon name="lock-closed-outline" size={32} color={theme.colors.textSubtle} />}
        title="This is no longer available."
        actionLabel="Back"
        onAction={goBack}
      />
    );
  } else if (phase === 'failed' || !detail) {
    content = <LoadError what="connection" onRetry={load} />;
  } else {
    const ended = detail.status === 'ended';
    const full = gate === 'full' && !detail.safetyOnly;
    content = (
      <>
        {banner ? (
          <View style={{ marginBottom: 12 }}>
            <LoadError variant="banner" what="connection" onRetry={load} />
          </View>
        ) : null}

        {ended ? (
          <Card>
            <Text variant="body">{closedExplanation(detail.endedBy)}</Text>
          </Card>
        ) : null}

        {!full && !ended ? (
          <ProAccessNotice access={access} onRefresh={refreshAccess} onReadTerms={() => setTermsOpen(true)} />
        ) : null}

        {full && detail.stylist ? (
          <View>
            <ProStylistCard stylist={detail.stylist} compact={!aboutOpen} />
            <Button
              label={aboutOpen ? 'Show less' : 'Show more'}
              accessibilityLabel={aboutOpen ? `Show less about ${detail.otherLabel}` : `Show more about ${detail.otherLabel}`}
              variant="ghost"
              size="sm"
              onPress={() => setAboutOpen(o => !o)}
            />
          </View>
        ) : null}

        {!ended ? sharingCard(detail, full) : null}

        {workFailed && (ended || full) ? (
          <View style={styles.section}>
            <LoadError variant="banner" what="looks and sessions" onRetry={reloadWork} />
          </View>
        ) : null}

        {ended || full ? looksSection(detail) : null}
        {ended || full ? sessionsSection(detail) : null}
        {ended || full ? messageButton(detail) : null}
        {full && !ended && detail.actions.canRename ? renameCard(detail) : null}
        {endButton(detail)}
        {full && !ended ? tipsCard : null}
        {!full && !ended ? errorText : null}
      </>
    );
  }

  return (
    <Screen
      scrollable
      padded
      header={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={theme.colors.accent} />}
    >
      {content}
      {sheets}
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
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  lines: {
    marginTop: 10,
    gap: 2,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  error: {
    marginTop: 10,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  tips: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
});

export default ProConnectionScreen;
