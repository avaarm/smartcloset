/**
 * BlockedUsersSheet — the people you've blocked, with an Unblock button for each.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { BlockedUser, getBlockedUsers, unblockUser } from '../services/friendService';

export type BlockedUsersSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export const BlockedUsersSheet: React.FC<BlockedUsersSheetProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBlocked(await getBlockedUsers());
    } catch (e) {
      console.error('Error loading blocked users:', e);
      setError('Couldn’t load your blocked users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleUnblock = async (user: BlockedUser) => {
    setBusyId(user.userId);
    setError(null);
    try {
      await unblockUser(user.userId);
      setBlocked(list => list.filter(b => b.userId !== user.userId));
    } catch (e: any) {
      setError(e?.message || 'Couldn’t unblock this person. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Blocked users">
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : blocked.length === 0 && !error ? (
        <Text variant="body" color="muted" style={{ paddingVertical: 16 }}>
          You haven’t blocked anyone. Blocked people can’t find you, send you requests or see your closet.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 320 }}>
          {blocked.map(user => (
            <View key={user.userId} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
              <Avatar name={user.name} size="md" />
              <Text variant="body" weight="600" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
                {user.name}
              </Text>
              <Button
                label="Unblock"
                size="sm"
                variant="secondary"
                onPress={() => handleUnblock(user)}
                loading={busyId === user.userId}
                disabled={busyId !== null}
                accessibilityLabel={`Unblock ${user.name}`}
              />
            </View>
          ))}
        </ScrollView>
      )}
      {error ? (
        <Text variant="caption" color="danger" style={{ marginTop: 8 }}>
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

export default BlockedUsersSheet;
