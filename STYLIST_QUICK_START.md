# Stylist Account - Quick Start Guide

Get started with the professional personal stylist features in 5 minutes.

## 🚀 Quick Setup

### Step 1: Load Sample Stylist Data

Add this to your app (e.g., in Settings screen or a test button):

```typescript
import { loadSampleStylistData } from './src/services/stylistService';

// Load sample data
await loadSampleStylistData();
```

This creates:
- ✅ 1 stylist profile (Emma Rodriguez)
- ✅ 3 sample clients
- ✅ 2 upcoming appointments

### Step 2: Add Stylist Screens to Navigation

Update your `App.tsx`:

```typescript
import StylistDashboardScreen from './src/screens/StylistDashboardScreen';
import ClientsListScreen from './src/screens/ClientsListScreen';

// Add to your tab navigator:
<Tab.Screen 
  name="StylistDashboard" 
  component={StylistDashboardScreen}
  options={{
    title: 'Dashboard',
    tabBarIcon: ({ color }) => (
      <Icon name="briefcase-outline" size={24} color={color} />
    )
  }}
/>

<Tab.Screen 
  name="ClientsList" 
  component={ClientsListScreen}
  options={{
    title: 'Clients',
    tabBarIcon: ({ color }) => (
      <Icon name="people-outline" size={24} color={color} />
    )
  }}
/>
```

### Step 3: Test the Features

1. **View Dashboard**
   - Navigate to Stylist Dashboard
   - See statistics (3 active clients, 2 upcoming appointments)
   - View upcoming appointments

2. **Browse Clients**
   - Tap "Clients" or "See All" on dashboard
   - View 3 sample clients
   - Search for clients
   - Filter by status

3. **View Client Details**
   - Tap on any client card
   - See profile, preferences, session history
   - (Note: Details screen needs to be created)

---

## 📱 Testing Without Navigation Changes

If you want to test without modifying navigation, add a test button:

```typescript
import { loadSampleStylistData, getStylistProfile, getClients } from './src/services/stylistService';

const TestStylistButton = () => {
  const handleTest = async () => {
    // Load sample data
    await loadSampleStylistData();
    
    // Get stylist profile
    const profile = await getStylistProfile();
    console.log('Stylist Profile:', profile);
    
    // Get clients
    const clients = await getClients();
    console.log('Clients:', clients);
    
    Alert.alert('Success', `Loaded ${clients.length} clients`);
  };

  return (
    <TouchableOpacity onPress={handleTest} style={styles.testButton}>
      <Text>Load Stylist Sample Data</Text>
    </TouchableOpacity>
  );
};
```

---

## 🎯 What You Can Test Now

### ✅ Working Features

1. **Stylist Profile Management**
   ```typescript
   const profile = await getStylistProfile();
   await updateStylistProfile({ bio: 'New bio' });
   ```

2. **Client Management**
   ```typescript
   const clients = await getClients();
   const activeClients = await getActiveClients();
   await addClient({ name: 'New Client', email: 'test@email.com', ... });
   ```

3. **Appointment Scheduling**
   ```typescript
   const appointments = await getAppointments();
   const upcoming = await getUpcomingAppointments();
   await createAppointment({ ... });
   ```

4. **Styling Recommendations**
   ```typescript
   const recommendations = await getRecommendations();
   await createRecommendation({ ... });
   ```

5. **Business Statistics**
   ```typescript
   const stats = await getStylistStats();
   // Returns: clients, appointments, revenue, etc.
   ```

### 🚧 Screens to Create

These screens are referenced but need to be built:

1. **ClientDetailsScreen** - View/edit individual client
2. **AddClientScreen** - Add new client form
3. **AppointmentsListScreen** - Full appointments calendar
4. **CreateAppointmentScreen** - Schedule new appointment
5. **AppointmentDetailsScreen** - View/edit appointment
6. **RecommendationsScreen** - List all recommendations
7. **CreateRecommendationScreen** - Create new recommendation
8. **StylistProfileScreen** - Edit stylist profile

---

## 💡 Sample Data Overview

### Stylist Profile
- **Name:** Emma Rodriguez
- **Business:** Stylish You Consulting
- **Experience:** 8 years
- **Specialties:** Personal Shopping, Wardrobe Consultation, Event Styling, Color Analysis
- **Pricing:** 
  - Consultation: $150
  - Hourly Rate: $200
  - Packages: $800 - $3,000

### Sample Clients

**1. Sarah Johnson**
- Corporate professional
- 3 sessions completed
- Style: Classic, Business Professional, Minimalist
- Budget: $100-$500
- Goals: Build executive wardrobe

**2. Michael Chen**
- Tech entrepreneur
- 5 sessions completed
- Style: Smart Casual, Contemporary, Athleisure
- Budget: $80-$400
- Goals: Upgrade casual wardrobe

**3. Jessica Martinez**
- Recent college grad
- 1 session completed
- Style: Modern, Feminine, Business Casual
- Budget: $30-$150
- Goals: Build professional wardrobe on budget

### Sample Appointments

**1. Tomorrow - Sarah Johnson**
- Type: Wardrobe Audit
- Time: 10:00 AM - 12:00 PM
- Location: Client's home
- Fee: $300 (paid)
- Status: Confirmed

**2. Next Week - Michael Chen**
- Type: Personal Shopping
- Time: 2:00 PM - 5:00 PM
- Location: Nordstrom Downtown
- Fee: $400 (unpaid)
- Status: Scheduled

---

## 🔄 Account Switching

Switch between user and stylist modes:

```typescript
import { switchToStylistMode, switchToUserMode, getAccountType } from './src/services/stylistService';

// Check current mode
const currentMode = await getAccountType(); // 'user' or 'stylist'

// Switch to stylist mode
await switchToStylistMode();

// Switch back to user mode
await switchToUserMode();
```

---

## 📊 API Examples

### Create a New Client

```typescript
import { addClient } from './src/services/stylistService';

const newClient = await addClient({
  stylistId: 'stylist_sample_001',
  name: 'Jane Doe',
  email: 'jane@email.com',
  phone: '+1 (555) 123-4567',
  wardrobeAccess: true,
  preferences: {
    style: ['Casual', 'Bohemian'],
    colors: ['Earth tones', 'Neutrals'],
    budget: { min: 50, max: 300 },
    sizes: {
      tops: 'M',
      bottoms: '8',
      shoes: '8',
    },
  },
  goals: ['Develop personal style', 'Build capsule wardrobe'],
});
```

### Schedule an Appointment

```typescript
import { createAppointment } from './src/services/stylistService';

const appointment = await createAppointment({
  stylistId: 'stylist_sample_001',
  clientId: 'client_001',
  clientName: 'Sarah Johnson',
  type: 'consultation',
  date: '2026-02-20',
  startTime: '14:00',
  endTime: '15:00',
  duration: 60,
  isVirtual: true,
  meetingLink: 'https://zoom.us/j/123456789',
  status: 'scheduled',
  fee: 150,
  paid: false,
  notes: 'Initial consultation for spring wardrobe',
});
```

### Create a Styling Recommendation

```typescript
import { createRecommendation } from './src/services/stylistService';

const recommendation = await createRecommendation({
  stylistId: 'stylist_sample_001',
  clientId: 'client_001',
  title: 'Spring Wardrobe Essentials',
  description: 'Key pieces to refresh your wardrobe for spring',
  category: 'purchase',
  suggestedPurchases: [
    {
      name: 'White Linen Shirt',
      category: 'tops',
      description: 'Versatile piece for casual and business looks',
      estimatedPrice: 89,
      priority: 'high',
    },
    {
      name: 'Wide-Leg Trousers',
      category: 'bottoms',
      description: 'On-trend and comfortable',
      estimatedPrice: 120,
      priority: 'medium',
    },
  ],
  season: ['spring', 'summer'],
  notes: 'Focus on breathable fabrics and neutral colors',
});

// Send to client
await sendRecommendation(recommendation.id);
```

### Add a Note

```typescript
import { createNote } from './src/services/stylistService';

const note = await createNote({
  stylistId: 'stylist_sample_001',
  clientId: 'client_001',
  content: 'Client mentioned upcoming job interview - needs professional outfit',
  category: 'observation',
  isPrivate: false, // Client can see this
  tags: ['interview', 'professional', 'urgent'],
});
```

---

## 🎨 UI Components

### Dashboard Stats Display

The dashboard shows:
- **Active Clients** - Purple card with people icon
- **Upcoming Appointments** - Blue card with calendar icon
- **Completed Sessions** - Green card with checkmark icon
- **Rating** - Yellow card with star icon

### Quick Actions

Four gradient buttons:
- **Add Client** - Purple gradient
- **Schedule** - Blue gradient
- **Recommend** - Green gradient
- **Clients** - Orange gradient

### Appointment Cards

Each appointment shows:
- Client name
- Appointment type (with icon)
- Date and time
- Status badge (confirmed/scheduled)

---

## 🐛 Troubleshooting

### Data Not Showing?

```typescript
// Clear all data and reload
import AsyncStorage from '@react-native-async-storage/async-storage';

await AsyncStorage.multiRemove([
  '@smartcloset_stylist_profile',
  '@smartcloset_stylist_clients',
  '@smartcloset_stylist_appointments',
]);

// Then reload sample data
await loadSampleStylistData();
```

### Navigation Errors?

Make sure you've imported the screens:
```typescript
import StylistDashboardScreen from './src/screens/StylistDashboardScreen';
import ClientsListScreen from './src/screens/ClientsListScreen';
```

### TypeScript Errors?

Import types:
```typescript
import { StylistProfile, Client, Appointment } from './src/types/stylist';
```

---

## 📝 Next Steps

### Immediate (Can Test Now)
1. ✅ Load sample data
2. ✅ View stylist dashboard
3. ✅ Browse clients list
4. ✅ Test search and filters
5. ✅ Check statistics

### Short Term (Need to Build)
1. Client details screen
2. Add client form
3. Appointment creation
4. Recommendations interface

### Long Term (Future Features)
1. Calendar integration
2. Push notifications
3. Payment processing
4. Client messaging
5. Analytics charts

---

## 🎉 You're Ready!

The stylist account system is now set up with:
- ✅ Complete data models
- ✅ Full service layer
- ✅ Dashboard screen
- ✅ Clients list screen
- ✅ Sample data for testing
- ✅ Comprehensive documentation

**Start testing by:**
1. Running `await loadSampleStylistData()`
2. Navigating to the Stylist Dashboard
3. Exploring the clients list
4. Checking the statistics

For full documentation, see `STYLIST_ACCOUNT_SYSTEM.md`

---

**Happy Styling!** 💜✨
