/**
 * ProInboxScreen — the Messages tab of the Stylist workspace: the clients the stylist has exchanged messages
 * with, the one with the newest message first, and a dot on the ones with something unread. A tap opens the
 * thread. Messages are text only and there is no push, so the screen says nothing is delivered until the app
 * is open; it refreshes whenever it is focused and by pull to refresh.
 *
 * The inbox needs the stylist's own gate (the server leaves the last-message preview out when the feature is
 * paused, the account is suspended or the terms are out of date, which would leave nothing to list), so those
 * states show the plain notice instead. Ended connections stay in the list while their messages last.
 *
 * Navigation goes through a callback to ProThread in this stack.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProClientRow from '../components/ProClientRow';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess } from '../hooks/useProAccess';
import { PRO_SAFETY_ELSEWHERE_NOTE } from '../config/proRules';
import { listProConnections } from '../services/proService';
import { toProError } from '../services/proErrors';
import type { ProConnectionSummary } from '../types/pro';

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'pro_terms_required', 'not_deployed',
]);

const when = (c: ProConnectionSummary): number => {
  const t = new Date(c.lastMessageAt ?? c.lastActivityAt).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** The conversations, newest message first. */
const conversations = (list: ProConnectionSummary[]): ProConnectionSummary[] =>
  list.filter(c => Boolean(c.lastMessagePreview) || Boolean(c.lastMessageAt)).sort((a, b) => when(b) - when(a));

const RowsSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading messages">
    {[0, 1, 2].map(i => (
      <View key={i} style={styles.skeletonRow}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.skeletonText}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="75%" height={12} style={{ marginTop: 8 }} />
        </View>
      </View>
    ))}
  </View>
);

const ProInboxScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();

  const [rows, setRows] = useState<ProConnectionSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const alive = useRef(true);
  const loadSeq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const ready = access.state === 'ready' ? access : null;
  const canLoad = ready !== null && ready.stylist === 'available';

  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    try {
      const list = await listProConnections('stylist');
      if (!alive.current || mine !== loadSeq.current) return;
      setRows(conversations(list));
      setLoadFailed(false);
    } catch (e) {
      if (!alive.current || mine !== loadSeq.current) return;
      setLoadFailed(true);
      if (ACCESS_CODES.has(toProError(e).code)) refresh();
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (canLoad) load();
    }, [canLoad, load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await (canLoad ? load() : refresh());
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Text variant="h3">Messages</Text>
    </View>
  );

  const list = () => {
    if (rows === null) {
      return loadFailed ? <LoadError what="messages" onRetry={load} /> : <RowsSkeleton />;
    }
    return (
      <View>
        {loadFailed ? (
          <View style={styles.errorBanner}>
            <LoadError what="messages" variant="banner" onRetry={load} />
          </View>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="chatbubbles-outline" size={32} color={theme.colors.textSubtle} />}
            title="No messages yet"
            body="When you and a client exchange messages, they show up here."
          />
        ) : (
          <View>
            {rows.map(c => (
              <ProClientRow
                key={c.id}
                connection={c}
                variant="inbox"
                onPress={() => navigation.navigate('ProThread', { connectionId: c.id })}
              />
            ))}
            <Text variant="caption" color="subtle" align="center" style={styles.note}>
              You’ll see new messages next time you open SmartCloset.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const body = () => {
    if (access.state === 'loading') return <RowsSkeleton />;
    if (!ready || ready.stylist !== 'available') {
      return <ProAccessNotice access={access} role="stylist" onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} safetyNote={PRO_SAFETY_ELSEWHERE_NOTE} />;
    }
    return list();
  };

  return (
    <Screen
      scrollable
      padded
      header={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
    >
      {body()}
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
  errorBanner: { marginBottom: 12 },
  note: { marginTop: 8 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  skeletonText: { flex: 1, marginLeft: 12 },
});

export default ProInboxScreen;
