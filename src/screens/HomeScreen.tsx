import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import StyleWidget from '../components/StyleWidget';
import { ClothingItem } from '../types';
import theme from '../styles/theme';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const [recentItems, setRecentItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalItems: 0,
    outfits: 0,
    wishlist: 0,
  });
  
  // Animation values
  const scrollY = new Animated.Value(0);
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });
  const headerTranslate = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -10],
    extrapolate: 'clamp',
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
    (navigation as any).navigate('ItemDetails', { item });
  };

  const renderFeatureCard = (
    title: string,
    icon: string,
    colors: string[],
    onPress: () => void
  ) => {
    return (
      <TouchableOpacity style={styles.featureCardContainer} onPress={onPress}>
        <View style={styles.featureCard}>
          <View style={styles.featureIconContainer}>
            <Icon name={icon} size={24} color={theme.colors.mediumGray} />
          </View>
          <Text style={styles.featureCardTitle}>{title}</Text>
        </View>
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
          source={{ uri: item.retailerImage || item.userImage || 'https://via.placeholder.com/100x120' }}
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
    <Animated.ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true }
      )}
      scrollEventThrottle={16}
    >
      <Animated.View 
        style={[
          styles.header,
          { 
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslate }] 
          }
        ]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.tagline}>What will you wear today?</Text>
          </View>
          <TouchableOpacity style={styles.authButton} onPress={() => (navigation as any).navigate('SignIn')}>
            <Text style={styles.authButtonText}>Sign in / Sign up</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <StyleWidget onOutfitSuggestionPress={handleOutfitSuggestionPress} />

      <Animated.View 
        style={[styles.statsContainer, {
          transform: [{
            translateY: scrollY.interpolate({
              inputRange: [0, 100, 200],
              outputRange: [0, -5, -10],
              extrapolate: 'clamp'
            })
          }]
        }]}
      >
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
      </Animated.View>

      <Text style={styles.sectionTitle}>Features</Text>
      <View style={styles.featureCardsContainer}>
        {renderFeatureCard(
          'My Wardrobe',
          'shirt-outline',
          ['#8B8B8B', '#A8A8A8'],
          () => navigation.navigate('Wardrobe' as never)
        )}
        {renderFeatureCard(
          'Outfits',
          'people-outline',
          ['#6B6B6B', '#888888'],
          () => navigation.navigate('Outfits' as never)
        )}
        {renderFeatureCard(
          'Wishlist',
          'heart-outline',
          ['#5A5A5A', '#777777'],
          () => navigation.navigate('Wishlist' as never)
        )}
        {renderFeatureCard(
          'Add Item',
          'add-circle-outline',
          ['#4A4A4A', '#666666'],
          () => navigation.navigate('Wardrobe' as never)
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
            onPress={() => navigation.navigate('Wardrobe' as never)}
          >
            <Text style={styles.addItemButtonText}>Add Your First Item</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    fontSize: 32,
    fontWeight: '300',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.mediumGray,
    letterSpacing: 0,
  },
  authButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    backgroundColor: '#FFFFFF',
  },
  authButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 16,
    padding: 20,
    ...theme.shadows.subtle,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '300',
    color: theme.colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.lightGray,
    opacity: 0.3,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mediumGray,
    marginHorizontal: 20,
    marginBottom: 16,
    marginTop: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  featureCardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  featureCardContainer: {
    width: '48%',
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.subtle,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureCardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0,
  },
  recentItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 20,
    marginBottom: 12,
  },
  viewAllText: {
    fontSize: 13,
    color: theme.colors.accent,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  recentItemsContainer: {
    marginBottom: 32,
  },
  recentItemsList: {
    paddingHorizontal: 20,
  },
  recentItemCard: {
    width: 120,
    marginRight: 16,
    alignItems: 'center',
  },
  recentItemImage: {
    width: 120,
    height: 160,
    borderRadius: 12,
    backgroundColor: theme.colors.mutedBackground,
  },
  recentItemName: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 24,
    ...theme.shadows.subtle,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.mediumGray,
    marginTop: 12,
    marginBottom: 20,
  },
  addItemButton: {
    backgroundColor: theme.colors.text,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  addItemButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  loader: {
    marginVertical: 24,
  },
});

export default HomeScreen;
