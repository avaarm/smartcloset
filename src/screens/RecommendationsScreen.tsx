import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Image,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getRecommendations, getClients } from '../services/stylistService';
import { StylingRecommendation, Client } from '../types/stylist';
import theme from '../styles/theme';

type RecommendationsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

const RecommendationsScreen = ({ navigation }: RecommendationsScreenProps) => {
  const [recommendations, setRecommendations] = useState<StylingRecommendation[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<StylingRecommendation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent' | 'implemented'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterRecommendations();
  }, [recommendations, searchQuery, filterStatus]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recs, clientsList] = await Promise.all([
        getRecommendations(),
        getClients(),
      ]);
      setRecommendations(recs);
      setClients(clientsList);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRecommendations = () => {
    let filtered = [...recommendations];

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        r =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          getClientName(r.clientId).toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setFilteredRecommendations(filtered);
  };

  const getClientName = (clientId: string): string => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || 'Unknown Client';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return '#9CA3AF';
      case 'sent':
        return '#3B82F6';
      case 'viewed':
        return '#F59E0B';
      case 'implemented':
        return '#10B981';
      default:
        return '#6B7280';
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
        return 'document-outline';
    }
  };

  const renderRecommendation = ({ item }: { item: StylingRecommendation }) => (
    <TouchableOpacity
      style={styles.recommendationCard}
      onPress={() => navigation.navigate('RecommendationDetails', { recommendation: item })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.categoryBadge}>
          <Icon name={getCategoryIcon(item.category || 'style-guide')} size={16} color={theme.colors.primary} />
          <Text style={styles.categoryText}>
            {(item.category || 'style-guide').replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
          </Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20` }]}
        >
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>

      <Text style={styles.recommendationTitle}>{item.title}</Text>
      <Text style={styles.recommendationDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.clientInfo}>
          <Icon name="person-outline" size={16} color={theme.colors.mediumGray} />
          <Text style={styles.clientName}>{getClientName(item.clientId)}</Text>
        </View>
        <Text style={styles.dateText}>
          {new Date(item.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>

      {item.suggestedPurchases && item.suggestedPurchases.length > 0 && (
        <View style={styles.purchasesPreview}>
          <Icon name="cart-outline" size={14} color={theme.colors.mediumGray} />
          <Text style={styles.purchasesText}>
            {item.suggestedPurchases.length} suggested purchase
            {item.suggestedPurchases.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {item.clientFeedback?.rating && (
        <View style={styles.ratingPreview}>
          <Icon name="star" size={14} color="#F59E0B" />
          <Text style={styles.ratingText}>{item.clientFeedback.rating.toFixed(1)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const getStatusCount = (status: string) => {
    if (status === 'all') return recommendations.length;
    return recommendations.filter(r => r.status === status).length;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Recommendations</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateRecommendation')}
          >
            <LinearGradient
              colors={theme.colors.gradient.primary}
              style={styles.addButtonGradient}
            >
              <Icon name="add" size={24} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Icon name="search-outline" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recommendations..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterTabs}
          contentContainerStyle={styles.filterTabsContent}
        >
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'all' && styles.filterTabActive]}
            onPress={() => setFilterStatus('all')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterStatus === 'all' && styles.filterTabTextActive,
              ]}
            >
              All ({getStatusCount('all')})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'draft' && styles.filterTabActive]}
            onPress={() => setFilterStatus('draft')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterStatus === 'draft' && styles.filterTabTextActive,
              ]}
            >
              Draft ({getStatusCount('draft')})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'sent' && styles.filterTabActive]}
            onPress={() => setFilterStatus('sent')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterStatus === 'sent' && styles.filterTabTextActive,
              ]}
            >
              Sent ({getStatusCount('sent')})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'implemented' && styles.filterTabActive]}
            onPress={() => setFilterStatus('implemented')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterStatus === 'implemented' && styles.filterTabTextActive,
              ]}
            >
              Implemented ({getStatusCount('implemented')})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Recommendations List */}
      <FlatList
        data={filteredRecommendations}
        renderItem={renderRecommendation}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="bulb-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No recommendations found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? 'Try adjusting your search'
                : 'Create your first styling recommendation'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => navigation.navigate('CreateRecommendation')}
              >
                <Text style={styles.emptyStateButtonText}>Create Recommendation</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F7FF',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
  },
  addButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonGradient: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  filterTabs: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  filterTabsContent: {
    gap: 8,
    paddingRight: 20,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
  },
  recommendationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    backgroundColor: '#F3F0FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  recommendationDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  dateText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  purchasesPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  purchasesText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  ratingPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default RecommendationsScreen;
