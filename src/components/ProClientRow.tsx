/**
 * ProClientRow — one client in the stylist's Clients list, or one conversation in the Messages inbox.
 *
 * The row shows only what the server gives a stylist about a connection: the name the client chose (or
 * "Former client"), the last message or activity, a dot when something needs the stylist, and whether the
 * closet is shared. It never shows why a connection ended, and an ended row reads the same neutral line
 * whoever ended it. The row is one button; it has no menu and no navigation of its own.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Avatar, Badge, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { closedExplanation, connectionTitle, endedByViewer, statusLabel } from '../utils/proFormat';
import type { ProConnectionSummary } from '../types/pro';

export type ProClientRowProps = {
  connection: ProConnectionSummary;
  onPress: () => void;
  /** 'inbox' leads with the last message, marks unread messages and leaves out the sharing chip. Default 'client'. */
  variant?: 'client' | 'inbox';
};

/** "Oct 24", or '' for a date that cannot be read. */
const shortDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const subtitleOf = (c: ProConnectionSummary, variant: 'client' | 'inbox'): string => {
  if (c.status === 'ended') return closedExplanation(endedByViewer(c));
  if (c.lastMessagePreview) return c.lastMessagePreview;
  if (variant === 'inbox') return '';
  const date = shortDate(c.lastActivityAt);
  return date ? `Last activity ${date}` : '';
};

export const ProClientRow: React.FC<ProClientRowProps> = ({ connection, onPress, variant = 'client' }) => {
  const { theme } = useTheme();
  const title = connectionTitle(connection);
  const ended = connection.status === 'ended';
  const inbox = variant === 'inbox';
  const needsYou = inbox ? connection.unread > 0 : connection.attention;
  const subtitle = subtitleOf(connection, variant);
  const when = shortDate(inbox ? connection.lastMessageAt ?? connection.lastActivityAt : connection.lastActivityAt);

  const label = inbox
    ? `Open messages with ${title}${needsYou ? ', unread' : ''}`
    : `Open ${title}${needsYou ? ', new activity' : ''}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Avatar name={title} size="md" />
      <View style={styles.text}>
        <Text variant="body" weight="600" numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
        ) : null}
        {ended || (!inbox && connection.closetShared) ? (
          <View style={styles.chips}>
            {ended ? <Badge label={statusLabel('connection', 'ended', false)} tone="neutral" /> : null}
            {!ended && !inbox && connection.closetShared ? <Badge label="Closet shared" tone="info" /> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.side}>
        {when ? <Text variant="caption" color="subtle">{when}</Text> : null}
        <View style={styles.sideBottom}>
          {needsYou ? (
            <View testID="pro-client-dot" style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
          ) : null}
          <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  text: { flex: 1, marginLeft: 12, marginRight: 8 },
  subtitle: { marginTop: 2 },
  chips: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  side: { alignItems: 'flex-end' },
  sideBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
});

export default ProClientRow;
