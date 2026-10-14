/**
 * SwapListingCard — the swap section of Item Details: open this piece to swap, see how it stands, change or
 * take it back.
 *
 * It is mounted inside ItemDetailsScreen, so it takes callbacks and nothing else from the screen, uses no
 * navigation hook, and reads only the swap service. It reads the member's listings once on mount (and again
 * after anything it changes, or when the piece is edited) and branches on the kind of error:
 *   not_authenticated            a guest: "Sign in to swap", and no other call is made
 *   swaps_disabled, not_deployed  the card is not shown at all
 *   anything else                "Couldn't load swap status" with Try again
 * It renders no text field (the note is typed in ListForSwapSheet) and logs nothing on failure.
 *
 * It uses the item screen's own look (section padding 20, title 20 / 700, card radius 12, gold accent), so it
 * sits in the page like its neighbours.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../styles/theme';
import type { ClothingItem } from '../types';
import type { MySwapListing } from '../types/swap';
import {
  listMySwapListings,
  publishSwapListing,
  renewSwapListing,
  withdrawSwapListing,
} from '../services/swapService';
import { swapErrorMessage, toSwapError } from '../services/swapErrors';
import { storagePathFromUrl } from '../services/imageUrls';
import ListForSwapSheet, {
  emailSupport,
  HELD_TEXT,
  hasClosetPhoto,
  PHOTO_FIRST_TEXT,
  useSwapTermsGate,
} from './ListForSwapSheet';

export type SwapListingCardProps = {
  item: ClothingItem;
  /** Take the member to the piece editor (to add a photo, or replace one a swap cannot use). */
  onEditPiece: () => void;
  /** Take the member to My swaps. */
  onOpenSwaps: () => void;
  /** Take a guest to sign in. */
  onSignIn: () => void;
};

type Load =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'hidden' }
  | { kind: 'error' }
  | { kind: 'ready'; listing: MySwapListing | null };

type ActionError = { message: string; replacePhoto: boolean };

/** Which of the member's listings stands for this piece. A hold or a removal outranks everything else. */
const STATUS_ORDER: MySwapListing['status'][] = ['removed', 'held', 'reserved', 'active', 'expired'];
const listingFor = (rows: MySwapListing[], itemId: string): MySwapListing | null => {
  for (const status of STATUS_ORDER) {
    const found = rows.find(r => r.itemId === itemId && r.status === status);
    if (found) return found;
  }
  return null;
};

const Pill: React.FC<{ label: string; tone?: 'plain' | 'accent' | 'good' | 'warn' }> = ({ label, tone = 'plain' }) => (
  <View style={[styles.pill, tone === 'accent' && styles.pillAccent, tone === 'good' && styles.pillGood, tone === 'warn' && styles.pillWarn]}>
    <Text style={[styles.pillText, tone === 'accent' && styles.pillTextAccent]}>{label}</Text>
  </View>
);

const Action: React.FC<{
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
}> = ({ label, onPress, primary, danger, disabled, busy }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || busy}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
    style={[styles.action, primary && styles.actionPrimary, (disabled || busy) && styles.actionOff]}
  >
    <Text style={[styles.actionText, primary && styles.actionTextPrimary, danger && styles.actionTextDanger]}>{label}</Text>
  </Pressable>
);

const LinkText: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="link"
    accessibilityLabel={label}
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    style={styles.link}
  >
    <Text style={styles.linkText}>{label}</Text>
  </Pressable>
);

function SwapListingCardInner({ item, onEditPiece, onOpenSwaps, onSignIn }: SwapListingCardProps) {
  const [view, setView] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  // The sheet keeps its mode and listing after it closes, so its content does not change while it slides away.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'open' | 'note'>('open');
  const [noteFor, setNoteFor] = useState<MySwapListing | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const request = useRef(0);
  const gate = useSwapTermsGate();

  const itemId = item.id;
  // The listing is a snapshot of these; when one changes, the server's "changed since you opened it" can change.
  const signature = [item.name, item.category, item.brand, item.color, item.size, item.condition, storagePathFromUrl(item.userImage)].join('\u0001');

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const rows = await listMySwapListings();
      if (!alive.current || mine !== request.current) return;
      setView({ kind: 'ready', listing: listingFor(rows, itemId) });
    } catch (e) {
      if (!alive.current || mine !== request.current) return;
      const code = toSwapError(e).code;
      if (code === 'not_authenticated') setView({ kind: 'guest' });
      else if (code === 'swaps_disabled' || code === 'not_deployed') setView({ kind: 'hidden' });
      else setView({ kind: 'error' });
    }
  }, [itemId]);

  useEffect(() => {
    setView({ kind: 'loading' });
    setActionError(null);
    setSheetOpen(false);
  }, [itemId]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load, signature]);

  const run = async (job: () => Promise<unknown>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await job();
      await load();
    } catch (e) {
      if (!alive.current) return;
      const code = toSwapError(e).code;
      if (code === 'swap_terms_required') {
        const why = await gate.requireTerms(() => {
          if (alive.current) run(job, fallback);
        });
        if (why && alive.current) setActionError({ message: why, replacePhoto: false });
      } else if (code === 'swaps_disabled' || code === 'not_deployed') {
        setView({ kind: 'hidden' });
      } else {
        // Only a republish (Update) can fail on the photo; the way on is a different photo.
        setActionError({
          message: swapErrorMessage(e, fallback),
          replacePhoto: code === 'unsupported_image' || code === 'photo_too_large',
        });
        // The server's picture of the listing may have moved on (taken, held, gone): show it.
        if (code === 'swap_unavailable' || code === 'item_reserved' || code === 'listing_held') await load();
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const confirmWithdraw = (listing: MySwapListing) =>
    Alert.alert(
      'Withdraw this piece?',
      listing.openOffers > 0 ? 'It leaves the swap board and the offers waiting for it end.' : 'It leaves the swap board.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => run(() => withdrawSwapListing(listing.id), 'Couldn’t withdraw that piece. Please try again.') },
      ],
    );

  const update = (listing: MySwapListing) =>
    run(
      () => publishSwapListing({ itemId, audience: listing.audience, note: listing.note }),
      'Couldn’t update that piece. Please try again.',
    );

  const retryLoad = () => {
    setView({ kind: 'loading' });
    load();
  };

  const openSheet = (mode: 'open' | 'note', listing?: MySwapListing) => {
    setSheetMode(mode);
    if (listing) setNoteFor(listing);
    setSheetOpen(true);
  };

  if (view.kind === 'hidden') return null;

  const renderReady = (listing: MySwapListing | null) => {
    if (!listing) {
      const photo = hasClosetPhoto(item);
      return (
        <View>
          <Text style={styles.body}>Let friends offer you a swap for this piece. Swaps are item for item.</Text>
          <View style={styles.actions}>
            <Action label="Open to swap" primary disabled={!photo} onPress={() => openSheet('open')} />
          </View>
          {!photo ? (
            <View style={styles.hint}>
              <Text style={styles.hintText}>{PHOTO_FIRST_TEXT}</Text>
              <LinkText label="Add a photo" onPress={onEditPiece} />
            </View>
          ) : null}
        </View>
      );
    }

    const audience = <Pill label={listing.audience === 'community' ? 'Community' : 'Friends'} tone="accent" />;

    if (listing.status === 'removed' || listing.status === 'held') {
      return (
        <View>
          <View style={styles.pills}>
            <Pill label={listing.status === 'held' ? 'Under review' : 'Not available'} tone="warn" />
          </View>
          <Text style={[styles.body, { marginTop: 10 }]}>{HELD_TEXT}</Text>
          <LinkText label="Email support" onPress={emailSupport} />
        </View>
      );
    }

    if (listing.inAcceptedSwap || listing.status === 'reserved') {
      return (
        <View>
          <View style={styles.pills}>{audience}</View>
          <View style={styles.banner} accessibilityRole="alert">
            <Text style={styles.bannerText}>Locked into a swap. Deleting this piece cancels the swap.</Text>
          </View>
          <View style={styles.actions}>
            <Action label="See swap" onPress={onOpenSwaps} />
          </View>
        </View>
      );
    }

    if (listing.status === 'expired') {
      return (
        <View>
          <View style={styles.pills}>
            {audience}
            <Pill label="Expired" />
          </View>
          <Text style={[styles.body, { marginTop: 10 }]}>Expired. This piece is no longer on the swap board.</Text>
          <View style={styles.actions}>
            <Action label="Renew" primary busy={busy} onPress={() => run(() => renewSwapListing(listing.id), 'Couldn’t renew that piece. Please try again.')} />
          </View>
        </View>
      );
    }

    return (
      <View>
        <View style={styles.pills}>
          {audience}
          <Pill label="Open to swap" tone="good" />
        </View>
        {listing.note ? <Text style={[styles.body, { marginTop: 10 }]}>{listing.note}</Text> : null}
        {listing.openOffers > 0 ? (
          <View style={styles.hint}>
            <Text style={styles.hintText}>{listing.openOffers === 1 ? '1 offer waiting' : `${listing.openOffers} offers waiting`}</Text>
            <LinkText label="See swaps" onPress={onOpenSwaps} />
          </View>
        ) : null}
        {listing.stale ? (
          <View style={styles.hint}>
            <Text style={styles.hintText}>You changed this piece since you opened it.</Text>
            <Action label="Update" primary busy={busy} onPress={() => update(listing)} />
          </View>
        ) : null}
        <View style={styles.actions}>
          <Action label="Edit note" disabled={busy} onPress={() => openSheet('note', listing)} />
          <Action label="Withdraw" danger disabled={busy} onPress={() => confirmWithdraw(listing)} />
        </View>
      </View>
    );
  };

  const body = (() => {
    switch (view.kind) {
      case 'loading':
        return (
          <View accessibilityLabel="Loading swap status" accessibilityRole="progressbar">
            <View style={[styles.bar, { width: '55%' }]} />
            <View style={[styles.bar, { width: '85%', marginTop: 10 }]} />
            <View style={[styles.bar, { width: '35%', height: 36, marginTop: 14 }]} />
          </View>
        );

      case 'guest':
        return (
          <View>
            <Text style={styles.body}>Trade pieces you no longer wear with your friends.</Text>
            <Pressable onPress={onSignIn} accessibilityRole="button" accessibilityLabel="Sign in to swap" style={styles.signIn}>
              <Text style={styles.signInText}>Sign in to swap</Text>
            </Pressable>
          </View>
        );

      case 'error':
        return (
          <View>
            <Text style={styles.body}>Couldn't load swap status</Text>
            <View style={styles.actions}>
              <Action label="Try again" onPress={retryLoad} />
            </View>
          </View>
        );

      case 'ready':
        return renderReady(view.listing);
    }
  })();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">Swap</Text>
      <View style={styles.card}>
        {body}
        {actionError ? (
          <View style={styles.hint}>
            <Text style={styles.errorText} accessibilityLiveRegion="polite">{actionError.message}</Text>
            {actionError.replacePhoto ? <LinkText label="Replace photo" onPress={onEditPiece} /> : null}
          </View>
        ) : null}
      </View>
      {view.kind === 'ready' ? (
        <>
          <ListForSwapSheet
            visible={sheetOpen}
            item={sheetMode === 'open' ? item : undefined}
            editListing={sheetMode === 'note' && noteFor ? noteFor : undefined}
            onClose={() => setSheetOpen(false)}
            onChanged={load}
            onEditPiece={() => onEditPiece()}
          />
          {gate.sheet}
        </>
      ) : null}
    </View>
  );
}

const SwapListingCard: React.FC<SwapListingCardProps> = props =>
  props.item.isWishlist ? null : <SwapListingCardInner {...props} />;

export { SwapListingCard };
export default SwapListingCard;

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 32 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    ...theme.shadows.subtle,
  },
  body: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  bar: { height: 14, borderRadius: 7, backgroundColor: theme.colors.border },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  pillAccent: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  pillGood: { backgroundColor: theme.colors.successSubtle, borderColor: 'transparent' },
  pillWarn: { backgroundColor: theme.colors.warningSubtle, borderColor: 'transparent' },
  pillText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  pillTextAccent: { color: theme.colors.accentText },
  banner: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.warningSubtle,
  },
  bannerText: { fontSize: 14, lineHeight: 20, color: theme.colors.text },
  hint: { marginTop: 10, gap: 4 },
  hintText: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  errorText: { fontSize: 14, lineHeight: 20, color: theme.colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  action: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignSelf: 'flex-start',
  },
  actionPrimary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  actionOff: { opacity: 0.5 },
  actionText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  actionTextPrimary: { color: theme.colors.accentText },
  actionTextDanger: { color: theme.colors.danger },
  link: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontWeight: '600', color: theme.colors.accent, textDecorationLine: 'underline' },
  signIn: {
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  signInText: { fontSize: 16, fontWeight: '600', color: theme.colors.accent, textDecorationLine: 'underline' },
});
