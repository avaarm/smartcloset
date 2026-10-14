/**
 * SwapBlockedSheet — the people you blocked from swaps, with an Unblock button for each.
 *
 * Rows come from list_swap_blocks and carry an opaque reference and a label (an alias, or a friend's
 * usual name), never an account id, so this sheet cannot reveal who a stranger is. The Friends
 * feature's own "Blocked users" list (BlockedUsersSheet) does not show these rows and is not touched.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { listSwapBlocks, unblockSwapMember } from '../services/swapService';
import { swapErrorMessage } from '../services/swapErrors';
import type { SwapBlock } from '../types/swap';

export type SwapBlockedSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export const SwapBlockedSheet: React.FC<SwapBlockedSheetProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [blocked, setBlocked] = useState<SwapBlock[]>([]);
  // False until the list for this opening has come back (or failed), so "nobody blocked" is never shown while loading.
  const [loaded, setLoaded] = useState(false);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the sheet opens or closes: a list or an unblock that finishes later is not shown.
  const session = useRef(0);

  const load = useCallback(async () => {
    const mine = session.current;
    setError(null);
    try {
      const rows = await listSwapBlocks();
      if (mine === session.current) setBlocked(rows);
    } catch (e) {
      if (mine === session.current) setError(swapErrorMessage(e, 'Couldn’t load the people you blocked. Please try again.'));
    } finally {
      if (mine === session.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    session.current++;
    if (visible) {
      setBlocked([]);
      setBusyRef(null);
      setLoaded(false);
      load();
    }
  }, [visible, load]);

  const handleUnblock = async (block: SwapBlock) => {
    const mine = session.current;
    setBusyRef(block.ref);
    setError(null);
    try {
      await unblockSwapMember(block.ref);
      if (mine === session.current) setBlocked(list => list.filter(b => b.ref !== block.ref));
    } catch (e) {
      if (mine === session.current) setError(swapErrorMessage(e, 'Couldn’t unblock this person. Please try again.'));
    } finally {
      if (mine === session.current) setBusyRef(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Blocked swap members">
      {!loaded ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : blocked.length === 0 && !error ? (
        <Text variant="body" color="muted" style={{ paddingVertical: 16 }}>
          You haven’t blocked anyone from swaps.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 320 }}>
          {blocked.map(block => (
            <View key={block.ref} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              <Avatar name={block.label} size="md" />
              <Text variant="body" weight="600" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
                {block.label}
              </Text>
              <Button
                label="Unblock"
                size="sm"
                variant="secondary"
                onPress={() => handleUnblock(block)}
                loading={busyRef === block.ref}
                disabled={busyRef !== null}
                accessibilityLabel={`Unblock ${block.label}`}
              />
            </View>
          ))}
        </ScrollView>
      )}
      {error ? (
        <Text variant="caption" color="danger" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 16 }} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default SwapBlockedSheet;
