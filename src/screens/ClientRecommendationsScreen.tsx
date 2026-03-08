import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { theme } from '../styles/theme';
import { getCurrentClientAccount } from '../services/marketplaceService';
import { getRecommendationsByClient } from '../services/stylistService';
import { StylingRecommendation } from '../types/stylist';

const ClientRecommendationsScreen = ({ navigation }: any) => {
  const [recommendations, setRecommendations] = useState<StylingRecommendation[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<StylingRecommendation[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'implemented'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, []);

  useEffect(() => {
    filterRecommendations();
  }, [activeTab, recommendations]);

  const loadRecommendations = async () => {
    try {
      const clientAccount = await getCurrentClientAccount();
      if (clientAccount) {
        const recs = await getRecommendationsByClient(clientAccount.id);
        setRecommendations(recs);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
      Alert.alert('Error', 'Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterRecommendations = () => {
    if (activeTab === 'all') {
      setFilteredRecommendations(recommendations);
    } else if (activeTab === 'pending') {
      setFilteredRecommendations(
        recommendations.filter((rec) => rec.status === 'sent' || rec.status === 'viewed')
      );
    } else {
      setFilteredRecommendations(
        recommendations.filter((rec) => rec.status === 'implemented')
      );
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadRecommendations();
  };

  const handleMarkAsImplemented = (recommendation: StylingRecommendation) => {
    Alert.alert(
      'Mark as Implemented',
      'Have you implemented this styling recommendation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Implemented',
          onPress: () => {
            Alert.alert('Success', 'Recommendation marked as implemented!');
            loadRecommendations();
          },
        },
      ]
    );
  };

  const handleProvideFeedback = (recommendation: StylingRecommendation) => {
    Alert.alert(
      'Provide Feedback',
      'Share your thoughts with your stylist',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Send Feedback',
          onPress: () => {
            Alert.alert('Sent', 'Your feedback has been sent to your stylist');
            loadRecommendations();
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return '#FFA726';
      case 'draft':
        return '#9E9E9E';
      case 'viewed':
        return '#2196F3';
      case 'implemented':
        return '#4CAF50';
      case 'declined':
        return '#FF5252';
      default:
        return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return 'mail-outline';
      case 'draft':
        return 'document-outline';
      case 'viewed':
        return 'eye-outline';
      case 'implemented':
        return 'checkmark-circle';
      case 'declined':
        return 'close-circle';
      default:
        return 'help-circle-outline';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'outfit':
        return 'shirt-outline';
      case 'purchase':
        return 'cart-outline';
      case 'wardrobe-tip':
        return 'bulb-outline';
      case 'color-palette':
        return 'color-palette-outline';
      case 'style-guide':
        return 'book-outline';
      default:
        return 'star-outline';
    }
  };

  const renderRecommendation = ({ item }: { item: StylingRecommendation }) => {
    const isImplemented = item.status === 'implemented';
    const isPending = item.status === 'sent' || item.status === 'viewed';

    return (
      <View style={styles.recommendationCard}>
        <View style={styles.cardHeader}>
          <View style={styles.categoryBadge}>
            <Icon name={getCategoryIcon(item.category)} size={16} color={theme.colors.primary} />
            <Text style={styles.categoryText}>{item.category.replace('-', ' ')}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Icon name={getStatusIcon(item.status)} size={14} color={getStatusColor(item.status)} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.recommendationTitle}>{item.title}</Text>
        <Text style={styles.recommendationDescription} numberOfLines={3}>
          {item.description}
        </Text>

        {item.suggestedPurchases && item.suggestedPurchases.length > 0 && (
          <View style={styles.purchasesContainer}>
            <Text style={styles.purchasesLabel}>Suggested Items:</Text>
            {item.suggestedPurchases.slice(0, 2).map((purchase, index) => (
              <View key={index} style={styles.purchaseItem}>
                <Icon name="cart-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.purchaseText}>
                  {purchase.name}
                  {purchase.estimatedPrice && ` - $${purchase.estimatedPrice}`}
                </Text>
              </View>
            ))}
            {item.suggestedPurchases.length > 2 && (
              <Text style={styles.moreText}>+{item.suggestedPurchases.length - 2} more</Text>
            )}
          </View>
        )}

        {item.images && item.images.length > 0 && (
          <View style={styles.imagesContainer}>
            {item.images.slice(0, 3).map((image, index) => (
              <Image key={index} source={{ uri: image }} style={styles.recommendationImage} />
            ))}
            {item.images.length > 3 && (
              <View style={styles.moreImagesOverlay}>
                <Text style={styles.moreImagesText}>+{item.images.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>
            {new Date(item.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>

        {isPending && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButtonPrimary}
              onPress={() => handleMarkAsImplemented(item)}
            >
              <Icon name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonPrimaryText}>Mark as Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonSecondary}
              onPress={() => handleProvideFeedback(item)}
            >
              <Icon name="chatbubble-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.actionButtonSecondaryText}>Feedback</Text>
            </TouchableOpacity>
          </View>
        )}

        {isImplemented && item.clientFeedback && (
          <View style={styles.feedbackContainer}>
            <Text style={styles.feedbackLabel}>Your Feedback:</Text>
            <Text style={styles.feedbackText}>{item.clientFeedback.comment || 'No comment provided'}</Text>
            {item.clientFeedback.rating && (
              <Text style={styles.feedbackRating}>Rating: {item.clientFeedback.rating}/5</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading recommendations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            All ({recommendations.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Pending (
            {recommendations.filter((r) => r.status === 'sent' || r.status === 'viewed').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'implemented' && styles.tabActive]}
          onPress={() => setActiveTab('implemented')}
        >
          <Text style={[styles.tabText, activeTab === 'implemented' && styles.tabTextActive]}>
            Done ({recommendations.filter((r) => r.status === 'implemented').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Recommendations List */}
      <FlatList
        data={filteredRecommendations}
        renderItem={renderRecommendation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="bulb-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No recommendations yet</Text>
            <Text style={styles.emptySubtext}>
              Your stylist will send personalized recommendations after your sessions
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  recommendationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.medium,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
    fontSize: 12,
    color: theme.colors.text,
    marginLeft: 6,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  recommendationDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  purchasesContainer: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  purchasesLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  purchaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  purchaseText: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 8,
  },
  moreText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  imagesContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  recommendationImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  moreImagesOverlay: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreImagesText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'capitalize',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 6,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginLeft: 6,
  },
  feedbackContainer: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  feedbackRating: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default ClientRecommendationsScreen;
