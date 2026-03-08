import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { theme } from '../styles/theme';
import { getStylistListing, getStylistReviews } from '../services/marketplaceService';
import { StylistListing, StylistReview } from '../types/stylist';

const StylistProfileViewScreen = ({ route, navigation }: any) => {
  const { stylistId } = route.params;
  
  const [listing, setListing] = useState<StylistListing | null>(null);
  const [reviews, setReviews] = useState<StylistReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);

  useEffect(() => {
    loadStylistData();
  }, []);

  const loadStylistData = async () => {
    try {
      const [stylistData, reviewsData] = await Promise.all([
        getStylistListing(stylistId),
        getStylistReviews(stylistId),
      ]);
      
      setListing(stylistData);
      setReviews(reviewsData);
    } catch (error) {
      console.error('Error loading stylist data:', error);
      Alert.alert('Error', 'Failed to load stylist profile');
    } finally {
      setLoading(false);
    }
  };

  const handleBookConsultation = () => {
    if (!listing) return;
    
    navigation.navigate('BookStylist', {
      stylistId: listing.stylistId,
      stylistName: listing.name,
      consultationFee: listing.pricing.consultationFee,
    });
  };

  const handleMessage = () => {
    Alert.alert('Coming Soon', 'Messaging will be available after booking your first session');
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Icon
          key={i}
          name={i <= rating ? 'star' : i - 0.5 <= rating ? 'star-half' : 'star-outline'}
          size={16}
          color="#FFA726"
        />
      );
    }
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Stylist not found</Text>
      </View>
    );
  }

  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header Image */}
        <View style={styles.headerContainer}>
          <Image
            source={{ uri: listing.profileImage || 'https://via.placeholder.com/400' }}
            style={styles.headerImage}
          />
          {listing.featured && (
            <View style={styles.featuredBadge}>
              <Icon name="star" size={16} color="#fff" />
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          )}
        </View>

        {/* Profile Info */}
        <View style={styles.profileSection}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{listing.name}</Text>
            {listing.verified && (
              <Icon name="checkmark-circle" size={24} color="#4CAF50" />
            )}
          </View>

          {listing.businessName && (
            <Text style={styles.businessName}>{listing.businessName}</Text>
          )}

          <View style={styles.ratingRow}>
            {renderStars(listing.rating)}
            <Text style={styles.rating}>{listing.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({listing.reviewCount} reviews)</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Icon name="briefcase-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.statText}>{listing.yearsExperience} years</Text>
            </View>
            {listing.location && (
              <View style={styles.stat}>
                <Icon name="location-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.statText}>
                  {listing.location.city}, {listing.location.state}
                </Text>
              </View>
            )}
          </View>

          {listing.location?.offersVirtual && (
            <View style={styles.virtualBadge}>
              <Icon name="videocam" size={16} color={theme.colors.primary} />
              <Text style={styles.virtualText}>Virtual Sessions Available</Text>
            </View>
          )}
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bio}>{listing.bio}</Text>
        </View>

        {/* Specialties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specialties</Text>
          <View style={styles.specialtiesContainer}>
            {listing.specialties.map((specialty, index) => (
              <View key={index} style={styles.specialtyTag}>
                <Text style={styles.specialtyText}>{specialty}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Certifications */}
        {listing.certifications && listing.certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            {listing.certifications.map((cert, index) => (
              <View key={index} style={styles.certificationItem}>
                <Icon name="ribbon-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.certificationText}>{cert}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          
          <View style={styles.pricingCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Consultation</Text>
              <Text style={styles.priceValue}>${listing.pricing.consultationFee}</Text>
            </View>
            
            {listing.pricing.hourlyRate && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Hourly Rate</Text>
                <Text style={styles.priceValue}>${listing.pricing.hourlyRate}/hr</Text>
              </View>
            )}
          </View>

          {listing.pricing.packages && listing.pricing.packages.length > 0 && (
            <View style={styles.packagesContainer}>
              <Text style={styles.subsectionTitle}>Packages</Text>
              {listing.pricing.packages.map((pkg, index) => (
                <View key={index} style={styles.packageCard}>
                  <View style={styles.packageHeader}>
                    <Text style={styles.packageName}>{pkg.name}</Text>
                    <Text style={styles.packagePrice}>${pkg.price}</Text>
                  </View>
                  <Text style={styles.packageDescription}>{pkg.description}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Portfolio */}
        {listing.portfolio && listing.portfolio.images && listing.portfolio.images.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            {listing.portfolio.description && (
              <Text style={styles.portfolioDescription}>{listing.portfolio.description}</Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
              {listing.portfolio.images.map((image, index) => (
                <Image
                  key={index}
                  source={{ uri: image }}
                  style={styles.portfolioImage}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
            
            {displayedReviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View>
                    <Text style={styles.reviewerName}>{review.clientName}</Text>
                    <Text style={styles.reviewDate}>
                      {new Date(review.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {renderStars(review.rating)}
                </View>
                
                {review.title && (
                  <Text style={styles.reviewTitle}>{review.title}</Text>
                )}
                
                <Text style={styles.reviewComment}>{review.comment}</Text>
                
                {review.response && (
                  <View style={styles.responseContainer}>
                    <Text style={styles.responseLabel}>Response from {listing.name}:</Text>
                    <Text style={styles.responseText}>{review.response.content}</Text>
                  </View>
                )}
              </View>
            ))}

            {reviews.length > 3 && !showAllReviews && (
              <TouchableOpacity
                style={styles.showMoreButton}
                onPress={() => setShowAllReviews(true)}
              >
                <Text style={styles.showMoreText}>Show All Reviews</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
          <Icon name="chatbubble-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.bookButton} onPress={handleBookConsultation}>
          <Text style={styles.bookButtonText}>Book Consultation</Text>
          <Text style={styles.bookButtonPrice}>${listing.pricing.consultationFee}</Text>
        </TouchableOpacity>
      </View>
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
  scrollView: {
    flex: 1,
  },
  headerContainer: {
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
  },
  featuredBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA726',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  featuredText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  profileSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: 8,
  },
  businessName: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: 8,
  },
  rating: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 6,
  },
  virtualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  virtualText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginLeft: 6,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  bio: {
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 24,
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specialtyTag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  specialtyText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  certificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  certificationText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 12,
  },
  pricingCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  packagesContainer: {
    marginTop: 8,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  packageCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  packagePrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  packageDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  portfolioDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  portfolioScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  portfolioImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  reviewCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  reviewDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  reviewComment: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  responseContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  responseText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  showMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  showMoreText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    ...theme.shadows.medium,
  },
  messageButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bookButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  bookButtonPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default StylistProfileViewScreen;
