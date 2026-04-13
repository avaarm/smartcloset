/**
 * WardrobeInsightsScreen — analytics dashboard for the user's wardrobe.
 *
 * Shows:
 *  - Total wardrobe value
 *  - Cost-per-wear leaderboard
 *  - Category breakdown (pie-style horizontal bar)
 *  - Most & least worn items
 *  - Color distribution
 *  - Season coverage
 */

import React, { useCallback, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Card, Screen, Text, Badge, EmptyState } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { ClothingItem, ClothingCategory } from '../types';
import { getClothingItems } from '../services/storage';

// ─── Category colors ────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<ClothingCategory, string> = {
  tops: '#4F86F7',
  bottoms: '#6B8E6B',
  dresses: '#D4748A',
  outerwear: '#C4A962',
  shoes: '#8B7FD9',
  accessories: '#E8915B',
};

const CATEGORY_ICONS: Record<ClothingCategory, string> = {
  tops: 'shirt-outline',
  bottoms: 'resize-outline',
  dresses: 'body-outline',
  outerwear: 'cloudy-outline',
  shoes: 'footsteps-outline',
  accessories: 'watch-outline',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const getCostPerWear = (item: ClothingItem): number | null => {
  if (!item.cost || !item.wearCount || item.wearCount === 0) return null;
  return item.cost / item.wearCount;
};

// ─── Component ──────────────────────────────────────────────────────────────

const WardrobeInsightsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const data = await getClothingItems();
        if (active) {
          setItems(data.filter(i => !i.isWishlist));
          setLoading(false);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  if (loading) {
    return (
      <Screen scrollable padded header={
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Wardrobe Insights</Text>
        </View>
      }>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <Text variant="body" color="muted">Loading your insights...</Text>
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen scrollable padded header={
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Wardrobe Insights</Text>
        </View>
      }>
        <EmptyState
          icon="analytics-outline"
          title="No items yet"
          body="Add clothing items to your wardrobe to see insights and analytics."
        />
      </Screen>
    );
  }

  // ── Compute stats ──
  const totalValue = items.reduce((sum, i) => sum + (i.cost || 0), 0);
  const itemsWithCost = items.filter(i => i.cost && i.cost > 0);
  const avgItemCost = itemsWithCost.length > 0
    ? itemsWithCost.reduce((s, i) => s + (i.cost || 0), 0) / itemsWithCost.length
    : 0;

  // Category breakdown
  const categoryBreakdown: Record<ClothingCategory, number> = {
    tops: 0, bottoms: 0, dresses: 0, outerwear: 0, shoes: 0, accessories: 0,
  };
  items.forEach(i => { categoryBreakdown[i.category] = (categoryBreakdown[i.category] || 0) + 1; });
  const maxCatCount = Math.max(...Object.values(categoryBreakdown), 1);

  // Most & least worn
  const worn = items.filter(i => (i.wearCount || 0) > 0).sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0));
  const mostWorn = worn.slice(0, 3);
  const leastWorn = items
    .filter(i => !i.isWishlist)
    .sort((a, b) => (a.wearCount || 0) - (b.wearCount || 0))
    .slice(0, 3);

  // Cost-per-wear champions
  const cpwItems = items
    .map(i => ({ item: i, cpw: getCostPerWear(i) }))
    .filter(x => x.cpw !== null)
    .sort((a, b) => (a.cpw as number) - (b.cpw as number))
    .slice(0, 5);

  // Color distribution
  const colorCounts: Record<string, number> = {};
  items.forEach(i => {
    const c = (i.color || 'unknown').toLowerCase();
    colorCounts[c] = (colorCounts[c] || 0) + 1;
  });
  const topColors = Object.entries(colorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // Season coverage
  const seasonCounts: Record<string, number> = { spring: 0, summer: 0, fall: 0, winter: 0 };
  items.forEach(i => {
    (i.season || []).forEach(s => { seasonCounts[s] = (seasonCounts[s] || 0) + 1; });
  });

  // Favorites
  const favCount = items.filter(i => i.favorite).length;

  return (
    <Screen
      scrollable
      padded
      header={
        <View style={[s.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Wardrobe Insights</Text>
        </View>
      }
    >
      {/* ── Summary KPIs ── */}
      <View style={s.kpiRow}>
        <Card style={s.kpiCard}>
          <Text variant="overline" color="muted">Total Items</Text>
          <Text variant="h2">{items.length}</Text>
        </Card>
        <Card style={s.kpiCard}>
          <Text variant="overline" color="muted">Wardrobe Value</Text>
          <Text variant="h2">{formatCurrency(totalValue)}</Text>
        </Card>
      </View>

      <View style={s.kpiRow}>
        <Card style={s.kpiCard}>
          <Text variant="overline" color="muted">Avg Item Cost</Text>
          <Text variant="h2">{formatCurrency(avgItemCost)}</Text>
        </Card>
        <Card style={s.kpiCard}>
          <Text variant="overline" color="muted">Favorites</Text>
          <Text variant="h2">{favCount}</Text>
        </Card>
      </View>

      {/* ── Category Breakdown ── */}
      <Text variant="h3" style={s.sectionTitle}>Category Breakdown</Text>
      <Card style={{ marginBottom: 20 }}>
        {(Object.entries(categoryBreakdown) as [ClothingCategory, number][]).map(([cat, count]) => (
          <View key={cat} style={s.barRow}>
            <View style={s.barLabel}>
              <Icon name={CATEGORY_ICONS[cat]} size={18} color={CATEGORY_COLORS[cat]} />
              <Text variant="label" style={{ marginLeft: 8, textTransform: 'capitalize' }}>
                {cat}
              </Text>
            </View>
            <View style={s.barTrack}>
              <View
                style={[
                  s.barFill,
                  {
                    width: `${Math.max((count / maxCatCount) * 100, 2)}%`,
                    backgroundColor: CATEGORY_COLORS[cat],
                  },
                ]}
              />
            </View>
            <Text variant="label" style={{ width: 28, textAlign: 'right' }}>{count}</Text>
          </View>
        ))}
      </Card>

      {/* ── Cost Per Wear ── */}
      {cpwItems.length > 0 && (
        <>
          <Text variant="h3" style={s.sectionTitle}>Best Cost-Per-Wear</Text>
          <Card style={{ marginBottom: 20 }}>
            {cpwItems.map(({ item, cpw }, idx) => (
              <Pressable
                key={item.id}
                style={[s.itemRow, idx < cpwItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                onPress={() => navigation.navigate('ItemDetails', { item })}
              >
                <Image
                  source={{ uri: item.userImage || item.retailerImage }}
                  style={s.thumb}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="label" numberOfLines={1}>{item.name}</Text>
                  <Text variant="caption" color="muted">
                    {item.wearCount} wears | {formatCurrency(item.cost || 0)} total
                  </Text>
                </View>
                <Badge
                  label={`$${(cpw as number).toFixed(2)}/wear`}
                  tone={idx === 0 ? 'success' : 'neutral'}
                />
              </Pressable>
            ))}
          </Card>
        </>
      )}

      {/* ── Most Worn ── */}
      {mostWorn.length > 0 && (
        <>
          <Text variant="h3" style={s.sectionTitle}>Most Worn</Text>
          <Card style={{ marginBottom: 20 }}>
            {mostWorn.map((item, idx) => (
              <Pressable
                key={item.id}
                style={[s.itemRow, idx < mostWorn.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                onPress={() => navigation.navigate('ItemDetails', { item })}
              >
                <Image
                  source={{ uri: item.userImage || item.retailerImage }}
                  style={s.thumb}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="label" numberOfLines={1}>{item.name}</Text>
                  <Text variant="caption" color="muted">{item.brand || item.category}</Text>
                </View>
                <Badge label={`${item.wearCount || 0}x`} />
              </Pressable>
            ))}
          </Card>
        </>
      )}

      {/* ── Least Worn ── */}
      <Text variant="h3" style={s.sectionTitle}>Least Worn</Text>
      <Card style={{ marginBottom: 20 }}>
        {leastWorn.map((item, idx) => (
          <Pressable
            key={item.id}
            style={[s.itemRow, idx < leastWorn.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
            onPress={() => navigation.navigate('ItemDetails', { item })}
          >
            <Image
              source={{ uri: item.userImage || item.retailerImage }}
              style={s.thumb}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text variant="label" numberOfLines={1}>{item.name}</Text>
              <Text variant="caption" color="muted">
                {(item.wearCount || 0) === 0 ? 'Never worn' : `${item.wearCount} wear${item.wearCount === 1 ? '' : 's'}`}
              </Text>
            </View>
            {(item.wearCount || 0) === 0 && (
              <Icon name="alert-circle-outline" size={18} color="#E57373" />
            )}
          </Pressable>
        ))}
      </Card>

      {/* ── Color Distribution ── */}
      <Text variant="h3" style={s.sectionTitle}>Color Palette</Text>
      <Card style={{ marginBottom: 20 }}>
        <View style={s.colorGrid}>
          {topColors.map(([color, count]) => (
            <View key={color} style={s.colorChip}>
              <View style={[s.colorDot, { backgroundColor: getColorHex(color) }]} />
              <Text variant="caption" style={{ textTransform: 'capitalize' }}>{color}</Text>
              <Text variant="caption" color="muted">{count}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* ── Season Coverage ── */}
      <Text variant="h3" style={s.sectionTitle}>Season Coverage</Text>
      <Card style={{ marginBottom: 40 }}>
        <View style={s.seasonRow}>
          {(['spring', 'summer', 'fall', 'winter'] as const).map(season => {
            const count = seasonCounts[season] || 0;
            const pct = items.length > 0 ? Math.round((count / items.length) * 100) : 0;
            return (
              <View key={season} style={s.seasonItem}>
                <Icon
                  name={
                    season === 'spring' ? 'flower-outline'
                    : season === 'summer' ? 'sunny-outline'
                    : season === 'fall' ? 'leaf-outline'
                    : 'snow-outline'
                  }
                  size={24}
                  color={theme.colors.text}
                />
                <Text variant="label" style={{ marginTop: 4, textTransform: 'capitalize' }}>{season}</Text>
                <Text variant="caption" color="muted">{count} items</Text>
                <Text variant="caption" color="muted">{pct}%</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
};

// ─── Color name → hex ───────────────────────────────────────────────────────

const getColorHex = (name: string): string => {
  const map: Record<string, string> = {
    black: '#1A1A1A', white: '#FAFAFA', red: '#E53935', blue: '#1E88E5',
    green: '#43A047', yellow: '#FDD835', purple: '#8E24AA', pink: '#EC407A',
    orange: '#FF7043', brown: '#795548', gray: '#9E9E9E', grey: '#9E9E9E',
    navy: '#1A237E', beige: '#D7CCC8', cream: '#FFF8E1', tan: '#D2B48C',
    maroon: '#7B1F1F', olive: '#6B8E23', teal: '#00897B', coral: '#FF7F50',
    burgundy: '#800020', khaki: '#BDB76B', ivory: '#FFFFF0', charcoal: '#36454F',
    camel: '#C19A6B', sage: '#87AE73', mint: '#AAF0D1', lavender: '#B39DDB',
    mauve: '#E0B0FF', multicolor: '#888888', unknown: '#CCCCCC',
  };
  return map[name] || '#CCCCCC';
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 12,
    marginTop: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  barLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 110,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorChip: {
    alignItems: 'center',
    width: 60,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 4,
  },
  seasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  seasonItem: {
    alignItems: 'center',
    flex: 1,
  },
});

export default WardrobeInsightsScreen;
