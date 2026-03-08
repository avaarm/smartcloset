import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StylistListing,
  StylistReview,
  BookingRequest,
  ClientAccount,
  ClientDashboardStats,
} from '../types/stylist';

const STORAGE_KEYS = {
  LISTINGS: '@smartcloset_stylist_listings',
  REVIEWS: '@smartcloset_stylist_reviews',
  BOOKING_REQUESTS: '@smartcloset_booking_requests',
  CLIENT_ACCOUNTS: '@smartcloset_client_accounts',
  CURRENT_CLIENT: '@smartcloset_current_client',
};

// ==================== Stylist Listings (Marketplace) ====================

export const getStylistListings = async (filters?: {
  specialty?: string;
  minRating?: number;
  maxPrice?: number;
  location?: string;
  virtualOnly?: boolean;
}): Promise<StylistListing[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LISTINGS);
    if (!data) return [];
    
    let listings: StylistListing[] = JSON.parse(data);
    
    // Apply filters
    if (filters) {
      if (filters.specialty) {
        listings = listings.filter(l => 
          l.specialties.some(s => s.toLowerCase().includes(filters.specialty!.toLowerCase()))
        );
      }
      
      if (filters.minRating) {
        listings = listings.filter(l => l.rating >= filters.minRating!);
      }
      
      if (filters.maxPrice) {
        listings = listings.filter(l => l.pricing.consultationFee <= filters.maxPrice!);
      }
      
      if (filters.virtualOnly) {
        listings = listings.filter(l => l.location?.offersVirtual);
      }
    }
    
    // Sort: featured first, then by rating
    return listings.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return b.rating - a.rating;
    });
  } catch (error) {
    console.error('Error getting stylist listings:', error);
    return [];
  }
};

export const getStylistListing = async (stylistId: string): Promise<StylistListing | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LISTINGS);
    if (!data) return null;
    
    const listings: StylistListing[] = JSON.parse(data);
    return listings.find(l => l.stylistId === stylistId) || null;
  } catch (error) {
    console.error('Error getting stylist listing:', error);
    return null;
  }
};

export const searchStylists = async (query: string): Promise<StylistListing[]> => {
  try {
    const listings = await getStylistListings();
    const searchTerm = query.toLowerCase();
    
    return listings.filter(l => 
      l.name.toLowerCase().includes(searchTerm) ||
      l.businessName?.toLowerCase().includes(searchTerm) ||
      l.bio.toLowerCase().includes(searchTerm) ||
      l.specialties.some(s => s.toLowerCase().includes(searchTerm))
    );
  } catch (error) {
    console.error('Error searching stylists:', error);
    return [];
  }
};

export const getFeaturedStylists = async (): Promise<StylistListing[]> => {
  try {
    const listings = await getStylistListings();
    return listings.filter(l => l.featured);
  } catch (error) {
    console.error('Error getting featured stylists:', error);
    return [];
  }
};

// ==================== Reviews ====================

export const getStylistReviews = async (stylistId: string): Promise<StylistReview[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.REVIEWS);
    if (!data) return [];
    
    const reviews: StylistReview[] = JSON.parse(data);
    return reviews
      .filter(r => r.stylistId === stylistId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error getting stylist reviews:', error);
    return [];
  }
};

export const createReview = async (
  review: Omit<StylistReview, 'id' | 'helpful' | 'createdAt'>
): Promise<StylistReview> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.REVIEWS);
    const reviews: StylistReview[] = data ? JSON.parse(data) : [];
    
    const newReview: StylistReview = {
      ...review,
      id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      helpful: 0,
      createdAt: new Date().toISOString(),
    };
    
    reviews.push(newReview);
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews));
    
    // Update listing rating
    await updateListingRating(review.stylistId);
    
    return newReview;
  } catch (error) {
    console.error('Error creating review:', error);
    throw error;
  }
};

export const addReviewResponse = async (
  reviewId: string,
  response: string
): Promise<StylistReview | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.REVIEWS);
    if (!data) return null;
    
    const reviews: StylistReview[] = JSON.parse(data);
    const index = reviews.findIndex(r => r.id === reviewId);
    
    if (index === -1) return null;
    
    reviews[index].response = {
      content: response,
      createdAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews));
    return reviews[index];
  } catch (error) {
    console.error('Error adding review response:', error);
    return null;
  }
};

const updateListingRating = async (stylistId: string): Promise<void> => {
  try {
    const reviews = await getStylistReviews(stylistId);
    if (reviews.length === 0) return;
    
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LISTINGS);
    if (!data) return;
    
    const listings: StylistListing[] = JSON.parse(data);
    const index = listings.findIndex(l => l.stylistId === stylistId);
    
    if (index !== -1) {
      listings[index].rating = Math.round(avgRating * 10) / 10;
      listings[index].reviewCount = reviews.length;
      await AsyncStorage.setItem(STORAGE_KEYS.LISTINGS, JSON.stringify(listings));
    }
  } catch (error) {
    console.error('Error updating listing rating:', error);
  }
};

// ==================== Booking Requests ====================

export const getBookingRequests = async (stylistId: string): Promise<BookingRequest[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.BOOKING_REQUESTS);
    if (!data) return [];
    
    const requests: BookingRequest[] = JSON.parse(data);
    return requests
      .filter(r => r.stylistId === stylistId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error getting booking requests:', error);
    return [];
  }
};

export const getClientBookingRequests = async (clientId: string): Promise<BookingRequest[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.BOOKING_REQUESTS);
    if (!data) return [];
    
    const requests: BookingRequest[] = JSON.parse(data);
    return requests
      .filter(r => r.clientId === clientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error getting client booking requests:', error);
    return [];
  }
};

export const createBookingRequest = async (
  request: Omit<BookingRequest, 'id' | 'status' | 'createdAt'>
): Promise<BookingRequest> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.BOOKING_REQUESTS);
    const requests: BookingRequest[] = data ? JSON.parse(data) : [];
    
    const newRequest: BookingRequest = {
      ...request,
      id: `booking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    requests.push(newRequest);
    await AsyncStorage.setItem(STORAGE_KEYS.BOOKING_REQUESTS, JSON.stringify(requests));
    
    return newRequest;
  } catch (error) {
    console.error('Error creating booking request:', error);
    throw error;
  }
};

export const updateBookingRequest = async (
  requestId: string,
  updates: Partial<BookingRequest>
): Promise<BookingRequest | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.BOOKING_REQUESTS);
    if (!data) return null;
    
    const requests: BookingRequest[] = JSON.parse(data);
    const index = requests.findIndex(r => r.id === requestId);
    
    if (index === -1) return null;
    
    requests[index] = {
      ...requests[index],
      ...updates,
      respondedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.BOOKING_REQUESTS, JSON.stringify(requests));
    return requests[index];
  } catch (error) {
    console.error('Error updating booking request:', error);
    return null;
  }
};

// ==================== Client Accounts ====================

export const getCurrentClientAccount = async (): Promise<ClientAccount | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_CLIENT);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting current client account:', error);
    return null;
  }
};

export const setCurrentClientAccount = async (account: ClientAccount | null): Promise<void> => {
  try {
    if (account) {
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_CLIENT, JSON.stringify(account));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_CLIENT);
    }
  } catch (error) {
    console.error('Error setting current client account:', error);
    throw error;
  }
};

export const getClientAccount = async (clientId: string): Promise<ClientAccount | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT_ACCOUNTS);
    if (!data) return null;
    
    const accounts: ClientAccount[] = JSON.parse(data);
    return accounts.find(a => a.id === clientId) || null;
  } catch (error) {
    console.error('Error getting client account:', error);
    return null;
  }
};

export const createClientAccount = async (
  account: Omit<ClientAccount, 'id' | 'joinedDate' | 'isActive'>
): Promise<ClientAccount> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT_ACCOUNTS);
    const accounts: ClientAccount[] = data ? JSON.parse(data) : [];
    
    const newAccount: ClientAccount = {
      ...account,
      id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      joinedDate: new Date().toISOString(),
      isActive: true,
    };
    
    accounts.push(newAccount);
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_ACCOUNTS, JSON.stringify(accounts));
    
    return newAccount;
  } catch (error) {
    console.error('Error creating client account:', error);
    throw error;
  }
};

export const updateClientAccount = async (
  clientId: string,
  updates: Partial<ClientAccount>
): Promise<ClientAccount | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT_ACCOUNTS);
    if (!data) return null;
    
    const accounts: ClientAccount[] = JSON.parse(data);
    const index = accounts.findIndex(a => a.id === clientId);
    
    if (index === -1) return null;
    
    accounts[index] = {
      ...accounts[index],
      ...updates,
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_ACCOUNTS, JSON.stringify(accounts));
    
    // Update current client if it's the same
    const currentClient = await getCurrentClientAccount();
    if (currentClient?.id === clientId) {
      await setCurrentClientAccount(accounts[index]);
    }
    
    return accounts[index];
  } catch (error) {
    console.error('Error updating client account:', error);
    return null;
  }
};

export const getClientDashboardStats = async (clientId: string): Promise<ClientDashboardStats> => {
  try {
    // Import other services to get data
    const { getAppointmentsByClient } = require('./stylistService');
    const { getRecommendationsByClient } = require('./stylistService');
    const { getRelationship } = require('./messagingService');
    
    const clientAccount = await getClientAccount(clientId);
    const appointments: any[] = await getAppointmentsByClient(clientId);
    const recommendations: any[] = await getRecommendationsByClient(clientId);
    
    const upcomingAppointments = appointments.filter(a => 
      a.status === 'scheduled' || a.status === 'confirmed'
    ).length;
    
    const implementedRecs = recommendations.filter(r => r.status === 'implemented').length;
    
    let currentStylist = undefined;
    if (clientAccount?.currentStylistId) {
      const { getStylistProfile } = require('./stylistService');
      const stylist = await getStylistProfile();
      if (stylist) {
        currentStylist = {
          id: stylist.id,
          name: stylist.name,
          profileImage: stylist.profileImage,
        };
      }
    }
    
    // Calculate total spent from relationship
    let totalSpent = 0;
    if (clientAccount?.currentStylistId) {
      const relationship = await getRelationship(clientAccount.currentStylistId, clientId);
      if (relationship) {
        totalSpent = relationship.totalSpent;
      }
    }
    
    return {
      totalSessions: appointments.filter(a => a.status === 'completed').length,
      upcomingAppointments,
      recommendationsReceived: recommendations.length,
      recommendationsImplemented: implementedRecs,
      totalSpent,
      currentStylist,
    };
  } catch (error) {
    console.error('Error getting client dashboard stats:', error);
    return {
      totalSessions: 0,
      upcomingAppointments: 0,
      recommendationsReceived: 0,
      recommendationsImplemented: 0,
      totalSpent: 0,
    };
  }
};

// ==================== Sample Data ====================

export const loadSampleMarketplaceData = async (): Promise<void> => {
  try {
    const sampleListings: StylistListing[] = [
      {
        id: 'listing_001',
        stylistId: 'stylist_sample_001',
        name: 'Emma Rodriguez',
        businessName: 'Stylish You Consulting',
        bio: 'Professional stylist with 8 years of experience helping clients discover their personal style. Specializing in wardrobe transformations and confidence building.',
        profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        specialties: ['Personal Shopping', 'Wardrobe Consultation', 'Event Styling', 'Color Analysis'],
        certifications: ['Certified Image Consultant', 'Fashion Styling Certificate'],
        yearsExperience: 8,
        rating: 4.9,
        reviewCount: 47,
        pricing: {
          consultationFee: 150,
          hourlyRate: 200,
          packages: [
            { name: 'Style Starter', price: 800, description: '3 sessions + wardrobe audit' },
            { name: 'Complete Makeover', price: 2000, description: '6 sessions + shopping + follow-ups' },
          ],
        },
        availability: {
          acceptingNewClients: true,
          nextAvailable: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        location: {
          city: 'Los Angeles',
          state: 'CA',
          country: 'USA',
          offersVirtual: true,
          offersInPerson: true,
        },
        portfolio: {
          images: [
            'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400',
            'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400',
          ],
          description: 'View my client transformations and styling work',
        },
        featured: true,
        verified: true,
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'listing_002',
        stylistId: 'stylist_002',
        name: 'Marcus Thompson',
        businessName: 'Modern Gentleman Styling',
        bio: 'Menswear specialist helping professionals elevate their style. From boardroom to weekend casual, I\'ll help you look your best.',
        profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
        specialties: ['Menswear', 'Professional Styling', 'Casual Wear'],
        certifications: ['Menswear Specialist'],
        yearsExperience: 6,
        rating: 4.8,
        reviewCount: 32,
        pricing: {
          consultationFee: 125,
          hourlyRate: 175,
          packages: [
            { name: 'Executive Package', price: 1500, description: 'Complete professional wardrobe' },
          ],
        },
        availability: {
          acceptingNewClients: true,
          nextAvailable: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        location: {
          city: 'New York',
          state: 'NY',
          country: 'USA',
          offersVirtual: true,
          offersInPerson: true,
        },
        featured: true,
        verified: true,
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'listing_003',
        stylistId: 'stylist_003',
        name: 'Sofia Chen',
        businessName: 'Chic & Sustainable Style',
        bio: 'Sustainable fashion advocate and stylist. I help clients build eco-friendly wardrobes without compromising on style.',
        profileImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
        specialties: ['Sustainable Fashion', 'Capsule Wardrobe', 'Ethical Styling'],
        yearsExperience: 5,
        rating: 4.7,
        reviewCount: 28,
        pricing: {
          consultationFee: 100,
          hourlyRate: 150,
        },
        availability: {
          acceptingNewClients: true,
          nextAvailable: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        location: {
          city: 'San Francisco',
          state: 'CA',
          country: 'USA',
          offersVirtual: true,
          offersInPerson: false,
        },
        featured: false,
        verified: true,
        createdAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    
    const sampleReviews: StylistReview[] = [
      {
        id: 'review_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        clientName: 'Sarah J.',
        rating: 5,
        title: 'Life-changing experience!',
        comment: 'Emma completely transformed my wardrobe and helped me feel confident in my professional life. Highly recommend!',
        helpful: 12,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        response: {
          content: 'Thank you so much, Sarah! It was a pleasure working with you.',
          createdAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'review_002',
        stylistId: 'stylist_sample_001',
        clientId: 'client_002',
        clientName: 'Michael C.',
        rating: 5,
        title: 'Worth every penny',
        comment: 'Emma\'s expertise and attention to detail are unmatched. She really listens and understands your needs.',
        helpful: 8,
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    
    await AsyncStorage.setItem(STORAGE_KEYS.LISTINGS, JSON.stringify(sampleListings));
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(sampleReviews));
    
    console.log('Sample marketplace data loaded successfully');
  } catch (error) {
    console.error('Error loading sample marketplace data:', error);
    throw error;
  }
};

export const clearMarketplaceData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.LISTINGS,
      STORAGE_KEYS.REVIEWS,
      STORAGE_KEYS.BOOKING_REQUESTS,
      STORAGE_KEYS.CLIENT_ACCOUNTS,
      STORAGE_KEYS.CURRENT_CLIENT,
    ]);
  } catch (error) {
    console.error('Error clearing marketplace data:', error);
    throw error;
  }
};
