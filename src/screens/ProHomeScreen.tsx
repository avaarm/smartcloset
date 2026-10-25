/**
 * ProHomeScreen — "Stylists" on Home: the stylists a person is connected to, the way to connect with a new one
 * (an invite code), and the door to the Stylist workspace.
 *
 * Access comes first (useProAccess), and every state has its own plain answer: a guest is asked to sign in, a
 * paused feature, a suspension, terms that are out of date and a build older than the server are each said in one
 * line by ProAccessNotice. In all of them except a guest and a server without the feature, the list of connections
 * still shows (reading it needs only a sign-in), so a connection can always be opened and ended, its sharing
 * stopped, and the stylist reported or blocked: those ways out never depend on terms or switches. Connecting
 * with a new stylist and the workspace card appear only when the person may use them.
 *
 * The first-run choice arrives as the `open` param ('redeem' or 'stylist_setup'); once access has settled the
 * matching sheet opens and the param is cleared, so it is acted on once. Only one modal is up at a time, and the
 * report sheet for a stylist seen in the connect sheet waits for that sheet to leave (iOS drops a modal shown
 * while another is still sliding away).
 *
 * Navigation goes through routes registered next to this one in HomeStack (ProConnection, SignIn). Nothing about
 * another person is stored on the device.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { useAccountMode } from '../context/AccountModeContext';
import LoadError from '../components/LoadError';
import { KeyboardSafeScrollView } from '../components/KeyboardSafe';
import ProAccessNotice from '../components/ProAccessNotice';
import ProBlockedSheet from '../components/ProBlockedSheet';
import ProConnectionCard from '../components/ProConnectionCard';
import ProGuidelinesSheet from '../components/ProGuidelinesSheet';
import ProRedeemSheet from '../components/ProRedeemSheet';
import ProSafetySheet from '../components/ProSafetySheet';
import ProStylistProfileSheet from '../components/ProStylistProfileSheet';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess, type ProAccess } from '../hooks/useProAccess';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import { PRO_INDEPENDENT_LINE } from '../config/proRules';
import { toProError } from '../services/proErrors';
import { listProConnections } from '../services/proService';
import type { ProConnectionSummary } from '../types/pro';
import type { ProHomeParams } from '../types/proRoutes';

type Gate = 'loading' | 'blocked' | 'safety' | 'full';
type SheetName = 'redeem' | 'profile' | 'blocked' | 'guidelines' | 'safety';
type LoadKind = 'load' | 'refresh' | 'silent';

/** How many ended connections show before "Show older". */
const PAST_LIMIT = 10;
/** How long one modal is given to leave on iOS before the next is shown. */
const HANDOFF_MS = 700;

/** What the account mode gives; a mocked context may return only the first two, and the role is then read again on its own. */
type RoleMode = {
  currentMode?: string;
  switchMode?: (mode: 'user' | 'stylist') => Promise<void> | void;
  refreshRole?: () => Promise<unknown> | void;
};

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'not_deployed',
]);

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

const emailSupport = async () => {
  try {
    await Linking.openURL(SUPPORT_MAILTO);
  } catch {
    Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
  }
};

const RowsSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading your stylists">
    {[0, 1, 2].map(i => (
      <View key={i} style={styles.skeletonRow}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.skeletonText}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="35%" height={12} style={{ marginTop: 8 }} />
        </View>
      </View>
    ))}
  </View>
);

const ProHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { open: openParam } = (route.params || {}) as ProHomeParams;
  const { theme } = useTheme();
  const { access, refresh: refreshAccess } = useProAccess();
  const mode = useAccountMode() as unknown as RoleMode;
  const gate = gateOf(access);
  const listable = access.state === 'ready' || access.state === 'paused' || access.state === 'suspended';

  const [rows, setRows] = useState<ProConnectionSummary[] | null>(null);
  // A read failed: with nothing on screen it replaces the list, with rows on screen it is a banner above them.
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const [open, setOpen] = useState<SheetName | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // The target is kept after the sheet closes so it can slide out with its content.
  const [safety, setSafety] = useState<{ inviteId: string; label: string } | null>(null);
  const [termsOpen, setTermsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const alive = useRef(true);
  // A number per read: an answer that arrives after a newer read started is dropped.
  const requestId = useRef(0);
  const haveRows = useRef(false);
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledOpen = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (handoff.current !== null) clearTimeout(handoff.current);
    };
  }, []);

  // ── reading ──

  const load = useCallback(async (kind: LoadKind) => {
    const id = ++requestId.current;
    if (kind === 'refresh') setRefreshing(true);
    try {
      const next = await listProConnections('client');
      if (id !== requestId.current || !alive.current) return;
      haveRows.current = true;
      setRows(next);
      setLoadFailed(false);
    } catch (e) {
      if (id !== requestId.current || !alive.current) return;
      if (ACCESS_CODES.has(toProError(e).code)) refreshAccess();
      // A quiet re-read that fails leaves the list as it is.
      if (kind !== 'silent' || !haveRows.current) setLoadFailed(true);
    } finally {
      if (id === requestId.current && alive.current) setRefreshing(false);
    }
  }, [refreshAccess]);

  // Coming back to the screen reads the list again (a connection may have ended, a look may have been read).
  useFocusEffect(
    useCallback(() => {
      if (!listable) {
        requestId.current++;
        return undefined;
      }
      load(haveRows.current ? 'silent' : 'load');
      return undefined;
    }, [listable, load]),
  );

  // ── sheets ──

  /** One modal at a time; on iOS the one that is leaving gets time to go before the next is shown. */
  const show = useCallback((name: SheetName | null, afterLeaving = false) => {
    if (handoff.current !== null) {
      clearTimeout(handoff.current);
      handoff.current = null;
    }
    if (name) setTermsOpen(false);
    if (!name || !afterLeaving || Platform.OS !== 'ios') {
      setOpen(name);
      return;
    }
    setOpen(null);
    handoff.current = setTimeout(() => {
      handoff.current = null;
      if (alive.current) setOpen(name);
    }, HANDOFF_MS);
  }, []);

  // The first-run choice: wait until access has settled, open the matching sheet once, clear the param.
  useEffect(() => {
    if (!openParam) {
      handledOpen.current = null;
      return;
    }
    if (access.state === 'loading' || handledOpen.current === openParam) return;
    handledOpen.current = openParam;
    navigation.setParams?.({ open: undefined });
    if (access.state !== 'ready') return;
    if (openParam === 'redeem' && access.client !== 'update_required') show('redeem');
    if (openParam === 'stylist_setup' && access.stylist !== 'update_required') show('profile');
  }, [openParam, access, navigation, show]);

  const closeRedeem = () => {
    show(null);
    // A connection may have been made even if the person chose Done instead of "Choose what to share".
    load('silent');
    refreshAccess();
  };

  const openWorkspace = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      // The server's word on the role first, so the workspace opens at once for a profile saved a moment ago.
      await mode.refreshRole?.();
      await mode.switchMode?.('stylist');
    } catch {
      if (alive.current) setNote("Couldn't open the workspace. Please try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // ── pieces of the page ──

  const openConnection = (c: ProConnectionSummary) => navigation.navigate('ProConnection', { connectionId: c.id });

  const menuRow = (icon: string, text: string, onPress: () => void) => (
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
      <Icon name={icon} size={20} color={theme.colors.text} />
      <Text variant="body" style={{ marginLeft: 12 }}>{text}</Text>
    </Pressable>
  );

  // The menu is a dropdown inside the screen, not a second modal: a sheet opened from a closing sheet is unreliable on iOS.
  const menuOverlay = menuOpen ? (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setMenuOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View
        style={[
          styles.menu,
          { backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.lg, ...theme.shadows.medium },
        ]}
      >
        {menuRow('shield-checkmark-outline', 'Professional guidelines', () => show('guidelines'))}
        {menuRow('ban-outline', 'Blocked stylists and clients', () => show('blocked'))}
        {menuRow('mail-outline', 'Email support', emailSupport)}
      </View>
    </>
  ) : null;

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>Stylists</Text>
      {listable ? (
        <Pressable
          onPress={() => setMenuOpen(o => !o)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Stylists menu"
          accessibilityState={{ expanded: menuOpen }}
        >
          <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  const termsNeeded = access.state === 'ready' && access.client === 'needs_terms';
  const adultMissing = !(access.state === 'ready' && access.status.adultConfirmed);

  const sheets = (
    <>
      <ProRedeemSheet
        visible={open === 'redeem'}
        onClose={closeRedeem}
        onConnected={connectionId => {
          closeRedeem();
          navigation.navigate('ProConnection', { connectionId });
        }}
        onReport={(inviteId, label) => {
          setSafety({ inviteId, label });
          show('safety', true);
        }}
      />
      <ProStylistProfileSheet
        visible={open === 'profile'}
        onClose={() => show(null)}
        onSaved={() => {
          show(null);
          refreshAccess();
        }}
      />
      <ProGuidelinesSheet visible={open === 'guidelines'} onClose={() => show(null)} />
      <ProBlockedSheet visible={open === 'blocked'} onClose={() => show(null)} />
      {safety ? (
        <ProSafetySheet
          visible={open === 'safety'}
          refType="invite"
          refId={safety.inviteId}
          inviteId={safety.inviteId}
          label={safety.label}
          onClose={() => show(null)}
          onBlocked={() => show(null)}
        />
      ) : null}
      <ProTermsSheet
        visible={termsNeeded && termsOpen && open === null && !openParam}
        role="client"
        needsAdult={adultMissing}
        onAccepted={() => {
          setTermsOpen(true);
          refreshAccess();
        }}
        onClose={() => setTermsOpen(false)}
      />
    </>
  );

  const list = (items: ProConnectionSummary[]) =>
    items.map(c => <ProConnectionCard key={c.id} connection={c} onPress={() => openConnection(c)} />);

  /** The connections, with ended ones under "Past". Used by the full page and by the ways-out-only page. */
  const connectionLists = (all: ProConnectionSummary[]) => {
    const active = all.filter(c => c.status === 'active');
    const ended = all.filter(c => c.status !== 'active');
    const pastShown = showAllPast ? ended : ended.slice(0, PAST_LIMIT);
    return (
      <>
        {active.length > 0 ? (
          <View>
            <Text variant="overline" color="muted" style={styles.sectionTitle}>Your stylists</Text>
            {list(active)}
          </View>
        ) : null}
        {ended.length > 0 ? (
          <View style={active.length > 0 ? styles.past : undefined}>
            <Text variant="overline" color="muted" style={styles.sectionTitle}>Past</Text>
            {list(pastShown)}
            {!showAllPast && ended.length > PAST_LIMIT ? (
              <Button label="Show older" variant="ghost" size="sm" onPress={() => setShowAllPast(true)} />
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  /** The card that leads to the Stylist workspace, or to becoming a stylist. */
  const workspaceCard = () => {
    if (access.state !== 'ready') return null;
    const hasProfile = access.status.stylist !== null;
    if (hasProfile) {
      if (access.stylist !== 'available') return null;
      return (
        <Card style={styles.card}>
          <Text variant="h4">Stylist workspace</Text>
          <Text variant="body" color="muted" style={{ marginTop: 4 }}>Your clients, schedule and messages.</Text>
          <Button
            label="Open the Stylist workspace"
            onPress={openWorkspace}
            loading={busy}
            fullWidth
            style={{ marginTop: 12 }}
          />
          {note ? <Text variant="caption" color="danger" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">{note}</Text> : null}
        </Card>
      );
    }
    if (access.stylist === 'update_required') return null;
    return (
      <Card style={styles.card}>
        <Text variant="h4">Stylist workspace</Text>
        <Text variant="body" color="muted" style={{ marginTop: 4 }}>
          Work with clients of your own. You'll set up a short profile first.
        </Text>
        <Button
          label="Become a stylist"
          variant="secondary"
          onPress={() => show('profile')}
          fullWidth
          style={{ marginTop: 12 }}
        />
      </Card>
    );
  };

  // ── the page ──

  let content: React.ReactNode;
  if (gate === 'loading') {
    content = <RowsSkeleton />;
  } else if (gate === 'blocked') {
    content = (
      <ProAccessNotice
        access={access}
        onSignIn={() => navigation.navigate('SignIn')}
        onRefresh={refreshAccess}
      />
    );
  } else {
    // Under a pause, a suspension, stale terms or an old build: the notice, then only the list to open and leave.
    const notice = gate === 'safety' ? (
      <ProAccessNotice access={access} onRefresh={refreshAccess} onReadTerms={() => setTermsOpen(true)} />
    ) : null;
    let body: React.ReactNode;
    if (rows === null && !loadFailed) {
      body = <RowsSkeleton />;
    } else if (rows === null) {
      body = <LoadError what="stylists" onRetry={() => load('load')} />;
    } else {
      body = (
        <>
          {loadFailed ? (
            <View style={{ marginBottom: 12 }}>
              <LoadError variant="banner" what="stylists" onRetry={() => load('refresh')} />
            </View>
          ) : null}
          {rows.length === 0 && gate === 'full' ? (
            <EmptyState
              icon={<Icon name="color-wand-outline" size={32} color={theme.colors.textSubtle} />}
              title="No stylists yet"
              body="Ask your stylist for an invite code."
              actionLabel="Connect with a stylist"
              onAction={() => show('redeem')}
            />
          ) : (
            <>
              {connectionLists(rows)}
              {gate === 'full' ? (
                <Button
                  label="Connect with a stylist"
                  variant="secondary"
                  onPress={() => show('redeem')}
                  fullWidth
                  style={styles.connect}
                />
              ) : null}
            </>
          )}
        </>
      );
    }
    content = (
      <>
        {notice}
        {body}
        {gate === 'full' ? workspaceCard() : null}
        {gate === 'full' ? (
          <Text variant="caption" color="muted" align="center" style={styles.independent}>{PRO_INDEPENDENT_LINE}</Text>
        ) : null}
      </>
    );
  }

  return (
    <Screen padded={false} header={header}>
      <View style={{ flex: 1 }}>
        <KeyboardSafeScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            listable ? (
              <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.colors.accent} />
            ) : undefined
          }
        >
          {content}
        </KeyboardSafeScrollView>
        {menuOverlay}
      </View>
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
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  past: {
    marginTop: 24,
  },
  connect: {
    marginTop: 16,
  },
  card: {
    marginTop: 24,
  },
  independent: {
    marginTop: 20,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  skeletonText: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    top: 4,
    right: 12,
    minWidth: 240,
    overflow: 'visible',
    elevation: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default ProHomeScreen;
