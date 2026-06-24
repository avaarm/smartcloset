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
import { deleteClothingItem } from '../services/storage';

const { width, height } = Dimensions.get('window');

type ItemDetailsRouteProp = RouteProp<{ ItemDetails: { item: ClothingItem } }, 'ItemDetails'>;

const ItemDetailsScreen: React.FC = () => {
  const route = useRoute<ItemDetailsRouteProp>();
  const navigation = useNavigation();
  const { item } = route.params;
  
  const [scrollY] = useState(new Animated.Value(0));
  const [isFavorite, setIsFavorite] = useState(item.favorite || false);
  const [wearCount, setWearCount] = useState(item.wearCount || 0);
  const [lastWorn, setLastWorn] = useState<string | undefined>(item.lastWorn);

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
    const prevLastWorn = lastWorn;
    const prevCount = wearCount;
    try {
      // Optimistic local update so the UI updates immediately
      const now = new Date().toISOString();
      setWearCount(prevCount + 1);
      setLastWorn(now);
      await WearTrackingService.markItemWorn(item.id);
      Alert.alert(
        'Marked as worn',
        `${item.name} now logged ${prevCount + 1} time${prevCount + 1 === 1 ? '' : 's'}.`,
        [
          {
            text: 'Undo',
            style: 'destructive',
            onPress: async () => {
              try {
                await WearTrackingService.undoLastWear(item.id, prevLastWorn);
                setWearCount(prevCount);
                setLastWorn(prevLastWorn);
              } catch {
                Alert.alert('Error', 'Could not undo. Try again.');
              }
            },
          },
          { text: 'OK', style: 'default' },
        ],
      );
    } catch (error) {
      console.error('Error marking item as worn:', error);
      // Revert optimistic state on failure
      setWearCount(prevCount);
      setLastWorn(prevLastWorn);
      Alert.alert('Error', 'Failed to mark item as worn');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      `Delete "${item.name}"?`,
      'This removes the item from your wardrobe. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClothingItem(item.id);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete the item.');
            }
          },
        },
      ],
    );
  };

  const getLastWornText = () => {
    if (!lastWorn) return 'Never';
    const lastWornDate = new Date(lastWorn);
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
            {item.retailer && renderInfoRow('storefront-outline', 'Retailer', item.retailer)}
            {renderInfoRow('color-palette-outline', 'Color', item.color || 'Not specified')}
            {item.season && item.season.length > 0 &&
              renderInfoRow(
                'sunny-outline',
                'Season',
                item.season.length === 4 ? 'All seasons' : item.season.map(s => s.toString()).join(', '),
              )}
            {item.occasion && renderInfoRow('compass-outline', 'Occasion', item.occasion)}
            {item.dateAdded &&
              renderInfoRow(
                'calendar-outline',
                'Added',
                new Date(item.dateAdded).toLocaleDateString(),
              )}
          </View>

          {/* Pricing Section — Used vs New + Savings */}
          {(item.cost || item.retailCost) && (
            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Pricing</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceCol}>
                  <Text style={styles.priceLabel}>Used</Text>
                  <Text style={styles.priceValue}>
                    {item.cost ? `$${item.cost.toFixed(item.cost % 1 === 0 ? 0 : 2)}` : '—'}
                  </Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.priceLabel}>New</Text>
                  <Text style={styles.priceValue}>
                    {item.retailCost
                      ? `$${item.retailCost.toFixed(item.retailCost % 1 === 0 ? 0 : 2)}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.priceLabel}>Saved</Text>
                  {item.cost && item.retailCost && item.retailCost > item.cost ? (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.priceValue, { color: '#059669' }]}>
                        ${(item.retailCost - item.cost).toFixed(0)}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600' }}>
                        {Math.round(((item.retailCost - item.cost) / item.retailCost) * 100)}% off
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.priceValue}>—</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Materials composition */}
          {item.materials && item.materials.length > 0 && (
            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Materials</Text>
              {item.materials.map((m, i) => (
                <View key={`${m.name}-${i}`} style={styles.materialRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.materialName}>
                      {m.name.charAt(0).toUpperCase() + m.name.slice(1)}
                    </Text>
                    <Text style={styles.materialTier}>{m.tier || 'primary'}</Text>
                  </View>
                  {m.percentage != null && (
                    <Text style={styles.materialPct}>{m.percentage}%</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagWrap}>
                {item.tags.map((t, i) => (
                  <View key={`${t}-${i}`} style={styles.tagChip}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {item.notes && item.notes.trim().length > 0 && (
            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          )}

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

            <TouchableOpacity
              style={[styles.actionButtonOutline, { marginTop: 12, borderColor: '#FCA5A5' }]}
              onPress={handleDelete}
            >
              <Icon name="trash-outline" size={20} color="#DC2626" />
              <Text style={[styles.actionButtonOutlineText, { color: '#DC2626' }]}>
                Delete Item
              </Text>
            </TouchableOpacity>
          </View>

          {/* Wear Analytics — replaces the hardcoded "Style Tips" with real signal */}
          <View style={styles.tipsSection}>
            <Text style={styles.sectionTitle}>Wear Analytics</Text>
            {(() => {
              const wears = wearCount;
              const paid = item.cost || 0;
              const retail = item.retailCost || paid;
              const cpwPaid = wears > 0 && paid > 0 ? paid / wears : null;
              const cpwRetail = wears > 0 && retail > 0 ? retail / wears : null;

              // Idle warning: > $50 retail and never worn
              if (retail >= 50 && wears === 0) {
                return (
                  <View style={[styles.tipCard, { backgroundColor: '#FEF3C7' }]}>
                    <Icon name="alert-circle-outline" size={24} color="#92400E" />
                    <View style={{ flex: 1, marginLeft: 4 }}>
                      <Text style={[styles.tipText, { color: '#92400E', fontWeight: '600' }]}>
                        Idle ${retail.toFixed(0)} value
                      </Text>
                      <Text style={[styles.tipText, { color: '#92400E', marginTop: 2, fontSize: 13 }]}>
                        You haven't worn this yet. Try styling it this week, or it may be a candidate to sell.
                      </Text>
                    </View>
                  </View>
                );
              }

              // Strong cost-per-wear (under $5/wear)
              if (cpwPaid != null && cpwPaid < 5) {
                return (
                  <View style={[styles.tipCard, { backgroundColor: '#D1FAE5' }]}>
                    <Icon name="trophy-outline" size={24} color="#065F46" />
                    <View style={{ flex: 1, marginLeft: 4 }}>
                      <Text style={[styles.tipText, { color: '#065F46', fontWeight: '600' }]}>
                        Workhorse · ${cpwPaid.toFixed(2)}/wear
                      </Text>
                      <Text style={[styles.tipText, { color: '#065F46', marginTop: 2, fontSize: 13 }]}>
                        {wears} wears at ${paid.toFixed(0)} paid. Excellent value — keep it in rotation.
                      </Text>
                    </View>
                  </View>
                );
              }

              // Generic: show CPW comparison
              if (cpwPaid != null) {
                return (
                  <View style={styles.tipCard}>
                    <Icon name="analytics-outline" size={24} color={theme.colors.accent} />
                    <View style={{ flex: 1, marginLeft: 4 }}>
                      <Text style={[styles.tipText, { fontWeight: '600' }]}>
                        ${cpwPaid.toFixed(2)} per wear
                      </Text>
                      <Text style={[styles.tipText, { marginTop: 2, fontSize: 13 }]}>
                        {wears} wear{wears === 1 ? '' : 's'} of an item that cost ${paid.toFixed(0)}
                        {cpwRetail && retail > paid
                          ? ` (${cpwRetail.toFixed(2)} based on retail).`
                          : '.'}
                        {' '}Each additional wear lowers this number.
                      </Text>
                    </View>
                  </View>
                );
              }

              // No cost data
              return (
                <View style={styles.tipCard}>
                  <Icon name="information-circle-outline" size={24} color={theme.colors.accent} />
                  <Text style={styles.tipText}>
                    Add cost info via the edit pencil to see cost-per-wear and savings analytics.
                  </Text>
                </View>
              );
            })()}
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
  // Pricing breakdown row
  priceRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    ...theme.shadows.subtle,
  },
  priceCol: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  // Materials composition
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    marginBottom: 6,
    ...theme.shadows.subtle,
  },
  materialName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  materialTier: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
    marginTop: 2,
  },
  materialPct: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  // Tags
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 14,
  },
  tagText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '500',
  },
  // Notes
  notesText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    ...theme.shadows.subtle,
  },
});

export default ItemDetailsScreen;
