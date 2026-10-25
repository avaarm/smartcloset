/**
 * ProClosetGrid — the pieces of a client's shared closet as a two-column grid of tiles.
 *
 * Read-only unless `selectable` is set (the look editor's picker). The grid knows nothing about a photo's
 * address: each tile gets a ProPhoto asked for by connection and piece, so a grant that is switched off stops
 * the next photo request. A tap on a read-only tile calls `onOpen`; there is no long press, no menu, and
 * nothing to save, copy or share. Pages are merged by the caller, by piece id.
 *
 * `connectionId`, `onOpen`, `header` and `empty` are additions to the contract of the design document: without
 * the connection a tile cannot ask for its photo, and without `onOpen` a screen cannot show a piece's details.
 */

import React from 'react';
import { FlatList, RefreshControlProps, StyleSheet, View } from 'react-native';
import ProItemTile from './ProItemTile';
import ProPhoto from './ProPhoto';
import { categoryLabel } from '../utils/clothingOptions';
import type { ProClosetItem } from '../types/pro';

export type ProClosetGridProps = {
  items: ProClosetItem[];
  /** The connection the pieces belong to; with it every tile asks for its piece's cover photo. */
  connectionId?: string;
  onEndReached?: () => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  /** Read-only grids: a tap opens the piece. */
  onOpen?: (item: ProClosetItem) => void;
  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  /** Shown instead of the grid when there are no pieces. */
  empty?: React.ReactElement | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

/** "Zara · Navy" — the two words a stylist scans for under a piece's name (its category when it has neither). */
export const closetItemSubtitle = (item: ProClosetItem): string =>
  [item.brand, item.color ? item.color.charAt(0).toUpperCase() + item.color.slice(1) : '']
    .filter(Boolean)
    .join(' · ') || categoryLabel(item.category);

export const ProClosetGrid: React.FC<ProClosetGridProps> = ({
  items,
  connectionId,
  onEndReached,
  selectable = false,
  selectedIds = [],
  onToggle,
  onOpen,
  header,
  footer,
  empty,
  refreshControl,
}) => {
  const renderItem = ({ item }: { item: ProClosetItem }) => {
    const selected = selectedIds.includes(item.id);
    const photo = (
      <ProPhoto
        connectionId={connectionId}
        itemId={item.id}
        hasPhoto={item.hasPhoto}
        accessibilityLabel={`Photo of ${item.name}`}
      />
    );
    return (
      <View style={styles.cell}>
        {selectable ? (
          <ProItemTile
            name={item.name}
            subtitle={closetItemSubtitle(item)}
            photo={photo}
            selected={selected}
            onPress={() => onToggle?.(item.id)}
            accessibilityLabel={`${item.name}${selected ? ', selected' : ''}`}
          />
        ) : (
          <ProItemTile
            name={item.name}
            subtitle={closetItemSubtitle(item)}
            photo={photo}
            onPress={onOpen ? () => onOpen(item) : undefined}
            accessibilityLabel={item.name}
          />
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      numColumns={2}
      renderItem={renderItem}
      extraData={selectedIds}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshControl={refreshControl}
      ListHeaderComponent={header ?? null}
      ListFooterComponent={footer ?? null}
      ListEmptyComponent={empty ?? null}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 24 },
  cell: { width: '50%', paddingHorizontal: 6, paddingBottom: 16 },
});

export default ProClosetGrid;
