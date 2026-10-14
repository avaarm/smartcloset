/**
 * MySwapsScreen — the swap inbox and the member's own pieces.
 *
 * Two segments: "Swaps" (offers and swaps grouped by what needs the member) and "My pieces" (the
 * listings, which MyPiecesList owns). Everything refreshes on focus and by pull to refresh; there is
 * no push, so the screen says so.
 *
 * Access comes first (useSwapAccess): guest, paused, suspended, update-required and terms states are
 * handled here, and only a usable account reads the inbox. A suspended member can still read history.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import MyPiecesList from '../components/MyPiecesList';
import SwapBlockedSheet from '../components/SwapBlockedSheet';
import SwapGuidelinesSheet from '../components/SwapGuidelinesSheet';
import SwapPhoto from '../components/SwapPhoto';
import SwapStatusBadge from '../components/SwapStatusBadge';
import SwapTermsSheet from '../components/SwapTermsSheet';
import { useSwapAccess } from '../hooks/useSwapAccess';
import { listMySwaps } from '../services/swapService';
import { toSwapError } from '../services/swapErrors';
import {
  SWAP_NOT_DEPLOYED_MESSAGE,
  SWAP_PAUSED_MESSAGE,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../config/swapRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import { BUCKET_ORDER, BUCKET_TITLES, swapTitle } from '../utils/swapFormat';
import type { SwapBucket, SwapSummary } from '../types/swap';

type Segment = 'swaps' | 'pieces';

/** How many finished swaps show before "Show older". */
const PAST_LIMIT = 10;

const emailSupport = async () => {
  try {
    await Linking.openURL(SUPPORT_MAILTO);
  } catch {
    Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
  }
};

const titleOf = (s: SwapSummary): string =>
  s.giveNames.length || s.getNames.length ? swapTitle(s.giveNames, s.getNames) : 'Swap';

const rowLabel = (s: SwapSummary): string =>
  `Open swap with ${s.otherLabel}: ${titleOf(s)}${s.attention ? ', new activity' : ''}`;

const SwapRow: React.FC<{ swap: SwapSummary; onPress: () => void }> = ({ swap, onPress }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rowLabel(swap)}
      style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <SwapPhoto path={swap.thumbPath} style={[styles.thumb, { borderRadius: theme.radius.md }]} />
      <View style={styles.rowText}>
        <Text variant="body" weight="600" numberOfLines={2}>{titleOf(swap)}</Text>
        <Text variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={1}>{swap.otherLabel}</Text>
        <View style={styles.badges}>
          <SwapStatusBadge status={swap.status} closedReason={swap.closedReason} role={swap.role} />
          {swap.bucket === 'finishing' ? (
            <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>Tap to finish up</Text>
          ) : null}
        </View>
      </View>
      {swap.attention ? (
        <View testID="swap-attention-dot" style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
      ) : null}
      <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
    </Pressable>
  );
};

const RowsSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading swaps">
    {[0, 1, 2].map(i => (
      <View key={i} style={[styles.row, { borderColor: 'transparent' }]}>
        <Skeleton width={56} height={70} />
        <View style={styles.rowText}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
        </View>
      </View>
    ))}
  </View>
);

const MySwapsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { access, refresh } = useSwapAccess();

  const [segment, setSegment] = useState<Segment>(route.params?.segment === 'pieces' ? 'pieces' : 'swaps');
  const [swaps, setSwaps] = useState<SwapSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  // Bumped on pull to refresh so the pieces list (which loads itself) loads again.
  const [piecesKey, setPiecesKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const alive = useRef(true);
  const loadSeq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // navigate('MySwaps', { segment: 'pieces' }) while this screen is already open.
  const requested = route.params?.segment;
  useEffect(() => {
    if (requested === 'pieces' || requested === 'swaps') setSegment(requested);
  }, [requested]);

  // The terms sheet opens by itself the first time the screen finds them unaccepted.
  useEffect(() => {
    if (access.state === 'needs_terms') setTermsOpen(true);
  }, [access.state]);

  const canRead = access.state === 'ready' || access.state === 'suspended';

  const loadSwaps = useCallback(async () => {
    const mine = ++loadSeq.current;
    try {
      const rows = await listMySwaps();
      if (!alive.current || mine !== loadSeq.current) return;
      setSwaps(rows);
      setLoadFailed(false);
    } catch (e) {
      if (!alive.current || mine !== loadSeq.current) return;
      setLoadFailed(true);
      // The server's answer about the account itself: let the access state catch up.
      const code = toSwapError(e).code;
      if (code === 'not_authenticated' || code === 'swaps_disabled' || code === 'not_deployed') refresh();
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (canRead) loadSwaps();
    }, [canRead, loadSwaps]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // With swaps on screen only the list reloads: re-reading the settings offline would replace it
      // with a full-screen error. Without access, the pull is how the member re-checks it.
      await (canRead ? loadSwaps() : refresh());
      setPiecesKey(k => k + 1);
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  const grouped = useMemo(() => {
    const out: Record<SwapBucket, SwapSummary[]> = { needs_you: [], finishing: [], in_progress: [], waiting: [], past: [] };
    // The server already orders each group, newest activity first.
    for (const s of swaps ?? []) (out[s.bucket] ?? out.past).push(s);
    return out;
  }, [swaps]);

  const openThread = (swapId: string) => navigation.navigate('SwapThread', { swapId });

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

  const header = (
    <View>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>My swaps</Text>
        {canRead ? (
          <Pressable
            onPress={() => setMenuOpen(o => !o)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Swap menu"
            accessibilityState={{ expanded: menuOpen }}
          >
            <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
          </Pressable>
        ) : null}
      </View>
      {menuOpen ? (
        // Rows in the header block, not a second modal: the sheets they open are modals themselves, and
        // two modals changing at once is unreliable on iOS.
        <View style={{ paddingHorizontal: 20, backgroundColor: theme.colors.surface }}>
          {menuRow('shield-checkmark-outline', 'Swap guidelines', () => setGuidelinesOpen(true))}
          {menuRow('ban-outline', 'Blocked swap members', () => setBlockedOpen(true))}
          {menuRow('mail-outline', 'Email support', emailSupport)}
        </View>
      ) : null}
    </View>
  );

  const segments = (
    <View style={[styles.segments, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
      {([['swaps', 'Swaps'], ['pieces', 'My pieces']] as Array<[Segment, string]>).map(([key, label]) => {
        const selected = segment === key;
        return (
          <Pressable
            key={key}
            onPress={() => setSegment(key)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              { borderRadius: theme.radius.md },
              selected && { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text variant="bodySmall" weight={selected ? '600' : '400'} color={selected ? 'primary' : 'muted'}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const swapsBody = () => {
    if (swaps === null) {
      return loadFailed ? <LoadError what="swaps" onRetry={loadSwaps} /> : <RowsSkeleton />;
    }
    return (
      <View>
        {loadFailed ? (
          <View style={{ marginBottom: 12 }}>
            <LoadError what="swaps" variant="banner" onRetry={loadSwaps} />
          </View>
        ) : null}
        {swaps.length === 0 ? (
          <EmptyState
            icon={<Icon name="swap-horizontal-outline" size={32} color={theme.colors.textSubtle} />}
            title="No swaps yet"
            body="Offers you send and receive show up here."
            actionLabel="Browse the swap board"
            onAction={() => navigation.navigate('SwapBoard')}
          />
        ) : (
          <View>
            {BUCKET_ORDER.map(bucket => {
              const all = grouped[bucket];
              if (all.length === 0) return null;
              const rows = bucket === 'past' && !showAllPast ? all.slice(0, PAST_LIMIT) : all;
              return (
                <View key={bucket} style={{ marginBottom: 20 }}>
                  <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>
                    {BUCKET_TITLES[bucket]}
                  </Text>
                  {rows.map(s => (
                    <SwapRow key={s.id} swap={s} onPress={() => openThread(s.id)} />
                  ))}
                  {bucket === 'past' && !showAllPast && all.length > PAST_LIMIT ? (
                    <Button
                      label="Show older"
                      variant="secondary"
                      size="sm"
                      onPress={() => setShowAllPast(true)}
                      style={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </View>
              );
            })}
            <Text variant="caption" color="subtle" align="center">
              You’ll see updates next time you open SmartCloset.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const body = () => {
    switch (access.state) {
      case 'loading':
        return <RowsSkeleton />;
      case 'guest':
        return (
          <EmptyState
            icon={<Icon name="person-outline" size={32} color={theme.colors.textSubtle} />}
            title="Sign in to swap"
            body="Swap pieces with friends once you have an account."
            actionLabel="Sign in"
            onAction={() => navigation.navigate('SignIn')}
          />
        );
      case 'paused':
        return <EmptyState title="Swaps are paused" body={SWAP_PAUSED_MESSAGE} />;
      case 'not_deployed':
        return <EmptyState title="Swaps aren’t available yet" body={SWAP_NOT_DEPLOYED_MESSAGE} />;
      case 'update_required':
        return access.appIsOlder ? (
          <EmptyState title="Update SmartCloset" body={SWAP_UPDATE_REQUIRED_MESSAGE} />
        ) : (
          <EmptyState title="Swaps aren’t ready yet" body={SWAP_SERVER_BEHIND_MESSAGE} />
        );
      case 'needs_terms':
        return (
          <EmptyState
            icon={<Icon name="document-text-outline" size={32} color={theme.colors.textSubtle} />}
            title="Read the swap terms to get started"
            actionLabel="Read the swap terms"
            onAction={() => setTermsOpen(true)}
          />
        );
      case 'error':
        return <LoadError what="swaps" onRetry={refresh} />;
      default:
        return (
          <View>
            {access.state === 'suspended' ? (
              <Card style={{ marginBottom: 16 }}>
                <Text variant="h4">Swapping is paused on your account</Text>
                <Text variant="body" color="muted" style={{ marginTop: 6 }}>
                  You can still read your past swaps. Email support if you think this is a mistake.
                </Text>
                <Button label="Email support" variant="secondary" onPress={emailSupport} style={{ marginTop: 12 }} />
              </Card>
            ) : null}
            {segments}
            <View style={{ marginTop: 16 }}>
              {segment === 'pieces' ? <MyPiecesList key={piecesKey} onChanged={loadSwaps} /> : swapsBody()}
            </View>
          </View>
        );
    }
  };

  return (
    <Screen
      scrollable
      padded
      header={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {body()}
      <SwapGuidelinesSheet visible={guidelinesOpen} onClose={() => setGuidelinesOpen(false)} />
      <SwapBlockedSheet visible={blockedOpen} onClose={() => setBlockedOpen(false)} />
      {access.state === 'needs_terms' ? (
        <SwapTermsSheet
          visible={termsOpen}
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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segments: { flexDirection: 'row', padding: 4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  thumb: { width: 56, height: 70 },
  rowText: { flex: 1, marginLeft: 12, marginRight: 8 },
  badges: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
});

export default MySwapsScreen;
