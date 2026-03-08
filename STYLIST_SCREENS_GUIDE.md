# Stylist Screens - Complete Guide

Documentation for the three core stylist screens: Client Details, Appointment Creation, and Recommendations Interface.

---

## 📱 Screens Overview

### 1. Client Details Screen
**File:** `src/screens/ClientDetailsScreen.tsx`  
**Purpose:** Comprehensive view of individual client information, history, and interactions

### 2. Create Appointment Screen
**File:** `src/screens/CreateAppointmentScreen.tsx`  
**Purpose:** Schedule new appointments with clients

### 3. Recommendations Screen
**File:** `src/screens/RecommendationsScreen.tsx`  
**Purpose:** Browse, filter, and manage all styling recommendations

---

## 1️⃣ Client Details Screen

### Features

**Profile Header**
- Client avatar (image or initials)
- Name and email
- Status indicator (active/inactive)
- Edit and delete buttons
- Statistics: Sessions, Recommendations, Appointments

**Quick Actions**
- Schedule appointment
- Create recommendation
- Add note
- Toggle active/inactive status

**Contact Information**
- Email address
- Phone number
- Client since date
- Last session date

**Style Preferences**
- Preferred styles (tags)
- Favorite colors (tags)
- Budget range
- Clothing sizes (tops, bottoms, shoes, dresses)
- Body type
- Lifestyle description

**Goals**
- List of client's styling goals
- Checkmark icons for visual appeal

**Notes**
- General notes about the client
- Visible to both stylist and client

**Recent Appointments**
- Last 3 appointments
- Type, date, time, status
- Tap to view details
- "See All" link

**Recommendations**
- Last 3 recommendations
- Title, category, status
- Tap to view details
- "See All" link

### Navigation

```typescript
// Navigate to client details
navigation.navigate('ClientDetails', { 
  client: clientObject 
});

// Or with just ID
navigation.navigate('ClientDetails', { 
  clientId: 'client_123' 
});
```

### Actions Available

```typescript
// Edit client
navigation.navigate('EditClient', { client });

// Delete client (with confirmation)
handleDeleteClient(); // Shows alert

// Toggle status
handleToggleStatus(); // Active ↔ Inactive

// Schedule appointment
navigation.navigate('CreateAppointment', { 
  clientId: client.id, 
  clientName: client.name 
});

// Create recommendation
navigation.navigate('CreateRecommendation', { 
  clientId: client.id, 
  clientName: client.name 
});

// Add note
navigation.navigate('AddNote', { clientId: client.id });
```

### UI Design

**Header Gradient**
- Purple gradient background
- White text
- Profile image/initials
- Status badge
- Statistics row

**Content Cards**
- White background
- Rounded corners (16px)
- Subtle shadows
- Organized sections

**Color Coding**
- Active status: Green (#10B981)
- Inactive status: Orange (#F59E0B)
- Completed appointments: Green background
- Scheduled appointments: Blue background

---

## 2️⃣ Create Appointment Screen

### Features

**Client Selection**
- Dropdown picker
- Shows active clients only
- Pre-selectable from client details
- Search-friendly

**Appointment Type Selection**
- 6 types with icons:
  - Consultation (60 min)
  - Personal Shopping (180 min)
  - Wardrobe Audit (120 min)
  - Styling Session (90 min)
  - Virtual Session (60 min)
  - Follow-up (30 min)
- Auto-sets duration based on type
- Visual card selection

**Date & Time**
- Date input (YYYY-MM-DD)
- Start time input (HH:MM)
- Auto-calculates end time
- Shows calculated end time

**Duration**
- Quick select buttons: 30m, 60m, 90m, 120m, 180m
- Highlights selected duration
- Updates end time automatically

**Virtual Toggle**
- Switch for virtual/in-person
- Shows meeting link field if virtual
- Shows location field if in-person

**Location/Meeting Link**
- Required based on virtual toggle
- Location for in-person
- Meeting link (Zoom, etc.) for virtual

**Fee & Payment**
- Optional fee amount
- Paid toggle switch
- Decimal input for fee

**Notes**
- Prep notes (for stylist preparation)
- General notes (session notes)
- Multi-line text areas

### Form Validation

```typescript
// Required fields
- Client selection
- Date
- Start time
- Location (if not virtual) OR Meeting link (if virtual)

// Optional fields
- Fee
- Payment status
- Prep notes
- General notes
```

### Navigation

```typescript
// Create appointment
navigation.navigate('CreateAppointment');

// Pre-select client
navigation.navigate('CreateAppointment', {
  clientId: 'client_123',
  clientName: 'Sarah Johnson'
});
```

### Form Submission

```typescript
const handleCreate = async () => {
  // Validates required fields
  // Calculates end time
  // Creates appointment
  // Shows success alert
  // Returns to previous screen
};
```

### UI Design

**Header**
- Close button (left)
- "New Appointment" title
- Create button (right, purple)

**Form Sections**
- Clean white background
- Grouped inputs
- Clear labels
- Helper text for end time

**Type Selection**
- Grid layout (3 columns)
- Icon + label
- Active state with purple border
- Purple background when selected

**Duration Buttons**
- Horizontal row
- Equal width
- Purple when selected
- Shows minutes (e.g., "60m")

---

## 3️⃣ Recommendations Screen

### Features

**Header**
- Title: "Recommendations"
- Add button (purple gradient, floating)
- Search bar
- Filter tabs

**Search**
- Real-time search
- Searches: title, description, client name
- Clear button when typing

**Filter Tabs**
- All (count)
- Draft (count)
- Sent (count)
- Implemented (count)
- Horizontal scroll
- Active state highlighting

**Recommendation Cards**
- Category badge with icon
- Status badge with color coding
- Title (bold, large)
- Description (2 lines max)
- Client name with icon
- Creation date
- Suggested purchases count (if any)
- Client rating (if provided)

**Category Icons**
- Outfit: shirt-outline
- Purchase: cart-outline
- Wardrobe Tip: bulb-outline
- Color Palette: color-palette-outline
- Style Guide: book-outline

**Status Colors**
- Draft: Gray (#9CA3AF)
- Sent: Blue (#3B82F6)
- Viewed: Orange (#F59E0B)
- Implemented: Green (#10B981)

### Navigation

```typescript
// View recommendations
navigation.navigate('Recommendations');

// Create new recommendation
navigation.navigate('CreateRecommendation');

// View recommendation details
navigation.navigate('RecommendationDetails', { 
  recommendation: recObject 
});

// Filter by client
navigation.navigate('RecommendationsList', { 
  clientId: 'client_123' 
});
```

### Data Display

```typescript
// Card shows:
- Category badge (top left)
- Status badge (top right)
- Title
- Description (truncated)
- Client name
- Creation date
- Purchase count (if applicable)
- Rating (if provided)
```

### Empty States

**No Recommendations**
- Lightbulb icon
- "No recommendations found"
- Helpful message
- "Create Recommendation" button

**No Search Results**
- Same icon
- "No recommendations found"
- "Try adjusting your search"
- No button (just clear search)

### UI Design

**Header Section**
- White background
- Large title
- Gradient add button
- Search bar (gray background)
- Horizontal filter tabs

**Recommendation Cards**
- White background
- Rounded corners (16px)
- Subtle shadow
- Organized information hierarchy
- Color-coded status badges

**Layout**
- FlatList for performance
- Padding around cards
- Smooth scrolling
- Pull to refresh (future)

---

## 🔗 Navigation Flow

### From Dashboard
```
Dashboard → Clients List → Client Details
Dashboard → Quick Action: Add Client
Dashboard → Quick Action: Schedule → Create Appointment
Dashboard → Quick Action: Recommend → Recommendations
```

### From Client Details
```
Client Details → Edit Client
Client Details → Schedule → Create Appointment
Client Details → Recommend → Create Recommendation
Client Details → Add Note
Client Details → View Appointment → Appointment Details
Client Details → View Recommendation → Recommendation Details
```

### From Recommendations
```
Recommendations → Create Recommendation
Recommendations → Recommendation Details
```

---

## 🎨 Design System

### Colors

**Primary Actions**
- Purple: `#8B7FD9`
- Purple Gradient: `['#8B7FD9', '#A599E9']`

**Status Colors**
- Active/Success: `#10B981`
- Warning/Pending: `#F59E0B`
- Info/Scheduled: `#3B82F6`
- Inactive/Draft: `#9CA3AF`
- Error: `#EF4444`

**Backgrounds**
- Screen: `#F8F7FF`
- Card: `#FFFFFF`
- Input: `#F3F4F6`

**Text**
- Primary: `#1F1B2E`
- Secondary: `#6B7280`
- Disabled: `#9CA3AF`

### Typography

**Headers**
- Large: 28px, bold
- Medium: 20px, bold
- Small: 18px, bold

**Body**
- Regular: 16px
- Small: 14px
- Caption: 13px

**Labels**
- 14px, medium weight
- 12px for badges

### Spacing

- Section padding: 20px
- Card padding: 16px
- Element gap: 12px
- Small gap: 8px

### Border Radius

- Cards: 16px
- Buttons: 12px
- Badges: 20px (pill)
- Small badges: 12px

---

## 📋 Integration Checklist

### Add to Navigation

```typescript
// In your navigation stack/tabs:

<Stack.Screen 
  name="ClientDetails" 
  component={ClientDetailsScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen 
  name="CreateAppointment" 
  component={CreateAppointmentScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen 
  name="Recommendations" 
  component={RecommendationsScreen}
  options={{ headerShown: false }}
/>
```

### Import Screens

```typescript
import ClientDetailsScreen from './src/screens/ClientDetailsScreen';
import CreateAppointmentScreen from './src/screens/CreateAppointmentScreen';
import RecommendationsScreen from './src/screens/RecommendationsScreen';
```

### Test Navigation

```typescript
// From ClientsList
navigation.navigate('ClientDetails', { client });

// From anywhere
navigation.navigate('CreateAppointment', { 
  clientId: 'client_123',
  clientName: 'Sarah Johnson'
});

// From dashboard or menu
navigation.navigate('Recommendations');
```

---

## 🧪 Testing Guide

### Test Client Details Screen

1. **Load client data**
   ```typescript
   await loadSampleStylistData();
   const clients = await getClients();
   navigation.navigate('ClientDetails', { client: clients[0] });
   ```

2. **Verify sections display:**
   - Profile header with stats
   - Quick actions (4 buttons)
   - Contact information
   - Style preferences
   - Goals
   - Recent appointments
   - Recommendations

3. **Test actions:**
   - Edit button → Should navigate to edit screen
   - Delete button → Should show confirmation
   - Schedule button → Should navigate with client pre-selected
   - Recommend button → Should navigate with client pre-selected
   - Toggle status → Should update immediately

### Test Create Appointment Screen

1. **Open form**
   ```typescript
   navigation.navigate('CreateAppointment');
   ```

2. **Fill out form:**
   - Select client
   - Choose appointment type
   - Set date and time
   - Adjust duration
   - Toggle virtual/in-person
   - Enter location or meeting link
   - Add fee (optional)
   - Add notes (optional)

3. **Verify:**
   - End time calculates correctly
   - Virtual toggle shows/hides correct fields
   - Required field validation works
   - Success alert appears
   - Returns to previous screen

### Test Recommendations Screen

1. **Load recommendations**
   ```typescript
   await loadSampleStylistData();
   navigation.navigate('Recommendations');
   ```

2. **Test features:**
   - Search for recommendations
   - Filter by status
   - View counts on filter tabs
   - Tap card to view details
   - Tap add button to create new

3. **Verify:**
   - Cards display correctly
   - Status colors are correct
   - Search works in real-time
   - Filters update counts
   - Empty state shows when no results

---

## 🚀 Quick Start

### 1. Add Screens to Navigation

```typescript
// App.tsx or your navigation file
import ClientDetailsScreen from './src/screens/ClientDetailsScreen';
import CreateAppointmentScreen from './src/screens/CreateAppointmentScreen';
import RecommendationsScreen from './src/screens/RecommendationsScreen';

// In your Stack.Navigator:
<Stack.Screen name="ClientDetails" component={ClientDetailsScreen} />
<Stack.Screen name="CreateAppointment" component={CreateAppointmentScreen} />
<Stack.Screen name="Recommendations" component={RecommendationsScreen} />
```

### 2. Load Sample Data

```typescript
import { loadSampleStylistData } from './src/services/stylistService';

// In your app initialization or settings
await loadSampleStylistData();
```

### 3. Navigate to Screens

```typescript
// From ClientsList
const client = await getClientById('client_001');
navigation.navigate('ClientDetails', { client });

// Create appointment
navigation.navigate('CreateAppointment');

// View recommendations
navigation.navigate('Recommendations');
```

---

## 📊 Data Requirements

### Client Details Screen
- Client object with full profile
- Appointments for client
- Recommendations for client
- Notes for client

### Create Appointment Screen
- List of active clients
- Stylist ID (from auth/context)

### Recommendations Screen
- All recommendations
- All clients (for name lookup)

---

## 🎯 Future Enhancements

### Client Details
- [ ] Edit client inline
- [ ] Photo upload
- [ ] Wardrobe preview
- [ ] Session timeline
- [ ] Revenue from client

### Create Appointment
- [ ] Calendar date picker
- [ ] Time picker UI
- [ ] Recurring appointments
- [ ] Send confirmation email
- [ ] Add to calendar

### Recommendations
- [ ] Drag to reorder
- [ ] Bulk actions
- [ ] Export recommendations
- [ ] Templates
- [ ] Photo attachments
- [ ] Share via email/SMS

---

## 📝 Summary

**Three Essential Screens Created:**

1. **Client Details** - Complete client profile and history
2. **Create Appointment** - Full-featured appointment scheduling
3. **Recommendations** - Comprehensive recommendation management

**Key Features:**
- ✅ Beautiful, modern UI with purple theme
- ✅ Full CRUD operations
- ✅ Real-time search and filtering
- ✅ Comprehensive data display
- ✅ Intuitive navigation
- ✅ Form validation
- ✅ Empty states
- ✅ Status indicators
- ✅ Quick actions

**Ready to Use:**
- All screens fully functional
- TypeScript typed
- Integrated with stylist service
- Consistent design system
- Production-ready code

---

**Version:** 1.0.0  
**Last Updated:** February 10, 2026  
**Screens:** 3  
**Total Lines:** ~1,500  

Made with 💜 for professional stylists
