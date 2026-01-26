import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { OutfitAnalyticsService, OutfitAnalytics } from '../services/outfitAnalyticsService';
import theme from '../styles/theme';

const OutfitAnalyticsScreen = () => {
  const navigation = useNavigation();
  const [analytics, setAnalytics] = useState<OutfitAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<'increasing' | 'decreasing' | 'stable'>('stable');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await OutfitAnalyticsService.getOutfitAnalytics();
      const trendData = await OutfitAnalyticsService.getWearTrend();
      setAnalytics(data);
      setTrend(trendData);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'increasing':
        return { name: 'trending-up', color: '#34C759' };
      case 'decreasing':
        return { name: 'trending-down', color: '#FF3B30' };
      default:
        return { name: 'remove', color: theme.colors.mediumGray };
    }
  };

  const getTrendText = () => {
    switch (trend) {
      case 'increasing':
        return 'Your outfit usage is increasing! 📈';
      case 'decreasing':
        return 'Your outfit usage is decreasing 📉';
      default:
        return 'Your outfit usage is stable';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.errorText}>Failed to load analytics</Text>
        </View>
      </SafeAreaView>
    );
  }

  const trendIcon = getTrendIcon();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Outfit Analytics</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Icon name="albums-outline" size={32} color={theme.colors.accent} />
              <Text style={styles.statValue}>{analytics.totalOutfits}</Text>
              <Text style={styles.statLabel}>Total Outfits</Text>
            </View>
            <View style={styles.statCard}>
              <Icon name="checkmark-circle-outline" size={32} color="#34C759" />
              <Text style={styles.statValue}>{analytics.totalWears}</Text>
              <Text style={styles.statLabel}>Total Wears</Text>
            </View>
            <View style={styles.statCard}>
              <Icon name="bar-chart-outline" size={32} color="#FF9500" />
              <Text style={styles.statValue}>{analytics.averageWearCount.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Avg per Outfit</Text>
            </View>
            <View style={styles.statCard}>
              <Icon name="alert-circle-outline" size={32} color="#FF3B30" />
              <Text style={styles.statValue}>{analytics.unwornOutfits}</Text>
              <Text style={styles.statLabel}>Unworn</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wear Trend</Text>
          <View style={styles.trendCard}>
            <Icon name={trendIcon.name} size={40} color={trendIcon.color} />
            <Text style={styles.trendText}>{getTrendText()}</Text>
          </View>
        </View>

        {analytics.mostWornOutfit && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Most Worn Outfit 🏆</Text>
            <View style={styles.highlightCard}>
              <View style={styles.highlightHeader}>
                <Icon name="trophy" size={24} color="#FFD700" />
                <Text style={styles.highlightName}>{analytics.mostWornOutfit.name}</Text>
              </View>
              <Text style={styles.highlightSubtext}>
                Worn {analytics.mostWornOutfit.wearCount} times
              </Text>
            </View>
          </View>
        )}

        {analytics.averageRating > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Average Rating</Text>
            <View style={styles.ratingCard}>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Icon
                    key={star}
                    name={star <= Math.round(analytics.averageRating) ? 'star' : 'star-outline'}
                    size={28}
                    color="#FFD700"
                    style={styles.star}
                  />
                ))}
              </View>
              <Text style={styles.ratingValue}>{analytics.averageRating.toFixed(1)} / 5.0</Text>
            </View>
          </View>
        )}

        {analytics.favoriteOccasions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Occasions</Text>
            {analytics.favoriteOccasions.map((item, index) => (
              <View key={item.occasion} style={styles.occasionRow}>
                <View style={styles.occasionRank}>
                  <Text style={styles.occasionRankText}>{index + 1}</Text>
                </View>
                <Text style={styles.occasionName}>{item.occasion}</Text>
                <Text style={styles.occasionCount}>{item.count} times</Text>
              </View>
            ))}
          </View>
        )}

        {analytics.wearsByMonth.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wears by Month</Text>
            <View style={styles.chartContainer}>
              {analytics.wearsByMonth.map((item) => {
                const maxCount = Math.max(...analytics.wearsByMonth.map((m) => m.count));
                const heightPercentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                
                return (
                  <View key={item.month} style={styles.barContainer}>
                    <View style={styles.barWrapper}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(heightPercentage, 5)}%`,
                            backgroundColor:
                              item.count > 0 ? theme.colors.accent : theme.colors.lightGray,
                          },
                        ]}
                      >
                        {item.count > 0 && (
                          <Text style={styles.barValue}>{item.count}</Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.barLabel}>{item.month.split(' ')[0]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {analytics.recentlyWornOutfits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Worn (Last 30 Days)</Text>
            {analytics.recentlyWornOutfits.slice(0, 5).map((entry) => {
              const date = new Date(entry.dateWorn);
              const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              
              return (
                <View key={entry.id} style={styles.recentRow}>
                  <Icon name="calendar" size={16} color={theme.colors.accent} />
                  <Text style={styles.recentDate}>{formattedDate}</Text>
                  {entry.occasion && (
                    <View style={styles.recentOccasion}>
                      <Text style={styles.recentOccasionText}>{entry.occasion}</Text>
                    </View>
                  )}
                  {entry.rating && (
                    <View style={styles.recentRating}>
                      <Icon name="star" size={12} color="#FFD700" />
                      <Text style={styles.recentRatingText}>{entry.rating}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {analytics.unwornOutfits > 0 && (
          <View style={styles.section}>
            <View style={styles.tipCard}>
              <Icon name="bulb-outline" size={24} color="#FF9500" />
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>Tip</Text>
                <Text style={styles.tipText}>
                  You have {analytics.unwornOutfits} unworn outfit{analytics.unwornOutfits > 1 ? 's' : ''}. 
                  Try wearing them to maximize your wardrobe!
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    marginTop: 4,
    textAlign: 'center',
  },
  trendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  trendText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginLeft: 16,
    flex: 1,
  },
  highlightCard: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  highlightName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginLeft: 12,
    flex: 1,
  },
  highlightSubtext: {
    fontSize: 14,
    color: theme.colors.mediumGray,
  },
  ratingCard: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  star: {
    marginHorizontal: 4,
  },
  ratingValue: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  occasionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  occasionRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  occasionRankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  occasionName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
    flex: 1,
  },
  occasionCount: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 180,
    paddingTop: 20,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
  },
  barWrapper: {
    width: '100%',
    height: 140,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 6,
  },
  barValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  barLabel: {
    fontSize: 10,
    color: theme.colors.mediumGray,
    marginTop: 8,
    textAlign: 'center',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  recentDate: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginLeft: 8,
    minWidth: 60,
  },
  recentOccasion: {
    backgroundColor: theme.colors.mutedBackground,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  recentOccasionText: {
    fontSize: 11,
    color: theme.colors.mediumGray,
  },
  recentRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  recentRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    marginLeft: 4,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE5B4',
  },
  tipContent: {
    flex: 1,
    marginLeft: 12,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9500',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.mediumGray,
  },
});

export default OutfitAnalyticsScreen;
