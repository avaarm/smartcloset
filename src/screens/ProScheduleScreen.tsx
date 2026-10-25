/**
 * ProScheduleScreen — the Schedule tab of the Stylist workspace: every session across every client, in three
 * segments (Upcoming, Needs response, Past). A tap on a row opens the session in ProAppointmentSheet, where it
 * can be confirmed, declined or cancelled; each row also leads to the client and to the thread.
 *
 * The times are the viewer's own (ProAppointmentRow and the sheet show the proposer's zone when it differs).
 * Nothing is stored on the device. Reports about a session start from the sheet, which closes before the report
 * sheet opens (sheets are never nested).
 *
 * Navigation goes through callbacks: ProThread in this stack, and the client's page in the Clients tab.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProAppointmentRow from '../components/ProAppointmentRow';
import ProAppointmentSheet from '../components/ProAppointmentSheet';
import ProSafetySheet from '../components/ProSafetySheet';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess } from '../hooks/useProAccess';
import { PRO_SAFETY_ELSEWHERE_NOTE } from '../config/proRules';
import { listProSessions } from '../services/proService';
import { toProError } from '../services/proErrors';
import type { ProAppointment, ProSessionScope } from '../types/pro';

/** A sheet that is leaving is hidden first and the next one is shown after this wait, on iOS (two modals changing at once are unreliable). */
const HANDOFF_MS = 600;

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'pro_terms_required', 'not_deployed',
]);

const SEGMENTS: ReadonlyArray<readonly [ProSessionScope, string]> = [
  ['upcoming', 'Upcoming'],
  ['needs_me', 'Needs response'],
  ['past', 'Past'],
];

const EMPTY: Record<ProSessionScope, { title: string; body?: string }> = {
  upcoming: { title: 'No upcoming sessions', body: 'Propose a session from a client’s page.' },
  needs_me: { title: 'Nothing is waiting for your answer' },
  past: { title: 'No past sessions yet' },
};

const RowsSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading sessions">
    {[0, 1, 2].map(i => (
      <View key={i} style={styles.skeletonRow}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="35%" height={12} style={{ marginTop: 8 }} />
      </View>
    ))}
  </View>
);

const ProScheduleScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();

  const [segment, setSegment] = useState<ProSessionScope>('upcoming');
  const [rows, setRows] = useState<ProAppointment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [selected, setSelected] = useState<ProAppointment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The target is kept after the sheet closes so it can slide out with its content.
  const [safety, setSafety] = useState<ProAppointment | null>(null);
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
  const canLoad = ready !== null && ready.stylist === 'available';

  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    try {
      const list = await listProSessions({ scope: segment });
      if (!alive.current || mine !== loadSeq.current) return;
      // Across all connections the server also returns the person's sessions as a client of another stylist;
      // those belong to Home > Stylists, and the client's page of this workspace cannot open them.
      setRows(list.filter(a => a.myRole === 'stylist'));
      setLoadFailed(false);
    } catch (e) {
      if (!alive.current || mine !== loadSeq.current) return;
      setLoadFailed(true);
      if (ACCESS_CODES.has(toProError(e).code)) refresh();
    }
  }, [segment, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (canLoad) load();
    }, [canLoad, load]),
  );

  const chooseSegment = (next: ProSessionScope) => {
    if (next === segment) return;
    // The old segment's rows would read as the new one's while it loads.
    loadSeq.current++;
    setRows(null);
    setLoadFailed(false);
    setSegment(next);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await (canLoad ? load() : refresh());
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

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

  const openSession = (a: ProAppointment) => {
    setSelected(a);
    setSheetOpen(true);
  };
  const openThread = (a: ProAppointment) => navigation.navigate('ProThread', { connectionId: a.connectionId });
  // The client's page lives in the Clients tab: the nested form reaches it from here.
  const openClient = (a: ProAppointment) =>
    navigation.navigate('Clients', { screen: 'ProClientDetail', params: { connectionId: a.connectionId } });

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Text variant="h3">Schedule</Text>
    </View>
  );

  const segments = (
    <View style={[styles.segments, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
      {SEGMENTS.map(([key, text]) => {
        const on = segment === key;
        return (
          <Pressable
            key={key}
            onPress={() => chooseSegment(key)}
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ selected: on }}
            style={[styles.segment, { borderRadius: theme.radius.md }, on && { backgroundColor: theme.colors.surface }]}
          >
            <Text variant="bodySmall" weight={on ? '600' : '400'} color={on ? 'primary' : 'muted'}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const list = () => {
    if (rows === null) {
      return loadFailed ? <LoadError what="sessions" onRetry={load} /> : <RowsSkeleton />;
    }
    return (
      <View>
        {loadFailed ? (
          <View style={styles.errorBanner}>
            <LoadError what="sessions" variant="banner" onRetry={load} />
          </View>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="calendar-outline" size={32} color={theme.colors.textSubtle} />}
            title={EMPTY[segment].title}
            body={EMPTY[segment].body}
          />
        ) : (
          rows.map(a => (
            <View key={a.id} style={styles.item}>
              <ProAppointmentRow appointment={a} onPress={() => openSession(a)} />
              <View style={styles.rowActions}>
                <Button
                  label="Open client"
                  variant="ghost"
                  size="sm"
                  onPress={() => openClient(a)}
                  accessibilityLabel={`Open client ${a.otherLabel}`}
                />
                <Button
                  label="Message"
                  variant="ghost"
                  size="sm"
                  onPress={() => openThread(a)}
                  accessibilityLabel={`Message ${a.otherLabel}`}
                />
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  const body = () => {
    if (access.state === 'loading') return <RowsSkeleton />;
    if (!ready || ready.stylist !== 'available') {
      return <ProAccessNotice access={access} role="stylist" onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} safetyNote={PRO_SAFETY_ELSEWHERE_NOTE} />;
    }
    return (
      <View>
        {segments}
        <View style={styles.list}>{list()}</View>
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
      {canLoad ? (
        <ProAppointmentSheet
          visible={sheetOpen}
          mode="view"
          appointment={selected ?? undefined}
          connectionId={selected?.connectionId}
          onClose={() => setSheetOpen(false)}
          onChanged={() => {
            setSheetOpen(false);
            load();
          }}
          onReport={a => openAfterSheet(() => {
            setSafety(a);
            setSafetyOpen(true);
          })}
        />
      ) : null}
      {safety ? (
        <ProSafetySheet
          visible={safetyOpen}
          refType="appointment"
          refId={safety.id}
          label={safety.otherLabel}
          connectionId={safety.connectionId}
          onClose={() => setSafetyOpen(false)}
          onBlocked={() => {
            setSafetyOpen(false);
            load();
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
  segments: { flexDirection: 'row', padding: 4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  list: { marginTop: 16 },
  errorBanner: { marginBottom: 12 },
  item: { marginBottom: 6 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginBottom: 8 },
  skeletonRow: { paddingVertical: 12 },
});

export default ProScheduleScreen;
