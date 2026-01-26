import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  Share,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import theme from '../styles/theme';
import { ClothingItem } from '../types';
import { WearTrackingService } from '../services/wearTrackingService';

const { width, height } = Dimensions.get('window');

type ItemDetailsRouteProp = RouteProp<{ ItemDetails: { item: ClothingItem } }, 'ItemDetails'>;

const ItemDetailsScreen: React.FC = () => {
  const route = useRoute<ItemDetailsRouteProp>();
  const navigation = useNavigation();
  const { item } = route.params;
  
  const [scrollY] = useState(new Animated.Value(0));
  const [isFavorite, setIsFavorite] = useState(item.favorite || false);
  const [wearCount, setWearCount] = useState(item.wearCount || 0);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolate: 'clamp',
  });

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this ${item.name} from my SmartCloset!`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleEdit = () => {
    (navigation as any).navigate('AddClothing', { editItem: item });
  };

  const handleMarkAsWorn = async () => {
    try {
      await WearTrackingService.markItemWorn(item.id);
      setWearCount(wearCount + 1);
      Alert.alert(
        'Success',
        `${item.name} has been marked as worn!`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error marking item as worn:', error);
      Alert.alert('Error', 'Failed to mark item as worn');
    }
  };

  const getLastWornText = () => {
    if (!item.lastWorn) return 'Never';
    const lastWornDate = new Date(item.lastWorn);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastWornDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const renderInfoRow = (icon: string, label: string, value: string) => (
    <View style={styles.infoRow}>
      <View style={styles.infoIconContainer}>
        <Icon name={icon} size={20} color={theme.colors.accent} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Animated Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)']}
          style={styles.headerGradient}
        >
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Icon name="share-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>

      {/* Floating Action Buttons */}
      <View style={styles.floatingButtons}>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => setIsFavorite(!isFavorite)}
        >
          <Icon
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavorite ? theme.colors.error : '#FFFFFF'}
          />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* Hero Image */}
        <Animated.View style={[styles.imageContainer, { transform: [{ scale: imageScale }] }]}>
          <Image
            source={{
              uri:
                item.retailerImage ||
                item.userImage ||
                'https://via.placeholder.com/400x500',
            }}
            style={styles.image}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)']}
            style={styles.imageGradient}
          />
        </Animated.View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title Section */}
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <View style={styles.titleContainer}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemCategory}>{item.category}</Text>
              </View>
              <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                <Icon name="pencil" size={20} color={theme.colors.accent} />
              </TouchableOpacity>
            </View>
            {item.brand && (
              <View style={styles.brandBadge}>
                <Text style={styles.brandText}>{item.brand}</Text>
              </View>
            )}
          </View>

          {/* Stats Section */}
          <View style={styles.statsSection}>
            <View style={styles.statCard}>
              <Icon name="calendar-outline" size={24} color={theme.colors.accent} />
              <Text style={styles.statValue}>{wearCount}</Text>
              <Text style={styles.statLabel}>Times Worn</Text>
            </View>
            <View style={styles.statCard}>
              <Icon name="time-outline" size={24} color={theme.colors.accent} />
              <Text style={styles.statValue}>{getLastWornText()}</Text>
              <Text style={styles.statLabel}>Last Worn</Text>
            </View>
            {item.cost && (
              <View style={styles.statCard}>
                <Icon name="cash-outline" size={24} color={theme.colors.success} />
                <Text style={styles.statValue}>
                  ${wearCount > 0 ? (item.cost / wearCount).toFixed(2) : item.cost.toFixed(2)}
                </Text>
                <Text style={styles.statLabel}>Cost/Wear</Text>
              </View>
            )}
          </View>

          {/* Details Section */}
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            {item.brand && renderInfoRow('pricetag-outline', 'Brand', item.brand)}
            {renderInfoRow('color-palette-outline', 'Color', item.color || 'Not specified')}
            {item.season && item.season.length > 0 && renderInfoRow('sunny-outline', 'Season', item.season.map(s => s.toString()).join(', '))}
            {item.dateAdded && (
              renderInfoRow(
                'calendar-outline',
                'Added',
                new Date(item.dateAdded).toLocaleDateString()
              )
            )}
          </View>

          {/* Actions Section */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleMarkAsWorn}
            >
              <LinearGradient
                colors={theme.colors.gradient.primary}
                style={styles.actionButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Mark as Worn Today</Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionButtonOutline}
              onPress={() => (navigation as any).navigate('CreateOutfit')}
            >
              <Icon name="sparkles-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.actionButtonOutlineText}>Create Outfit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionButtonOutline, { marginTop: 12 }]} onPress={handleShare}>
              <Icon name="share-social-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.actionButtonOutlineText}>Share Item</Text>
            </TouchableOpacity>
          </View>

          {/* Style Tips Section */}
          <View style={styles.tipsSection}>
            <Text style={styles.sectionTitle}>Style Tips</Text>
            <View style={styles.tipCard}>
              <Icon name="bulb-outline" size={24} color={theme.colors.warning} />
              <Text style={styles.tipText}>
                This {item.category} pairs well with neutral colors and can be dressed up or down
                depending on the occasion.
              </Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  floatingButtons: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 99,
  },
  floatingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.card,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: width,
    height: height * 0.5,
    backgroundColor: theme.colors.mutedBackground,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  content: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
  },
  itemName: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  itemCategory: {
    fontSize: 16,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  brandText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    padding: 16,
    borderRadius: 16,
    flex: 1,
    marginHorizontal: 4,
    ...theme.shadows.subtle,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    ...theme.shadows.subtle,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  actionsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  actionButton: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  actionButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.cardBackground,
  },
  actionButtonOutlineText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  tipsSection: {
    paddingHorizontal: 20,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warning,
    ...theme.shadows.subtle,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    marginLeft: 12,
  },
});

export default ItemDetailsScreen;
