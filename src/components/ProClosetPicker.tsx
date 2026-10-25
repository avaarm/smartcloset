/**
 * ProClosetPicker — a sheet over the client's shared closet in which a stylist picks the pieces of a look.
 *
 * It pages with getClientCloset (60 at a time) and merges the pages by piece id, so a page the server clamps
 * can never show a piece twice. The picker holds the choice only while it is open: "Add to look" hands the
 * chosen pieces back, in the order they were picked, and the look editor decides what to do with them.
 *
 * `selectedItems` is an addition to the contract of the design document. A draft that is reopened already has
 * pieces the picker may not have loaded yet (they can be on a later page), and the picker can only hand back
 * pieces it has details for, so the screen passes the pieces it holds. Without it, an id the picker never sees
 * is dropped from the result.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Sheet, Skeleton, Text } from '../ui';
import LoadError from './LoadError';
import ProClosetGrid from './ProClosetGrid';
import { PRO_LIMITS } from '../config/proRules';
import { getClientCloset } from '../services/proService';
import { proErrorMessage, toProError } from '../services/proErrors';
import type { ProClosetItem } from '../types/pro';

export type ProClosetPickerProps = {
  visible: boolean;
  connectionId: string;
  /** The ids already in the look, in order. */
  selectedIds: string[];
  /** The most pieces a look may hold. */
  max: number;
  onDone: (items: ProClosetItem[]) => void;
  onClose: () => void;
  /** The pieces already in the look, so they can be handed back without being loaded again. */
  selectedItems?: ProClosetItem[];
};

type Phase = 'loading' | 'ready' | 'error';

export const ProClosetPicker: React.FC<ProClosetPickerProps> = ({
  visible,
  connectionId,
  selectedIds,
  max,
  onDone,
  onClose,
  selectedItems,
}) => {
  const { height } = useWindowDimensions();
  const [items, setItems] = useState<ProClosetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // Every piece the picker has details for, shown or not: the result of "Add to look" is read from here.
  const known = useRef(new Map<string, ProClosetItem>());
  // The ids on the grid, to tell a page that brought something new from one that did not.
  const shown = useRef(new Set<string>());
  // A new number each time the sheet opens, closes or is pointed at another connection; an answer that comes
  // back under an older number belongs to a sheet that is gone.
  const session = useRef(0);
  const busy = useRef(false);
  const exhausted = useRef(false);

  /** Adds the pieces not yet on the grid; returns how many were new. */
  const append = useCallback((page: ProClosetItem[]): number => {
    const fresh: ProClosetItem[] = [];
    for (const item of page) {
      known.current.set(item.id, item);
      if (!shown.current.has(item.id)) {
        shown.current.add(item.id);
        fresh.push(item);
      }
    }
    if (fresh.length > 0) setItems(cur => [...cur, ...fresh]);
    return fresh.length;
  }, []);

  const loadFirst = useCallback(async () => {
    const mine = session.current;
    busy.current = true;
    exhausted.current = false;
    setPhase('loading');
    setFailure(null);
    setFatal(false);
    setMoreFailed(false);
    try {
      const page = await getClientCloset(connectionId, { offset: 0, limit: PRO_LIMITS.closet_page_size });
      if (mine !== session.current) return;
      shown.current = new Set();
      setItems([]);
      append(page.items);
      setTotal(page.total);
      setPhase('ready');
    } catch (e) {
      if (mine !== session.current) return;
      const err = toProError(e);
      setFailure(proErrorMessage(err, "Couldn't load the closet. Please try again."));
      // These say the closet itself is not there to pick from; asking again changes nothing.
      setFatal(err.code === 'closet_not_shared' || err.code === 'pro_unavailable' || err.code === 'connection_ended');
      setPhase('error');
    } finally {
      if (mine === session.current) busy.current = false;
    }
  }, [connectionId, append]);

  useEffect(() => {
    session.current++;
    busy.current = false;
    if (!visible) return;
    known.current = new Map((selectedItems ?? []).map(i => [i.id, i] as [string, ProClosetItem]));
    shown.current = new Set();
    setItems([]);
    setTotal(0);
    setChosen(Array.from(new Set(selectedIds)).slice(0, max));
    setNotice(null);
    setLoadingMore(false);
    loadFirst();
    // The sheet reads its inputs when it opens; later changes to them while it is open are not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, connectionId]);

  /** `retry` is the person tapping "Try again" after a failed page; reaching the end never retries by itself. */
  const loadMore = useCallback(async (retry: boolean) => {
    if (phase !== 'ready' || busy.current || exhausted.current || (moreFailed && !retry) || items.length >= total) return;
    const mine = session.current;
    busy.current = true;
    setMoreFailed(false);
    setLoadingMore(true);
    try {
      const page = await getClientCloset(connectionId, { offset: items.length, limit: PRO_LIMITS.closet_page_size });
      if (mine !== session.current) return;
      const added = append(page.items);
      setTotal(page.total);
      // A page that brought nothing new would be asked for again for ever.
      if (added === 0) exhausted.current = true;
    } catch {
      if (mine === session.current) setMoreFailed(true);
    } finally {
      if (mine === session.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [phase, moreFailed, items.length, total, connectionId, append]);

  const toggle = (id: string) => {
    if (chosen.includes(id)) {
      setChosen(cur => cur.filter(x => x !== id));
      setNotice(null);
      return;
    }
    if (chosen.length >= max) {
      setNotice(`You can pick up to ${max} pieces.`);
      return;
    }
    setChosen(cur => [...cur, id]);
    setNotice(null);
  };

  const done = () => {
    onDone(chosen.map(id => known.current.get(id)).filter((i): i is ProClosetItem => Boolean(i)));
  };

  const footer = loadingMore ? (
    <View style={styles.footer}><Skeleton width="60%" height={12} /></View>
  ) : moreFailed ? (
    <View style={styles.footer}>
      <Button label="Couldn’t load more. Try again" variant="secondary" size="sm" onPress={() => loadMore(true)} />
    </View>
  ) : null;

  let body: React.ReactNode;
  if (phase === 'loading') {
    body = (
      <View accessibilityLabel="Loading the closet" style={styles.skeletons}>
        {[0, 1, 2, 3].map(i => <Skeleton key={i} height={90} style={styles.skeletonTile} />)}
      </View>
    );
  } else if (phase === 'error') {
    body = fatal ? (
      <Text variant="body" color="muted" align="center" style={styles.message}>{failure}</Text>
    ) : (
      <LoadError what="closet" title="Couldn’t load the closet" onRetry={loadFirst} />
    );
  } else {
    body = (
      <ProClosetGrid
        items={items}
        connectionId={connectionId}
        selectable
        selectedIds={chosen}
        onToggle={toggle}
        onEndReached={() => loadMore(false)}
        footer={footer}
        empty={<Text variant="body" color="muted" align="center" style={styles.message}>No pieces are shared yet.</Text>}
      />
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Add pieces">
      <View style={{ height: Math.round(height * 0.55) }}>{body}</View>
      {notice ? (
        <Text variant="caption" color="danger" style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>
      ) : null}
      <Text variant="caption" color="muted" style={styles.count}>
        {`${chosen.length} of ${max} selected`}
      </Text>
      <View style={styles.buttons}>
        <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.button} />
        <Button label="Add to look" onPress={done} disabled={phase !== 'ready'} style={styles.button} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  skeletons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 10 },
  skeletonTile: { width: '46%' },
  message: { paddingVertical: 32, paddingHorizontal: 16 },
  footer: { alignItems: 'center', paddingVertical: 12 },
  notice: { marginTop: 8 },
  count: { marginTop: 10 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: { flex: 1, alignSelf: 'stretch' },
});

export default ProClosetPicker;
