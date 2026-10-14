/**
 * SwapBoardScreen — the swap rack: pieces friends (and, when it is switched on, community members)
 * have opened to swap.
 *
 * Every state of useSwapAccess has its own plain screen (guest, paused, not deployed, suspended, update
 * needed, terms not accepted, offline); once the member may swap, the board shows a two-column grid with
 * a Friends / Community segment, category and condition chips and a search box. Pages are 30 pieces,
 * fetched by cursor, and the server counts each page against a daily limit, so the board does not
 * re-query on every return to the screen (only when it is stale, or after a block made on a piece's
 * own screen) and runs a search only when it is submitted.
 *
 * Navigation goes through callbacks to routes registered in HomeStack (SwapListing, MySwaps, Friends,
 * SignIn). Nothing from this screen is stored on the device.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import SwapBlockedSheet from '../components/SwapBlockedSheet';
import SwapCard from '../components/SwapCard';
import SwapGuidelinesSheet from '../components/SwapGuidelinesSheet';
import SwapJoinCommunitySheet from '../components/SwapJoinCommunitySheet';
import SwapSafetySheet from '../components/SwapSafetySheet';
import SwapTermsSheet from '../components/SwapTermsSheet';
import { useSwapAccess, type SwapAccess } from '../hooks/useSwapAccess';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import {
  SWAP_NOT_DEPLOYED_MESSAGE,
  SWAP_PAUSED_MESSAGE,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../config/swapRules';
import { browseSwapListings } from '../services/swapService';
import { SwapError, swapErrorMessage, toSwapError } from '../services/swapErrors';
import type { ClothingCategory } from '../types/clothing';
import type { SwapListing } from '../types/swap';
import { CATEGORY_LABELS, CLOTHING_CATEGORIES } from '../utils/clothingOptions';
import { ITEM_CONDITIONS, ITEM_CONDITION_LABELS, type ItemCondition } from '../utils/itemCondition';
import { keyboardListProps } from '../utils/keyboardListProps';

const PAGE_SIZE = 30;
/** Coming back to the board re-reads the first page only if it has been this long (milliseconds). */
const STALE_MS = 30000;
const SEARCH_MAX = 40;
const INVITE_MESSAGE = 'I’m swapping clothes with friends on SmartCloset. Come and swap with me!';

type RouteParams = { friendId?: string; friendName?: string };
type Segment = 'friends' | 'community';
type Filters = { category: ClothingCategory | null; conditions: ItemCondition[]; q: string };
type LoadKind = 'load' | 'refresh' | 'silent';

const NO_FILTERS: Filters = { category: null, conditions: [], q: '' };

// Set by a screen opened from the board (the listing screen, after a block) to say the rack changed
// under it. The next read of the first page clears it, and returning to the board makes that read
// at once instead of waiting out STALE_MS. Kept in memory only.
let rackDirty = false;
export const markSwapRackDirty = (): void => {
  rackDirty = true;
};

/** Answers that mean "what this member may do has changed": the screen asks useSwapAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'swaps_disabled', 'swap_suspended', 'swap_terms_required', 'not_deployed',
]);

const sameFilters = (a: Filters, b: Filters): boolean =>
  a.category === b.category && a.q === b.q && a.conditions.join() === b.conditions.join();

const emailSupport = async () => {
  try {
    await Linking.openURL(SUPPORT_MAILTO);
  } catch {
    Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
  }
};

// ─── what a member sees when they cannot swap (shared with the listing screen) ───

export type SwapAccessNoticeProps = {
  access: SwapAccess;
  onSignIn: () => void;
  onRetry: () => void | Promise<unknown>;
  onReadTerms: () => void;
};

/** The same plain answer for every swap screen. Renders nothing for `loading` and `ready`. */
export const SwapAccessNotice: React.FC<SwapAccessNoticeProps> = ({ access, onSignIn, onRetry, onReadTerms }) => {
  const { theme } = useTheme();
  const icon = (name: string) => <Icon name={name} size={32} color={theme.colors.textSubtle} />;
  switch (access.state) {
    case 'guest':
      return (
        <EmptyState
          icon={icon('person-outline')}
          title="Sign in to swap"
          body="Swap pieces with your friends once you’re signed in."
          actionLabel="Sign in"
          onAction={onSignIn}
        />
      );
    case 'paused':
      return <EmptyState icon={icon('pause-circle-outline')} title="Swaps are paused" body={SWAP_PAUSED_MESSAGE} />;
    case 'not_deployed':
      return (
        <EmptyState icon={icon('construct-outline')} title="Swaps aren’t available yet" body={SWAP_NOT_DEPLOYED_MESSAGE} />
      );
    case 'suspended':
      return (
        <EmptyState
          icon={icon('hand-left-outline')}
          title="Swapping is paused on your account"
          body="Email support if you think this is a mistake. Your past swaps are still in My swaps."
          actionLabel="Email support"
          onAction={emailSupport}
        />
      );
    case 'update_required':
      return access.appIsOlder ? (
        <EmptyState icon={icon('cloud-download-outline')} title="Update needed" body={SWAP_UPDATE_REQUIRED_MESSAGE} />
      ) : (
        <EmptyState icon={icon('time-outline')} title="Check back soon" body={SWAP_SERVER_BEHIND_MESSAGE} />
      );
    case 'needs_terms':
      return (
        <EmptyState
          icon={icon('document-text-outline')}
          title="Read the swap terms to get started"
          actionLabel="Read the terms"
          onAction={onReadTerms}
        />
      );
    case 'error':
      return <LoadError what="swaps" onRetry={onRetry} />;
    default:
      return null;
  }
};

// ─── pieces ──────────────────────────────────────────────────────────────────

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accent : theme.colors.muted,
          borderRadius: theme.radius.full,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text variant="bodySmall" weight="600" style={{ color: selected ? theme.colors.accentText : theme.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
};

const SkeletonGrid: React.FC = () => (
  <View style={styles.skeletonGrid} accessibilityLabel="Loading swaps">
    {[0, 1, 2, 3, 4, 5].map(i => (
      <View key={i} style={styles.cell}>
        <Skeleton style={{ aspectRatio: 4 / 5, height: undefined }} borderRadius={12} />
        <Skeleton width="70%" height={12} style={{ marginTop: 10 }} />
        <Skeleton width="45%" height={10} style={{ marginTop: 6 }} />
      </View>
    ))}
  </View>
);

// ─── the screen ──────────────────────────────────────────────────────────────

const SwapBoardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { friendId, friendName } = (route.params || {}) as RouteParams;
  const { theme } = useTheme();
  const { access, refresh: refreshAccess } = useSwapAccess();

  const settings = access.state === 'ready' ? access.settings : null;
  const ready = settings !== null;
  const communityAvailable = Boolean(settings?.communityAvailable);
  const communityJoined = Boolean(settings?.communityJoined);

  const [segment, setSegment] = useState<Segment>('friends');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [searchText, setSearchText] = useState('');

  const [items, setItems] = useState<SwapListing[]>([]);
  const [cursor, setCursor] = useState<{ ts: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [error, setError] = useState<SwapError | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [termsOpen, setTermsOpen] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  // The target is kept after the sheet closes so it can slide out with its content.
  const [safety, setSafety] = useState<{ refId: string; label: string } | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  // Community only when the server offers it and the member has joined; a friend's own board is friends only.
  const scope: Segment = !friendId && communityAvailable && communityJoined && segment === 'community' ? 'community' : 'friends';

  const query = useMemo(
    () => ({
      scope,
      category: filters.category ?? undefined,
      conditions: filters.conditions.length ? filters.conditions : undefined,
      q: filters.q || undefined,
      friendId: scope === 'friends' ? friendId : undefined,
    }),
    [scope, filters, friendId],
  );

  // A number per first-page request: an answer that arrives after the filters moved on is dropped.
  const requestId = useRef(0);
  const loadedAt = useRef(0);
  const moreBusy = useRef(false);

  const fetchFirst = useCallback(
    async (kind: LoadKind) => {
      const id = ++requestId.current;
      rackDirty = false;
      moreBusy.current = false;
      if (kind === 'load') {
        loadedAt.current = 0;
        setItems([]);
        setCursor(null);
        setError(null);
        setMoreFailed(false);
        setLoadingMore(false);
        setLoading(true);
      } else if (kind === 'refresh') {
        setRefreshing(true);
      }
      try {
        const page = await browseSwapListings({ ...query, cursor: null, limit: PAGE_SIZE });
        if (id !== requestId.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
        setMoreFailed(false);
        setLoadingMore(false);
        loadedAt.current = Date.now();
      } catch (e) {
        if (id !== requestId.current) return;
        const err = toSwapError(e);
        if (ACCESS_CODES.has(err.code)) refreshAccess();
        if (err.code === 'community_not_joined' || err.code === 'community_unavailable') setSegment('friends');
        // A quiet re-read that fails leaves the board as it is.
        if (kind !== 'silent') setError(err);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query, refreshAccess],
  );

  useEffect(() => {
    if (ready) fetchFirst('load');
    else requestId.current++;
  }, [ready, fetchFirst]);

  // Coming back to the board: read the first page again if it has gone stale, or at once if a block
  // elsewhere emptied part of it (the blocked member's cards would only lead to "No longer available").
  // The callback is stable and reads the latest values, so a filter change cannot trigger it.
  const latest = useRef({ ready, fetchFirst });
  latest.current = { ready, fetchFirst };
  useFocusEffect(
    useCallback(() => {
      const { ready: isReady, fetchFirst: refetch } = latest.current;
      if (!isReady) return;
      if (rackDirty) refetch('load');
      else if (loadedAt.current && Date.now() - loadedAt.current > STALE_MS) refetch('silent');
    }, []),
  );

  // `retry` is the member tapping "Try again" after a failed page; reaching the end of the list never retries by itself.
  const loadMore = useCallback(async (retry: boolean) => {
    if (!cursor || moreBusy.current || (moreFailed && !retry) || loading || refreshing) return;
    const id = requestId.current;
    setMoreFailed(false);
    moreBusy.current = true;
    setLoadingMore(true);
    try {
      const page = await browseSwapListings({ ...query, cursor, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setItems(cur => {
        const seen = new Set(cur.map(l => l.id));
        return [...cur, ...page.items.filter(l => !seen.has(l.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      if (id === requestId.current) setMoreFailed(true);
    } finally {
      if (id === requestId.current) {
        moreBusy.current = false;
        setLoadingMore(false);
      }
    }
  }, [cursor, moreFailed, loading, refreshing, query]);

  // ── filters ──

  const applyFilters = (next: Partial<Filters>) => {
    setFilters(prev => {
      const merged: Filters = { ...prev, q: searchText.trim().slice(0, SEARCH_MAX), ...next };
      return sameFilters(prev, merged) ? prev : merged;
    });
  };

  const pickCategory = (category: ClothingCategory | null) => applyFilters({ category });

  const toggleCondition = (condition: ItemCondition) => {
    const on = filters.conditions.includes(condition);
    const next = ITEM_CONDITIONS.filter(c => (c === condition ? !on : filters.conditions.includes(c)));
    applyFilters({ conditions: next });
  };

  const clearSearch = () => {
    setSearchText('');
    applyFilters({ q: '' });
  };

  const clearFilters = () => {
    setSearchText('');
    setFilters(prev => (sameFilters(prev, NO_FILTERS) ? prev : NO_FILTERS));
  };

  const hasFilters = Boolean(filters.category || filters.conditions.length || filters.q);

  const chooseSegment = (next: Segment) => {
    if (next === 'community' && !communityJoined) {
      setJoinOpen(true);
      return;
    }
    setSegment(next);
  };

  // ── navigation ──

  const openListing = (l: SwapListing) => navigation.navigate('SwapListing', { listingId: l.id });
  const openMySwaps = () => navigation.navigate('MySwaps');
  const openPieces = () => navigation.navigate('MySwaps', { segment: 'pieces' });
  const openFriends = () => navigation.navigate('Friends');
  const signIn = () => navigation.navigate('SignIn');

  const invite = async () => {
    try {
      await Share.share({ message: INVITE_MESSAGE });
    } catch {
      // The share sheet was dismissed or is not available; nothing to report.
    }
  };

  const openSafety = (l: SwapListing) => {
    setSafety({ refId: l.id, label: l.ownerLabel });
    setSafetyOpen(true);
  };

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
        {menuRow('shield-checkmark-outline', 'Swap guidelines', () => setShowGuidelines(true))}
        {menuRow('ban-outline', 'Blocked swap members', () => setShowBlocked(true))}
        {menuRow('mail-outline', 'Email support', emailSupport)}
      </View>
    </>
  ) : null;

  // ── header ──

  const canUseSwaps = access.state === 'ready' || access.state === 'suspended';
  const needsYou = settings?.needsYou ?? 0;
  const title = friendId ? `${friendName || 'Friend'}’s swaps` : 'Swaps';

  const header = (
    <View>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>{title}</Text>
        {canUseSwaps ? (
          <>
            <Pressable
              onPress={openMySwaps}
              hitSlop={8}
              style={styles.mySwaps}
              accessibilityRole="button"
              accessibilityLabel="My swaps"
              accessibilityValue={{ text: needsYou > 0 ? `${needsYou} need you` : 'Nothing waiting' }}
            >
              <Text variant="bodySmall" weight="600" color="accent">My swaps</Text>
              {needsYou > 0 ? <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} /> : null}
            </Pressable>
            <Pressable
              onPress={() => setMenuOpen(open => !open)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Swap menu"
              accessibilityState={{ expanded: menuOpen }}
            >
              <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
            </Pressable>
          </>
        ) : null}
      </View>

      {ready ? (
        <View style={styles.filters}>
          {communityAvailable && !friendId ? (
            <View style={[styles.segment, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
              {(['friends', 'community'] as const).map(value => {
                const selected = scope === value;
                const label = value === 'friends' ? 'Friends' : 'Community';
                return (
                  <Pressable
                    key={value}
                    onPress={() => chooseSegment(value)}
                    style={[
                      styles.segmentItem,
                      { borderRadius: theme.radius.md, backgroundColor: selected ? theme.colors.surface : 'transparent' },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                  >
                    <Text variant="bodySmall" weight="600" color={selected ? 'primary' : 'muted'}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.searchBar, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
            <Icon name="search-outline" size={18} color={theme.colors.textSubtle} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Search by name or brand"
              placeholderTextColor={theme.colors.textSubtle}
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={() => applyFilters({})}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              blurOnSubmit
              maxLength={SEARCH_MAX}
              accessibilityLabel="Search swaps"
              accessibilityRole="search"
            />
            {searchText.length > 0 ? (
              <Pressable onPress={clearSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Icon name="close-circle" size={18} color={theme.colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="All" selected={filters.category === null} onPress={() => pickCategory(null)} />
            {CLOTHING_CATEGORIES.map(c => (
              <Chip
                key={c}
                label={CATEGORY_LABELS[c]}
                selected={filters.category === c}
                onPress={() => pickCategory(filters.category === c ? null : c)}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {ITEM_CONDITIONS.map(c => (
              <Chip
                key={c}
                label={ITEM_CONDITION_LABELS[c]}
                selected={filters.conditions.includes(c)}
                onPress={() => toggleCondition(c)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  const sheets = (
    <>
      <SwapGuidelinesSheet visible={showGuidelines} onClose={() => setShowGuidelines(false)} />
      <SwapBlockedSheet visible={showBlocked} onClose={() => setShowBlocked(false)} />
      <SwapTermsSheet
        visible={access.state === 'needs_terms' && termsOpen}
        onAccepted={() => {
          setTermsOpen(true);
          refreshAccess();
        }}
        onClose={() => setTermsOpen(false)}
      />
      <SwapJoinCommunitySheet
        visible={joinOpen}
        onJoined={() => {
          setJoinOpen(false);
          setSegment('community');
          refreshAccess();
        }}
        onClose={() => setJoinOpen(false)}
      />
      {safety ? (
        <SwapSafetySheet
          visible={safetyOpen}
          refType="listing"
          refId={safety.refId}
          label={safety.label}
          onClose={() => setSafetyOpen(false)}
          onBlocked={() => {
            setSafetyOpen(false);
            fetchFirst('load');
          }}
        />
      ) : null}
    </>
  );

  // ── when the member cannot swap (yet) ──

  if (!ready) {
    return (
      <Screen padded={false} header={header}>
        <View style={{ flex: 1 }}>
          {access.state === 'loading' ? (
            <View style={styles.skeletonPage}>
              <SkeletonGrid />
            </View>
          ) : (
            <SwapAccessNotice
              access={access}
              onSignIn={signIn}
              onRetry={refreshAccess}
              onReadTerms={() => setTermsOpen(true)}
            />
          )}
          {menuOverlay}
        </View>
        {sheets}
      </Screen>
    );
  }

  // ── the board ──

  const emptyContent = (() => {
    if (loading) return <SkeletonGrid />;
    if (error) {
      if (error.code === 'swap_rate_limited') {
        return (
          <EmptyState
            icon={<Icon name="hourglass-outline" size={32} color={theme.colors.textSubtle} />}
            title={swapErrorMessage(error, 'You’re going a bit fast. Please wait a moment.')}
          />
        );
      }
      return <LoadError what="swaps" onRetry={() => fetchFirst('load')} />;
    }
    if (hasFilters) {
      return (
        <EmptyState
          icon={<Icon name="search-outline" size={32} color={theme.colors.textSubtle} />}
          title="No matches"
          body="Try a different search or clear your filters."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      );
    }
    if (friendId) {
      return (
        <EmptyState
          icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
          title="Nothing open to swap yet"
          body={`${friendName || 'This friend'} hasn’t opened a piece to swap yet.`}
        />
      );
    }
    if (scope === 'community') {
      return (
        <EmptyState
          icon={<Icon name="people-outline" size={32} color={theme.colors.textSubtle} />}
          title="Quiet in here"
          body="Be the first to open a piece for the community."
          actionLabel="Open a piece"
          onAction={openPieces}
        />
      );
    }
    return (
      <View>
        <EmptyState
          icon={<Icon name="swap-horizontal-outline" size={32} color={theme.colors.textSubtle} />}
          title="Nothing open to swap yet"
          body="When a friend opens a piece to swap, it shows up here. Open one of yours to get things started."
        />
        <View style={styles.emptyActions}>
          <Button label="Open a piece" onPress={openPieces} fullWidth />
          <Button label="Find friends" variant="secondary" onPress={openFriends} fullWidth />
          <Button label="Invite a friend" variant="secondary" onPress={invite} fullWidth />
        </View>
      </View>
    );
  })();

  const footer = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  ) : moreFailed ? (
    <View style={styles.footer}>
      <Button label="Couldn’t load more. Try again" variant="secondary" size="sm" onPress={() => loadMore(true)} />
    </View>
  ) : null;

  return (
    <Screen padded={false} header={header}>
      <View style={{ flex: 1 }}>
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          {...keyboardListProps}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchFirst('refresh')} tintColor={theme.colors.accent} />
          }
          onEndReached={() => loadMore(false)}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            error && items.length > 0 ? (
              <View style={styles.banner}>
                <LoadError variant="banner" what="swaps" onRetry={() => fetchFirst('refresh')} />
              </View>
            ) : null
          }
          ListEmptyComponent={emptyContent}
          ListFooterComponent={footer}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <SwapCard listing={item} onPress={() => openListing(item)} onMenu={() => openSafety(item)} />
            </View>
          )}
        />

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
  mySwaps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  filters: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  chipRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 100,
  },
  cell: {
    width: '50%',
    paddingHorizontal: 6,
    paddingBottom: 16,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  skeletonPage: {
    paddingHorizontal: 10,
    paddingTop: 12,
  },
  banner: {
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  emptyActions: {
    paddingHorizontal: 24,
    gap: 10,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  menu: {
    position: 'absolute',
    top: 4,
    right: 12,
    minWidth: 220,
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

export default SwapBoardScreen;
