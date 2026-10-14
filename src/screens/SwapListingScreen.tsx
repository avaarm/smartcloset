/**
 * SwapListingScreen — one piece on the swap rack: a large photo, who is offering it, the facts, their
 * note, and "Offer a swap". Other pieces from the same person sit underneath.
 *
 * Your own piece shows "This is your piece" and a way to My swaps instead of the offer button. A piece
 * that was withdrawn or taken off the rack shows "No longer available" with a way back, and so does
 * one the member can no longer see (the server answers the same either way). After a block the screen
 * goes back, because the piece is gone.
 *
 * Navigation goes through routes registered in HomeStack (SwapListing, SwapThread, MySwaps, SignIn).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import SwapCard from '../components/SwapCard';
import SwapOfferSheet from '../components/SwapOfferSheet';
import SwapPhoto from '../components/SwapPhoto';
import SwapSafetySheet from '../components/SwapSafetySheet';
import SwapTermsSheet from '../components/SwapTermsSheet';
import { useSwapAccess } from '../hooks/useSwapAccess';
import { browseSwapListings, getSwapListing } from '../services/swapService';
import { toSwapError } from '../services/swapErrors';
import type { SwapListing } from '../types/swap';
import { listingFacts, ownerLine } from '../utils/swapFormat';
import { markSwapRackDirty, SwapAccessNotice } from './SwapBoardScreen';

/** "More from <owner>" shows at most this many other pieces. */
const MORE_SHOWN = 10;

type RouteParams = { listingId: string };
type LoadState = 'loading' | 'ready' | 'gone' | 'error';

/** Answers that mean "what this member may do has changed": the screen asks useSwapAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'swaps_disabled', 'swap_suspended', 'swap_terms_required', 'not_deployed',
]);

const SwapListingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { listingId } = (route.params || {}) as RouteParams;
  const { theme } = useTheme();
  const { access, refresh: refreshAccess } = useSwapAccess();
  const ready = access.state === 'ready';

  const [state, setState] = useState<LoadState>('loading');
  const [listing, setListing] = useState<SwapListing | null>(null);
  const [more, setMore] = useState<SwapListing[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(true);
  // The target is kept after the sheet closes so it can slide out with its content.
  const [safety, setSafety] = useState<{ refId: string; label: string } | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  // A number per load: an answer for a piece the screen has moved off is dropped.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState('loading');
    setListing(null);
    setMore([]);
    try {
      const found = await getSwapListing(listingId);
      if (id !== requestId.current) return;
      setListing(found);
      setState('ready');
      if (found.mine) return;
      try {
        const page = await browseSwapListings({
          scope: found.ownerKind === 'friend' ? 'friends' : 'community',
          sameOwnerAs: found.id,
          limit: MORE_SHOWN + 1,
        });
        if (id === requestId.current) setMore(page.items.filter(l => l.id !== found.id).slice(0, MORE_SHOWN));
      } catch {
        // The row of other pieces is a bonus; without it the piece is shown on its own.
      }
    } catch (e) {
      if (id !== requestId.current) return;
      const err = toSwapError(e);
      if (err.code === 'swap_unavailable' || err.code === 'item_not_found') {
        setState('gone');
        return;
      }
      if (ACCESS_CODES.has(err.code)) refreshAccess();
      setState('error');
    }
  }, [listingId, refreshAccess]);

  useEffect(() => {
    if (ready && listingId) load();
    else requestId.current++;
  }, [ready, listingId, load]);

  const goBack = () => navigation.goBack();

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
        Swap piece
      </Text>
      {listing && !listing.mine ? (
        <Pressable
          onPress={() => {
            setSafety({ refId: listing.id, label: listing.ownerLabel });
            setSafetyOpen(true);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${listing.ownerLabel}`}
        >
          <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  const safetySheet = safety ? (
    <SwapSafetySheet
      visible={safetyOpen}
      refType="listing"
      refId={safety.refId}
      label={safety.label}
      onClose={() => setSafetyOpen(false)}
      onBlocked={() => {
        setSafetyOpen(false);
        // The board underneath still shows this member's cards; have it read the rack again when we land on it.
        markSwapRackDirty();
        goBack();
      }}
    />
  ) : null;

  // ── when the member cannot swap (yet) ──

  if (!ready) {
    return (
      <Screen padded header={header}>
        {access.state === 'loading' ? (
          <Skeleton style={{ aspectRatio: 4 / 5, height: undefined }} borderRadius={16} />
        ) : (
          <SwapAccessNotice
            access={access}
            onSignIn={() => navigation.navigate('SignIn')}
            onRetry={refreshAccess}
            onReadTerms={() => setTermsOpen(true)}
          />
        )}
        <SwapTermsSheet
          visible={access.state === 'needs_terms' && termsOpen}
          onAccepted={() => {
            setTermsOpen(true);
            refreshAccess();
          }}
          onClose={() => setTermsOpen(false)}
        />
      </Screen>
    );
  }

  // ── the piece ──

  if (state === 'gone') {
    return (
      <Screen padded header={header}>
        <EmptyState
          icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
          title="No longer available"
          body="This piece was withdrawn or is no longer on the swap board."
          actionLabel="Back to the swap board"
          onAction={goBack}
        />
      </Screen>
    );
  }

  if (state === 'error') {
    return (
      <Screen padded header={header}>
        <LoadError what="piece" title="Couldn’t load this piece" onRetry={load} />
      </Screen>
    );
  }

  if (state === 'loading' || !listing) {
    return (
      <Screen padded header={header}>
        <Skeleton style={{ aspectRatio: 4 / 5, height: undefined }} borderRadius={16} />
        <Skeleton width="60%" height={22} style={{ marginTop: 16 }} />
        <Skeleton width="40%" height={14} style={{ marginTop: 10 }} />
      </Screen>
    );
  }

  const facts = listingFacts(listing);

  return (
    <Screen scrollable padded header={header}>
      <View style={[styles.photo, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.xl }]}>
        <SwapPhoto path={listing.photoPath} style={styles.photoImage} accessibilityLabel={listing.name} />
      </View>

      <Text variant="h2" style={{ marginTop: 16 }}>{listing.name}</Text>
      <Text variant="body" color="muted" style={{ marginTop: 4 }}>{ownerLine(listing)}</Text>

      {facts.length > 0 ? (
        <Card style={{ marginTop: 16 }} padding={0}>
          {facts.map((fact, i) => (
            <View
              key={fact.label}
              style={[
                styles.fact,
                i < facts.length - 1 && { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <Text variant="body" color="muted" style={styles.factLabel}>{fact.label}</Text>
              <Text variant="body" style={{ flex: 1 }}>{fact.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {listing.note ? (
        <Card style={{ marginTop: 16 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 6 }}>{`Note from ${listing.ownerLabel}`}</Text>
          <Text variant="body">{listing.note}</Text>
        </Card>
      ) : null}

      <View style={{ marginTop: 20 }}>
        {listing.mine ? (
          <>
            <Text variant="h4">This is your piece</Text>
            <Text variant="body" color="muted" style={{ marginTop: 4 }}>
              Withdraw it or change its note from My swaps.
            </Text>
            <Button
              label="See in My swaps"
              variant="secondary"
              onPress={() => navigation.navigate('MySwaps', { segment: 'pieces' })}
              fullWidth
              style={{ marginTop: 12 }}
            />
          </>
        ) : (
          <Button label="Offer a swap" size="lg" onPress={() => setOfferOpen(true)} fullWidth />
        )}
      </View>

      {more.length > 0 ? (
        <View style={{ marginTop: 28 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>{`More from ${listing.ownerLabel}`}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreRow}>
            {more.map(l => (
              <View key={l.id} style={styles.moreCell}>
                <SwapCard
                  listing={l}
                  onPress={() => navigation.navigate('SwapListing', { listingId: l.id })}
                  onMenu={() => {
                    setSafety({ refId: l.id, label: l.ownerLabel });
                    setSafetyOpen(true);
                  }}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {!listing.mine ? (
        <SwapOfferSheet
          visible={offerOpen}
          target={listing}
          onClose={() => setOfferOpen(false)}
          onSent={swapId => {
            setOfferOpen(false);
            navigation.navigate('SwapThread', { swapId });
          }}
          onOpenPieces={() => navigation.navigate('MySwaps', { segment: 'pieces' })}
        />
      ) : null}
      {safetySheet}
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
  photo: {
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  fact: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  factLabel: {
    width: 96,
  },
  moreRow: {
    gap: 12,
  },
  moreCell: {
    width: 150,
  },
});

export default SwapListingScreen;
