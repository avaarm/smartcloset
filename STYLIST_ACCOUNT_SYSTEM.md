# SmartCloset - Professional Personal Stylist Account System

Complete documentation for the professional personal stylist account feature in SmartCloset.

## 🎯 Overview

The Stylist Account System transforms SmartCloset into a professional tool for personal stylists to manage their business, clients, appointments, and styling recommendations. This dual-mode system allows the app to function as both a personal wardrobe manager and a professional styling business platform.

---

## 📋 Table of Contents

1. [Account Types](#account-types)
2. [Core Features](#core-features)
3. [Data Models](#data-models)
4. [Services & APIs](#services--apis)
5. [Screens & UI](#screens--ui)
6. [Usage Guide](#usage-guide)
7. [Integration](#integration)
8. [Sample Data](#sample-data)

---

## Account Types

### User Account (Default)
- Personal wardrobe management
- Outfit suggestions
- Wishlist tracking
- Personal styling

### Stylist Account (Professional)
- Client management
- Appointment scheduling
- Styling recommendations
- Business analytics
- Revenue tracking
- Client wardrobe access

**Switching Between Modes:**
```typescript
import { switchToStylistMode, switchToUserMode } from './services/stylistService';

// Switch to stylist mode
await switchToStylistMode();

// Switch back to user mode
await switchToUserMode();
```

---

## Core Features

### 1. 👥 Client Management

**Features:**
- Add/edit/delete clients
- Client profiles with preferences
- Style preferences and goals
- Body measurements and sizes
- Budget tracking
- Session history
- Private notes
- Wardrobe access permissions

**Client Profile Includes:**
- Contact information
- Style preferences (casual, business, bohemian, etc.)
- Preferred colors
- Budget range
- Clothing sizes
- Body type
- Lifestyle information
- Personal goals
- Session count and history

### 2. 📅 Appointment Scheduling

**Appointment Types:**
- Consultation
- Personal Shopping
- Wardrobe Audit
- Styling Session
- Virtual Session
- Follow-up

**Features:**
- Calendar integration
- Time slot management
- Virtual meeting links
- Location tracking
- Status management (scheduled, confirmed, completed, cancelled)
- Reminder system
- Prep notes
- Fee tracking
- Payment status

### 3. 💡 Styling Recommendations

**Recommendation Types:**
- Outfit suggestions
- Purchase recommendations
- Wardrobe tips
- Color palette guidance
- Style guides

**Features:**
- Link to client's wardrobe items
- Suggested purchases with links
- Priority levels
- Occasion-specific recommendations
- Seasonal recommendations
- Client feedback and ratings
- Status tracking (draft, sent, viewed, implemented)

### 4. 📝 Stylist Notes

**Note Categories:**
- Observations
- Preferences
- Goals
- Measurements
- General notes

**Features:**
- Private notes (stylist-only)
- Client-visible notes
- Appointment-linked notes
- Tag system
- Search functionality

### 5. 📊 Business Analytics

**Statistics Tracked:**
- Total clients
- Active clients
- Upcoming appointments
- Completed sessions
- Total revenue
- Average rating
- Recommendations sent
- Recommendations implemented

### 6. 💼 Professional Profile

**Profile Information:**
- Business name
- Bio and specialties
- Certifications
- Years of experience
- Pricing structure
- Availability schedule
- Contact information
- Social media links
- Portfolio/website

---

## Data Models

### StylistProfile
```typescript
interface StylistProfile {
  id: string;
  accountType: 'stylist';
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  specialties: string[];
  certifications?: string[];
  yearsExperience?: number;
  profileImage?: string;
  businessName?: string;
  website?: string;
  instagram?: string;
  pricing?: {
    consultationFee?: number;
    hourlyRate?: number;
    packageRates?: Array<{
      name: string;
      price: number;
      description: string;
    }>;
  };
  availability?: {
    daysAvailable: string[];
    hoursAvailable: { start: string; end: string };
  };
  rating?: number;
  totalClients?: number;
  joinedDate: string;
  isActive: boolean;
}
```

### Client
```typescript
interface Client {
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
  wardrobeAccess: boolean;
  status: 'active' | 'inactive' | 'archived';
}
```

### Appointment
```typescript
interface Appointment {
  id: string;
  stylistId: string;
  clientId: string;
  clientName: string;
  type: 'consultation' | 'shopping' | 'wardrobe-audit' | 
        'styling-session' | 'virtual' | 'follow-up';
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  location?: string;
  isVirtual: boolean;
  meetingLink?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 
          'cancelled' | 'no-show';
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
```

### StylingRecommendation
```typescript
interface StylingRecommendation {
  id: string;
  stylistId: string;
  clientId: string;
  title: string;
  description: string;
  category: 'outfit' | 'purchase' | 'wardrobe-tip' | 
            'color-palette' | 'style-guide';
  items?: string[]; // ClothingItem IDs
  suggestedPurchases?: Array<{
    name: string;
    category: string;
    description: string;
    estimatedPrice?: number;
    links?: string[];
    priority: 'high' | 'medium' | 'low';
  }>;
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
```

---

## Services & APIs

### Account Management

```typescript
// Get current account type
const accountType = await getAccountType();

// Switch to stylist mode
await switchToStylistMode();

// Switch to user mode
await switchToUserMode();
```

### Stylist Profile

```typescript
// Get stylist profile
const profile = await getStylistProfile();

// Create stylist profile
const newProfile = await createStylistProfile({
  accountType: 'stylist',
  name: 'Emma Rodriguez',
  email: 'emma@stylishyou.com',
  specialties: ['Personal Shopping', 'Wardrobe Consultation'],
  // ... other fields
});

// Update stylist profile
await updateStylistProfile({
  bio: 'Updated bio text',
  yearsExperience: 10,
});
```

### Client Management

```typescript
// Get all clients
const clients = await getClients();

// Get active clients only
const activeClients = await getActiveClients();

// Get specific client
const client = await getClientById('client_123');

// Add new client
const newClient = await addClient({
  stylistId: 'stylist_001',
  name: 'Sarah Johnson',
  email: 'sarah@email.com',
  wardrobeAccess: true,
  // ... other fields
});

// Update client
await updateClient('client_123', {
  status: 'active',
  notes: 'Updated notes',
});

// Delete client
await deleteClient('client_123');
```

### Appointment Management

```typescript
// Get all appointments
const appointments = await getAppointments();

// Get upcoming appointments
const upcoming = await getUpcomingAppointments();

// Get appointments for specific client
const clientAppts = await getAppointmentsByClient('client_123');

// Create appointment
const newAppt = await createAppointment({
  stylistId: 'stylist_001',
  clientId: 'client_123',
  clientName: 'Sarah Johnson',
  type: 'consultation',
  date: '2026-02-15',
  startTime: '10:00',
  endTime: '11:00',
  duration: 60,
  status: 'scheduled',
  fee: 150,
  paid: false,
});

// Update appointment
await updateAppointment('appt_123', {
  status: 'completed',
  notes: 'Great session!',
});

// Delete appointment
await deleteAppointment('appt_123');
```

### Styling Recommendations

```typescript
// Get all recommendations
const recommendations = await getRecommendations();

// Get recommendations for client
const clientRecs = await getRecommendationsByClient('client_123');

// Create recommendation
const newRec = await createRecommendation({
  stylistId: 'stylist_001',
  clientId: 'client_123',
  title: 'Spring Wardrobe Refresh',
  description: 'Key pieces for spring season',
  category: 'purchase',
  suggestedPurchases: [
    {
      name: 'Linen Blazer',
      category: 'outerwear',
      description: 'Neutral linen blazer for versatility',
      estimatedPrice: 200,
      priority: 'high',
    },
  ],
});

// Send recommendation to client
await sendRecommendation('rec_123');

// Update recommendation
await updateRecommendation('rec_123', {
  status: 'implemented',
  clientFeedback: {
    rating: 5,
    comment: 'Love these suggestions!',
    date: new Date().toISOString(),
  },
});
```

### Stylist Notes

```typescript
// Get all notes
const notes = await getNotes();

// Get notes for specific client
const clientNotes = await getNotesByClient('client_123');

// Create note
const newNote = await createNote({
  stylistId: 'stylist_001',
  clientId: 'client_123',
  content: 'Client prefers earth tones',
  category: 'preference',
  isPrivate: true,
  tags: ['color', 'preference'],
});

// Update note
await updateNote('note_123', {
  content: 'Updated note content',
});

// Delete note
await deleteNote('note_123');
```

### Statistics

```typescript
// Get stylist statistics
const stats = await getStylistStats();
// Returns: {
//   totalClients: 15,
//   activeClients: 12,
//   upcomingAppointments: 5,
//   completedSessions: 87,
//   totalRevenue: 12500,
//   recommendationsSent: 45,
//   recommendationsImplemented: 32,
// }
```

---

## Screens & UI

### 1. Stylist Dashboard
**File:** `src/screens/StylistDashboardScreen.tsx`

**Features:**
- Welcome header with stylist name
- Statistics grid (clients, appointments, sessions, rating)
- Quick action buttons (Add Client, Schedule, Recommend, View Clients)
- Upcoming appointments list
- Revenue summary
- Pro tips section

**Navigation:**
```typescript
navigation.navigate('StylistDashboard');
```

### 2. Clients List
**File:** `src/screens/ClientsListScreen.tsx`

**Features:**
- Search functionality
- Filter by status (active, all, inactive)
- Client cards with avatar, name, email, session count
- Status indicators
- Add client button
- Empty state

**Navigation:**
```typescript
navigation.navigate('ClientsList');
```

### 3. Client Details
**File:** `src/screens/ClientDetailsScreen.tsx` (to be created)

**Features:**
- Client profile information
- Preferences and goals
- Session history
- Recommendations sent
- Notes section
- Wardrobe access
- Edit/delete options

### 4. Add/Edit Client
**File:** `src/screens/AddClientScreen.tsx` (to be created)

**Features:**
- Contact information form
- Style preferences
- Budget settings
- Size information
- Goals and notes
- Wardrobe access toggle

### 5. Appointments List
**File:** `src/screens/AppointmentsListScreen.tsx` (to be created)

**Features:**
- Calendar view
- List view
- Filter by status
- Upcoming vs past appointments
- Quick actions (confirm, cancel, complete)

### 6. Create Appointment
**File:** `src/screens/CreateAppointmentScreen.tsx` (to be created)

**Features:**
- Client selection
- Appointment type
- Date and time picker
- Duration
- Location/virtual toggle
- Fee and payment status
- Notes

### 7. Recommendations
**File:** `src/screens/RecommendationsScreen.tsx` (to be created)

**Features:**
- List of all recommendations
- Filter by client
- Filter by status
- Create new recommendation
- View/edit recommendations

### 8. Stylist Profile
**File:** `src/screens/StylistProfileScreen.tsx` (to be created)

**Features:**
- Edit profile information
- Manage specialties
- Update pricing
- Set availability
- View statistics
- Switch to user mode

---

## Usage Guide

### For Stylists

#### Getting Started

1. **Create Stylist Profile**
```typescript
import { createStylistProfile } from './services/stylistService';

const profile = await createStylistProfile({
  accountType: 'stylist',
  name: 'Your Name',
  email: 'your@email.com',
  specialties: ['Personal Shopping', 'Wardrobe Consultation'],
  yearsExperience: 5,
});
```

2. **Load Sample Data (for testing)**
```typescript
import { loadSampleStylistData } from './services/stylistService';

await loadSampleStylistData();
```

#### Daily Workflow

1. **Check Dashboard**
   - View upcoming appointments
   - Check new client inquiries
   - Review statistics

2. **Manage Clients**
   - Add new clients
   - Update client preferences
   - Review session history
   - Add notes after sessions

3. **Schedule Appointments**
   - Create new appointments
   - Confirm scheduled sessions
   - Mark completed sessions
   - Track payments

4. **Create Recommendations**
   - Draft styling recommendations
   - Link to client wardrobe items
   - Suggest purchases
   - Send to clients
   - Track implementation

5. **Track Business**
   - Monitor revenue
   - Review client satisfaction
   - Analyze recommendation success
   - Update availability

---

## Integration

### Adding Stylist Mode to Navigation

**Update App.tsx:**

```typescript
import { getAccountType } from './src/services/stylistService';
import StylistDashboardScreen from './src/screens/StylistDashboardScreen';
import ClientsListScreen from './src/screens/ClientsListScreen';

// In your navigation setup
const [accountType, setAccountType] = useState<'user' | 'stylist'>('user');

useEffect(() => {
  const loadAccountType = async () => {
    const type = await getAccountType();
    setAccountType(type);
  };
  loadAccountType();
}, []);

// Conditional navigation based on account type
{accountType === 'stylist' ? (
  <Tab.Screen 
    name="Dashboard" 
    component={StylistDashboardScreen}
    options={{
      tabBarIcon: ({ color }) => (
        <Icon name="briefcase-outline" size={24} color={color} />
      )
    }}
  />
) : (
  <Tab.Screen 
    name="Home" 
    component={HomeScreen}
    options={{
      tabBarIcon: ({ color }) => (
        <Icon name="home-outline" size={24} color={color} />
      )
    }}
  />
)}

<Tab.Screen 
  name="Clients" 
  component={ClientsListScreen}
  options={{
    tabBarIcon: ({ color }) => (
      <Icon name="people-outline" size={24} color={color} />
    )
  }}
/>
```

### Mode Switching

**Add to Settings Screen:**

```typescript
import { getAccountType, switchToStylistMode, switchToUserMode } from './services/stylistService';

const [accountType, setAccountType] = useState<'user' | 'stylist'>('user');

const handleSwitchMode = async () => {
  if (accountType === 'user') {
    await switchToStylistMode();
    setAccountType('stylist');
  } else {
    await switchToUserMode();
    setAccountType('user');
  }
  // Restart app or reload navigation
};

// In render:
<TouchableOpacity onPress={handleSwitchMode}>
  <Text>
    Switch to {accountType === 'user' ? 'Stylist' : 'User'} Mode
  </Text>
</TouchableOpacity>
```

---

## Sample Data

### Load Sample Stylist Data

```typescript
import { loadSampleStylistData } from './services/stylistService';

// This creates:
// - 1 sample stylist profile (Emma Rodriguez)
// - 3 sample clients (Sarah, Michael, Jessica)
// - 2 sample appointments
await loadSampleStylistData();
```

### Sample Stylist Profile
- **Name:** Emma Rodriguez
- **Business:** Stylish You Consulting
- **Experience:** 8 years
- **Specialties:** Personal Shopping, Wardrobe Consultation, Event Styling, Color Analysis
- **Pricing:** $150 consultation, $200/hour, packages from $800-$3000

### Sample Clients
1. **Sarah Johnson** - Corporate professional, 3 sessions
2. **Michael Chen** - Tech entrepreneur, 5 sessions
3. **Jessica Martinez** - Recent grad, 1 session

---

## Benefits

### For Stylists
✅ **Professional Business Management** - All-in-one platform  
✅ **Client Organization** - Centralized client information  
✅ **Appointment Tracking** - Never miss a session  
✅ **Revenue Tracking** - Monitor business performance  
✅ **Recommendation System** - Professional styling tools  
✅ **Client Wardrobe Access** - View and style client items  
✅ **Business Analytics** - Data-driven insights  

### For Clients
✅ **Professional Guidance** - Expert styling advice  
✅ **Personalized Recommendations** - Tailored to their style  
✅ **Wardrobe Optimization** - Make the most of existing items  
✅ **Shopping Assistance** - Smart purchase decisions  
✅ **Style Education** - Learn styling principles  

---

## Technical Details

### Storage Keys
- `@smartcloset_account_type` - Current account type
- `@smartcloset_stylist_profile` - Stylist profile data
- `@smartcloset_stylist_clients` - Clients list
- `@smartcloset_stylist_appointments` - Appointments
- `@smartcloset_stylist_recommendations` - Recommendations
- `@smartcloset_stylist_notes` - Stylist notes

### Dependencies
- `@react-native-async-storage/async-storage` - Data persistence
- `react-native-vector-icons` - Icons
- `react-native-linear-gradient` - Gradients
- `@react-navigation/native` - Navigation

### TypeScript Support
All types are fully typed with TypeScript interfaces in:
- `src/types/stylist.ts` - All stylist-related types
- Full IntelliSense support
- Type-safe API calls

---

## Future Enhancements

### Phase 2 Features
- [ ] Client messaging system
- [ ] Photo gallery for recommendations
- [ ] Calendar integration (Google Calendar, Apple Calendar)
- [ ] Payment processing integration
- [ ] Invoice generation
- [ ] Client portal (separate app/web view)
- [ ] Appointment reminders (push notifications)
- [ ] Analytics dashboard with charts
- [ ] Export reports (PDF, CSV)

### Phase 3 Features
- [ ] Multi-stylist support (team management)
- [ ] Booking system for clients
- [ ] Online consultation (video call integration)
- [ ] Social media integration
- [ ] Marketing tools
- [ ] Client referral system
- [ ] Loyalty programs
- [ ] Inventory management for stylists

---

## Testing

### Test Stylist Features

1. **Load Sample Data**
```typescript
await loadSampleStylistData();
```

2. **Switch to Stylist Mode**
```typescript
await switchToStylistMode();
```

3. **Navigate to Dashboard**
```typescript
navigation.navigate('StylistDashboard');
```

4. **Test Client Management**
- View clients list
- Add new client
- Edit client details
- View client profile

5. **Test Appointments**
- Create appointment
- Update status
- Mark as completed

6. **Test Recommendations**
- Create recommendation
- Send to client
- Track status

---

## Support

### Common Issues

**Q: How do I switch between user and stylist mode?**  
A: Use `switchToStylistMode()` or `switchToUserMode()` from stylistService.

**Q: Can a stylist also use the app as a personal user?**  
A: Yes! The app supports both modes. Switch as needed.

**Q: How is client data stored?**  
A: All data is stored locally using AsyncStorage. For production, consider cloud sync.

**Q: Can clients see stylist notes?**  
A: Only if `isPrivate: false`. Private notes are stylist-only.

**Q: How do I access a client's wardrobe?**  
A: Client must grant `wardrobeAccess: true` in their profile.

---

## Summary

The Stylist Account System transforms SmartCloset into a comprehensive professional tool for personal stylists while maintaining all personal wardrobe management features. With client management, appointment scheduling, styling recommendations, and business analytics, stylists can run their entire business through the app.

**Key Features:**
- 👥 Client Management
- 📅 Appointment Scheduling  
- 💡 Styling Recommendations
- 📝 Professional Notes
- 📊 Business Analytics
- 💼 Professional Profile
- 🔄 Dual Mode (User/Stylist)

**Status:** ✅ Core features implemented and ready for testing

---

**Version:** 1.0.0  
**Last Updated:** February 10, 2026  
**Created By:** SmartCloset Development Team  

Made with 💜 for professional stylists
