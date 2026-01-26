import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { getClothingItems } from '../services/storage';
import { StatsService } from '../services/statsService';
import { ClothingItem, WardrobeStats } from '../types';
import { theme } from '../styles/theme';

const { width } = Dimensions.get('window');

export const StatsScreen = () => {
  const [stats, setStats] = useState<WardrobeStats | null>(null);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const allItems = await getClothingItems();
      setItems(allItems);
      const wardrobeStats = StatsService.calculateWardrobeStats(allItems);
      setStats(wardrobeStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  if (loading || !stats) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading statistics...</Text>
      </View>
    );
  }

  const mostWornItems = StatsService.getMostWornItems(items, 3);
  const bestValueItems = StatsService.getBestValueItems(items, 3);
  const unwornItems = StatsService.getUnwornItems(items);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Wardrobe Analytics</Text>
        <Text style={styles.subtitle}>Insights into your style</Text>
      </View>

      {/* Overview Cards */}
      <View style={styles.overviewSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalItems}</Text>
          <Text style={styles.statLabel}>Total Items</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{formatCurrency(stats.totalValue)}</Text>
          <Text style={styles.statLabel}>Total Value</Text>
        </View>
      </View>

      <View style={styles.overviewSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.averageWearCount.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Avg Wears</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.wishlistCount}</Text>
          <Text style={styles.statLabel}>Wishlist</Text>
        </View>
      </View>

      {/* Category Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>By Category</Text>
        <View style={styles.categoryGrid}>
          {Object.entries(stats.itemsByCategory).map(([category, count]) => (
            <View key={category} style={styles.categoryCard}>
              <Text style={styles.categoryCount}>{count}</Text>
              <Text style={styles.categoryName}>{category}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Season Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>By Season</Text>
        <View style={styles.seasonGrid}>
          {Object.entries(stats.itemsBySeason).map(([season, count]) => (
            <View key={season} style={styles.seasonCard}>
              <Text style={styles.seasonEmoji}>
                {season === 'spring' ? '🌸' : season === 'summer' ? '☀️' : 
                 season === 'fall' ? '🍂' : '❄️'}
              </Text>
              <Text style={styles.seasonCount}>{count}</Text>
              <Text style={styles.seasonName}>{season}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Most Worn Items */}
      {mostWornItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Most Worn</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {mostWornItems.map(item => (
              <View key={item.id} style={styles.itemCard}>
                <Image
                  source={{ uri: item.retailerImage || item.userImage }}
                  style={styles.itemImage}
                />
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemWears}>{item.wearCount} wears</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Best Value Items */}
      {bestValueItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Best Value</Text>
          <Text style={styles.sectionSubtitle}>Lowest cost per wear</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {bestValueItems.map(item => (
              <View key={item.id} style={styles.itemCard}>
                <Image
                  source={{ uri: item.retailerImage || item.userImage }}
                  style={styles.itemImage}
                />
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemValue}>
                  {formatCurrency(StatsService.getCostPerWear(item))}/wear
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Unworn Items Alert */}
      {unwornItems.length > 0 && (
        <View style={styles.section}>
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>⚠️ Unworn Items</Text>
            <Text style={styles.alertText}>
              You have {unwornItems.length} items that haven't been worn yet.
            </Text>
            <Text style={styles.alertSubtext}>
              Consider styling them into new outfits!
            </Text>
          </View>
        </View>
      )}

      {/* Most Worn Item Highlight */}
      {stats.mostWornItem && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your MVP</Text>
          <View style={styles.mvpCard}>
            <Image
              source={{ uri: stats.mostWornItem.retailerImage || stats.mostWornItem.userImage }}
              style={styles.mvpImage}
            />
            <View style={styles.mvpInfo}>
              <Text style={styles.mvpName}>{stats.mostWornItem.name}</Text>
              <Text style={styles.mvpBrand}>{stats.mostWornItem.brand}</Text>
              <Text style={styles.mvpWears}>
                Worn {stats.mostWornItem.wearCount} times
              </Text>
              {stats.mostWornItem.cost && (
                <Text style={styles.mvpValue}>
                  {formatCurrency(StatsService.getCostPerWear(stats.mostWornItem))} per wear
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: theme.colors.primary,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 100,
  },
  overviewSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  categoryCard: {
    width: (width - 56) / 3,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    ...theme.shadows.small,
  },
  categoryCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  seasonGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  seasonCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    ...theme.shadows.small,
  },
  seasonEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  seasonCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  seasonName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  itemCard: {
    width: 140,
    marginRight: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    ...theme.shadows.small,
  },
  itemImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f0f0f0',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    padding: 8,
    paddingBottom: 4,
  },
  itemWears: {
    fontSize: 12,
    color: theme.colors.primary,
    paddingHorizontal: 8,
    paddingBottom: 8,
    fontWeight: '600',
  },
  itemValue: {
    fontSize: 12,
    color: theme.colors.success,
    paddingHorizontal: 8,
    paddingBottom: 8,
    fontWeight: '600',
  },
  alertCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  alertText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 4,
  },
  alertSubtext: {
    fontSize: 12,
    color: '#856404',
    fontStyle: 'italic',
  },
  mvpCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
    ...theme.shadows.medium,
  },
  mvpImage: {
    width: 120,
    height: 120,
    backgroundColor: '#f0f0f0',
  },
  mvpInfo: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  mvpName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  mvpBrand: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  mvpWears: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  mvpValue: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: '600',
  },
});
