/**
 * ProClientsScreen — the root of the Clients tab in the Stylist workspace: the people the stylist works with,
 * and the way to bring in a new one (an invite code).
 *
 * Access comes first (useProAccess). A stylist who can work sees the probation line while they are new, the
 * list, and the Invite and My profile buttons. When the feature is paused, the account is suspended, the terms
 * are out of date or this build is older than the server, the list still shows (reading it needs only a sign-in)
 * so every client can still be opened, ended, reported or blocked: those ways out never depend on terms or
 * switches. Nothing about a client is stored on the device.
 *
 * Navigation goes through callbacks to routes of the Clients stack (ProClientDetail).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProClientRow from '../components/ProClientRow';
import ProInvitesSheet from '../components/ProInvitesSheet';
import ProStylistProfileSheet from '../components/ProStylistProfileSheet';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess } from '../hooks/useProAccess';
import { PRO_STYLIST_BANNER } from '../config/proRules';
import { listProConnections } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import type { ProConnectionSummary } from '../types/pro';

/** How many finished connections show before "Show older". */
const PAST_LIMIT = 10;

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'pro_terms_required', 'not_deployed',
]);

const RowsSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading clients">
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

const ProClientsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();

  const [connections, setConnections] = useState<ProConnectionSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const alive = useRef(true);
  const loadSeq = useRef(0);
  const askedTerms = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const ready = access.state === 'ready' ? access : null;
  const stylistRole = ready ? ready.stylist : null;
  const hasProfile = Boolean(ready?.status.stylist);
  const canWork = stylistRole === 'available' && hasProfile;
  // The list is read with the sign-in gate only, so it is available whenever the person is signed in and the
  // functions exist: that is what keeps End, Report and Block reachable under a pause or a suspension.
  const canList = access.state === 'ready' || access.state === 'paused' || access.state === 'suspended';

  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    try {
      const rows = await listProConnections('stylist');
      if (!alive.current || mine !== loadSeq.current) return;
      setConnections(rows);
      setLoadFailed(false);
    } catch (e) {
      if (!alive.current || mine !== loadSeq.current) return;
      setLoadFailed(true);
      if (ACCESS_CODES.has(toProError(e).code)) refresh();
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (canList) load();
    }, [canList, load]),
  );

  // The terms sheet opens by itself the first time the screen finds them unaccepted.
  useEffect(() => {
    if (stylistRole === 'needs_terms' && hasProfile && !askedTerms.current) {
      askedTerms.current = true;
      setTermsOpen(true);
    }
  }, [stylistRole, hasProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), canList ? load() : Promise.resolve()]);
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  const openClient = (c: ProConnectionSummary) => navigation.navigate('ProClientDetail', { connectionId: c.id });

  // ── header ──

  const showProfile = ready !== null && stylistRole !== 'update_required';
  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Text variant="h3" style={styles.title}>Clients</Text>
      {showProfile ? (
        <Button
          label="My profile"
          variant="secondary"
          size="sm"
          onPress={() => setProfileOpen(true)}
          accessibilityLabel="My profile"
        />
      ) : null}
      {canWork ? (
        <Button
          label="Invite"
          size="sm"
          onPress={() => setInvitesOpen(true)}
          style={styles.inviteButton}
          accessibilityLabel="Invite"
        />
      ) : null}
    </View>
  );

  // ── parts of the body ──

  const status = ready?.status;
  const probation = canWork && status?.stylist && !status.stylist.approved ? (
    <Card style={styles.banner} bordered>
      <View style={styles.bannerRow}>
        <Icon name="information-circle-outline" size={20} color={theme.colors.textMuted} />
        <View style={styles.bannerText}>
          <Text variant="bodySmall">{PRO_STYLIST_BANNER}</Text>
          <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
            {`${status.stylist.activeClients} of ${status.stylist.clientLimit} clients, ${status.stylist.liveInvites} of ${status.stylist.inviteLimit} live invite${status.stylist.inviteLimit === 1 ? '' : 's'}.`}
          </Text>
        </View>
      </View>
    </Card>
  ) : null;

  const held = canWork && status?.stylist?.invitesHeld ? (
    <Text variant="bodySmall" color="danger" style={styles.heldNote}>
      {proErrorMessage(new ProError('invites_held'))}
    </Text>
  ) : null;

  const active = (connections ?? []).filter(c => c.status === 'active');
  const past = (connections ?? []).filter(c => c.status !== 'active');
  const pastShown = showAllPast ? past : past.slice(0, PAST_LIMIT);

  const listBody = () => {
    if (connections === null) {
      return loadFailed ? <LoadError what="clients" onRetry={load} /> : <RowsSkeleton />;
    }
    return (
      <View>
        {loadFailed ? (
          <View style={styles.errorBanner}>
            <LoadError what="clients" variant="banner" onRetry={load} />
          </View>
        ) : null}
        {connections.length === 0 ? (
          <EmptyState
            icon={<Icon name="people-outline" size={32} color={theme.colors.textSubtle} />}
            title={canWork ? 'No clients yet.' : 'No clients'}
            body={canWork ? 'Create an invite code and give it to your first client.' : undefined}
            actionLabel={canWork ? 'Invite a client' : undefined}
            onAction={canWork ? () => setInvitesOpen(true) : undefined}
          />
        ) : (
          <View>
            {active.length > 0 ? (
              <View style={styles.group}>
                <Text variant="overline" color="muted" style={styles.groupTitle}>Clients</Text>
                {active.map(c => <ProClientRow key={c.id} connection={c} onPress={() => openClient(c)} />)}
              </View>
            ) : null}
            {past.length > 0 ? (
              <View style={styles.group}>
                <Text variant="overline" color="muted" style={styles.groupTitle}>Past</Text>
                {pastShown.map(c => <ProClientRow key={c.id} connection={c} onPress={() => openClient(c)} />)}
                {!showAllPast && past.length > PAST_LIMIT ? (
                  <Button
                    label="Show older"
                    variant="secondary"
                    size="sm"
                    onPress={() => setShowAllPast(true)}
                    style={styles.showOlder}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  const body = () => {
    if (access.state === 'loading') return <RowsSkeleton />;
    if (!canList) return <ProAccessNotice access={access} role="stylist" onRefresh={refresh} />;

    // A stylist workspace without a profile cannot be reached from the tabs; if it is, the way forward is the profile.
    if (ready && !hasProfile) {
      return (
        <EmptyState
          icon={<Icon name="person-outline" size={32} color={theme.colors.textSubtle} />}
          title={proErrorMessage(new ProError('stylist_profile_required'))}
          actionLabel="Set up profile"
          onAction={() => setProfileOpen(true)}
        />
      );
    }

    return (
      <View>
        <ProAccessNotice access={access} role="stylist" onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} />
        {probation}
        {held}
        {listBody()}
      </View>
    );
  };

  return (
    <Screen
      scrollable
      padded
      header={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
    >
      {body()}
      {canWork ? (
        <ProInvitesSheet
          visible={invitesOpen}
          onClose={() => {
            setInvitesOpen(false);
            refresh();
          }}
        />
      ) : null}
      {showProfile ? (
        <ProStylistProfileSheet
          visible={profileOpen}
          onClose={() => setProfileOpen(false)}
          onSaved={() => {
            setProfileOpen(false);
            refresh();
          }}
        />
      ) : null}
      {stylistRole === 'needs_terms' ? (
        <ProTermsSheet
          visible={termsOpen}
          role="stylist"
          needsAdult={ready ? !ready.status.adultConfirmed : true}
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
  title: { flex: 1 },
  inviteButton: { marginLeft: 8 },
  banner: { marginBottom: 12 },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bannerText: { flex: 1 },
  heldNote: { marginBottom: 12 },
  errorBanner: { marginBottom: 12 },
  group: { marginBottom: 20 },
  groupTitle: { marginBottom: 10 },
  showOlder: { alignSelf: 'center' },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  skeletonText: { flex: 1, marginLeft: 12 },
});

export default ProClientsScreen;
