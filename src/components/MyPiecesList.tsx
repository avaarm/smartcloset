/**
 * MyPiecesList — the member's own listings: what is open to swap, how each stands, and what they can do.
 *
 * Mounted by the My swaps screen (the "My pieces" segment). It renders a plain column of rows, not a list
 * with its own scrolling, so the screen's scroll view and pull to refresh stay in charge; the screen gives it
 * a new `key` to read again. It uses no navigation hook and takes no callbacks but onChanged.
 *
 * Per row, by status:
 *   open      Edit note, Withdraw (asks first), Narrow to friends (community listings), Update (when the
 *             piece changed since it was opened)
 *   expired   Renew, Withdraw
 *   locked    nothing: a piece in an accepted swap cannot be changed; the swap decides
 *   held, removed  nothing: only a person can clear either, so the row says so and offers Email support
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, BadgeTone, Button, Card, EmptyState, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import type { MySwapListing } from '../types/swap';
import { SWAP_NOT_DEPLOYED_MESSAGE, SWAP_PAUSED_MESSAGE } from '../config/swapRules';
import {
  listMySwapListings,
  narrowSwapListing,
  publishSwapListing,
  renewSwapListing,
  withdrawSwapListing,
} from '../services/swapService';
import { swapErrorMessage, toSwapError } from '../services/swapErrors';
import { conditionLabel } from '../utils/itemCondition';
import LoadError from './LoadError';
import SwapPhoto from './SwapPhoto';
import ListForSwapSheet, { emailSupport, HELD_TEXT, useSwapTermsGate } from './ListForSwapSheet';

export type MyPiecesListProps = {
  /** Something about the member's listings changed (so the screen can refresh the inbox and badges). */
  onChanged?: () => void;
};

type Failure = 'guest' | 'paused' | 'not_deployed' | 'error';

const isLocked = (l: MySwapListing) => l.status === 'reserved' || l.inAcceptedSwap;

const statusBadge = (l: MySwapListing): { label: string; tone: BadgeTone } => {
  if (l.status === 'removed') return { label: 'Not available', tone: 'danger' };
  if (l.status === 'held') return { label: 'Under review', tone: 'warning' };
  if (isLocked(l)) return { label: 'Locked into a swap', tone: 'accent' };
  if (l.status === 'expired') return { label: 'Expired', tone: 'neutral' };
  return { label: 'Open to swap', tone: 'success' };
};

const offersText = (n: number) => (n === 1 ? '1 open offer' : `${n} open offers`);

export const MyPiecesList: React.FC<MyPiecesListProps> = ({ onChanged }) => {
  const { theme } = useTheme();
  const gate = useSwapTermsGate();
  const [rows, setRows] = useState<MySwapListing[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // A refresh failed while rows were on screen: keep them and say so.
  const [banner, setBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'pick' | 'note'>('pick');
  const [noteFor, setNoteFor] = useState<MySwapListing | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const request = useRef(0);
  const haveRows = useRef(false);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const next = await listMySwapListings();
      if (!alive.current || mine !== request.current) return;
      haveRows.current = true;
      setRows(next);
      setFailure(null);
      setBanner(false);
    } catch (e) {
      if (!alive.current || mine !== request.current) return;
      const code = toSwapError(e).code;
      if (haveRows.current && code !== 'not_authenticated' && code !== 'swaps_disabled' && code !== 'not_deployed') {
        setBanner(true);
        return;
      }
      haveRows.current = false;
      setRows(null);
      setFailure(
        code === 'not_authenticated' ? 'guest' : code === 'swaps_disabled' ? 'paused' : code === 'not_deployed' ? 'not_deployed' : 'error',
      );
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const changed = useCallback(() => {
    load();
    onChanged?.();
  }, [load, onChanged]);

  const run = async (job: () => Promise<unknown>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await job();
      await load();
      onChanged?.();
    } catch (e) {
      if (!alive.current) return;
      const code = toSwapError(e).code;
      if (code === 'swap_terms_required') {
        const why = await gate.requireTerms(() => {
          if (alive.current) run(job, fallback);
        });
        if (why && alive.current) setActionError(why);
      } else {
        setActionError(swapErrorMessage(e, fallback));
        // The server's picture may have moved on (taken, held, gone): show it.
        if (code === 'swap_unavailable' || code === 'item_reserved' || code === 'listing_held') await load();
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const confirmWithdraw = (l: MySwapListing) =>
    Alert.alert(
      'Withdraw this piece?',
      l.openOffers > 0 ? 'It leaves the swap board and the offers waiting for it end.' : 'It leaves the swap board.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => run(() => withdrawSwapListing(l.id), 'Couldn’t withdraw that piece. Please try again.') },
      ],
    );

  const narrow = (l: MySwapListing) => {
    const go = () => run(() => narrowSwapListing(l.id), 'Couldn’t make that piece friends only. Please try again.');
    if (l.openOffers === 0) {
      go();
      return;
    }
    Alert.alert('Make this friends only?', 'Offers from people who aren’t your friends end.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Narrow to friends', onPress: go },
    ]);
  };

  const update = (l: MySwapListing) =>
    run(
      () => publishSwapListing({ itemId: l.itemId as string, audience: l.audience, note: l.note }),
      'Couldn’t update that piece. Please try again.',
    );

  const openSheet = (mode: 'pick' | 'note', listing?: MySwapListing) => {
    setSheetMode(mode);
    if (listing) setNoteFor(listing);
    setSheetOpen(true);
  };

  const renderRow = (l: MySwapListing) => {
    const badge = statusBadge(l);
    const facts = [l.size, conditionLabel(l.condition)].filter(Boolean).join(' · ');
    const locked = isLocked(l);
    const stuck = l.status === 'held' || l.status === 'removed';
    const open = !locked && !stuck && l.status === 'active';
    const expired = !locked && l.status === 'expired';
    return (
      <Card key={l.id} padding={12} bordered style={{ marginBottom: 12 }}>
        <View style={styles.top}>
          <SwapPhoto
            path={l.photoPath}
            accessibilityLabel={`Photo of ${l.name}`}
            style={{ width: 64, height: 80, borderRadius: theme.radius.md }}
          />
          <View style={styles.info}>
            <Text variant="h4" numberOfLines={2}>{l.name}</Text>
            {facts ? <Text variant="bodySmall" color="muted" style={{ marginTop: 2 }}>{facts}</Text> : null}
            <View style={styles.badges}>
              <Badge label={l.audience === 'community' ? 'Community' : 'Friends'} tone="info" />
              <Badge label={badge.label} tone={badge.tone} />
            </View>
            {l.openOffers > 0 && !stuck ? (
              <Text variant="bodySmall" color="accent" weight="600" style={{ marginTop: 6 }}>{offersText(l.openOffers)}</Text>
            ) : null}
            {l.note ? <Text variant="bodySmall" color="muted" style={{ marginTop: 6 }} numberOfLines={2}>{l.note}</Text> : null}
          </View>
        </View>

        {stuck ? (
          <View style={{ marginTop: 10 }}>
            <Text variant="bodySmall" color="muted">{HELD_TEXT}</Text>
            <View style={styles.actions}>
              <Button label="Email support" size="sm" variant="secondary" onPress={emailSupport} />
            </View>
          </View>
        ) : null}

        {open && l.stale && l.itemId ? (
          <View style={[styles.nudge, { backgroundColor: theme.colors.warningSubtle, borderRadius: theme.radius.md }]}>
            <Text variant="bodySmall" style={{ flex: 1, marginRight: 8 }}>You changed this piece since you opened it.</Text>
            <Button label="Update" size="sm" disabled={busy} onPress={() => update(l)} />
          </View>
        ) : null}

        {open ? (
          <View style={styles.actions}>
            <Button label="Edit note" size="sm" variant="secondary" disabled={busy} onPress={() => openSheet('note', l)} />
            {l.audience === 'community' ? (
              <Button label="Narrow to friends" size="sm" variant="secondary" disabled={busy} onPress={() => narrow(l)} />
            ) : null}
            <Button
              label="Withdraw"
              size="sm"
              variant="secondary"
              textStyle={{ color: theme.colors.danger }}
              disabled={busy}
              onPress={() => confirmWithdraw(l)}
            />
          </View>
        ) : null}

        {expired ? (
          <View style={styles.actions}>
            <Button label="Renew" size="sm" disabled={busy} onPress={() => run(() => renewSwapListing(l.id), 'Couldn’t renew that piece. Please try again.')} />
            <Button
              label="Withdraw"
              size="sm"
              variant="secondary"
              textStyle={{ color: theme.colors.danger }}
              disabled={busy}
              onPress={() => confirmWithdraw(l)}
            />
          </View>
        ) : null}
      </Card>
    );
  };

  let content: React.ReactNode;
  if (failure === 'guest') {
    content = <EmptyState title="Sign in to swap" body="Sign in to open pieces from your closet to swap." />;
  } else if (failure === 'paused') {
    content = <EmptyState title="Swaps are paused" body={SWAP_PAUSED_MESSAGE} />;
  } else if (failure === 'not_deployed') {
    content = <EmptyState title="Swaps aren’t available yet in this version" body={SWAP_NOT_DEPLOYED_MESSAGE} />;
  } else if (failure === 'error') {
    content = <LoadError what="pieces" onRetry={load} />;
  } else if (rows === null) {
    content = (
      <View accessibilityLabel="Loading your pieces">
        {[0, 1].map(i => (
          <Card key={i} padding={12} bordered style={{ marginBottom: 12 }}>
            <View style={styles.top}>
              <Skeleton width={64} height={80} borderRadius={theme.radius.md} />
              <View style={styles.info}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
              </View>
            </View>
          </Card>
        ))}
      </View>
    );
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
        title="Nothing open to swap yet"
        body="Open a piece from your closet and your friends can offer a swap for it."
        actionLabel="Open a piece"
        onAction={() => openSheet('pick')}
      />
    );
  } else {
    content = (
      <View>
        {rows.map(renderRow)}
        <Button
          label="Open another piece"
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={() => openSheet('pick')}
        />
      </View>
    );
  }

  return (
    <View>
      {banner ? (
        <View style={{ marginBottom: 12 }}>
          <LoadError what="pieces" variant="banner" onRetry={load} />
        </View>
      ) : null}
      {actionError ? (
        <Text variant="bodySmall" color="danger" style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}
      {content}
      {rows !== null ? (
        <>
          <ListForSwapSheet
            visible={sheetOpen}
            editListing={sheetMode === 'note' && noteFor ? noteFor : undefined}
            onClose={() => setSheetOpen(false)}
            onChanged={changed}
          />
          {gate.sheet}
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  top: { flexDirection: 'row' },
  info: { flex: 1, marginLeft: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  nudge: { flexDirection: 'row', alignItems: 'center', padding: 10, marginTop: 12 },
});

export default MyPiecesList;
