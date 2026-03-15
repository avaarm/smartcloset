# SmartCloset - Dual Interface System

Complete guide for the three-mode interface system: Personal User, Professional Stylist, and Client-of-Stylist.

---

## 🎯 Overview

SmartCloset now operates in **three distinct modes**, each with its own interface and features:

1. **Personal User Mode** - Individual wardrobe management (original functionality)
2. **Professional Stylist Mode** - Business management for stylists
3. **Client Mode** - For users working with a professional stylist

---

## 📱 Three Interface Modes

### 1. Personal User Mode (Default)

**For:** Individual users managing their own wardrobe

**Features:**
- Personal wardrobe management
- Outfit suggestions
- Wishlist tracking
- Wear tracking and statistics
- Personal styling

**Navigation:**
- Home / Wardrobe
- Outfits
- Wishlist
- Statistics
- Settings

---

### 2. Professional Stylist Mode

**For:** Professional stylists managing their business

**Features:**
- Client management
- Appointment scheduling
- Styling recommendations
- Business analytics
- Revenue tracking
- Messaging with clients
- Booking request management
- Review management

**Navigation:**
- Dashboard (business overview)
- Clients (client list and management)
- Appointments (calendar and scheduling)
- Recommendations (styling suggestions)
- Messages (client communication)
- Bookings (new client requests)
- Profile (stylist profile and settings)

**Key Screens:**
- `StylistDashboardScreen` - Business overview with stats
- `ClientsListScreen` - All clients
- `ClientDetailsScreen` - Individual client profile
- `CreateAppointmentScreen` - Schedule appointments
- `RecommendationsScreen` - Manage recommendations
- `MessagesScreen` - Client communication
- `BookingRequestsScreen` - Handle new inquiries

---

### 3. Client Mode

**For:** Users working with a professional stylist

**Features:**
- View stylist marketplace
- Book appointments with stylists
- Receive styling recommendations
- Message with stylist
- View appointment history
- Access personal wardrobe (linked to personal mode)
- Implement stylist recommendations
- Leave reviews

**Navigation:**
- Dashboard (client overview)
- My Stylist (current stylist info)
- Appointments (upcoming and past)
- Recommendations (received suggestions)
- Messages (chat with stylist)
- Discover (browse stylists marketplace)
- Wardrobe (personal items with stylist access)

**Key Screens:**
- `ClientDashboardScreen` - Overview of sessions and recommendations
- `MyStylistScreen` - Current stylist profile and relationship
- `StylistMarketplaceScreen` - Browse and discover stylists
- `StylistProfileScreen` - View stylist details and book
- `ClientMessagesScreen` - Chat with stylist
- `ClientAppointmentsScreen` - View appointments
- `ClientRecommendationsScreen` - View received recommendations

---

## 🔄 Mode Switching

### Account Types

```typescript
type AccountType = 'user' | 'stylist' | 'client';
type UserRole = 'personal' | 'stylist' | 'client-of-stylist';
```

### Switching Between Modes

```typescript
import { 
  switchToPersonalMode, 
  switchToStylistMode, 
  switchToClientMode,
  getCurrentMode 
} from './services/accountService';

// Get current mode
const mode = await getCurrentMode(); // 'user', 'stylist', or 'client'

// Switch to personal mode
await switchToPersonalMode();

// Switch to stylist mode
await switchToStylistMode();

// Switch to client mode
await switchToClientMode();
```

### Multi-Mode Support

Users can have multiple roles:
- A personal user can also be a client working with a stylist
- A stylist can also have a personal wardrobe
- Seamless switching between modes

---

## 💬 Messaging & Interaction Platform

### Features

**Message Threads**
- One-on-one conversations between stylist and client
- Unread message tracking
- Last message preview
- Thread timestamps

**Messages**
- Text messages
- Image attachments
- Link sharing
- Outfit attachments
- Recommendation attachments
- Appointment attachments
- Read receipts

**Notifications**
- New message alerts
- Appointment reminders
- Recommendation notifications
- Booking request alerts
- Review notifications
- Payment reminders

### Service: `messagingService.ts`

```typescript
// Get threads
const threads = await getThreads(userId, userType);

// Get or create thread
const thread = await getOrCreateThread(stylistId, clientId);

// Send message
const message = await sendMessage(
  threadId,
  stylistId,
  clientId,
  senderId,
  senderType,
  content,
  attachments
);

// Mark as read
await markThreadAsRead(threadId, userType);

// Get unread count
const unreadCount = await getUnreadMessageCount(userId, userType);

// Notifications
const notifications = await getNotifications(userId, userType);
await markNotificationAsRead(notificationId);
```

---

## 🏪 Stylist Marketplace

### Features

**For General Public:**
- Browse stylist listings
- Search by specialty, location, price
- Filter by rating, availability
- View stylist profiles
- Read reviews
- Book consultations
- Compare stylists

**For Stylists:**
- Create public listing
- Manage availability
- Set pricing
- Showcase portfolio
- Respond to reviews
- Accept/decline booking requests
- Build reputation

### Stylist Listing Components

**Profile Information:**
- Name and business name
- Bio and specialties
- Certifications
- Years of experience
- Profile photo
- Portfolio images

**Pricing:**
- Consultation fee
- Hourly rate
- Package deals

**Availability:**
- Accepting new clients
- Next available date
- Preferred communication

**Location:**
- City, state, country
- Virtual sessions offered
- In-person sessions offered

**Social Proof:**
- Rating (out of 5)
- Number of reviews
- Featured status
- Verified badge

### Service: `marketplaceService.ts`

```typescript
// Browse stylists
const stylists = await getStylistListings({
  specialty: 'Personal Shopping',
  minRating: 4.5,
  maxPrice: 200,
  virtualOnly: true
});

// Search
const results = await searchStylists('wardrobe consultation');

// Get featured
const featured = await getFeaturedStylists();

// View reviews
const reviews = await getStylistReviews(stylistId);

// Book stylist
const booking = await createBookingRequest({
  stylistId,
  clientId,
  clientName,
  clientEmail,
  requestedService: 'Wardrobe Consultation',
  message: 'I need help building a professional wardrobe'
});
```

---

## 🔐 Account & Relationship Management

### Client Accounts

```typescript
interface ClientAccount {
  id: string;
  accountType: 'client';
  userId: string; // Links to personal wardrobe
  currentStylistId?: string;
  stylistHistory: string[];
  preferences: {...};
  goals: string[];
}
```

### Stylist-Client Relationships

```typescript
interface StylistClientRelationship {
  id: string;
  stylistId: string;
  clientId: string;
  status: 'pending' | 'active' | 'paused' | 'ended';
  totalSessions: number;
  totalSpent: number;
  wardrobeAccessGranted: boolean;
  communicationPreference: 'in-app' | 'email' | 'phone' | 'all';
}
```

### Wardrobe Access

When a client grants wardrobe access to their stylist:
- Stylist can view client's clothing items
- Stylist can create outfit recommendations using client's items
- Stylist can suggest items to add/remove
- Client maintains full control and can revoke access

---

## 📊 Data Architecture

### Storage Keys

**Messaging:**
- `@smartcloset_message_threads`
- `@smartcloset_messages`
- `@smartcloset_notifications`
- `@smartcloset_relationships`

**Marketplace:**
- `@smartcloset_stylist_listings`
- `@smartcloset_stylist_reviews`
- `@smartcloset_booking_requests`
- `@smartcloset_client_accounts`
- `@smartcloset_current_client`

**Account:**
- `@smartcloset_account_type`
- `@smartcloset_current_mode`
- `@smartcloset_user_profile`

### Data Flow

```
Personal User ←→ Client Account ←→ Stylist
     ↓              ↓                  ↓
  Wardrobe    Appointments      Client Management
  Outfits     Recommendations   Business Analytics
  Stats       Messages          Revenue Tracking
```

---

## 🎨 UI/UX Design

### Mode Indicators

**Visual Cues:**
- Different color schemes per mode
  - Personal: Purple theme
  - Stylist: Professional purple/blue
  - Client: Softer purple/pink
- Mode badge in header
- Different navigation icons
- Context-aware actions

### Navigation Structure

**Personal Mode:**
```
Bottom Tabs:
- Home (wardrobe-outline)
- Outfits (shirt-outline)
- Wishlist (heart-outline)
- Stats (bar-chart-outline)
- Settings (settings-outline)
```

**Stylist Mode:**
```
Bottom Tabs:
- Dashboard (briefcase-outline)
- Clients (people-outline)
- Appointments (calendar-outline)
- Messages (chatbubbles-outline)
- More (menu-outline)
```

**Client Mode:**
```
Bottom Tabs:
- Home (home-outline)
- My Stylist (person-outline)
- Appointments (calendar-outline)
- Messages (chatbubbles-outline)
- Discover (search-outline)
```

---

## 🚀 Implementation Guide

### Step 1: Update Navigation

```typescript
// App.tsx
import { getCurrentMode } from './src/services/accountService';

const [mode, setMode] = useState<'user' | 'stylist' | 'client'>('user');

useEffect(() => {
  loadMode();
}, []);

const loadMode = async () => {
  const currentMode = await getCurrentMode();
  setMode(currentMode);
};

// Conditional navigation based on mode
{mode === 'stylist' && <StylistNavigator />}
{mode === 'client' && <ClientNavigator />}
{mode === 'user' && <PersonalNavigator />}
```

### Step 2: Create Mode Switcher

```typescript
// Settings Screen
const ModeSwitcher = () => {
  const [currentMode, setCurrentMode] = useState('user');
  
  const switchMode = async (newMode: 'user' | 'stylist' | 'client') => {
    if (newMode === 'stylist') {
      await switchToStylistMode();
    } else if (newMode === 'client') {
      await switchToClientMode();
    } else {
      await switchToPersonalMode();
    }
    setCurrentMode(newMode);
    // Reload app or navigation
  };
  
  return (
    <View>
      <TouchableOpacity onPress={() => switchMode('user')}>
        <Text>Personal Mode</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => switchMode('stylist')}>
        <Text>Stylist Mode</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => switchMode('client')}>
        <Text>Client Mode</Text>
      </TouchableOpacity>
    </View>
  );
};
```

### Step 3: Load Sample Data

```typescript
import { loadSampleStylistData } from './src/services/stylistService';
import { loadSampleMessagingData } from './src/services/messagingService';
import { loadSampleMarketplaceData } from './src/services/marketplaceService';

// Load all sample data
await loadSampleStylistData();
await loadSampleMessagingData();
await loadSampleMarketplaceData();
```

---

## 📱 User Journeys

### Journey 1: Personal User Discovers Stylist

1. User browses personal wardrobe (Personal Mode)
2. Sees "Find a Stylist" option
3. Switches to Client Mode
4. Browses stylist marketplace
5. Views stylist profile and reviews
6. Books consultation
7. Receives booking confirmation
8. Attends session
9. Receives recommendations
10. Implements suggestions in wardrobe

### Journey 2: Stylist Manages Client

1. Stylist receives booking request (Stylist Mode)
2. Reviews client information
3. Accepts booking
4. Creates appointment
5. Prepares for session
6. Conducts session
7. Creates styling recommendations
8. Sends recommendations to client
9. Messages client for follow-up
10. Tracks client progress

### Journey 3: Client Works with Stylist

1. Client logs in (Client Mode)
2. Views dashboard with upcoming appointment
3. Messages stylist with questions
4. Attends virtual session
5. Receives styling recommendations
6. Reviews recommendations
7. Implements suggestions
8. Provides feedback and rating
9. Books follow-up session
10. Continues relationship

---

## 🔧 Technical Implementation

### Services Created

1. **`messagingService.ts`** - Message threads, notifications, relationships
2. **`marketplaceService.ts`** - Stylist listings, reviews, bookings, client accounts
3. **`accountService.ts`** - Mode switching and account management (to be created)

### Types Added

```typescript
// New types in src/types/stylist.ts
- ClientAccount
- StylistClientRelationship
- MessageThread
- Message
- StylistListing
- StylistReview
- BookingRequest
- Notification
- ClientDashboardStats
```

### Screens to Create

**Client Mode Screens:**
- `ClientDashboardScreen.tsx`
- `MyStylistScreen.tsx`
- `StylistMarketplaceScreen.tsx`
- `StylistProfileViewScreen.tsx`
- `BookStylistScreen.tsx`
- `ClientMessagesScreen.tsx`
- `ClientAppointmentsScreen.tsx`
- `ClientRecommendationsScreen.tsx`

**Messaging Screens:**
- `MessagesListScreen.tsx` (for both stylist and client)
- `ChatScreen.tsx` (conversation view)
- `NotificationsScreen.tsx`

**Marketplace Screens:**
- `StylistMarketplaceScreen.tsx` (browse)
- `StylistSearchScreen.tsx` (search and filter)
- `StylistProfileViewScreen.tsx` (public profile)
- `BookingRequestsScreen.tsx` (stylist side)

---

## 🎯 Benefits

### For Personal Users
✅ Keep using SmartCloset as before  
✅ Option to work with professional stylist  
✅ Seamless transition to client mode  
✅ Maintain personal wardrobe control  

### For Stylists
✅ Complete business management platform  
✅ Client communication tools  
✅ Professional marketplace presence  
✅ Revenue tracking and analytics  
✅ Booking management  

### For Clients
✅ Easy stylist discovery  
✅ Direct communication with stylist  
✅ Receive professional recommendations  
✅ Track styling progress  
✅ Integrated with personal wardrobe  

---

## 📈 Future Enhancements

### Phase 2
- [ ] Video consultation integration
- [ ] Payment processing
- [ ] Calendar sync (Google, Apple)
- [ ] Email notifications
- [ ] SMS reminders
- [ ] Photo sharing in messages
- [ ] Voice messages

### Phase 3
- [ ] Group styling sessions
- [ ] Stylist teams/agencies
- [ ] Client referral program
- [ ] Loyalty rewards
- [ ] Gift certificates
- [ ] Subscription packages
- [ ] AI-powered stylist matching

### Phase 4
- [ ] Social features (share outfits)
- [ ] Community forums
- [ ] Style challenges
- [ ] Virtual try-on (AR)
- [ ] Shopping integration
- [ ] Brand partnerships
- [ ] Influencer collaborations

---

## 🧪 Testing

### Test Personal Mode
```typescript
await switchToPersonalMode();
// Test wardrobe, outfits, wishlist, stats
```

### Test Stylist Mode
```typescript
await switchToStylistMode();
await loadSampleStylistData();
// Test dashboard, clients, appointments, recommendations
```

### Test Client Mode
```typescript
await switchToClientMode();
await loadSampleMarketplaceData();
// Test marketplace, booking, messages, recommendations
```

### Test Messaging
```typescript
await loadSampleMessagingData();
// Test threads, messages, notifications
```

---

## 📝 Summary

The dual-interface system transforms SmartCloset into a comprehensive platform serving three distinct user types:

**Three Modes:**
1. 🏠 **Personal** - Individual wardrobe management
2. 💼 **Stylist** - Professional business platform
3. 👥 **Client** - Working with a stylist

**Key Features:**
- 💬 Messaging platform for stylist-client communication
- 🏪 Stylist marketplace for discovery and booking
- 📅 Integrated appointment scheduling
- 💡 Recommendation system
- ⭐ Review and rating system
- 🔄 Seamless mode switching
- 🔐 Wardrobe access control

**Status:** ✅ Core architecture and services implemented  
**Next:** Create client-facing screens and complete integration

---

**Version:** 2.0.0  
**Last Updated:** February 11, 2026  
**Architecture:** Dual-Interface System  

Made with 💜 for everyone in the styling ecosystem
