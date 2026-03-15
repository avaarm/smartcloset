# SmartCloset → Supabase Migration Guide

This guide walks through every step to migrate SmartCloset from AsyncStorage to Supabase (database + auth).

---

## Step 1 — Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New Project**.
3. Choose your organization, name it `smartcloset`, pick a strong database password, and select the region closest to you.
4. Wait ~2 minutes for the project to provision.
5. Once ready, go to **Settings → API** and copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon / public key** (starts with `eyJ...`)

You'll paste these into the app in Step 4.

---

## Step 2 — Create the Database Schema

Go to **SQL Editor** in the Supabase dashboard and run the following SQL. This creates all the tables matching SmartCloset's current data model.

### 2a. Core Tables (Wardrobe)

```sql
-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  profile_image TEXT,
  account_type TEXT DEFAULT 'user' CHECK (account_type IN ('user', 'stylist', 'client')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Clothing Items
CREATE TABLE clothing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories')),
  retailer_image TEXT,
  user_image TEXT,
  brand TEXT,
  color TEXT NOT NULL,
  season TEXT[] DEFAULT '{}',
  date_added TIMESTAMPTZ DEFAULT now(),
  is_wishlist BOOLEAN DEFAULT false,
  wear_count INTEGER DEFAULT 0,
  last_worn TIMESTAMPTZ,
  cost DECIMAL(10,2),
  purchase_date TIMESTAMPTZ,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  favorite BOOLEAN DEFAULT false,
  retailer TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Outfits
CREATE TABLE outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  item_ids UUID[] DEFAULT '{}',
  season TEXT[] DEFAULT '{}',
  occasion TEXT,
  date_created TIMESTAMPTZ DEFAULT now(),
  last_worn TIMESTAMPTZ,
  wear_count INTEGER DEFAULT 0,
  favorite BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Outfit Wear History
CREATE TABLE outfit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_id UUID REFERENCES outfits(id) ON DELETE SET NULL,
  date_worn TIMESTAMPTZ DEFAULT now(),
  occasion TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2b. Stylist Tables

```sql
-- Stylist Profiles
CREATE TABLE stylist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  bio TEXT,
  specialties TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  years_experience INTEGER DEFAULT 0,
  website TEXT,
  instagram TEXT,
  consultation_fee DECIMAL(10,2),
  hourly_rate DECIMAL(10,2),
  days_available TEXT[] DEFAULT '{}',
  hours_start TEXT,
  hours_end TEXT,
  rating DECIMAL(3,2),
  total_clients INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stylist-Client Relationships
CREATE TABLE stylist_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'paused', 'ended')),
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  total_sessions INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  wardrobe_access_granted BOOLEAN DEFAULT false,
  communication_preference TEXT DEFAULT 'in-app',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stylist_id, client_id)
);

-- Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT,
  type TEXT CHECK (type IN ('consultation', 'shopping', 'wardrobe-audit', 'styling-session', 'virtual', 'follow-up')),
  date TIMESTAMPTZ NOT NULL,
  start_time TEXT,
  end_time TEXT,
  duration INTEGER,
  location TEXT,
  is_virtual BOOLEAN DEFAULT false,
  meeting_link TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show')),
  notes TEXT,
  prep_notes TEXT,
  fee DECIMAL(10,2),
  paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Styling Recommendations
CREATE TABLE styling_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('outfit', 'purchase', 'wardrobe-tip', 'color-palette', 'style-guide')),
  item_ids UUID[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  occasion TEXT,
  season TEXT[] DEFAULT '{}',
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'implemented')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  feedback_rating INTEGER,
  feedback_comment TEXT,
  feedback_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID,
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type TEXT CHECK (sender_type IN ('stylist', 'client')),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Message Threads
CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_stylist INTEGER DEFAULT 0,
  unread_client INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stylist_id, client_id)
);

-- Booking Requests
CREATE TABLE booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  requested_service TEXT,
  preferred_date TIMESTAMPTZ,
  preferred_time TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'converted')),
  appointment_id UUID REFERENCES appointments(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Stylist Reviews
CREATE TABLE stylist_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID NOT NULL REFERENCES stylist_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  appointment_id UUID REFERENCES appointments(id),
  helpful INTEGER DEFAULT 0,
  response_content TEXT,
  response_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2c. Indexes (for performance)

```sql
CREATE INDEX idx_clothing_items_user ON clothing_items(user_id);
CREATE INDEX idx_clothing_items_category ON clothing_items(user_id, category);
CREATE INDEX idx_clothing_items_wishlist ON clothing_items(user_id, is_wishlist);
CREATE INDEX idx_outfits_user ON outfits(user_id);
CREATE INDEX idx_outfit_history_user ON outfit_history(user_id);
CREATE INDEX idx_outfit_history_outfit ON outfit_history(outfit_id);
CREATE INDEX idx_appointments_stylist ON appointments(stylist_id);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_created ON messages(thread_id, created_at);
CREATE INDEX idx_stylist_clients_stylist ON stylist_clients(stylist_id);
CREATE INDEX idx_stylist_clients_client ON stylist_clients(client_id);
```

---

## Step 3 — Set Up Row Level Security (RLS)

RLS ensures users can only access their own data. Run this in the SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clothing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE styling_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_reviews ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Clothing Items: users manage their own items
CREATE POLICY "Users can view own items" ON clothing_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own items" ON clothing_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON clothing_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own items" ON clothing_items FOR DELETE USING (auth.uid() = user_id);

-- Outfits: users manage their own outfits
CREATE POLICY "Users can view own outfits" ON outfits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own outfits" ON outfits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own outfits" ON outfits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own outfits" ON outfits FOR DELETE USING (auth.uid() = user_id);

-- Outfit History: users manage their own history
CREATE POLICY "Users can view own history" ON outfit_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON outfit_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own history" ON outfit_history FOR DELETE USING (auth.uid() = user_id);

-- Stylist Profiles: stylists manage own, clients can view their stylist
CREATE POLICY "Stylists can manage own profile" ON stylist_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view active stylists" ON stylist_profiles FOR SELECT USING (is_active = true);

-- Stylist Clients: visible to the stylist and the client
CREATE POLICY "Stylist can view own clients" ON stylist_clients FOR ALL
  USING (stylist_id IN (SELECT id FROM stylist_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Client can view own relationships" ON stylist_clients FOR SELECT
  USING (auth.uid() = client_id);

-- Appointments: visible to both stylist and client
CREATE POLICY "Stylist can manage appointments" ON appointments FOR ALL
  USING (stylist_id IN (SELECT id FROM stylist_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Client can view own appointments" ON appointments FOR SELECT
  USING (auth.uid() = client_id);

-- Messages: visible to both parties
CREATE POLICY "Users can view own messages" ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = client_id
    OR stylist_id IN (SELECT id FROM stylist_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can send messages" ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Message Threads: visible to both parties
CREATE POLICY "Users can view own threads" ON message_threads FOR SELECT
  USING (auth.uid() = client_id
    OR stylist_id IN (SELECT id FROM stylist_profiles WHERE user_id = auth.uid()));

-- Booking Requests
CREATE POLICY "Clients can create bookings" ON booking_requests FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Stylists can view bookings" ON booking_requests FOR SELECT
  USING (stylist_id IN (SELECT id FROM stylist_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Clients can view own bookings" ON booking_requests FOR SELECT
  USING (auth.uid() = client_id);

-- Styling Recommendations
CREATE POLICY "Stylists manage recommendations" ON styling_recommendations FOR ALL
  USING (stylist_id IN (SELECT id FROM stylist_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Clients view own recommendations" ON styling_recommendations FOR SELECT
  USING (auth.uid() = client_id);

-- Reviews: anyone can read, clients can write
CREATE POLICY "Anyone can view reviews" ON stylist_reviews FOR SELECT USING (true);
CREATE POLICY "Clients can write reviews" ON stylist_reviews FOR INSERT WITH CHECK (auth.uid() = client_id);
```

---

## Step 4 — Configure Supabase Client in the App

Create a `.env` file in the project root (and add it to `.gitignore`):

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Then create the Supabase client file:

**File:** `src/config/supabase.ts`

```typescript
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // ← Replace
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_KEY';  // ← Replace

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## Step 5 — Enable Auth Providers in Dashboard

1. Go to **Authentication → Providers** in Supabase dashboard.
2. **Email:** Already enabled by default. Toggle "Confirm email" off for testing.
3. **Apple:**
   - Enable Apple provider.
   - Follow Supabase's Apple sign-in guide to create an App ID, Service ID, and key in the Apple Developer portal.
   - Paste the Service ID, Team ID, and Key into Supabase.
4. **Google:**
   - Enable Google provider.
   - Create an OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com).
   - You need **two** client IDs: one for web (paste into Supabase) and one for iOS (use in the app).
   - Add the Supabase callback URL (shown in the dashboard) as an authorized redirect URI in Google Cloud.

---

## Step 6 — Create the Auth Service

**File:** `src/services/authService.ts`

```typescript
import { supabase } from '../config/supabase';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';

// Configure Google Sign-In (call once at app startup)
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',  // ← Replace
    webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',  // ← Replace
  });
};

// Sign in with Email & Password
export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

// Sign up with Email & Password
export const signUpWithEmail = async (email: string, password: string, name?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;

  // Create profile row
  if (data.user) {
    await supabase.from('profiles').insert({
      id: data.user.id,
      name: name || '',
      email,
    });
  }
  return data;
};

// Sign in with Google
export const signInWithGoogle = async () => {
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult?.data?.idToken;
  if (!idToken) throw new Error('No Google ID token');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  return data;
};

// Sign in with Apple
export const signInWithApple = async () => {
  const appleAuthResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  if (!appleAuthResponse.identityToken) {
    throw new Error('No Apple identity token');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: appleAuthResponse.identityToken,
  });
  if (error) throw error;
  return data;
};

// Sign out
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// Get current session
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Get current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Listen for auth state changes
export const onAuthStateChange = (callback: (session: any) => void) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
};
```

---

## Step 7 — Update App.tsx

Replace the AsyncStorage-based auth with Supabase session management:

```typescript
// In App.tsx — replace the auth state logic:

import { supabase } from './src/config/supabase';
import { configureGoogleSignIn } from './src/services/authService';
import { Session } from '@supabase/supabase-js';

// Inside the App component:
const [session, setSession] = useState<Session | null>(null);

useEffect(() => {
  configureGoogleSignIn();

  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setIsAuthLoading(false);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });

  return () => subscription.unsubscribe();
}, []);

// Use `session` instead of `isSignedIn`:
// if (!session) → show SignInScreen
// if (session)  → show main app
```

---

## Step 8 — Update SignInScreen

Wire the buttons to the real auth service:

```typescript
import { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail } from '../services/authService';

// In the component:
const handleGoogleSignIn = async () => {
  try {
    await signInWithGoogle();
    // Auth state listener in App.tsx will handle navigation
  } catch (error: any) {
    Alert.alert('Error', error.message);
  }
};

const handleAppleSignIn = async () => {
  try {
    await signInWithApple();
  } catch (error: any) {
    Alert.alert('Error', error.message);
  }
};
```

---

## Step 9 — Migrate Storage Service

Replace AsyncStorage calls with Supabase queries. Example for clothing items:

```typescript
// src/services/storage.ts — updated

import { supabase } from '../config/supabase';
import { ClothingItem } from '../types';

export const getClothingItems = async (): Promise<ClothingItem[]> => {
  const { data, error } = await supabase
    .from('clothing_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapDbToClothingItem);
};

export const saveClothingItem = async (item: Partial<ClothingItem>): Promise<void> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('clothing_items').insert({
    user_id: user.id,
    name: item.name,
    category: item.category,
    color: item.color,
    season: item.season,
    retailer_image: item.retailerImage,
    user_image: item.userImage,
    brand: item.brand,
    is_wishlist: item.isWishlist || false,
    cost: item.cost,
    tags: item.tags,
    retailer: item.retailer,
  });

  if (error) throw error;
};

export const updateClothingItem = async (item: ClothingItem): Promise<void> => {
  const { error } = await supabase
    .from('clothing_items')
    .update({
      name: item.name,
      category: item.category,
      color: item.color,
      season: item.season,
      wear_count: item.wearCount,
      last_worn: item.lastWorn,
      favorite: item.favorite,
      notes: item.notes,
      tags: item.tags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id);

  if (error) throw error;
};

export const deleteClothingItem = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('clothing_items')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Helper: map DB snake_case → app camelCase
const mapDbToClothingItem = (row: any): ClothingItem => ({
  id: row.id,
  name: row.name,
  category: row.category,
  retailerImage: row.retailer_image,
  userImage: row.user_image,
  brand: row.brand,
  color: row.color,
  season: row.season || [],
  dateAdded: row.date_added || row.created_at,
  isWishlist: row.is_wishlist,
  wearCount: row.wear_count,
  lastWorn: row.last_worn,
  cost: row.cost ? Number(row.cost) : undefined,
  purchaseDate: row.purchase_date,
  notes: row.notes,
  tags: row.tags || [],
  favorite: row.favorite,
  retailer: row.retailer,
});
```

Apply the same pattern to `outfitService.ts`, `wearTrackingService.ts`, etc.

---

## Step 10 — Auto-Create Profile on Sign-Up

Add a database trigger so a `profiles` row is created automatically when a new user signs up:

```sql
-- Run in SQL Editor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## Step 11 — Add Sign-Out Button

Add a sign-out option to `SettingsScreen` or the Home header:

```typescript
import { signOut } from '../services/authService';

const handleSignOut = async () => {
  Alert.alert('Sign Out', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: async () => {
      await signOut();
      // Auth listener in App.tsx handles the rest
    }},
  ]);
};
```

---

## Summary of Files to Create / Modify

| Action | File |
|--------|------|
| **Create** | `src/config/supabase.ts` |
| **Create** | `src/services/authService.ts` |
| **Modify** | `src/services/storage.ts` → Supabase queries |
| **Modify** | `src/services/outfitService.ts` → Supabase queries |
| **Modify** | `src/services/wearTrackingService.ts` → Supabase queries |
| **Modify** | `src/screens/SignInScreen.tsx` → real auth calls |
| **Modify** | `App.tsx` → Supabase session management |
| **Modify** | `index.js` → add `import 'react-native-url-polyfill/auto'` at top |

---

## Quick Checklist

- [ ] Supabase project created
- [ ] Database tables created (Step 2)
- [ ] RLS policies applied (Step 3)
- [ ] `src/config/supabase.ts` created with URL + key (Step 4)
- [ ] Google OAuth configured in Google Cloud + Supabase dashboard (Step 5)
- [ ] Apple Sign-In configured in Apple Developer + Supabase dashboard (Step 5)
- [ ] `src/services/authService.ts` created (Step 6)
- [ ] `App.tsx` updated to use Supabase session (Step 7)
- [ ] `SignInScreen.tsx` wired to real auth (Step 8)
- [ ] Storage services migrated to Supabase (Step 9)
- [ ] Profile trigger created (Step 10)
- [ ] Sign-out button added (Step 11)
- [ ] `pod install` run after changes
- [ ] Tested: sign up, sign in, sign out, data CRUD
