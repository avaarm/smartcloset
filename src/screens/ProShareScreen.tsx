/**
 * ProShareScreen — "What <name> can see": the one place a client turns closet sharing on, changes it, renews it
 * and turns it off.
 *
 * Nothing is shared when a client connects, and there is no default choice: the client reads the consent text,
 * picks "Only pieces I choose" or "All my pieces" (neither is selected to begin with) and only then can tap
 * "Share my closet". The confirm line says how many pieces are being shared right now. Turning sharing on sends
 * this build's PRO_SHARE_TEXT_VERSION (the service adds it); a server that has moved on answers
 * `stale_consent_text`, shown as "Update SmartCloset to change sharing".
 *
 * Turning sharing off ("Stop sharing") asks nothing, sends no text version and is offered in every access state,
 * including a pause, a suspension, stale terms and an update the build needs: it is a way out, and the server
 * lets it through whatever the switch or the terms say. Changing the pieces of a live grant keeps its original
 * end date; only "Keep sharing" (shown for the last seven days) renews it.
 *
 * The server decides what is allowed (`actions` from get_pro_connection, the grant from get_pro_grant); this
 * screen draws what it is told. Navigation goes to AddClothing (a closet with nothing to share) and back.
 * Nothing is stored on the device.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProItemPicker from '../components/ProItemPicker';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess, type ProAccess } from '../hooks/useProAccess';
import { PRO_SHARE_ALL_HINT, proShareConsent } from '../config/proRules';
import { proErrorMessage, toProError } from '../services/proErrors';
import { closedExplanation } from '../utils/proFormat';
import { getProConnection, getProGrant, setProGrant } from '../services/proService';
import { getOwnedClothingItems } from '../services/storage';
import type { ProConnectionDetail, ProGrant, ProGrantMode } from '../types/pro';
import type { ProShareParams } from '../types/proRoutes';

type Phase = 'loading' | 'ready' | 'gone' | 'failed';
type Busy = 'share' | 'stop' | 'renew' | null;
type Gate = 'loading' | 'blocked' | 'safety' | 'full';
type Retry = { run: () => void };

/** How many events of the log show before "Show all". */
const EVENTS_SHOWN = 5;

const FALLBACK = "Couldn't change sharing. Please try again.";

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

const EVENT_TEXT: Record<string, string> = {
  granted: 'Sharing turned on',
  changed: 'Sharing changed',
  renewed: 'Sharing renewed',
  revoked: 'Sharing turned off',
  expired: 'Sharing ended',
  connection_ended: 'Connection ended',
};

const eventLine = (e: NonNullable<ProGrant['events']>[number]): string => {
  const base = EVENT_TEXT[e.event];
  if (!base) return '';
  const what = e.itemMode === 'all' ? 'all pieces' : e.itemMode === 'selected' && e.itemCount ? piecesText(e.itemCount) : '';
  const when = dayText(e.at);
  return [base, what ? `(${what})` : '', when ? `on ${when}` : ''].filter(Boolean).join(' ');
};

const ProShareScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { connectionId } = (route.params || {}) as Partial<ProShareParams>;
  const { theme } = useTheme();
  const { access, refresh: refreshAccess } = useProAccess();
  const gate = gateOf(access);
  const listable = access.state === 'ready' || access.state === 'paused' || access.state === 'suspended';

  const [phase, setPhase] = useState<Phase>(connectionId ? 'loading' : 'gone');
  const [banner, setBanner] = useState(false);
  const [detail, setDetail] = useState<ProConnectionDetail | null>(null);
  const [grant, setGrant] = useState<ProGrant | null>(null);
  // null until the closet has been counted (or when counting failed): the empty-closet state needs a real zero.
  const [ownedCount, setOwnedCount] = useState<number | null>(null);

  // The setup panel: opened by the switch (or "Change"), closed by Cancel, by a success, or by the switch.
  const [setupOpen, setSetupOpen] = useState(false);
  const [choice, setChoice] = useState<ProGrantMode | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [termsOpen, setTermsOpen] = useState(true);
  const [retry, setRetry] = useState<Retry | null>(null);

  const alive = useRef(true);
  const busyRef = useRef(false);
  const loaded = useRef(false);
  // A number per request: an answer that arrives after a newer request started is dropped.
  const requestId = useRef(0);
  const ownedRequestId = useRef(0);
  // The closet count the last read found: undefined before any read, null when the read failed.
  const ownedKnown = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!connectionId) return;
    const id = ++requestId.current;
    try {
      const [d, g] = await Promise.all([getProConnection(connectionId), getProGrant(connectionId)]);
      if (id !== requestId.current || !alive.current) return;
      // Sharing a closet is the client's page; a stylist's side of this connection has nothing to show here.
      if (d.myRole !== 'client') {
        setPhase('gone');
        return;
      }
      loaded.current = true;
      setDetail(d);
      setGrant(g);
      setPhase('ready');
      setBanner(false);
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
  }, [connectionId, refreshAccess]);

  const loadOwned = useCallback(async () => {
    const id = ++ownedRequestId.current;
    try {
      const items = await getOwnedClothingItems();
      if (id !== ownedRequestId.current || !alive.current) return;
      ownedKnown.current = items.length;
      setOwnedCount(items.length);
    } catch {
      if (id !== ownedRequestId.current || !alive.current) return;
      ownedKnown.current = null;
      setOwnedCount(null);
    }
  }, []);

  // Everything is read again on each return, which is cheap here (the server counts nothing). The closet is
  // walked page by page, so it is read once per visit, and again on a return only while it is unknown or empty:
  // that is the return from "Add clothing", or a read that failed.
  useFocusEffect(
    useCallback(() => {
      if (!listable) {
        requestId.current++;
        return undefined;
      }
      load();
      if (gate === 'full' && !ownedKnown.current) loadOwned();
      return undefined;
    }, [listable, gate, load, loadOwned]),
  );

  const goBack = () => navigation.goBack();
  const name = detail?.otherLabel || 'your stylist';

  // ── writing ──

  /** Runs one change to the grant. A write that needs the terms opens them and repeats itself once they are agreed. */
  const run = async (kind: Exclude<Busy, null>, job: () => Promise<ProGrant>, repeat: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      const next = await job();
      if (!alive.current) return;
      setGrant(next);
      setSetupOpen(false);
      setChoice(null);
      setPicked([]);
      load();
    } catch (e) {
      if (!alive.current) return;
      const err = toProError(e);
      if (err.code === 'pro_terms_required') {
        setRetry({ run: repeat });
      } else {
        setError(proErrorMessage(err, FALLBACK));
        if (err.code === 'item_not_found') loadOwned();
        if (err.code === 'connection_ended' || err.code === 'pro_unavailable') load();
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const share = () => {
    if (!connectionId || !choice) return;
    if (choice === 'selected' && picked.length === 0) return;
    const ids = picked;
    const mode = choice;
    run(
      'share',
      () => setProGrant(connectionId, mode === 'all' ? { enabled: true, itemMode: 'all' } : { enabled: true, itemMode: 'selected', itemIds: ids }),
      share,
    );
  };

  const stop = () => {
    if (!connectionId) return;
    run('stop', () => setProGrant(connectionId, { enabled: false }), stop);
  };

  const keepSharing = () => {
    if (!connectionId || !grant?.enabled || !grant.itemMode) return;
    const mode = grant.itemMode;
    const ids = grant.itemIds;
    run(
      'renew',
      () => setProGrant(connectionId, mode === 'all'
        ? { enabled: true, itemMode: 'all', renew: true }
        : { enabled: true, itemMode: 'selected', itemIds: ids ?? [], renew: true }),
      keepSharing,
    );
  };

  const openSetup = () => {
    setError(null);
    setChoice(null);
    setPicked([]);
    setSetupOpen(true);
  };

  const openChange = () => {
    if (!grant?.itemMode) return;
    setError(null);
    setChoice(grant.itemMode);
    setPicked(grant.itemMode === 'selected' ? grant.itemIds ?? [] : []);
    setSetupOpen(true);
  };

  const closeSetup = () => {
    setSetupOpen(false);
    setChoice(null);
    setPicked([]);
    setError(null);
  };

  const onSwitch = (next: boolean) => {
    if (busy) return;
    if (next) {
      if (!grant?.enabled) openSetup();
    } else if (grant?.enabled) {
      stop();
    } else {
      closeSetup();
    }
  };

  // ── pieces of the page ──

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
        {detail ? `What ${detail.otherLabel} can see` : 'Sharing'}
      </Text>
    </View>
  );

  const termsNeeded = access.state === 'ready' && access.client === 'needs_terms';
  const adultMissing = !(access.state === 'ready' && access.status.adultConfirmed);
  const termsSheet = (
    <ProTermsSheet
      visible={(termsNeeded && termsOpen) || retry !== null}
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

  const errorText = error ? (
    <Text variant="caption" color="danger" style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
  ) : null;

  /** What is shared right now, as one block of plain lines. */
  const summary = (g: ProGrant) => {
    const count = g.itemMode === 'selected' ? g.itemIds?.length ?? g.itemCount ?? 0 : null;
    const what = g.itemMode === 'all' ? 'All your pieces are shared.' : count !== null ? `${piecesText(count)} you chose ${count === 1 ? 'is' : 'are'} shared.` : 'Your closet is shared.';
    return (
      <View style={styles.summary}>
        <Text variant="body">{what}</Text>
        {g.expiresAt ? <Text variant="bodySmall" color="muted">{`Sharing ends on ${dayText(g.expiresAt)}.`}</Text> : null}
        <Text variant="bodySmall" color="muted">
          {g.lastViewedAt ? `Last viewed ${dayText(g.lastViewedAt)}.` : 'Not viewed yet.'}
        </Text>
        {typeof g.views30d === 'number' ? (
          <Text variant="bodySmall" color="muted">{`Closet pages viewed in the last 30 days: ${g.views30d}.`}</Text>
        ) : null}
      </View>
    );
  };

  const stopButton = (
    <Button
      label="Stop sharing"
      variant="secondary"
      onPress={stop}
      loading={busy === 'stop'}
      disabled={busy !== null}
      fullWidth
      style={{ marginTop: 12 }}
    />
  );

  // ── when the person cannot use sharing (yet): only the way out ──

  const safetyBody = () => (
    <>
      <ProAccessNotice access={access} onRefresh={refreshAccess} onReadTerms={() => setTermsOpen(true)} />
      {phase === 'ready' && grant?.enabled ? (
        <Card style={{ marginTop: 16 }}>
          <Text variant="h4">My closet</Text>
          {summary(grant)}
          {errorText}
          {stopButton}
        </Card>
      ) : null}
    </>
  );

  // ── the page ──

  const fullBody = () => {
    if (!grant || !detail) return null;
    const emptyCloset = ownedCount === 0 && !grant.enabled;
    const editing = grant.enabled && setupOpen;
    const showSetup = !emptyCloset && setupOpen;
    const sharedNow = choice === 'all' ? ownedCount : choice === 'selected' ? picked.length : null;
    const canConfirm = busy === null && (choice === 'all' ? ownedCount !== 0 : choice === 'selected' && picked.length > 0);
    const option = (value: ProGrantMode, label: string, hint: string, onPress: () => void) => {
      const selected = choice === value;
      return (
        <Pressable
          key={value}
          onPress={onPress}
          disabled={busy !== null}
          style={[
            styles.option,
            {
              borderRadius: theme.radius.lg,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
              backgroundColor: selected ? theme.colors.accentSubtle : theme.colors.surface,
            },
          ]}
          accessibilityRole="radio"
          accessibilityState={{ selected, disabled: busy !== null }}
          accessibilityLabel={label}
          accessibilityHint={hint}
        >
          <Text variant="body" weight="600">{label}</Text>
          <Text variant="caption" color="muted" style={{ marginTop: 2 }}>{hint}</Text>
        </Pressable>
      );
    };

    return (
      <>
        {grant.enabled && grant.expiresSoon ? (
          <View style={[styles.expiring, { backgroundColor: theme.colors.warningSubtle, borderRadius: theme.radius.lg }]}>
            <Icon name="time-outline" size={20} color={theme.colors.warning} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text variant="bodySmall" weight="600">
                {`Your stylist's access ends on ${dayText(grant.expiresAt)}. Keep sharing?`}
              </Text>
              <Button
                label="Keep sharing"
                size="sm"
                onPress={keepSharing}
                loading={busy === 'renew'}
                disabled={busy !== null}
                style={{ marginTop: 8 }}
              />
            </View>
          </View>
        ) : null}

        <Card style={{ marginTop: grant.enabled && grant.expiresSoon ? 16 : 0 }}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text variant="h4">My closet</Text>
              <Text variant="caption" color="muted">{grant.enabled ? 'Sharing is on' : 'Not shared'}</Text>
            </View>
            <Switch
              value={grant.enabled || setupOpen}
              onValueChange={onSwitch}
              disabled={busy !== null || emptyCloset}
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
              accessibilityLabel="My closet"
            />
          </View>

          {grant.enabled && !editing ? (
            <>
              {summary(grant)}
              <Button
                label="Change what's shared"
                variant="secondary"
                onPress={openChange}
                disabled={busy !== null}
                fullWidth
                style={{ marginTop: 12 }}
              />
              {stopButton}
            </>
          ) : null}

          {!grant.enabled || editing ? (
            <Text variant="bodySmall" color="muted" style={styles.consent}>{proShareConsent(name)}</Text>
          ) : null}

          {emptyCloset ? (
            <View style={styles.emptyCloset}>
              <Text variant="h4" align="center">You have no pieces to share yet</Text>
              <Button
                label="Add clothing"
                onPress={() => navigation.navigate('AddClothing')}
                style={{ marginTop: 12, alignSelf: 'center' }}
              />
            </View>
          ) : null}

          {showSetup ? (
            <View style={{ marginTop: 16 }}>
              <View style={styles.options}>
                {option('selected', 'Only pieces I choose', 'Pick them from your closet', () => setPickerOpen(true))}
                {option('all', 'All my pieces', PRO_SHARE_ALL_HINT, () => setChoice('all'))}
              </View>
              {choice === 'selected' ? (
                <View style={styles.chosen}>
                  <Text variant="bodySmall" color="muted" style={{ flex: 1 }}>{`${piecesText(picked.length)} chosen`}</Text>
                  <Button label="Change pieces" variant="ghost" size="sm" onPress={() => setPickerOpen(true)} disabled={busy !== null} />
                </View>
              ) : null}
              <Text variant="bodySmall" style={{ marginTop: 12 }}>
                {choice === null
                  ? 'Choose one to continue.'
                  : sharedNow !== null
                    ? `You'll share ${piecesText(sharedNow)} with ${name} right now.`
                    : `You'll share all your pieces with ${name} right now.`}
              </Text>
              {editing ? <Text variant="caption" color="muted" style={{ marginTop: 2 }}>The end date stays the same.</Text> : null}
              {errorText}
              <View style={styles.buttons}>
                <Button label="Cancel" variant="secondary" onPress={closeSetup} disabled={busy !== null} style={{ flex: 1 }} />
                <Button
                  label={editing ? 'Save changes' : 'Share my closet'}
                  onPress={share}
                  loading={busy === 'share'}
                  disabled={!canConfirm}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            errorText
          )}
        </Card>

        {grant.events && grant.events.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>History</Text>
            {(showAllEvents ? grant.events : grant.events.slice(0, EVENTS_SHOWN)).map((e, i) => {
              const line = eventLine(e);
              return line ? (
                <Text key={`${e.event}-${e.at}-${i}`} variant="bodySmall" color="muted" style={{ marginBottom: 4 }}>{line}</Text>
              ) : null;
            })}
            {!showAllEvents && grant.events.length > EVENTS_SHOWN ? (
              <Button label="Show all" variant="ghost" size="sm" onPress={() => setShowAllEvents(true)} />
            ) : null}
          </View>
        ) : null}

        <ProItemPicker
          visible={pickerOpen}
          selectedIds={picked}
          onClose={() => setPickerOpen(false)}
          onDone={ids => {
            setPickerOpen(false);
            setPicked(ids);
            setChoice(ids.length > 0 ? 'selected' : null);
          }}
        />
      </>
    );
  };

  let content: React.ReactNode;
  if (gate === 'loading' || (listable && phase === 'loading')) {
    content = (
      <View accessibilityLabel="Loading sharing">
        <Skeleton height={64} borderRadius={16} />
        <Skeleton height={140} borderRadius={16} style={{ marginTop: 16 }} />
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
  } else if (phase === 'failed') {
    content = <LoadError what="sharing settings" onRetry={load} />;
  } else {
    content = (
      <>
        {banner ? (
          <View style={{ marginBottom: 12 }}>
            <LoadError variant="banner" what="sharing settings" onRetry={load} />
          </View>
        ) : null}
        {detail && detail.status === 'ended' ? (
          <EmptyState
            icon={<Icon name="link-outline" size={32} color={theme.colors.textSubtle} />}
            title="Nothing is shared"
            body={closedExplanation(detail.endedBy)}
          />
        ) : gate === 'safety' ? (
          safetyBody()
        ) : (
          fullBody()
        )}
      </>
    );
  }

  return (
    <Screen scrollable padded header={header}>
      {content}
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summary: {
    marginTop: 12,
    gap: 2,
  },
  consent: {
    marginTop: 12,
  },
  options: {
    flexDirection: 'row',
    gap: 10,
  },
  option: {
    flex: 1,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  expiring: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
  },
  emptyCloset: {
    marginTop: 16,
    alignItems: 'center',
  },
  error: {
    marginTop: 10,
  },
});

export default ProShareScreen;
