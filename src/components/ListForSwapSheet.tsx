/**
 * ListForSwapSheet — opens a closet piece to swap, or edits the note of a listing that is already open.
 *
 *   item          the form: a preview of what others will see, who may see it, a one-line note.
 *   neither       first a grid of the member's pieces that can be listed, then the same form.
 *   editListing   only the note and Save (updateSwapListingNote).
 *
 * A photo of the piece in the member's own closet is the only hard requirement for friends; size and
 * condition are suggested for friends and required for the community. They are properties of the piece, so
 * the sheet shows them and points to the piece editor (onEditPiece) instead of asking again.
 *
 * Joining the community and agreeing to the swap terms are steps of this sheet, not a second modal on top
 * of it: the form is hidden while the other sheet is up, and nothing the member typed is lost. Picking
 * Community before the terms are agreed asks for the terms first, then moves on to the join step. On iOS the
 * sheet that is leaving is hidden first and the next one is shown after a short wait (HANDOFF_MS), because a
 * modal presented while another is still sliding away can be dropped by UIKit, which would leave this sheet
 * "open" with nothing on screen.
 *
 * Also exports the pieces SwapListingCard and MyPiecesList share: publishFailure (what a failed publish
 * means for the buttons) and useSwapTermsGate (ask for the terms, then repeat the action).
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import type { ClothingItem } from '../types';
import type { MySwapListing, SwapAudience, SwapSettings } from '../types/swap';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import {
  SWAP_COMMUNITY_SCAN_NOTICE,
  SWAP_LIMITS,
  SWAP_NO_MONEY_LINE,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_TERMS_VERSION,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../config/swapRules';
import {
  getSwapSettings,
  listMySwapListings,
  publishSwapListing,
  updateSwapListingNote,
} from '../services/swapService';
import { SwapError, swapErrorMessage, toSwapError } from '../services/swapErrors';
import { storagePathFromUrl } from '../services/imageUrls';
import { getOwnedClothingItems } from '../services/storage';
import { conditionLabel, isItemCondition } from '../utils/itemCondition';
import { KeyboardLift, useKeyboardHeight } from './KeyboardLift';
import SwapJoinCommunitySheet from './SwapJoinCommunitySheet';
import SwapTermsSheet from './SwapTermsSheet';

const NOTE_MAX = SWAP_LIMITS.note_max;

export const PHOTO_FIRST_TEXT = 'Add a photo of the piece first';
export const PHOTO_PREPARING_TEXT = 'Getting your photo ready';
const SUGGEST_LABEL_TEXT = 'Add size and condition so friends know what they are getting';
const COMMUNITY_LABEL_TEXT = 'Community swaps need a size and condition';
const PUBLISH_FALLBACK = 'Couldn’t open this piece to swap. Please try again.';

/**
 * How long the sheet that is leaving stays down before the next one comes up (iOS only). A slide takes about
 * 0.4 s; this leaves margin for a slow phone. Sheet reports no "finished leaving" signal to wait for (compare
 * RateBrandSheet, which has one), so this is a fixed wait.
 */
const HANDOFF_MS = 700;

// ─── shared with SwapListingCard and MyPiecesList ───────────────────────────

/** What the owner reads when a listing is under review or has been removed; a person has to clear either. */
export const HELD_TEXT = swapErrorMessage(new SwapError('listing_held'), '');

/** Opens the member's mail app addressed to support, or says where to write. */
export const emailSupport = async () => {
  try {
    await Linking.openURL(SUPPORT_MAILTO);
  } catch {
    Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
  }
};

/** Whether the piece has a photo in the member's own closet bucket, which is what a listing is made from. */
export const hasClosetPhoto = (item: Pick<ClothingItem, 'userImage'>): boolean =>
  storagePathFromUrl(item.userImage) !== null;

/** What stops this piece being listed for this audience before the server is even asked, if anything. */
const missingFor = (piece: ClothingItem, to: SwapAudience): 'photo' | 'label' | null => {
  if (!hasClosetPhoto(piece)) return 'photo';
  if (to === 'community' && (!piece.size?.trim() || !isItemCondition(piece.condition))) return 'label';
  return null;
};

export type PublishFailure = {
  message: string;
  /** Doing the same thing again may work. False when it cannot until the photo or the hold changes. */
  retry: boolean;
  /** A photo the server cannot use: the way on is a different photo. */
  replacePhoto: boolean;
  /** The piece itself is missing something (the server's `listing_incomplete`). */
  editPiece: boolean;
  /** A person has to clear this (a hold or a removal): the way on is Email support. */
  support: boolean;
};

/** What a failed publish says and which buttons make sense after it. */
export const publishFailure = (error: unknown): PublishFailure => {
  const code = toSwapError(error).code;
  const message = swapErrorMessage(error, PUBLISH_FALLBACK);
  const replacePhoto = code === 'unsupported_image' || code === 'photo_too_large';
  return {
    message,
    retry: !replacePhoto && code !== 'listing_held',
    replacePhoto,
    editPiece: code === 'listing_incomplete',
    support: code === 'listing_held',
  };
};

/**
 * Null when the member can be asked to agree to the terms. Otherwise the reason they cannot: this build's
 * text is not the server's current text, so what they would agree to is not what they were shown, and
 * nothing that records consent is called (the same rule as useSwapAccess's update_required).
 */
const whyNotTerms = async (): Promise<string | null> => {
  try {
    const settings = await getSwapSettings();
    const server = settings?.currentTermsVersion;
    if (typeof server === 'string' && server !== SWAP_TERMS_VERSION) {
      return SWAP_TERMS_VERSION < server ? SWAP_UPDATE_REQUIRED_MESSAGE : SWAP_SERVER_BEHIND_MESSAGE;
    }
  } catch {
    // Cannot tell. The terms sheet copes with a version mismatch itself.
  }
  return null;
};

/**
 * For an action the server refused with `swap_terms_required`: requireTerms(retry) opens the terms and, once
 * the member agrees, runs `retry`. It returns a message instead when the member cannot be asked (the build
 * and the server disagree about the terms). Render `sheet` once; `open` is true while it is up.
 *
 * `wanted`, when given, is asked again after the server has been read: if it says no (the member closed the
 * sheet or chose something else meanwhile) nothing opens and nothing is returned. A screen that must time
 * when the terms appear renders SwapTermsSheet itself from `open`, `accepted` and `cancel` instead of `sheet`.
 */
export const useSwapTermsGate = () => {
  const [open, setOpen] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const requireTerms = useCallback(async (retry: () => void, wanted?: () => boolean): Promise<string | null> => {
    const why = await whyNotTerms();
    if (!alive.current || (wanted && !wanted())) return null;
    if (why) return why;
    retryRef.current = retry;
    setOpen(true);
    return null;
  }, []);

  const cancel = useCallback(() => {
    retryRef.current = null;
    setOpen(false);
  }, []);

  const accepted = useCallback(() => {
    const retry = retryRef.current;
    retryRef.current = null;
    setOpen(false);
    retry?.();
  }, []);

  const sheet = <SwapTermsSheet visible={open} onAccepted={accepted} onClose={cancel} />;
  return { open, requireTerms, cancel, accepted, sheet };
};

// ─── the sheet ───────────────────────────────────────────────────────────────

export type ListForSwapSheetProps = {
  visible: boolean;
  /** The piece to open. Leave out (with no editListing) to choose one first. */
  item?: ClothingItem;
  /** An open listing: only its note can be changed. */
  editListing?: MySwapListing;
  onClose: () => void;
  /** Something changed on the server (listed, or the note saved); reload what you show. */
  onChanged?: () => void;
  /** Take the member to the piece editor. The sheet closes first. */
  onEditPiece?: (item: ClothingItem) => void;
};

type Step = 'form' | 'join';
/** Which of the three modals is up. 'none' is also the gap while one leaves and the next has not come yet. */
type Shown = 'none' | 'form' | 'join' | 'terms';

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void; disabled?: boolean }> = ({
  label,
  selected,
  onPress,
  disabled,
}) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      style={[
        styles.chip,
        {
          borderRadius: theme.radius.full,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
        },
      ]}
    >
      <Text variant="label" style={{ color: selected ? theme.colors.accentText : theme.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
};

const LinkButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ paddingVertical: 6, alignSelf: 'flex-start' }}
    >
      <Text variant="body" style={{ color: theme.colors.accent, textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Pressable>
  );
};

export const ListForSwapSheet: React.FC<ListForSwapSheetProps> = ({
  visible,
  item,
  editListing,
  onClose,
  onChanged,
  onEditPiece,
}) => {
  const { theme } = useTheme();
  const keyboard = useKeyboardHeight();
  const gate = useSwapTermsGate();
  const { cancel: cancelTerms } = gate;

  const [step, setStep] = useState<Step>('form');
  const [audience, setAudience] = useState<SwapAudience>('friends');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PublishFailure | null>(null);
  // Anything else worth telling the member: the note could not be saved, the closet could not be read.
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<SwapSettings | null>(null);
  const [chosen, setChosen] = useState<ClothingItem | null>(null);
  const [pieces, setPieces] = useState<ClothingItem[] | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  // A new number each time the sheet opens or closes. An answer from an older one is dropped.
  const session = useRef(0);
  // State is a render behind a fast second tap; this is not.
  const busyRef = useRef(false);
  // Set while Community is waiting on the server's terms version, to the check in flight. A second tap on
  // Community is ignored; Friends, closing the sheet or a new opening clears it, and the check then opens nothing.
  const checkingTermsRef = useRef<object | null>(null);

  const editing = Boolean(editListing);
  const picking = !editing && !item;
  const target: ClothingItem | null = item ?? chosen;
  const editId = editListing?.id;
  const itemId = item?.id;

  // Which modal the state asks for, and which one is actually up. They differ for HANDOFF_MS on iOS while one
  // modal leaves and the next waits, so two modals never change in the same commit.
  const want: Shown = !visible ? 'none' : gate.open ? 'terms' : step === 'join' ? 'join' : 'form';
  const [shown, setShown] = useState<Shown>(want);
  const shownRef = useRef<Shown>(want);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTarget = useRef<Shown>(want);
  const show = useCallback((next: Shown) => {
    shownRef.current = next;
    setShown(next);
  }, []);
  const clearHandoff = useCallback(() => {
    if (handoffTimer.current !== null) {
      clearTimeout(handoffTimer.current);
      handoffTimer.current = null;
    }
  }, []);

  // A layout effect, so the sheet never paints a frame of the previous opening (or an empty note field that is
  // about to be filled) and the new session number is in place before the effects below read it.
  useLayoutEffect(() => {
    session.current++;
    busyRef.current = false;
    checkingTermsRef.current = null;
    cancelTerms();
    // A handoff that was waiting belongs to the old session. With nothing up, settle on what this one shows.
    clearHandoff();
    if (shownRef.current === 'none') show(visible ? 'form' : 'none');
    setStep('form');
    if (visible) {
      setAudience('friends');
      setNote(editListing?.note ?? '');
      setBusy(false);
      setFailure(null);
      setNotice(null);
      setChosen(null);
      setPieces(null);
      setSettings(null);
    }
    // editListing's note is read when the sheet opens; later changes to the prop must not erase typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editId, itemId, cancelTerms]);

  // Bring `shown` to `want`. From nothing, to nothing, or off iOS it is immediate; otherwise the modal that is
  // up goes first and the next one follows after HANDOFF_MS. `want` can pass through another value on the way
  // (the old architecture does not batch updates made after an await), so a change during the wait only
  // retargets it: the wait is counted from when the modal went down, not from the last change.
  useLayoutEffect(() => {
    if (handoffTimer.current !== null) {
      if (want === 'none') {
        clearHandoff();
        show('none');
      } else {
        handoffTarget.current = want;
      }
      return;
    }
    const now = shownRef.current;
    if (now === want) return;
    if (want === 'none' || now === 'none' || Platform.OS !== 'ios') {
      show(want);
      return;
    }
    show('none');
    handoffTarget.current = want;
    handoffTimer.current = setTimeout(() => {
      handoffTimer.current = null;
      show(handoffTarget.current);
    }, HANDOFF_MS);
  }, [want, show, clearHandoff]);

  // Unmounting during the wait.
  useLayoutEffect(() => clearHandoff, [clearHandoff]);

  // Whether the community tier is on, and whether this member has joined it.
  useEffect(() => {
    if (!visible || editing) return;
    const mine = session.current;
    (async () => {
      try {
        const next = await getSwapSettings();
        if (mine === session.current && next && typeof next === 'object') setSettings(next);
      } catch {
        // Friends only; publishing reports any real problem.
      }
    })();
  }, [visible, editing, editId, itemId]);

  // The grid of pieces that can be listed: owned, with a photo in the closet bucket, not already on the rack.
  useEffect(() => {
    if (!visible || !picking) return;
    const mine = session.current;
    (async () => {
      try {
        const [owned, listed] = await Promise.all([getOwnedClothingItems(), listMySwapListings()]);
        if (mine !== session.current) return;
        const taken = new Set(listed.map(l => l.itemId).filter(Boolean));
        setPieces(owned.filter(p => !p.isWishlist && hasClosetPhoto(p) && !taken.has(p.id)));
      } catch (e) {
        if (mine !== session.current) return;
        setPieces([]);
        setNotice(swapErrorMessage(e, 'Couldn’t load your closet. Please try again.'));
      }
    })();
  }, [visible, picking, loadTick]);

  const editPiece = (piece: ClothingItem) => {
    onClose();
    onEditPiece?.(piece);
  };

  const publish = async (piece: ClothingItem, to: SwapAudience, text: string) => {
    if (busyRef.current || missingFor(piece, to)) return;
    const mine = session.current;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await publishSwapListing({ itemId: piece.id, audience: to, note: text.trim() || undefined });
      // The server changed whether or not the sheet is still up.
      onChanged?.();
      if (mine === session.current) onClose();
    } catch (e) {
      if (mine !== session.current) return;
      if (toSwapError(e).code === 'swap_terms_required') {
        const why = await gate.requireTerms(
          () => {
            if (mine === session.current) publish(piece, to, text);
          },
          () => mine === session.current,
        );
        if (why && mine === session.current) setFailure({ message: why, retry: false, replacePhoto: false, editPiece: false, support: false });
        return;
      }
      setFailure(publishFailure(e));
    } finally {
      if (mine === session.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const saveNote = async (listing: MySwapListing, text: string) => {
    if (busyRef.current) return;
    const mine = session.current;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await updateSwapListingNote(listing.id, text.trim());
      onChanged?.();
      if (mine === session.current) onClose();
    } catch (e) {
      if (mine !== session.current) return;
      if (toSwapError(e).code === 'swap_terms_required') {
        const why = await gate.requireTerms(
          () => {
            if (mine === session.current) saveNote(listing, text);
          },
          () => mine === session.current,
        );
        if (why && mine === session.current) setNotice(why);
        return;
      }
      setNotice(swapErrorMessage(e, 'Couldn’t save your note. Please try again.'));
    } finally {
      if (mine === session.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const onNoteChange = (text: string) => {
    setNote(text.slice(0, NOTE_MAX));
    setFailure(null);
    setNotice(null);
  };

  const pickAudience = async (next: SwapAudience) => {
    if (busy) return;
    if (next === 'community' && settings && !settings.communityJoined) {
      Keyboard.dismiss();
      if (settings.termsCurrent) {
        setStep('join');
        return;
      }
      // Joining records the terms against this build's text, and the server refuses it until they are agreed
      // (join_swap_community starts with the terms gate). The join step cannot ask, so ask here first.
      if (checkingTermsRef.current) return;
      const mine = session.current;
      const check = {};
      checkingTermsRef.current = check;
      const wanted = () => mine === session.current && checkingTermsRef.current === check;
      try {
        const why = await gate.requireTerms(() => {
          if (mine !== session.current) return;
          setSettings(s => (s ? { ...s, termsAccepted: true, termsCurrent: true } : s));
          setStep('join');
        }, wanted);
        if (why && wanted()) setFailure({ message: why, retry: false, replacePhoto: false, editPiece: false, support: false });
      } finally {
        if (checkingTermsRef.current === check) checkingTermsRef.current = null;
      }
      return;
    }
    // The member chose something else: a terms check for Community that is still reading must not open.
    checkingTermsRef.current = null;
    setAudience(next);
    setFailure(null);
  };

  const joined = () => {
    setStep('form');
    setAudience('community');
    setFailure(null);
    setSettings(s => (s ? { ...s, communityJoined: true } : s));
  };

  // ─── what is on screen ─────────────────────────────────────────────────────

  const bodyMax = Math.max(160, Math.min(420, Dimensions.get('window').height - keyboard - 280));
  let title = 'Open to swap';
  let body: React.ReactNode;

  if (editListing) {
    title = 'Edit note';
    body = (
      <KeyboardLift>
        <Text variant="body" color="muted" style={{ marginBottom: 12 }} numberOfLines={2}>
          {editListing.name}
        </Text>
        <Input
          label="Note"
          placeholder="For example, runs a little small"
          value={note}
          onChangeText={onNoteChange}
          maxLength={NOTE_MAX}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          helper={`${note.length}/${NOTE_MAX}`}
          accessibilityLabel="Note"
        />
        {notice ? (
          <Text variant="caption" color="danger" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
        <Button
          label="Save"
          onPress={() => saveNote(editListing, note)}
          loading={busy}
          fullWidth
          style={{ marginTop: 16 }}
        />
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} fullWidth style={{ marginTop: 6 }} />
      </KeyboardLift>
    );
  } else if (!target) {
    title = 'Choose a piece';
    body = (
      <View>
        {pieces === null ? (
          <Text variant="body" color="muted" accessibilityLiveRegion="polite">Loading your closet</Text>
        ) : pieces.length === 0 ? (
          <Text variant="body" color="muted">
            {notice ?? 'Nothing to open right now. A piece needs a photo in your closet, and one that is already open to swap is managed under My pieces.'}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: bodyMax }}>
            <View style={styles.grid}>
              {pieces.map(piece => (
                <Pressable
                  key={piece.id}
                  onPress={() => setChosen(piece)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${piece.name}`}
                  style={styles.cell}
                >
                  <Image
                    source={{ uri: piece.userImage }}
                    style={[styles.cellPhoto, { borderRadius: theme.radius.md, backgroundColor: theme.colors.muted }]}
                    resizeMode="cover"
                  />
                  <Text variant="caption" numberOfLines={1} style={{ marginTop: 4 }}>{piece.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
        {pieces !== null && pieces.length > 0 && notice ? (
          <Text variant="caption" color="danger" style={{ marginTop: 10 }}>{notice}</Text>
        ) : null}
        {pieces !== null && pieces.length === 0 && notice ? (
          <Button label="Try again" variant="secondary" onPress={() => { setNotice(null); setPieces(null); setLoadTick(n => n + 1); }} style={{ marginTop: 12 }} />
        ) : null}
        <Button label="Cancel" variant="ghost" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
      </View>
    );
  } else {
    const hasPhoto = hasClosetPhoto(target);
    const hasSize = Boolean(target.size?.trim());
    const hasCondition = isItemCondition(target.condition);
    const community = audience === 'community';
    const blockedByLabel = missingFor(target, audience) === 'label';
    const canPublish = missingFor(target, audience) === null && !busy;
    const communityOffered = Boolean(settings?.communityAvailable);
    const facts = [target.brand?.trim(), target.size?.trim()].filter(Boolean).join(', ');
    const noteShown = note.trim();
    const canRetry = failure?.retry ?? false;

    body = (
      <KeyboardLift>
        <ScrollView style={{ maxHeight: bodyMax }} keyboardShouldPersistTaps="handled">
          {chosen && picking ? (
            <LinkButton label="Choose a different piece" onPress={() => { setChosen(null); setFailure(null); }} />
          ) : null}

          <Text variant="overline" color="subtle" style={{ marginBottom: 8 }}>What others will see</Text>
          <View style={[styles.preview, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
            {hasPhoto ? (
              <Image
                source={{ uri: target.userImage }}
                style={[styles.previewPhoto, { borderRadius: theme.radius.md }]}
                resizeMode="cover"
                accessibilityLabel={`Photo of ${target.name}`}
              />
            ) : (
              <View style={[styles.previewPhoto, styles.previewEmpty, { borderRadius: theme.radius.md, backgroundColor: theme.colors.border }]}>
                <Icon name="shirt-outline" size={28} color={theme.colors.textSubtle} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text variant="h4" numberOfLines={2}>{target.name}</Text>
              {facts ? <Text variant="body" color="muted" style={{ marginTop: 2 }}>{facts}</Text> : null}
              {hasCondition ? (
                <Badge label={conditionLabel(target.condition)} tone="neutral" style={{ marginTop: 6 }} />
              ) : null}
              {noteShown ? <Text variant="body" style={{ marginTop: 8 }}>{noteShown}</Text> : null}
            </View>
          </View>
          <Text variant="caption" color="subtle" style={{ marginTop: 8 }}>
            {community
              ? 'Friends see your name. People who aren’t your friends see only your alias.'
              : 'Only your friends see this, under your name.'}{' '}
            Never what you paid or your private notes.
          </Text>

          {!hasPhoto ? (
            <View style={{ marginTop: 12 }}>
              <Text variant="body" color="danger" accessibilityLiveRegion="polite">{PHOTO_FIRST_TEXT}</Text>
              {onEditPiece ? <LinkButton label="Add a photo" onPress={() => editPiece(target)} /> : null}
            </View>
          ) : null}

          {communityOffered ? (
            <View style={{ marginTop: 16 }}>
              <Text variant="label" color="muted" style={{ marginBottom: 8 }}>Who can see it</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                <Chip label="Friends" selected={audience === 'friends'} onPress={() => pickAudience('friends')} disabled={busy} />
                <Chip label="Community" selected={community} onPress={() => pickAudience('community')} disabled={busy} />
              </View>
            </View>
          ) : null}

          {hasPhoto && (!hasSize || !hasCondition) ? (
            <View style={{ marginTop: 12 }}>
              <Text variant="body" color={blockedByLabel ? 'danger' : 'muted'}>
                {blockedByLabel ? COMMUNITY_LABEL_TEXT : SUGGEST_LABEL_TEXT}
              </Text>
              {onEditPiece ? <LinkButton label="Edit piece" onPress={() => editPiece(target)} /> : null}
            </View>
          ) : null}

          <View style={{ marginTop: 16 }}>
            <Input
              label="Note (optional)"
              placeholder="For example, runs a little small"
              value={note}
              onChangeText={onNoteChange}
              maxLength={NOTE_MAX}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              helper={`${note.length}/${NOTE_MAX}`}
              accessibilityLabel="Note"
            />
          </View>

          <Text variant="caption" color="subtle" style={{ marginTop: 12 }}>{SWAP_NO_MONEY_LINE}</Text>
          {community ? (
            <Text variant="caption" color="subtle" style={{ marginTop: 8 }}>{SWAP_COMMUNITY_SCAN_NOTICE}</Text>
          ) : null}
        </ScrollView>

        {busy ? (
          <Text variant="body" color="muted" style={{ marginTop: 12 }} accessibilityLiveRegion="polite">
            {PHOTO_PREPARING_TEXT}
          </Text>
        ) : null}
        {failure ? (
          <View style={{ marginTop: 12 }}>
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">{failure.message}</Text>
            {failure.editPiece && onEditPiece ? <LinkButton label="Edit piece" onPress={() => editPiece(target)} /> : null}
            {failure.support ? <LinkButton label="Email support" onPress={emailSupport} /> : null}
          </View>
        ) : null}

        {failure && failure.replacePhoto ? (
          onEditPiece ? (
            <Button label="Replace photo" onPress={() => editPiece(target)} fullWidth style={{ marginTop: 16 }} />
          ) : null
        ) : failure && !failure.retry ? null : (
          <Button
            label={canRetry ? 'Retry' : 'Open to swap'}
            onPress={() => publish(target, audience, note)}
            disabled={!canPublish}
            loading={busy}
            fullWidth
            style={{ marginTop: 16 }}
          />
        )}
        <Button
          label={failure && !failure.retry ? 'Close' : 'Cancel'}
          variant="ghost"
          onPress={onClose}
          fullWidth
          style={{ marginTop: 6 }}
        />
      </KeyboardLift>
    );
  }

  return (
    <>
      <Sheet visible={shown === 'form'} onClose={onClose} title={title}>
        {body}
      </Sheet>
      <SwapJoinCommunitySheet
        visible={shown === 'join'}
        onJoined={joined}
        onClose={() => setStep('form')}
      />
      <SwapTermsSheet visible={shown === 'terms'} onAccepted={gate.accepted} onClose={gate.cancel} />
    </>
  );
};

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, marginRight: 8 },
  chips: { flexDirection: 'row' },
  preview: { flexDirection: 'row', padding: 12 },
  previewPhoto: { width: 88, height: 110 },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '31%', marginBottom: 12 },
  cellPhoto: { width: '100%', aspectRatio: 0.8 },
});

export default ListForSwapSheet;
