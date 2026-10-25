/**
 * ProLookEditorScreen — a stylist writes a look for one client: a title, a note, and up to 12 pieces taken from
 * the closet the client shares. It is saved as a draft that only the stylist sees, and sent when it is ready.
 * A sent look can no longer be changed (a typo means sending a new one), so Send asks first.
 *
 * Pieces come from ProClosetPicker, which reads the live grant; the server checks again on every save and says
 * which position in the list is no longer shared (item_not_shared), and that piece is taken off the look. A
 * draft that is reopened gets its pieces back from getProLook, which returns each piece's id to the stylist.
 *
 * Writes keep what was typed when they fail. The reference that makes a new draft idempotent is made once when
 * the screen opens, so a save retried after a dropped connection returns the same draft instead of a second
 * one; after the first save the draft is edited by its id. The pieces are sent only when they changed, so a
 * change to the title alone leaves them as they are. The screen navigates nowhere except back.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, EmptyState, Input, Screen, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import { KeyboardDoneBar, keyboardDoneProps } from '../components/KeyboardSafe';
import ProAccessNotice from '../components/ProAccessNotice';
import { closetItemSubtitle } from '../components/ProClosetGrid';
import ProClosetPicker from '../components/ProClosetPicker';
import ProItemTile from '../components/ProItemTile';
import ProPhoto from '../components/ProPhoto';
import ProTermsSheet from '../components/ProTermsSheet';
import { useProAccess } from '../hooks/useProAccess';
import { PRO_LIMITS, PRO_TEXT_LIMITS, proClosetNotShared } from '../config/proRules';
import {
  deleteProLook,
  getProConnection,
  getProLook,
  saveProLook,
  sendProLook,
} from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import { connectionTitle, newClientRef } from '../utils/proFormat';
import type { ProClientsStackParamList } from '../types/proRoutes';
import type { ProClosetItem, ProLookDetail } from '../types/pro';

/** Answers that mean "what this person may do has changed": the screen asks useProAccess again. */
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'not_deployed',
]);

type Phase = 'loading' | 'ready' | 'locked' | 'ended' | 'gone' | 'error';
type Busy = 'save' | 'send' | 'delete' | null;
type Message = { kind: 'error' | 'ok'; text: string };

/** A piece of a reopened draft as the editor holds it: what the server returned, in the shape the picker uses. */
const pieceFrom = (i: ProLookDetail['items'][number]): ProClosetItem => ({
  id: i.itemId as string,
  name: i.name,
  category: i.category ?? '',
  color: i.color,
  brand: i.brand,
  hasPhoto: i.hasPhoto,
});

const ProLookEditorScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ProClientsStackParamList, 'ProLookEditor'>>();
  const { connectionId, recId } = route.params;
  const { theme } = useTheme();
  const { access, refresh } = useProAccess();

  const [phase, setPhase] = useState<Phase>(recId ? 'loading' : 'ready');
  const [label, setLabel] = useState('your client');
  const [canViewCloset, setCanViewCloset] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [pieces, setPieces] = useState<ProClosetItem[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(recId);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const alive = useRef(true);
  const initSeq = useRef(0);
  const initialised = useRef(false);
  const busyNow = useRef(false);
  // Made once when the screen opens: a save that is retried returns the same draft instead of making another.
  const clientRef = useRef(newClientRef());
  // The pieces differ from what the server holds, so the next save sends them.
  const itemsChanged = useRef(false);
  // What to run again once the terms have been accepted.
  const afterTerms = useRef<(() => void) | null>(null);
  const noteField = useRef<TextInput>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const ready = access.state === 'ready' ? access : null;
  const canEdit = ready !== null && ready.stylist === 'available';

  // ── opening ──

  const init = useCallback(async () => {
    const mine = ++initSeq.current;
    if (recId) setPhase('loading');
    // The client's name and what the connection allows come from the connection; they are nice to have.
    const detail = getProConnection(connectionId).then(d => d, () => null);
    const look = recId
      ? getProLook(recId).then(l => ({ look: l, error: null as unknown }), error => ({ look: null, error }))
      : Promise.resolve(null);
    const [d, result] = await Promise.all([detail, look]);
    if (!alive.current || mine !== initSeq.current) return;
    if (d) {
      setLabel(connectionTitle({ otherLabel: d.otherLabel, myRole: 'stylist' }));
      setCanViewCloset(d.actions.canViewCloset);
      if (d.status === 'ended') {
        setPhase('ended');
        return;
      }
    }
    if (result) {
      if (!result.look) {
        const err = toProError(result.error);
        if (ACCESS_CODES.has(err.code)) refresh();
        setPhase(err.code === 'pro_unavailable' ? 'gone' : 'error');
        return;
      }
      const l = result.look;
      if (l.status !== 'draft' || !l.actions.canEdit) {
        setPhase('locked');
        return;
      }
      setTitle(l.title);
      setNote(l.body);
      setPieces(l.items.filter(i => Boolean(i.itemId)).sort((a, b) => a.position - b.position).map(pieceFrom));
      setDraftId(l.id);
      itemsChanged.current = false;
      setDirty(false);
    }
    initialised.current = true;
    setPhase('ready');
  }, [connectionId, recId, refresh]);

  useEffect(() => {
    if (canEdit && !initialised.current) init();
  }, [canEdit, init]);

  // ── editing ──

  const changeTitle = (v: string) => {
    setTitle(v);
    setDirty(true);
    setMessage(null);
  };

  const changeNote = (v: string) => {
    setNote(v);
    setDirty(true);
    setMessage(null);
  };

  const removePiece = (id: string) => {
    setPieces(cur => cur.filter(p => p.id !== id));
    itemsChanged.current = true;
    setDirty(true);
    setMessage(null);
  };

  const addPieces = (picked: ProClosetItem[]) => {
    const same = picked.length === pieces.length && picked.every((p, at) => p.id === pieces[at].id);
    setPickerOpen(false);
    if (same) return;
    setPieces(picked.slice(0, PRO_LIMITS.items_per_look));
    itemsChanged.current = true;
    setDirty(true);
    setMessage(null);
  };

  const leave = () => {
    if (!dirty) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard your changes?', 'What you wrote on this look has not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  // ── writing ──

  /** A failed write: the terms are asked for and the action is retried, a piece that is no longer shared is taken off, anything else is said in words. */
  const writeFailed = async (e: unknown, sentIds: string[], retry: () => void, fallback: string) => {
    const err = toProError(e);
    if (err.code === 'pro_terms_required') {
      afterTerms.current = retry;
      setTermsOpen(true);
      return;
    }
    if (ACCESS_CODES.has(err.code)) refresh();
    if (err.code === 'item_not_shared') {
      // The server also answers this (for the first piece) when the whole grant is gone, and then no one piece is
      // to blame: ask whether the closet is still shared before taking anything off the look.
      const stillShared = await getProConnection(connectionId).then(d => d.actions.canViewCloset, () => true);
      if (!alive.current) return;
      if (!stillShared) {
        setCanViewCloset(false);
        setMessage({ kind: 'error', text: proErrorMessage(new ProError('closet_not_shared')) });
        return;
      }
      // DETAIL is the position, counting from 1, of the first piece in the list that was sent.
      const position = Number.parseInt(err.detail ?? '', 10);
      const goneId = Number.isInteger(position) ? sentIds[position - 1] : undefined;
      const gone = goneId ? pieces.find(p => p.id === goneId) : undefined;
      if (goneId && gone) {
        setPieces(cur => cur.filter(p => p.id !== goneId));
        itemsChanged.current = true;
        setMessage({ kind: 'error', text: `${gone.name} was taken off this look. ${proErrorMessage(err)}` });
        return;
      }
    }
    setMessage({ kind: 'error', text: proErrorMessage(err, fallback) });
  };

  /** Saves the draft (creating it the first time). Returns its id, or null after saying what went wrong. */
  const persist = async (retry: () => void): Promise<string | null> => {
    const ids = pieces.map(p => p.id);
    const sendPieces = draftId ? itemsChanged.current : ids.length > 0;
    try {
      const saved = await saveProLook({
        connectionId,
        id: draftId,
        title: title.trim(),
        body: note,
        itemIds: sendPieces ? ids : undefined,
        clientRef: draftId ? undefined : clientRef.current,
      });
      if (!alive.current) return null;
      setDraftId(saved.id);
      itemsChanged.current = false;
      setDirty(false);
      return saved.id;
    } catch (e) {
      if (alive.current) await writeFailed(e, ids, retry, 'Couldn’t save this look. Please try again.');
      return null;
    }
  };

  const titleMissing = () => {
    if (title.trim()) return false;
    setMessage({ kind: 'error', text: 'Give the look a title.' });
    return true;
  };

  const save = async () => {
    if (busyNow.current || titleMissing()) return;
    busyNow.current = true;
    setBusy('save');
    setMessage(null);
    try {
      const id = await persist(save);
      if (id && alive.current) setMessage({ kind: 'ok', text: 'Draft saved.' });
    } finally {
      busyNow.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const doSend = async () => {
    if (busyNow.current) return;
    busyNow.current = true;
    setBusy('send');
    setMessage(null);
    try {
      let id = draftId;
      if (!id || dirty) id = (await persist(doSend)) ?? undefined;
      if (!id) return;
      try {
        await sendProLook(id);
      } catch (e) {
        if (alive.current) await writeFailed(e, [], doSend, 'Couldn’t send this look. Please try again.');
        return;
      }
      if (alive.current) navigation.goBack();
    } finally {
      busyNow.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const send = () => {
    if (titleMissing()) return;
    if (pieces.length === 0 && !note.trim()) {
      setMessage({ kind: 'error', text: proErrorMessage(new ProError('recommendation_empty')) });
      return;
    }
    Alert.alert(
      `Send to ${label}`,
      `${label} will be able to see this look. You can’t change it after it is sent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: doSend },
      ],
    );
  };

  const remove = () => {
    const id = draftId;
    if (!id) return;
    Alert.alert('Delete draft', 'This draft will be deleted. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete draft',
        style: 'destructive',
        onPress: async () => {
          if (busyNow.current) return;
          busyNow.current = true;
          setBusy('delete');
          try {
            await deleteProLook(id);
            if (alive.current) navigation.goBack();
          } catch (e) {
            if (alive.current) setMessage({ kind: 'error', text: proErrorMessage(e, 'Couldn’t delete this draft. Please try again.') });
          } finally {
            busyNow.current = false;
            if (alive.current) setBusy(null);
          }
        },
      },
    ]);
  };

  // ── drawing ──

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={styles.title} numberOfLines={1}>{recId ? 'Edit look' : 'New look'}</Text>
    </View>
  );

  const gap = (title2: string, body?: string) => (
    <EmptyState
      icon={<Icon name="color-wand-outline" size={32} color={theme.colors.textSubtle} />}
      title={title2}
      body={body}
      actionLabel="Back"
      onAction={() => navigation.goBack()}
    />
  );

  const form = (
    <View>
      <Input
        label="Title"
        placeholder="e.g. Dinner with friends"
        value={title}
        onChangeText={changeTitle}
        maxLength={PRO_TEXT_LIMITS.look_title}
        helper={`${title.length}/${PRO_TEXT_LIMITS.look_title}`}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => noteField.current?.focus()}
        accessibilityLabel="Look title"
        containerStyle={styles.field}
      />
      <Input
        ref={noteField}
        label="Note"
        placeholder={`What should ${label} know about this look?`}
        value={note}
        onChangeText={changeNote}
        maxLength={PRO_TEXT_LIMITS.look_body}
        helper={`${note.length}/${PRO_TEXT_LIMITS.look_body}`}
        multiline
        {...keyboardDoneProps}
        inputStyle={styles.noteInput}
        accessibilityLabel="Look note"
        containerStyle={styles.field}
      />

      <View style={styles.piecesHeader}>
        <Text variant="overline" color="muted">Pieces</Text>
        <Text variant="caption" color="muted">{`${pieces.length} of ${PRO_LIMITS.items_per_look}`}</Text>
      </View>
      {pieces.length > 0 ? (
        <View style={styles.pieces}>
          {pieces.map(p => (
            <View key={p.id} style={styles.pieceCell}>
              <ProItemTile
                name={p.name}
                subtitle={closetItemSubtitle(p)}
                photo={<ProPhoto connectionId={connectionId} itemId={p.id} hasPhoto={p.hasPhoto} />}
                accessibilityLabel={p.name}
              />
              <Pressable
                onPress={() => removePiece(p.id)}
                hitSlop={8}
                style={[styles.remove, { backgroundColor: theme.colors.surfaceElevated }]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.name}`}
              >
                <Icon name="close" size={14} color={theme.colors.text} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="bodySmall" color="muted">{`Pick pieces from the closet ${label} shares with you.`}</Text>
      )}
      <Button
        label="Add pieces"
        variant="secondary"
        onPress={() => setPickerOpen(true)}
        disabled={pieces.length >= PRO_LIMITS.items_per_look || canViewCloset === false}
        style={styles.addButton}
        accessibilityLabel="Add pieces"
      />
      {canViewCloset === false ? (
        <Text variant="caption" color="muted" style={styles.hint}>
          {proClosetNotShared(label)}
        </Text>
      ) : null}
      {pieces.length >= PRO_LIMITS.items_per_look ? (
        <Text variant="caption" color="muted" style={styles.hint}>{`A look can hold up to ${PRO_LIMITS.items_per_look} pieces.`}</Text>
      ) : null}

      {message ? (
        <Text
          variant="bodySmall"
          color={message.kind === 'error' ? 'danger' : 'success'}
          style={styles.message}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Save draft"
          variant="secondary"
          onPress={save}
          loading={busy === 'save'}
          disabled={busy !== null && busy !== 'save'}
          fullWidth
          accessibilityLabel="Save draft"
        />
        <Button
          label={`Send to ${label}`}
          onPress={send}
          loading={busy === 'send'}
          disabled={busy !== null && busy !== 'send'}
          fullWidth
          accessibilityLabel={`Send to ${label}`}
        />
        {draftId ? (
          <Button
            label="Delete draft"
            variant="ghost"
            onPress={remove}
            loading={busy === 'delete'}
            disabled={busy !== null && busy !== 'delete'}
            fullWidth
            textStyle={{ color: theme.colors.danger }}
            accessibilityLabel="Delete draft"
          />
        ) : null}
      </View>
    </View>
  );

  const body = () => {
    if (access.state === 'loading') return <FormSkeleton />;
    if (!ready || ready.stylist !== 'available') {
      return <ProAccessNotice access={access} role="stylist" onRefresh={refresh} onReadTerms={() => setTermsOpen(true)} />;
    }
    switch (phase) {
      case 'loading':
        return <FormSkeleton />;
      case 'locked':
        return gap(proErrorMessage(new ProError('recommendation_locked')));
      case 'ended':
        return gap(proErrorMessage(new ProError('connection_ended')));
      case 'gone':
        return gap(proErrorMessage(new ProError('pro_unavailable')));
      case 'error':
        return <LoadError what="look" title="Couldn’t load this look" onRetry={init} />;
      default:
        return form;
    }
  };

  return (
    <Screen scrollable padded header={header}>
      {body()}
      {canEdit && phase === 'ready' ? (
        <ProClosetPicker
          visible={pickerOpen}
          connectionId={connectionId}
          selectedIds={pieces.map(p => p.id)}
          selectedItems={pieces}
          max={PRO_LIMITS.items_per_look}
          onDone={addPieces}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
      {ready ? (
        <ProTermsSheet
          visible={termsOpen}
          role="stylist"
          needsAdult={!ready.status.adultConfirmed}
          onAccepted={() => {
            setTermsOpen(false);
            const again = afterTerms.current;
            afterTerms.current = null;
            refresh();
            if (again) again();
          }}
          onClose={() => {
            setTermsOpen(false);
            afterTerms.current = null;
          }}
        />
      ) : null}
      <KeyboardDoneBar />
    </Screen>
  );
};

const FormSkeleton: React.FC = () => (
  <View accessibilityLabel="Loading this look">
    <Skeleton height={44} />
    <Skeleton height={120} style={{ marginTop: 16 }} />
    <Skeleton height={90} style={{ marginTop: 16 }} />
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { flex: 1, marginLeft: 12 },
  field: { marginBottom: 16 },
  noteInput: { minHeight: 110 },
  piecesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pieces: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  pieceCell: { width: '50%', paddingHorizontal: 6, paddingBottom: 14 },
  remove: {
    position: 'absolute',
    top: 6,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: { marginTop: 8, alignSelf: 'stretch' },
  hint: { marginTop: 8 },
  message: { marginTop: 16 },
  actions: { marginTop: 24, gap: 10 },
});

export default ProLookEditorScreen;
