/**
 * ProConnectionCard — one row of a person's stylists: initials, the other person's label, the stylist's headline,
 * the last message, a dot when something needs the person, and a status badge once the connection has ended.
 *
 * It is one button. It knows nothing about navigation or about what the other person looks like beyond the
 * label the server computed ("Former stylist" once they are gone), and it never shows an account id, a photo,
 * a rating or a mark of approval: SmartCloset does not check or rank anyone.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { closedExplanation, connectionTitle, endedByViewer } from '../utils/proFormat';
import type { ProConnectionSummary } from '../types/pro';
import ProStatusBadge from './ProStatusBadge';

export type ProConnectionCardProps = {
  connection: ProConnectionSummary;
  onPress: () => void;
};

const unreadText = (n: number) => (n === 1 ? '1 unread message' : `${n} unread messages`);

export const ProConnectionCard: React.FC<ProConnectionCardProps> = ({ connection, onPress }) => {
  const { theme } = useTheme();
  const title = connectionTitle(connection);
  const ended = connection.status === 'ended';
  const headline = connection.otherHeadline?.trim() || '';
  const preview = ended ? '' : connection.lastMessagePreview?.trim() || '';
  const closed = ended ? closedExplanation(endedByViewer(connection)) : '';

  const spoken = [
    headline,
    preview ? `Last message: ${preview}` : '',
    closed,
    connection.unread > 0 ? unreadText(connection.unread) : '',
    connection.attention ? 'Needs your attention' : '',
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      accessibilityValue={{ text: spoken.join('. ') }}
    >
      <Avatar name={title} size="md" />
      <View style={styles.body}>
        <Text variant="h4" numberOfLines={1}>{title}</Text>
        {headline ? <Text variant="bodySmall" color="muted" numberOfLines={1}>{headline}</Text> : null}
        {closed ? <Text variant="caption" color="subtle" numberOfLines={1}>{closed}</Text> : null}
        {preview ? <Text variant="caption" color="subtle" numberOfLines={1} style={styles.preview}>{preview}</Text> : null}
      </View>
      <View style={styles.right}>
        {connection.attention ? <View testID="pro-connection-dot" style={[styles.dot, { backgroundColor: theme.colors.danger }]} /> : null}
        {ended ? <ProStatusBadge kind="connection" status="ended" /> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  body: {
    flex: 1,
  },
  preview: {
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

export default ProConnectionCard;
