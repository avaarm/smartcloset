/**
 * ProBlockedSheet — the stylists and clients you blocked, with an Unblock button for each.
 *
 * Rows come from list_pro_blocks and carry an opaque reference and a label (the name the person was shown under),
 * never an account id, so this sheet cannot reveal who anyone is. Listing and unblocking need only a sign-in, so
 * the sheet works while professional features are paused. Unblocking does not reconnect anyone or restore anything.
 * The Friends list of blocked users (BlockedUsersSheet) and the swap one do not show these rows and are not touched.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from './LoadError';
import { listProBlocks, unblockProMember } from '../services/proService';
import { proErrorMessage } from '../services/proErrors';
import type { ProBlock } from '../types/pro';

export type ProBlockedSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export const ProBlockedSheet: React.FC<ProBlockedSheetProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [blocked, setBlocked] = useState<ProBlock[]>([]);
  // False until the list for this opening has come back (or failed), so "nobody blocked" is never shown while loading.
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the sheet opens or closes: a list or an unblock that finishes later is not shown.
  const session = useRef(0);

  const load = useCallback(async () => {
    const mine = session.current;
    try {
      const rows = await listProBlocks();
      if (mine === session.current) {
        setBlocked(rows);
        setLoadFailed(false);
      }
    } catch {
      if (mine === session.current) setLoadFailed(true);
    } finally {
      if (mine === session.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    session.current++;
    if (visible) {
      setBlocked([]);
      setBusyRef(null);
      setError(null);
      setLoaded(false);
      setLoadFailed(false);
      load();
    }
  }, [visible, load]);

  const handleUnblock = async (block: ProBlock) => {
    const mine = session.current;
    setBusyRef(block.ref);
    setError(null);
    try {
      await unblockProMember(block.ref);
      if (mine === session.current) setBlocked(list => list.filter(b => b.ref !== block.ref));
    } catch (e) {
      if (mine === session.current) setError(proErrorMessage(e, "Couldn't unblock this person. Please try again."));
    } finally {
      if (mine === session.current) setBusyRef(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Blocked stylists and clients">
      {!loaded ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : loadFailed ? (
        <LoadError
          variant="banner"
          what="blocked list"
          title="Couldn't load the people you blocked"
          onRetry={load}
        />
      ) : blocked.length === 0 ? (
        <Text variant="body" color="muted" style={{ paddingVertical: 16 }}>
          You haven't blocked any stylists or clients.
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

export default ProBlockedSheet;
