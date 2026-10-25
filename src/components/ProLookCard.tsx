/**
 * ProLookCard: one look in a list (documentation/design/pro-accounts.md 7.7). The cover piece, the title, where
 * the look stands, how many pieces it holds, the client's rating when there is one, and a dot while it is new to
 * the client.
 *
 * `mine` says whose look it is (true for the stylist who wrote it) and only changes the wording of a status
 * ("Sent" and "New", "They wore it" and "You wore it"). Left out, the card works it out from what a summary
 * carries: a draft exists only for the stylist; a new look and a photo path of the client's own exist only for
 * the client.
 *
 * `connectionId` lets a stylist's card fetch the cover photo (ProPhoto needs the connection with the piece id,
 * and the summary never carries a storage path for a stylist). A client's card uses their own photo path and
 * does not need it. The card holds no navigation: the host passes `onPress`.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { statusLabel } from '../utils/proFormat';
import type { Score } from '../config/ratingVocabulary';
import type { ProLookSummary } from '../types/pro';
import ProPhoto from './ProPhoto';
import ProStatusBadge from './ProStatusBadge';
import RatingScale from './RatingScale';

export type ProLookCardProps = {
  look: ProLookSummary;
  onPress: () => void;
  /** True when the viewer is the stylist who wrote the look. */
  mine?: boolean;
  /** The connection the look belongs to; lets a stylist's card show the cover photo. */
  connectionId?: string;
};

const inferMine = (look: ProLookSummary): boolean =>
  look.status === 'draft' || !(look.isNew || look.coverPhotoPath);

const piecesText = (count: number): string => `${count} ${count === 1 ? 'piece' : 'pieces'}`;

const validRating = (value: number | undefined): Score | null =>
  value !== undefined && Number.isInteger(value) && value >= 1 && value <= 5 ? (value as Score) : null;

export const ProLookCard: React.FC<ProLookCardProps> = ({ look, onPress, mine, connectionId }) => {
  const { theme } = useTheme();
  const byStylist = mine ?? inferMine(look);
  const title = look.title.trim() || 'Untitled look';
  const rating = validRating(look.clientRating);
  const status = statusLabel('look', look.status, byStylist);
  const pieces = piecesText(look.itemCount);

  const ownPath = look.coverPhotoPath ?? null;
  const viaFunction = !ownPath && Boolean(connectionId && look.coverItemId);

  const spoken = [title, status, pieces, rating ? `Rating ${rating} of 5` : ''].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={[
        styles.row,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
      ]}
    >
      <View style={[styles.cover, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.md }]}>
        <ProPhoto
          ownPath={ownPath}
          connectionId={viaFunction ? connectionId : undefined}
          itemId={viaFunction ? look.coverItemId : undefined}
          hasPhoto={Boolean(ownPath) || viaFunction}
          style={styles.coverImage}
          accessibilityLabel={`Cover of ${title}`}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {look.isNew ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.dot, { backgroundColor: theme.colors.accent }]}
            />
          ) : null}
          <Text variant="h4" numberOfLines={1} style={styles.title}>{title}</Text>
        </View>
        <Text variant="caption" color="muted">{pieces}</Text>
        {rating ? (
          <View style={styles.rating}>
            <RatingScale value={rating} readOnly size="sm" accessibilityLabel="Rating" />
          </View>
        ) : null}
      </View>
      <ProStatusBadge kind="look" status={look.status} mine={byStylist} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    gap: 12,
  },
  cover: { width: 60, height: 60, overflow: 'hidden' },
  coverImage: { width: 60, height: 60 },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  rating: { alignSelf: 'flex-start', marginTop: 2 },
});

export default ProLookCard;
