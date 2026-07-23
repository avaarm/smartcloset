/**
 * CapsuleWardrobeScreen — Capsule wardrobe builder for stylists.
 *
 * Tap items to include in a client's capsule. Shows live outfit count estimate
 * and a versatility score. Surfaces gaps (e.g. "add 2 bottoms to double combos").
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, Button, Card, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { getClothingItems } from '../services/storage';
import { ClothingItem } from '../types';

const TOPS = ['tops', 'shirts', 'blouses', 'sweaters', 'jackets', 'outerwear'];
const BOTTOMS = ['bottoms', 'pants', 'jeans', 'skirts', 'shorts'];
const DRESSES = ['dresses', 'jumpsuits'];
const SHOES = ['shoes', 'boots', 'sneakers', 'heels', 'sandals'];
const ACCESSORIES = ['accessories', 'bags', 'jewelry', 'belts', 'scarves', 'hats'];

const getCategoryGroup = (category: string): string => {
  const c = category.toLowerCase();
  if (TOPS.some(t => c.includes(t))) return 'tops';
  if (BOTTOMS.some(t => c.includes(t))) return 'bottoms';
  if (DRESSES.some(t => c.includes(t))) return 'dresses';
  if (SHOES.some(t => c.includes(t))) return 'shoes';
  if (ACCESSORIES.some(t => c.includes(t))) return 'accessories';
  return 'other';
};

const computeOutfitCount = (selected: ClothingItem[]): number => {
  const tops = selected.filter(i => getCategoryGroup(i.category) === 'tops').length;
  const bottoms = selected.filter(i => getCategoryGroup(i.category) === 'bottoms').length;
  const dresses = selected.filter(i => getCategoryGroup(i.category) === 'dresses').length;
  const shoes = selected.filter(i => getCategoryGroup(i.category) === 'shoes').length;
  const accessories = selected.filter(i => getCategoryGroup(i.category) === 'accessories').length;

  const outerwear = selected.filter(i => i.category.toLowerCase().includes('outerwear') || i.category.toLowerCase().includes('jacket')).length;
  const pureTopCount = Math.max(0, tops - outerwear);

  const layeredCombos = pureTopCount * bottoms + (outerwear * Math.max(1, pureTopCount) * bottoms);
  const outfitCombos = layeredCombos + dresses;
  const withFootwear = Math.max(1, shoes) * outfitCombos;
  const withAccessories = accessories > 0 ? Math.min(withFootwear * 2, withFootwear + accessories * Math.ceil(outfitCombos / 2)) : withFootwear;

  return Math.max(0, Math.round(withAccessories));
};

const getVersatilityScore = (selected: ClothingItem[]): { score: number; label: string; color: string } => {
  const groups = new Set(selected.map(i => getCategoryGroup(i.category)));
  const colorVariety = new Set(selected.map(i => i.color?.toLowerCase()).filter(Boolean)).size;
  const groupScore = Math.min(groups.size / 5, 1);
  const colorScore = Math.min(colorVariety / 6, 1);
  const sizeScore = Math.min(selected.length / 30, 1);
  const score = Math.round((groupScore * 0.4 + colorScore * 0.3 + sizeScore * 0.3) * 100);

  if (score >= 75) return { score, label: 'Excellent', color: '#059669' };
  if (score >= 55) return { score, label: 'Good', color: '#D97706' };
  if (score >= 35) return { score, label: 'Building', color: '#6B7280' };
  return { score, label: 'Starter', color: '#9CA3AF' };
};

const getGaps = (selected: ClothingItem[]): string[] => {
  const tops = selected.filter(i => getCategoryGroup(i.category) === 'tops').length;
  const bottoms = selected.filter(i => getCategoryGroup(i.category) === 'bottoms').length;
  const dresses = selected.filter(i => getCategoryGroup(i.category) === 'dresses').length;
  const shoes = selected.filter(i => getCategoryGroup(i.category) === 'shoes').length;
  const accessories = selected.filter(i => getCategoryGroup(i.category) === 'accessories').length;

  const gaps: string[] = [];
  if (tops < 3) gaps.push(`Add ${3 - tops} more top${3 - tops > 1 ? 's' : ''} to build outfit combos`);
  if (bottoms < 2) gaps.push(`Add ${2 - bottoms} more bottom${2 - bottoms > 1 ? 's' : ''} to pair with tops`);
  if (shoes < 2) gaps.push('Add a second footwear option to vary formality');
  if (accessories < 2) gaps.push('Add accessories — they can triple perceived outfits');
  if (tops > 0 && bottoms === 0 && dresses === 0) gaps.push('No bottoms or dresses — nothing to complete a look');
  if (selected.length > 0 && tops + bottoms + dresses === 0) gaps.push('Missing core apparel — add tops, bottoms, or dresses');

  return gaps.slice(0, 3);
};

const CapsuleWardrobeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const clientName: string | undefined = route.params?.clientName;

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    getClothingItems({ all: true })
      .then(all => {
        setItems(all.filter(i => !i.isWishlist));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => items.filter(i => selectedIds.has(i.id)),
    [items, selectedIds],
  );

  const outfitCount = useMemo(() => computeOutfitCount(selected), [selected]);
  const versatility = useMemo(() => getVersatilityScore(selected), [selected]);
  const gaps = useMemo(() => getGaps(selected), [selected]);

  const categories = useMemo(() => {
    const all = Array.from(new Set(items.map(i => getCategoryGroup(i.category))));
    return ['all', ...all.filter(c => c !== 'other'), ...(all.includes('other') ? ['other'] : [])];
  }, [items]);

  const filtered = filter === 'all' ? items : items.filter(i => getCategoryGroup(i.category) === filter);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(i => i.id)));
  const clearAll = () => setSelectedIds(new Set());

  if (loading) {
    return (
      <Screen>
        <Text variant="body" color="muted" align="center">Loading wardrobe…</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">Capsule Builder</Text>
        <Text variant="caption" color="muted">{selectedIds.size} selected</Text>
      </View>

      {/* Stats strip */}
      <View style={[styles.statsStrip, { backgroundColor: theme.colors.accent }]}>
        <View style={styles.statBlock}>
          <Text variant="h2" style={{ color: '#fff' }}>{outfitCount}</Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>Outfit combos</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.statBlock}>
          <Text variant="h2" style={{ color: '#fff' }}>{selectedIds.size}</Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>Pieces</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.statBlock}>
          <Text variant="h2" style={{ color: '#fff' }}>{versatility.score}</Text>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>{versatility.label}</Text>
        </View>
      </View>

      {/* Gaps */}
      {gaps.length > 0 && selectedIds.size > 0 && (
        <View style={[styles.gapsBar, { backgroundColor: theme.colors.muted, borderBottomColor: theme.colors.border }]}>
          {gaps.map((g, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Icon name="add-circle-outline" size={14} color={theme.colors.accent} style={{ marginTop: 2 }} />
              <Text variant="caption" color="muted" style={{ flex: 1 }}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterBar, { borderBottomColor: theme.colors.border }]}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {categories.map(c => (
            <Pressable
              key={c}
              onPress={() => setFilter(c)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === c ? theme.colors.accent : theme.colors.muted,
                  borderColor: filter === c ? theme.colors.accent : theme.colors.border,
                },
              ]}
            >
              <Text
                variant="caption"
                style={{
                  color: filter === c ? '#fff' : theme.colors.text,
                  textTransform: 'capitalize',
                }}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Quick actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
        <Pressable onPress={selectAll} hitSlop={8} style={{ marginRight: 16 }}>
          <Text variant="caption" color="accent">Select all</Text>
        </Pressable>
        <Pressable onPress={clearAll} hitSlop={8}>
          <Text variant="caption" color="muted">Clear</Text>
        </Pressable>
      </View>

      {/* Grid */}
      <ScrollView contentContainerStyle={styles.grid}>
        {filtered.map(item => {
          const isSelected = selectedIds.has(item.id);
          const img = item.userImage || item.retailerImage;
          return (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [
                styles.cell,
                {
                  borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                  borderWidth: isSelected ? 2.5 : 1,
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: theme.colors.cardBackground ?? '#fff',
                },
              ]}
            >
              {img ? (
                <Image source={{ uri: img }} style={styles.cellImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cellImage, { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="shirt-outline" size={24} color={theme.colors.textSubtle} />
                </View>
              )}
              {isSelected && (
                <View style={[styles.selectedBadge, { backgroundColor: theme.colors.accent }]}>
                  <Icon name="checkmark" size={12} color="#fff" />
                </View>
              )}
              <View style={{ padding: 6 }}>
                <Text variant="caption" numberOfLines={1}>{item.name}</Text>
                {item.brand && (
                  <Text variant="caption" color="muted" numberOfLines={1}>{item.brand}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Bottom CTA */}
      {selectedIds.size > 0 && (
        <View style={[styles.bottomBar, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <View style={{ flex: 1 }}>
            <Text variant="label">{selectedIds.size}-piece capsule</Text>
            <Text variant="caption" color="muted">{outfitCount} outfit combos · {versatility.label} versatility</Text>
          </View>
          <Button
            label="Save capsule"
            variant="primary"
            size="sm"
            onPress={() => {
              navigation.navigate('Lookbook', { clientName, capsuleIds: Array.from(selectedIds) });
            }}
          />
        </View>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  statsStrip: {
    flexDirection: 'row',
    paddingVertical: 16,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
  gapsBar: {
    padding: 12,
    paddingHorizontal: 16,
    gap: 4,
    borderBottomWidth: 1,
  },
  filterBar: {
    borderBottomWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 8,
  },
  cell: {
    width: '30.5%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  cellImage: {
    width: '100%',
    aspectRatio: 1,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
});

export default CapsuleWardrobeScreen;
