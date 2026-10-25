/**
 * ProClientClosetScreen — the pieces a client has chosen to share with this stylist, and nothing else.
 *
 * Pages of 60 are fetched from getClientCloset as the list is scrolled and merged by piece id. Every page and
 * every photo is checked against the live grant on the server, so the moment a client turns sharing off, narrows
 * it or ends the connection the next read says so and this screen replaces the grid with the explanation (the
 * pieces on screen are dropped with it; a photo already drawn stays only until the stylist leaves the screen).
 * Nothing here can be saved, shared or downloaded, and nothing is written to the device: the pieces and photos
 * live in memory for as long as the screen does.
 *
 * A stylist reads photos and text a stranger typed, so Report or block is one tap away, in the header and on every
 * piece (App Review 1.2): both open ProSafetySheet for the connection, and a block leaves the screen.
 *
 * The screen navigates nowhere except back.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import ProAccessNotice from '../components/ProAccessNotice';
import ProClosetGrid from '../components/ProClosetGrid';
import ProClosetItemSheet from '../components/ProClosetItemSheet';
import ProSafetySheet from '../components/ProSafetySheet';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess } from '../hooks/useProAccess';
import { PRO_CLOSET_ASK_HINT, PRO_LIMITS, proClosetNotSharedTitle } from '../config/proRules';
import { getClientCloset, getProConnection } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import { connectionTitle } from '../utils/proFormat';
import type { ProClientsStackParamList } from '../types/proRoutes';
import type { ProClosetItem } from '../types/pro';

/** Coming back to the screen reads the first page again only if it has been this long (milliseconds). */
const STALE_MS = 30000;
/** How long one modal is given to leave on iOS before the next is shown. */
const HANDOFF_MS = 600;

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'pro_terms_required', 'not_deployed',
]);

type Phase = 'loading' | 'ready' | 'unshared' | 'gone' | 'error';
type LoadKind = 'load' | 'refresh' | 'silent';

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

const GridSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading the closet" style={styles.skeletons}>
    {[0, 1, 2, 3, 4, 5].map(i => (
      <View key={i} style={styles.skeletonCell}>
        <Skeleton style={{ aspectRatio: 1, height: undefined }} borderRadius={12} />
        <Skeleton width="70%" height={12} style={{ marginTop: 10 }} />
      </View>
    ))}
  </View>
);

const ProClientClosetScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ProClientsStackParamList, 'ProClientCloset'>>();
  const { connectionId } = route.params;
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();

  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<ProClosetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProClosetItem | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const alive = useRef(true);
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const loadedAt = useRef(0);
  const moreBusy = useRef(false);
  const exhausted = useRef(false);
  // The ids on screen, to tell a page that brought something new from one that did not.
  const shown = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (handoff.current !== null) clearTimeout(handoff.current);
    };
  }, []);

  // Report or block from a piece: that sheet leaves first, then the safety sheet comes (sheets are never nested).
  const reportFromPiece = () => {
    setSelected(null);
    if (Platform.OS !== 'ios') {
      setSafetyOpen(true);
      return;
    }
    if (handoff.current !== null) clearTimeout(handoff.current);
    handoff.current = setTimeout(() => {
      handoff.current = null;
      if (alive.current) setSafetyOpen(true);
    }, HANDOFF_MS);
  };

  const ready = access.state === 'ready' ? access : null;
  const canLoad = ready !== null && ready.stylist === 'available';

  const loadFirst = useCallback(async (kind: LoadKind) => {
    const mine = ++seq.current;
    moreBusy.current = false;
    exhausted.current = false;
    if (kind === 'load') {
      loadedAt.current = 0;
      setPhase('loading');
      setLoadingMore(false);
      setMoreError(null);
    } else if (kind === 'refresh') {
      setRefreshing(true);
    }
    // The client's name and the grant's end come from the connection; they are nice to have, so a failure there is ignored.
    const detail = getProConnection(connectionId).then(d => d, () => null);
    const closet = getClientCloset(connectionId, { offset: 0, limit: PRO_LIMITS.closet_page_size }).then(
      page => ({ page, error: null as unknown }),
      error => ({ page: null, error }),
    );
    const [d, result] = await Promise.all([detail, closet]);
    if (!alive.current || mine !== seq.current) return;
    if (d) {
      setLabel(connectionTitle({ otherLabel: d.otherLabel, myRole: 'stylist' }));
      setExpiresAt(d.closet.expiresAt);
    }
    if (result.page) {
      shown.current = new Set(result.page.items.map(i => i.id));
      setItems(result.page.items.filter((i, at, all) => all.findIndex(x => x.id === i.id) === at));
      setTotal(result.page.total);
      setPhase('ready');
      setRefreshFailed(false);
      setMoreError(null);
      loadedAt.current = Date.now();
    } else {
      const err = toProError(result.error);
      if (ACCESS_CODES.has(err.code)) refresh();
      if (err.code === 'closet_not_shared' || err.code === 'pro_unavailable' || err.code === 'connection_ended') {
        // The grant is gone: nothing of the closet stays on screen.
        shown.current = new Set();
        setItems([]);
        setTotal(0);
        setPhase(err.code === 'closet_not_shared' ? 'unshared' : 'gone');
      } else if (kind === 'load') {
        setPhase('error');
      } else if (kind === 'refresh') {
        setRefreshFailed(true);
      }
    }
    if (mine === seq.current) setRefreshing(false);
  }, [connectionId, refresh]);

  // Coming back to the screen: read again at once the first time, and after that only when the list is stale.
  useFocusEffect(
    useCallback(() => {
      if (!canLoad) return;
      if (loadedAt.current === 0) loadFirst('load');
      else if (Date.now() - loadedAt.current > STALE_MS) loadFirst('silent');
    }, [canLoad, loadFirst]),
  );

  // `retry` is the stylist tapping "Try again" after a failed page; reaching the end of the list never retries by itself.
  const loadMore = useCallback(async (retry: boolean) => {
    if (phase !== 'ready' || moreBusy.current || exhausted.current || (moreError && !retry) || items.length >= total) return;
    const mine = seq.current;
    moreBusy.current = true;
    setMoreError(null);
    setLoadingMore(true);
    try {
      const page = await getClientCloset(connectionId, { offset: items.length, limit: PRO_LIMITS.closet_page_size });
      if (!alive.current || mine !== seq.current) return;
      const fresh = page.items.filter(i => !shown.current.has(i.id));
      fresh.forEach(i => shown.current.add(i.id));
      setItems(cur => [...cur, ...fresh]);
      setTotal(page.total);
      // A page that brought nothing new would be asked for again for ever.
      if (fresh.length === 0) exhausted.current = true;
    } catch (e) {
      if (!alive.current || mine !== seq.current) return;
      const err = toProError(e);
      if (err.code === 'closet_not_shared' || err.code === 'pro_unavailable') {
        loadFirst('load');
      } else {
        setMoreError(proErrorMessage(err, 'Couldn’t load more. Please try again.'));
      }
    } finally {
      if (alive.current && mine === seq.current) {
        moreBusy.current = false;
        setLoadingMore(false);
      }
    }
  }, [phase, moreError, items.length, total, connectionId, loadFirst]);

  const onRefresh = async () => {
    if (canLoad) await loadFirst('refresh');
    else await refresh();
  };

  // ── header ──

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={styles.title} numberOfLines={1}>
        {label ? `${label}’s closet` : 'Closet'}
      </Text>
      <Pressable
        onPress={() => setSafetyOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={label ? `Report or block ${label}` : 'Report or block'}
      >
        <Icon name="flag-outline" size={22} color={theme.colors.text} />
      </Pressable>
    </View>
  );

  const until = shortDate(expiresAt);
  const summary = phase === 'ready' ? (
    <View style={styles.summary}>
      <Text variant="bodySmall" color="muted">
        {`${total} ${total === 1 ? 'piece' : 'pieces'}${until ? ` · Shared until ${until}` : ''}`}
      </Text>
      {refreshFailed ? (
        <View style={styles.errorBanner}>
          <LoadError what="closet" title="Couldn’t refresh the closet" variant="banner" onRetry={() => loadFirst('refresh')} />
        </View>
      ) : null}
    </View>
  ) : null;

  const footer = loadingMore ? (
    <View style={styles.footer}><Skeleton width="50%" height={12} /></View>
  ) : moreError ? (
    <View style={styles.footer}>
      <Text variant="caption" color="muted" align="center" style={{ marginBottom: 8 }}>{moreError}</Text>
      <Button label="Try again" variant="secondary" size="sm" onPress={() => loadMore(true)} />
    </View>
  ) : null;

  const message = (title: string, body?: string) => (
    <EmptyState
      icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
      title={title}
      body={body}
      actionLabel="Back"
      onAction={() => navigation.goBack()}
    />
  );

  const body = () => {
    if (access.state === 'loading') return <GridSkeleton />;
    if (!ready || ready.stylist !== 'available') {
      return <ProAccessNotice access={access} role="stylist" onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} />;
    }
    switch (phase) {
      case 'loading':
        return <GridSkeleton />;
      case 'unshared':
        return message(proClosetNotSharedTitle(label || undefined), PRO_CLOSET_ASK_HINT);
      case 'gone':
        return message(proErrorMessage(new ProError('pro_unavailable')));
      case 'error':
        return <LoadError what="closet" title="Couldn’t load the closet" onRetry={() => loadFirst('load')} />;
      default:
        return (
          <ProClosetGrid
            items={items}
            connectionId={connectionId}
            onOpen={setSelected}
            onEndReached={() => loadMore(false)}
            header={summary}
            footer={footer}
            empty={
              <Text variant="body" color="muted" align="center" style={styles.empty}>
                No pieces are shared yet.
              </Text>
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
          />
        );
    }
  };

  return (
    <Screen padded={false} header={header}>
      <View style={styles.body}>{body()}</View>
      <ProClosetItemSheet
        visible={selected !== null}
        connectionId={connectionId}
        item={selected}
        onClose={() => setSelected(null)}
        onReport={reportFromPiece}
      />
      <ProSafetySheet
        visible={safetyOpen}
        refType="connection"
        refId={connectionId}
        label={label || 'this client'}
        connectionId={connectionId}
        onClose={() => setSafetyOpen(false)}
        onBlocked={() => {
          setSafetyOpen(false);
          navigation.goBack();
        }}
      />
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
  title: { flex: 1, marginLeft: 12 },
  body: { flex: 1 },
  summary: { paddingHorizontal: 6, paddingBottom: 12 },
  errorBanner: { marginTop: 10 },
  footer: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  empty: { paddingVertical: 48, paddingHorizontal: 24 },
  skeletons: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: 12 },
  skeletonCell: { width: '50%', paddingHorizontal: 6, paddingBottom: 16 },
});

export default ProClientClosetScreen;
