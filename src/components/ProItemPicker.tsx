/**
 * ProItemPicker — "Only pieces I choose": a grid of the person's own closet that they tick before sharing it with a
 * stylist. It lists owned pieces only (the wishlist is never shareable), reads all of them (getOwnedClothingItems
 * is not capped at 200 the way a plain page of getClothingItems is, and a grant can hold 500), and repeats the
 * rule that photos showing people, especially children, should not be picked.
 *
 * Nothing is applied until Done: Cancel leaves the caller's choice as it was. The picker keeps no copy of the
 * closet after it closes, takes no navigation hook and never navigates; the screen that opened it decides what
 * to do with the ids.
 *
 * The search box is a single-line field with a Return key, and the grid takes the keyboard list props so the
 * tiles stay tappable while the keyboard is up.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, EmptyState, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { PRO_LIMITS, PRO_PICKER_REMINDER } from '../config/proRules';
import { storagePathFromUrl } from '../services/imageUrls';
import { getOwnedClothingItems } from '../services/storage';
import type { ClothingItem } from '../types';
import { CATEGORY_LABELS } from '../utils/clothingOptions';
import { keyboardListProps } from '../utils/keyboardListProps';
import { KeyboardSafeView } from './KeyboardSafe';
import LoadError from './LoadError';
import ProItemTile from './ProItemTile';
import ProPhoto from './ProPhoto';

const MAX = PRO_LIMITS.grant_items_max;
const SEARCH_MAX = 40;

export type ProItemPickerProps = {
  visible: boolean;
  /** The ids ticked when the picker opens. */
  selectedIds: string[];
  /** The ticked ids, in the order they were ticked. Only called by Done. */
  onDone: (ids: string[]) => void;
  onClose: () => void;
};

export const ProItemPicker: React.FC<ProItemPickerProps> = ({ visible, selectedIds, onDone, onClose }) => {
  const { theme } = useTheme();
  const [items, setItems] = useState<ClothingItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  // A new number whenever the picker opens, closes or reads again: an answer under an older one is dropped.
  const session = useRef(0);
  const startingIds = useRef(selectedIds);
  startingIds.current = selectedIds;

  // Opening starts from the caller's choice with a clean search.
  useEffect(() => {
    if (!visible) return;
    setPicked(startingIds.current.slice(0, MAX));
    setQuery('');
    setNotice(null);
  }, [visible]);

  useEffect(() => {
    const mine = ++session.current;
    if (!visible) return undefined;
    setItems(null);
    setFailed(false);
    getOwnedClothingItems()
      .then(owned => {
        if (mine !== session.current) return;
        const own = owned.filter(piece => !piece.isWishlist);
        const present = new Set(own.map(piece => piece.id));
        setItems(own);
        // A piece deleted since the caller chose it can no longer be shared.
        setPicked(current => current.filter(id => present.has(id)));
      })
      .catch(() => {
        if (mine === session.current) setFailed(true);
      });
    return undefined;
  }, [visible, loadTick]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (items ?? []).filter(piece => !needle || piece.name.toLowerCase().includes(needle)),
    [items, needle],
  );
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const allShownPicked = shown.length > 0 && shown.every(piece => pickedSet.has(piece.id));

  const toggle = (id: string) => {
    if (pickedSet.has(id)) {
      setNotice(null);
      setPicked(picked.filter(x => x !== id));
    } else if (picked.length >= MAX) {
      setNotice(`You can share up to ${MAX} pieces.`);
    } else {
      setNotice(null);
      setPicked([...picked, id]);
    }
  };

  const toggleAll = () => {
    if (allShownPicked) {
      const drop = new Set(shown.map(piece => piece.id));
      setNotice(null);
      setPicked(picked.filter(id => !drop.has(id)));
      return;
    }
    const next = [...picked];
    let capped = false;
    for (const piece of shown) {
      if (pickedSet.has(piece.id)) continue;
      if (next.length >= MAX) {
        capped = true;
        break;
      }
      next.push(piece.id);
    }
    setNotice(capped ? `You can share up to ${MAX} pieces.` : null);
    setPicked(next);
  };

  const countText = picked.length === 1 ? '1 piece selected' : `${picked.length} pieces selected`;

  let body: React.ReactNode;
  if (failed) {
    body = <LoadError what="closet" onRetry={() => setLoadTick(n => n + 1)} />;
  } else if (items === null) {
    body = (
      <View style={styles.loading} accessibilityLabel="Loading your closet">
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
        title="You have no pieces to share yet"
      />
    );
  } else {
    body = (
      <FlatList
        data={shown}
        keyExtractor={piece => piece.id}
        numColumns={3}
        {...keyboardListProps}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        initialNumToRender={18}
        windowSize={7}
        ListEmptyComponent={
          <EmptyState
            icon={<Icon name="search-outline" size={32} color={theme.colors.textSubtle} />}
            title="No pieces match"
            body="Try a different name."
          />
        }
        renderItem={({ item }) => {
          const selected = pickedSet.has(item.id);
          const photoPath = storagePathFromUrl(item.userImage);
          return (
            <View style={styles.cell}>
              <ProItemTile
                name={item.name}
                subtitle={CATEGORY_LABELS[item.category]}
                photo={<ProPhoto ownPath={photoPath} hasPhoto={photoPath !== null} />}
                selected={selected}
                onPress={() => toggle(item.id)}
                accessibilityLabel={selected ? `${item.name}, selected` : item.name}
              />
            </View>
          );
        }}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardSafeView style={{ backgroundColor: theme.colors.background }}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text variant="body" color="accent" weight="600">Cancel</Text>
          </Pressable>
          <Text variant="h4" style={styles.title} numberOfLines={1}>Choose pieces</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.top}>
          <Text variant="bodySmall" color="muted">{PRO_PICKER_REMINDER}</Text>
          <View style={[styles.searchBar, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
            <Icon name="search-outline" size={18} color={theme.colors.textSubtle} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Search your pieces"
              placeholderTextColor={theme.colors.textSubtle}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              blurOnSubmit
              maxLength={SEARCH_MAX}
              accessibilityLabel="Search your pieces"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Icon name="close-circle" size={18} color={theme.colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>
          {items !== null && items.length > 0 ? (
            <View style={styles.selectRow}>
              <Pressable
                onPress={toggleAll}
                disabled={shown.length === 0}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={allShownPicked ? 'Clear all' : 'Select all'}
              >
                <Text variant="bodySmall" color="accent" weight="600">{allShownPicked ? 'Clear all' : 'Select all'}</Text>
              </Pressable>
              <Text variant="bodySmall" color="muted" accessibilityLiveRegion="polite">{countText}</Text>
            </View>
          ) : null}
          {notice ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">{notice}</Text>
          ) : null}
        </View>

        <View style={styles.bodyArea}>{body}</View>

        <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Button
            label={picked.length > 0 ? `Done (${picked.length})` : 'Done'}
            accessibilityLabel="Done"
            onPress={() => onDone(picked)}
            fullWidth
          />
        </SafeAreaView>
      </KeyboardSafeView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerSpacer: {
    width: 48,
  },
  top: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bodyArea: {
    flex: 1,
  },
  loading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  grid: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 24,
  },
  cell: {
    width: '33.3333%',
    paddingHorizontal: 6,
    paddingBottom: 14,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default ProItemPicker;
