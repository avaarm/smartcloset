import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import WeatherWidget from '../components/WeatherWidget';
import { ClothingItem } from '../types';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const [recentItems, setRecentItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalItems: 0,
    outfits: 0,
    wishlist: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load wardrobe stats
      const wardrobeItems = await AsyncStorage.getItem('wardrobe');
      const parsedWardrobe = wardrobeItems ? JSON.parse(wardrobeItems) : [];
      
      // Load outfits
      const savedOutfits = await AsyncStorage.getItem('savedOutfits');
      const parsedOutfits = savedOutfits ? JSON.parse(savedOutfits) : [];
      
      // Load wishlist
      const wishlistItems = await AsyncStorage.getItem('wishlist');
      const parsedWishlist = wishlistItems ? JSON.parse(wishlistItems) : [];
      
      // Set stats
      setStats({
        totalItems: parsedWardrobe.length,
        outfits: parsedOutfits.length,
        wishlist: parsedWishlist.length,
      });
      
      // Get recent items (last 5 added)
      const sortedItems = [...parsedWardrobe].sort((a, b) => {
        const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        return dateB - dateA;
      });
      
      setRecentItems(sortedItems.slice(0, 5));
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOutfitSuggestionPress = () => {
    navigation.navigate('Outfits' as never);
  };

  const handleItemPress = (item: ClothingItem) => {
    // Navigate to item details (this would need to be implemented)
    // navigation.navigate('ItemDetails', { item });
  };

  const renderFeatureCard = (
    title: string,
    icon: string,
    colors: string[],
    onPress: () => void
  ) => {
    return (
      <TouchableOpacity style={styles.featureCardContainer} onPress={onPress}>
        <LinearGradient
          colors={colors}
          style={styles.featureCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Icon name={icon} size={28} color="#FFFFFF" />
          <Text style={styles.featureCardTitle}>{title}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderRecentItem = ({ item }: { item: ClothingItem }) => {
    return (
      <TouchableOpacity
        style={styles.recentItemCard}
        onPress={() => handleItemPress(item)}
      >
        <Image
          source={{ uri: item.imageUri || item.userImage }}
          style={styles.recentItemImage}
          resizeMode="cover"
        />
        <Text style={styles.recentItemName} numberOfLines={1}>
          {item.name || item.category}
        </Text>
      </TouchableOpacity>
    );
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{getGreeting()}</Text>
        <Text style={styles.tagline}>What will you wear today?</Text>
      </View>

      <WeatherWidget onOutfitSuggestionPress={handleOutfitSuggestionPress} />

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalItems}</Text>
          <Text style={styles.statLabel}>Items</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.outfits}</Text>
          <Text style={styles.statLabel}>Outfits</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.wishlist}</Text>
          <Text style={styles.statLabel}>Wishlist</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Features</Text>
      <View style={styles.featureCardsContainer}>
        {renderFeatureCard(
          'Wardrobe',
          'shirt-outline',
          ['#6200EE', '#3700B3'],
          () => navigation.navigate('Wardrobe' as never)
        )}
        {renderFeatureCard(
          'Outfits',
          'albums-outline',
          ['#03DAC6', '#018786'],
          () => navigation.navigate('Outfits' as never)
        )}
        {renderFeatureCard(
          'Wishlist',
          'heart-outline',
          ['#FF385C', '#E00031'],
          () => navigation.navigate('Wishlist' as never)
        )}
        {renderFeatureCard(
          'Add Item',
          'add-circle-outline',
          ['#FF9800', '#F57C00'],
          () => navigation.navigate('Wardrobe' as never, { screen: 'AddClothing' } as never)
        )}
      </View>

      <View style={styles.recentItemsHeader}>
        <Text style={styles.sectionTitle}>Recently Added</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Wardrobe' as never)}>
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6200EE" style={styles.loader} />
      ) : recentItems.length > 0 ? (
        <FlatList
          data={recentItems}
          renderItem={renderRecentItem}
          keyExtractor={(item, index) => `recent-item-${index}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentItemsList}
          style={styles.recentItemsContainer}
        />
      ) : (
        <View style={styles.emptyStateContainer}>
          <Icon name="shirt-outline" size={40} color="#CCCCCC" />
          <Text style={styles.emptyStateText}>No items in your wardrobe yet</Text>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => navigation.navigate('Wardrobe' as never, { screen: 'AddClothing' } as never)}
          >
            <Text style={styles.addItemButtonText}>Add Your First Item</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  featureCardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  featureCardContainer: {
    width: '48%',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  featureCard: {
    padding: 16,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  recentItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
    marginBottom: 8,
  },
  viewAllText: {
    fontSize: 14,
    color: '#6200EE',
    fontWeight: '500',
  },
  recentItemsContainer: {
    marginBottom: 24,
  },
  recentItemsList: {
    paddingHorizontal: 16,
  },
  recentItemCard: {
    width: 100,
    marginRight: 12,
    alignItems: 'center',
  },
  recentItemImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  recentItemName: {
    fontSize: 14,
    color: '#111827',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 24,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 16,
  },
  addItemButton: {
    backgroundColor: '#6200EE',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addItemButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  loader: {
    marginVertical: 24,
  },
});

export default HomeScreen;
