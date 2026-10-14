/**
 * SwapOfferSheet — "Offer a swap": pick one to three of your own open pieces, optionally ask for up
 * to two more pieces from the same person, add a note, and send.
 *
 * Rules the server enforces again (propose_swap): one open offer per pair, offers to a stranger may
 * only include pieces open to the community, item for item with no money. The sheet only keeps people
 * from walking into the obvious refusals.
 *
 * A failed send keeps everything typed and picked. The attempt's clientRef is made once when the
 * sheet opens and reused by every retry, so a send that reached the server but whose answer was lost
 * returns the same swap instead of making a second one.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { SWAP_LIMITS, SWAP_NO_MONEY_LINE } from '../config/swapRules';
import { browseSwapListings, listMySwapListings, proposeSwap } from '../services/swapService';
import { swapErrorMessage } from '../services/swapErrors';
import type { MySwapListing, SwapListing } from '../types/swap';
import { conditionLabel } from '../utils/itemCondition';
import { newClientRef } from '../utils/swapFormat';
import { KeyboardDoneBar, keyboardDoneProps } from './KeyboardSafe';
import { KeyboardLift, useKeyboardHeight } from './KeyboardLift';
import SwapPhoto from './SwapPhoto';

/** Own pieces a member can put on one side of an offer, and the extra pieces they can ask for. */
const MAX_OFFERED = SWAP_LIMITS.items_per_side;
const MAX_EXTRA_ASKED = SWAP_LIMITS.items_per_side - 1;
/** How many of the owner's other pieces the sheet lists (the page also holds the target itself). */
const EXTRAS_SHOWN = 10;

export type SwapOfferSheetProps = {
  visible: boolean;
  /** The piece the member wants. */
  target: SwapListing;
  onClose: () => void;
  /** The offer was sent; the screen opens the thread. */
  onSent: (swapId: string) => void;
  /** The member has nothing open to swap: the screen takes them to My swaps, My pieces. */
  onOpenPieces: () => void;
};

const details = (size?: string, condition?: string): string => [size, condition].filter(Boolean).join(', ');

/** On the rack now: the server only accepts active, unexpired pieces on the giving side. */
const isOpen = (p: MySwapListing): boolean => p.status === 'active' && !(Date.parse(p.expiresAt) <= Date.now());

type RowProps = {
  label: string;
  title: string;
  subtitle: string;
  photoPath: string;
  checked: boolean;
  disabled: boolean;
  /** Shown under the title when the row cannot be picked. */
  note?: string;
  onToggle: () => void;
};

const PieceRow: React.FC<RowProps> = ({ label, title, subtitle, photoPath, checked, disabled, note, onToggle }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.row, { borderBottomColor: theme.colors.border, opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      <SwapPhoto path={photoPath} style={[styles.thumb, { borderRadius: theme.radius.sm }]} />
      <View style={styles.rowText}>
        <Text variant="body" weight="600" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" color="muted" numberOfLines={1}>{subtitle}</Text> : null}
        {note ? <Text variant="caption" color="subtle">{note}</Text> : null}
      </View>
      <Icon
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? theme.colors.accent : theme.colors.textSubtle}
      />
    </Pressable>
  );
};

export const SwapOfferSheet: React.FC<SwapOfferSheetProps> = ({ visible, target, onClose, onSent, onOpenPieces }) => {
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  // null while the member's pieces are loading.
  const [pieces, setPieces] = useState<MySwapListing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extras, setExtras] = useState<SwapListing[]>([]);
  const [offered, setOffered] = useState<string[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One reference per opening, kept by every retry and replaced only after a send succeeded.
  const clientRef = useRef('');
  // A new number each time the sheet opens, closes or is pointed at another piece: an answer that arrives
  // under an older number belongs to a sheet that is gone.
  const session = useRef(0);

  // Someone who is not a friend is offered only pieces that went through the community photo check.
  const stranger = target.ownerKind === 'member';
  const canOffer = useCallback((p: MySwapListing) => !stranger || p.audience === 'community', [stranger]);

  /** Reads the member's open pieces; true when at least one of them can go into this offer. */
  const loadPieces = useCallback(async (): Promise<boolean> => {
    const mine = session.current;
    setLoadError(null);
    try {
      const open = (await listMySwapListings()).filter(isOpen);
      if (mine !== session.current) return false;
      setPieces(open);
      return open.some(canOffer);
    } catch (e) {
      if (mine === session.current) setLoadError(swapErrorMessage(e, 'Couldn’t load your pieces. Please try again.'));
      return false;
    }
  }, [canOffer]);

  const loadExtras = useCallback(async () => {
    const mine = session.current;
    try {
      const page = await browseSwapListings({
        scope: stranger ? 'community' : 'friends',
        sameOwnerAs: target.id,
        limit: EXTRAS_SHOWN + 1,
      });
      if (mine === session.current) setExtras(page.items.filter(l => l.id !== target.id).slice(0, EXTRAS_SHOWN));
    } catch {
      // Asking for more is optional: without the list the offer is just for this piece.
    }
  }, [stranger, target.id]);

  // The owner's other pieces are only worth a page of the daily browsing allowance if there is something to offer for them.
  const loadAll = useCallback(async () => {
    if (await loadPieces()) await loadExtras();
  }, [loadPieces, loadExtras]);

  useEffect(() => {
    session.current++;
    if (!visible) return;
    clientRef.current = newClientRef();
    setPieces(null);
    setLoadError(null);
    setExtras([]);
    setOffered([]);
    setAsked([]);
    setNote('');
    setBusy(false);
    setError(null);
    loadAll();
  }, [visible, target.id, loadAll]);

  // A request in flight cannot be taken back, so the sheet stays until it has an answer.
  const close = () => {
    if (!busy) onClose();
  };

  const toggleOffered = (p: MySwapListing) => {
    if (busy || !canOffer(p)) return;
    setError(null);
    setOffered(cur => {
      if (cur.includes(p.id)) return cur.filter(id => id !== p.id);
      return cur.length >= MAX_OFFERED ? cur : [...cur, p.id];
    });
  };

  const toggleAsked = (l: SwapListing) => {
    if (busy) return;
    setError(null);
    setAsked(cur => {
      if (cur.includes(l.id)) return cur.filter(id => id !== l.id);
      return cur.length >= MAX_EXTRA_ASKED ? cur : [...cur, l.id];
    });
  };

  const send = async () => {
    if (busy || offered.length === 0) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      const swapId = await proposeSwap({
        requestListingIds: [target.id, ...asked],
        offerListingIds: offered,
        note: note.trim() || undefined,
        clientRef: clientRef.current,
      });
      if (mine !== session.current) return;
      clientRef.current = newClientRef();
      onSent(swapId);
    } catch (e) {
      if (mine === session.current) setError(swapErrorMessage(e, 'Couldn’t send your offer. Please try again.'));
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const openPieces = () => {
    onClose();
    onOpenPieces();
  };

  const selectable = (pieces ?? []).filter(canOffer);
  const nothingToOffer = pieces !== null && selectable.length === 0;
  // What is left of the screen once the sheet's fixed parts and the keyboard are taken out.
  const listMax = Math.max(100, Math.min(windowHeight * 0.4, windowHeight - keyboardHeight - 430));

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <View>
        <Text variant="body" color="danger" accessibilityLiveRegion="polite">{loadError}</Text>
        <Button label="Try again" variant="secondary" onPress={loadAll} style={styles.gap} />
      </View>
    );
  } else if (pieces === null) {
    body = (
      <Text variant="body" color="muted" style={styles.pad}>Loading your pieces…</Text>
    );
  } else if (nothingToOffer) {
    body = (
      <View>
        <Text variant="body" color="muted">
          {pieces.length === 0
            ? 'You don’t have any pieces open to swap yet. Open one of yours, then come back to make an offer.'
            : 'Only pieces you opened to the community can be offered to someone who isn’t your friend. Open one to the community, then come back to make an offer.'}
        </Text>
        <Button label="Open a piece" onPress={openPieces} fullWidth style={styles.gap} />
        <Button label="Cancel" variant="ghost" onPress={close} fullWidth style={styles.gapSmall} />
      </View>
    );
  } else {
    body = (
      <KeyboardLift>
        <ScrollView style={{ maxHeight: listMax }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHead}>
            <Text variant="overline" color="muted">Your pieces</Text>
            <Text variant="caption" color="muted">{`${offered.length} of ${MAX_OFFERED}`}</Text>
          </View>
          {pieces.map(p => {
            const friendsOnly = !canOffer(p);
            return (
              <PieceRow
                key={p.id}
                label={`Offer ${p.name}`}
                title={p.name}
                subtitle={details(p.size, conditionLabel(p.condition))}
                photoPath={p.photoPath}
                checked={offered.includes(p.id)}
                disabled={busy || friendsOnly}
                note={friendsOnly ? 'Friends only' : undefined}
                onToggle={() => toggleOffered(p)}
              />
            );
          })}

          {extras.length > 0 ? (
            <View>
              <View style={[styles.sectionHead, { marginTop: 16 }]}>
                <Text variant="overline" color="muted">{`More from ${target.ownerLabel}`}</Text>
                <Text variant="caption" color="muted">{`Ask for up to ${MAX_EXTRA_ASKED} more`}</Text>
              </View>
              {extras.map(l => (
                <PieceRow
                  key={l.id}
                  label={`Also ask for ${l.name}`}
                  title={l.name}
                  subtitle={details(l.size, conditionLabel(l.condition))}
                  photoPath={l.photoPath}
                  checked={asked.includes(l.id)}
                  disabled={busy}
                  onToggle={() => toggleAsked(l)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>

        <Input
          label="Note (optional)"
          placeholder={`Say hello to ${target.ownerLabel}`}
          value={note}
          onChangeText={t => {
            setNote(t);
            setError(null);
          }}
          multiline
          maxLength={SWAP_LIMITS.proposal_note_max}
          editable={!busy}
          containerStyle={styles.gap}
          inputStyle={styles.note}
          helper={`${note.length}/${SWAP_LIMITS.proposal_note_max}`}
          accessibilityLabel="Offer note"
          {...keyboardDoneProps}
        />
        <Text variant="caption" color="muted" style={styles.gapSmall}>{SWAP_NO_MONEY_LINE}</Text>
        {error ? (
          <Text variant="caption" color="danger" style={styles.gapSmall} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Button label="Cancel" variant="secondary" onPress={close} disabled={busy} style={styles.flex} />
          <Button
            label="Send offer"
            onPress={send}
            loading={busy}
            disabled={offered.length === 0}
            style={styles.flex}
          />
        </View>
        <KeyboardDoneBar />
      </KeyboardLift>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title="Offer a swap">
      <Text variant="bodySmall" color="muted" style={styles.intro}>
        {`You’re asking for ${target.name} from ${target.ownerLabel}.`}
      </Text>
      {body}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  intro: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 55,
    overflow: 'hidden',
  },
  rowText: {
    flex: 1,
    marginHorizontal: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  note: {
    minHeight: 64,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  flex: {
    flex: 1,
  },
  gap: {
    marginTop: 14,
  },
  gapSmall: {
    marginTop: 8,
  },
  pad: {
    paddingVertical: 24,
  },
});

export default SwapOfferSheet;
