export type AccountType = 'user' | 'stylist' | 'client';
export type UserRole = 'personal' | 'stylist' | 'client-of-stylist';

export interface StylistProfile {
  id: string;
  accountType: 'stylist';
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  specialties: string[]; // e.g., "Personal Shopping", "Wardrobe Consultation", "Event Styling"
  certifications?: string[];
  yearsExperience?: number;
  profileImage?: string;
  businessName?: string;
  website?: string;
  instagram?: string;
  pricing?: {
    consultationFee?: number;
    hourlyRate?: number;
    packageRates?: { name: string; price: number; description: string }[];
  };
  availability?: {
    daysAvailable: string[]; // ["Monday", "Tuesday", etc.]
    hoursAvailable: { start: string; end: string }; // e.g., { start: "09:00", end: "17:00" }
  };
  rating?: number;
  totalClients?: number;
  joinedDate: string;
  isActive: boolean;
}

export interface Client {
  id: string;
  stylistId: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  dateAdded: string;
  lastSession?: string;
  totalSessions: number;
  notes?: string;
  preferences?: {
    style?: string[]; // e.g., "Casual", "Business", "Bohemian"
    colors?: string[];
    budget?: { min: number; max: number };
    sizes?: {
      tops?: string;
      bottoms?: string;
      shoes?: string;
      dresses?: string;
    };
    bodyType?: string;
    lifestyle?: string;
  };
  goals?: string[];
  wardrobeAccess: boolean; // Can stylist view client's wardrobe
  status: 'active' | 'inactive' | 'archived';
}

export interface Appointment {
  id: string;
  stylistId: string;
  clientId: string;
  clientName: string;
  type: 'consultation' | 'shopping' | 'wardrobe-audit' | 'styling-session' | 'virtual' | 'follow-up';
  date: string;
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  location?: string;
  isVirtual: boolean;
  meetingLink?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
  prepNotes?: string;
  fee?: number;
  paid: boolean;
  reminders?: {
    sent: boolean;
    sentAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StylingRecommendation {
  id: string;
  stylistId: string;
  clientId: string;
  title: string;
  description: string;
  category: 'outfit' | 'purchase' | 'wardrobe-tip' | 'color-palette' | 'style-guide';
  items?: string[]; // ClothingItem IDs from client's wardrobe
  suggestedPurchases?: {
    name: string;
    category: string;
    description: string;
    estimatedPrice?: number;
    links?: string[];
    priority: 'high' | 'medium' | 'low';
  }[];
  images?: string[];
  occasion?: string;
  season?: string[];
  notes?: string;
  status: 'draft' | 'sent' | 'viewed' | 'implemented';
  createdAt: string;
  sentAt?: string;
  viewedAt?: string;
  clientFeedback?: {
    rating?: number;
    comment?: string;
    date?: string;
  };
}

export interface StylistNote {
  id: string;
  stylistId: string;
  clientId: string;
  appointmentId?: string;
  content: string;
  category: 'observation' | 'preference' | 'goal' | 'measurement' | 'general';
  isPrivate: boolean; // Only visible to stylist
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StylistStats {
  totalClients: number;
  activeClients: number;
  upcomingAppointments: number;
  completedSessions: number;
  totalRevenue?: number;
  averageRating?: number;
  recommendationsSent: number;
  recommendationsImplemented: number;
}

export interface ClientWardrobeAccess {
  clientId: string;
  stylistId: string;
  accessGranted: boolean;
  grantedAt?: string;
  permissions: {
    canView: boolean;
    canAddItems: boolean;
    canEditItems: boolean;
    canCreateOutfits: boolean;
    canMakeRecommendations: boolean;
  };
}

export interface StylistMessage {
  id: string;
  stylistId: string;
  clientId: string;
  senderId: string; // stylistId or clientId
  senderType: 'stylist' | 'client';
  content: string;
  attachments?: {
    type: 'image' | 'link' | 'outfit';
    url?: string;
    outfitId?: string;
  }[];
  read: boolean;
  createdAt: string;
}

export interface StylistPackage {
  id: string;
  stylistId: string;
  name: string;
  description: string;
  price: number;
  duration?: string; // e.g., "3 months", "6 sessions"
  includes: string[];
  isActive: boolean;
  createdAt: string;
}

// Client Account (for users working with a stylist)
export interface ClientAccount {
  id: string;
  accountType: 'client';
  userId: string; // Links to their personal wardrobe account
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  currentStylistId?: string; // Currently working with this stylist
  stylistHistory: string[]; // All stylists they've worked with
  preferences?: {
    style?: string[];
    colors?: string[];
    budget?: { min: number; max: number };
    sizes?: {
      tops?: string;
      bottoms?: string;
      shoes?: string;
      dresses?: string;
    };
    bodyType?: string;
    lifestyle?: string;
  };
  goals?: string[];
  joinedDate: string;
  isActive: boolean;
}

// Stylist-Client Relationship
export interface StylistClientRelationship {
  id: string;
  stylistId: string;
  clientId: string;
  status: 'pending' | 'active' | 'paused' | 'ended';
  startDate: string;
  endDate?: string;
  totalSessions: number;
  totalSpent: number;
  wardrobeAccessGranted: boolean;
  communicationPreference: 'in-app' | 'email' | 'phone' | 'all';
  notes?: string;
}

// Message Thread
export interface MessageThread {
  id: string;
  stylistId: string;
  clientId: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: {
    stylist: number;
    client: number;
  };
  createdAt: string;
  updatedAt: string;
}

// Enhanced Message with Thread Support
export interface Message {
  id: string;
  threadId: string;
  stylistId: string;
  clientId: string;
  senderId: string;
  senderType: 'stylist' | 'client';
  content: string;
  attachments?: {
    type: 'image' | 'link' | 'outfit' | 'recommendation' | 'appointment';
    url?: string;
    outfitId?: string;
    recommendationId?: string;
    appointmentId?: string;
    thumbnail?: string;
  }[];
  read: boolean;
  readAt?: string;
  createdAt: string;
}

// Stylist Marketplace Listing
export interface StylistListing {
  id: string;
  stylistId: string;
  name: string;
  businessName?: string;
  bio: string;
  profileImage?: string;
  specialties: string[];
  certifications?: string[];
  yearsExperience: number;
  rating: number;
  reviewCount: number;
  pricing: {
    consultationFee: number;
    hourlyRate?: number;
    packages?: { name: string; price: number; description: string }[];
  };
  availability: {
    acceptingNewClients: boolean;
    nextAvailable?: string;
  };
  location?: {
    city?: string;
    state?: string;
    country?: string;
    offersVirtual: boolean;
    offersInPerson: boolean;
  };
  portfolio?: {
    images: string[];
    description?: string;
  };
  featured: boolean;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

// Stylist Review
export interface StylistReview {
  id: string;
  stylistId: string;
  clientId: string;
  clientName: string;
  rating: number;
  title?: string;
  comment: string;
  appointmentId?: string;
  helpful: number;
  createdAt: string;
  response?: {
    content: string;
    createdAt: string;
  };
}

// Booking Request (from public marketplace)
export interface BookingRequest {
  id: string;
  stylistId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  requestedService: string;
  preferredDate?: string;
  preferredTime?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'converted';
  appointmentId?: string; // Set when converted to appointment
  createdAt: string;
  respondedAt?: string;
}

// Notification
export interface Notification {
  id: string;
  userId: string;
  userType: 'stylist' | 'client';
  type: 'message' | 'appointment' | 'recommendation' | 'booking-request' | 'review' | 'payment';
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  relatedId?: string; // ID of related entity (message, appointment, etc.)
  createdAt: string;
}

// Client Dashboard Stats
export interface ClientDashboardStats {
  totalSessions: number;
  upcomingAppointments: number;
  recommendationsReceived: number;
  recommendationsImplemented: number;
  totalSpent: number;
  currentStylist?: {
    id: string;
    name: string;
    profileImage?: string;
  };
}
