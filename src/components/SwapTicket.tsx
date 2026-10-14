/**
 * SwapTicket — the two sides of a swap at a glance: what the member gives, what they get, where the
 * swap stands, and (while it is accepted) what happens next.
 *
 * It only draws what get_swap returned. Photos come through SwapPhoto, so a swap that closed or involves
 * someone blocked (the server sends no photo path then) shows the placeholder. No navigation, no calls.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { conditionLabel } from '../utils/itemCondition';
import type { SwapDetail, SwapItemView } from '../types/swap';
import SwapPhoto from './SwapPhoto';
import SwapStatusBadge from './SwapStatusBadge';

export type SwapTicketProps = { detail: SwapDetail };

/** What the member does next once the swap is accepted, from their side. Null in every other state. */
export const handoffLine = (d: Pick<SwapDetail, 'status' | 'iDone' | 'theyDone' | 'otherLabel'>): string | null => {
  if (d.status !== 'accepted') return null;
  if (!d.iDone && d.theyDone) {
    return `${d.otherLabel} says you swapped. Tap “We swapped!” when you have your piece.`;
  }
  if (d.iDone && !d.theyDone) {
    return `You tapped “We swapped!”. Waiting for ${d.otherLabel} to do the same.`;
  }
  if (d.iDone) return null;
  return 'Arrange the hand-off in the messages. When you have your piece, tap “We swapped!”.';
};

const Piece: React.FC<{ item: SwapItemView }> = ({ item }) => {
  const { theme } = useTheme();
  const facts = [item.size ? `Size ${item.size}` : '', conditionLabel(item.condition)].filter(Boolean).join(' · ');
  return (
    <View style={styles.piece}>
      <SwapPhoto
        path={item.photoPath}
        style={[styles.photo, { borderRadius: theme.radius.md }]}
        accessibilityLabel={`Photo of ${item.name}`}
      />
      <Text variant="bodySmall" weight="600" numberOfLines={2} style={{ marginTop: 6 }}>
        {item.name}
      </Text>
      {facts ? (
        <Text variant="caption" color="muted" numberOfLines={1}>
          {facts}
        </Text>
      ) : null}
    </View>
  );
};

export const SwapTicket: React.FC<SwapTicketProps> = ({ detail }) => {
  const give = detail.items.filter(i => i.mine);
  const get = detail.items.filter(i => !i.mine);
  const line = handoffLine(detail);

  return (
    <Card style={{ marginBottom: 12 }}>
      <SwapStatusBadge status={detail.status} closedReason={detail.closedReason} role={detail.role} />
      <View style={styles.columns}>
        <View style={styles.column}>
          <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>You give</Text>
          {give.map((item, i) => (
            <Piece key={`${item.listingId ?? 'gone'}-${i}`} item={item} />
          ))}
        </View>
        <View style={styles.column}>
          <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>You get</Text>
          {get.map((item, i) => (
            <Piece key={`${item.listingId ?? 'gone'}-${i}`} item={item} />
          ))}
        </View>
      </View>
      {line ? (
        <Text variant="bodySmall" color="muted" style={{ marginTop: 14 }}>
          {line}
        </Text>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 12, marginTop: 14 },
  column: { flex: 1 },
  piece: { marginBottom: 12 },
  photo: { width: '100%', aspectRatio: 4 / 5 },
});

export default SwapTicket;
