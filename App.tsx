import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import HomeScreen from './src/screens/HomeScreen';
import WardrobeScreen from './src/screens/WardrobeScreen';
import OutfitScreen from './src/screens/OutfitScreen';
import WishlistScreen from './src/screens/WishlistScreen';
import AddClothingScreen from './src/screens/AddClothingScreen';
import ItemDetailsScreen from './src/screens/ItemDetailsScreen';
import CreateOutfitScreen from './src/screens/CreateOutfitScreen';
import OutfitDetailsScreen from './src/screens/OutfitDetailsScreen';
import ManualOutfitBuilderScreen from './src/screens/ManualOutfitBuilderScreen';
import OutfitAnalyticsScreen from './src/screens/OutfitAnalyticsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SplashScreen from './src/components/SplashScreen';
import { StatusBar, Platform, ActivityIndicator, View } from 'react-native';
import SignInScreen from './src/screens/SignInScreen';
import { supabase } from './src/config/supabase';
import { configureGoogleSignIn } from './src/services/authService';
import { Session } from '@supabase/supabase-js';
import { AccountModeProvider, useAccountMode } from './src/context/AccountModeContext';
import { PRO_MODES_ENABLED } from './src/config/features';
import { ThemeProvider } from './src/styles/ThemeProvider';
import BodyProfileOnboardingScreen from './src/screens/BodyProfileOnboardingScreen';
import BodyProfileScreen from './src/screens/BodyProfileScreen';
import LensSearchScreen from './src/screens/LensSearchScreen';
import { initCrashReporting, setUser as setCrashUser } from './src/services/crashReporting';
import env from './src/config/env';
import WardrobeInsightsScreen from './src/screens/WardrobeInsightsScreen';
import OutfitCalendarScreen from './src/screens/OutfitCalendarScreen';
import StyleQuizScreen from './src/screens/StyleQuizScreen';
import ColorSeasonScreen from './src/screens/ColorSeasonScreen';
import { hasCompletedModeOnboarding, markModeOnboardingComplete } from './src/services/accountService';
import FriendsScreen from './src/screens/FriendsScreen';
import FriendClosetScreen from './src/screens/FriendClosetScreen';
import BrandReportScreen from './src/screens/BrandReportScreen';
import SwapBoardScreen from './src/screens/SwapBoardScreen';
import SwapListingScreen from './src/screens/SwapListingScreen';
import MySwapsScreen from './src/screens/MySwapsScreen';
import SwapThreadScreen from './src/screens/SwapThreadScreen';
import ProHomeScreen from './src/screens/ProHomeScreen';
import ProConnectionScreen from './src/screens/ProConnectionScreen';
import ProShareScreen from './src/screens/ProShareScreen';
import ProRecommendationScreen from './src/screens/ProRecommendationScreen';
import ProThreadScreen from './src/screens/ProThreadScreen';
import ProClientsScreen from './src/screens/ProClientsScreen';
import ProClientDetailScreen from './src/screens/ProClientDetailScreen';
import ProClientClosetScreen from './src/screens/ProClientClosetScreen';
import ProLookEditorScreen from './src/screens/ProLookEditorScreen';
import ProScheduleScreen from './src/screens/ProScheduleScreen';
import ProInboxScreen from './src/screens/ProInboxScreen';
import ProOnboardingScreen from './src/screens/ProOnboardingScreen';
import { setProEntry } from './src/services/proEntry';
import { purgeLegacyProData } from './src/services/localData';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const WardrobeStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="WardrobeMain" 
        component={WardrobeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddClothing"
        component={AddClothingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ItemDetails" 
        component={ItemDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BrandReport"
        component={BrandReportScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateOutfit"
        component={CreateOutfitScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WardrobeInsights"
        component={WardrobeInsightsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StyleQuiz"
        component={StyleQuizScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ColorSeason"
        component={ColorSeasonScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const SignInNavigable = ({ navigation }: any) => {
  const handleDone = (_session?: any) => {
    navigation.goBack();
  };
  return (
    <SignInScreen
      onSignInComplete={handleDone}
      onGuestContinue={handleDone}
    />
  );
};

const HomeStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SignIn"
        component={SignInNavigable}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="ItemDetails"
        component={ItemDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BrandReport"
        component={BrandReportScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddClothing"
        component={AddClothingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateOutfit"
        component={CreateOutfitScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BodyProfileOnboarding"
        component={BodyProfileOnboardingScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="BodyProfile"
        component={BodyProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LensSearch"
        component={LensSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FriendCloset"
        component={FriendClosetScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="SwapBoard" component={SwapBoardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SwapListing" component={SwapListingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MySwaps" component={MySwapsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SwapThread" component={SwapThreadScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProHome" component={ProHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProConnection" component={ProConnectionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProShare" component={ProShareScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProRecommendation" component={ProRecommendationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProThread" component={ProThreadScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="WardrobeInsights"
        component={WardrobeInsightsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OutfitCalendar"
        component={OutfitCalendarScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StyleQuiz"
        component={StyleQuizScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ColorSeason"
        component={ColorSeasonScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const OutfitStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="OutfitMain" 
        component={OutfitScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="OutfitDetails" 
        component={OutfitDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ManualOutfitBuilder" 
        component={ManualOutfitBuilderScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OutfitAnalytics"
        component={OutfitAnalyticsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OutfitCalendar"
        component={OutfitCalendarScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const WishlistStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="WishlistMain" 
        component={WishlistScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddClothing"
        component={AddClothingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ItemDetails" 
        component={ItemDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BrandReport"
        component={BrandReportScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

// ==================== Stylist workspace stacks ====================
// The stylist tab set: Clients, Schedule, Messages, Settings. A client has no tab set of its own; the
// connection is reached from Home > Stylists (ProHome and the routes after it in HomeStack).

const ProClientsStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProClients" component={ProClientsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProClientDetail" component={ProClientDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProClientCloset" component={ProClientClosetScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProLookEditor" component={ProLookEditorScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProRecommendation" component={ProRecommendationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProThread" component={ProThreadScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

const ProScheduleStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProSchedule" component={ProScheduleScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProThread" component={ProThreadScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

const ProInboxStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProInbox" component={ProInboxScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProThread" component={ProThreadScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

// Initialize crash reporting before any rendering
initCrashReporting(env.SENTRY_DSN);

const App = (): React.JSX.Element => {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  // null = not yet checked, true = show the "how will you use Smart Closet?"
  // prompt, false = already onboarded (or guest) — skip straight to the app.
  const [needsModeOnboarding, setNeedsModeOnboarding] = useState<boolean | null>(null);

  // The old on-device Stylist and Client simulation left its stores behind; remove them. Best effort, never throws.
  useEffect(() => {
    purgeLegacyProData();
  }, []);

  useEffect(() => {
    if (!showSplash) {
      configureGoogleSignIn();

      // Check for existing session. Cap at 5 s so a paused/unreachable
      // Supabase project doesn't leave the app stuck on the spinner.
      const authTimeout = setTimeout(() => setIsAuthLoading(false), 5000);
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        clearTimeout(authTimeout);
        setSession(s);
        setIsAuthLoading(false);
        // Set crash reporting user context
        if (s?.user) {
          setCrashUser({ id: s.user.id, email: s.user.email });
        }
      }).catch(() => {
        clearTimeout(authTimeout);
        setIsAuthLoading(false);
      });

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, s) => {
          setSession(s);
          // Update crash reporting user context
          setCrashUser(s?.user ? { id: s.user.id, email: s.user.email } : null);
        },
      );

      return () => subscription.unsubscribe();
    }
  }, [showSplash]);

  // Decide once per signed-in user (per device) whether they still need the
  // "how will you use Smart Closet?" prompt. Guests skip it entirely — they
  // aren't creating an account, so there's nothing to route.
  useEffect(() => {
    if (isGuest) {
      setNeedsModeOnboarding(false);
      return;
    }
    const userId = session?.user?.id;
    if (!userId) {
      setNeedsModeOnboarding(null);
      return;
    }
    let cancelled = false;
    hasCompletedModeOnboarding(userId).then(completed => {
      if (!cancelled) setNeedsModeOnboarding(!completed);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isGuest]);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleGuestContinue = useCallback(() => {
    setIsGuest(true);
  }, []);

  const handleSignInComplete = useCallback((newSession: Session) => {
    setSession(newSession);
  }, []);

  const handleModeOnboardingComplete = useCallback((choice: 'personal' | 'stylist' | 'client') => {
    const userId = session?.user?.id;
    if (userId) markModeOnboardingComplete(userId);
    // Home reads this once it is up and opens the matching sheet (nothing is created here).
    if (choice === 'stylist' || choice === 'client') setProEntry(choice);
    setNeedsModeOnboarding(false);
  }, [session?.user?.id]);

  const isSignedIn = !!session || isGuest;

  if (showSplash) {
    return <SplashScreen onAnimationComplete={handleSplashComplete} />;
  }

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#C4975A" />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInScreen
        onSignInComplete={handleSignInComplete}
        onGuestContinue={handleGuestContinue}
      />
    );
  }

  if (needsModeOnboarding === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#080604' }}>
        <ActivityIndicator size="large" color="#C4975A" />
      </View>
    );
  }

  if (needsModeOnboarding) {
    return (
      <ProOnboardingScreen
        userName={session?.user?.user_metadata?.name}
        onComplete={handleModeOnboardingComplete}
      />
    );
  }

  return (
    <ThemeProvider>
      <AccountModeProvider>
        <NavigationContainer>
          <ModeAwareTabs />
        </NavigationContainer>
      </AccountModeProvider>
    </ThemeProvider>
  );
};

const tabScreenOptions = {
  // Android only: on iOS the form scroll view measures the keyboard before the tab bar hides, so
  // hiding it leaves the last fields covered. The iOS keyboard simply draws over the tab bar.
  tabBarHideOnKeyboard: Platform.OS === 'android',
  tabBarActiveTintColor: '#C4975A',
  tabBarInactiveTintColor: '#9CA3AF',
  tabBarStyle: {
    height: Platform.OS === 'ios' ? 88 : 60,
    paddingBottom: Platform.OS === 'ios' ? 30 : 8,
    paddingTop: 8,
    backgroundColor: '#FDFAF5',
    borderTopWidth: 1,
    borderTopColor: '#EDE5D8',
    elevation: 10,
    shadowColor: 'rgba(196, 151, 90, 0.10)',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tabBarLabelStyle: {
    fontSize: 12,
    fontWeight: '500' as const,
    marginBottom: 4,
  },
  headerStyle: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(196, 151, 90, 0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
    borderBottomWidth: 0,
  },
  headerTintColor: '#1F1B2E',
  headerTitleStyle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F1B2E',
  },
};

const ModeAwareTabs = () => {
  const { currentMode: savedMode } = useAccountMode();
  // Whatever a device last saved, the stylist tab set is unreachable while the
  // pro modes are off (with them on, the context honours it only while the server
  // confirms an active stylist role).
  const currentMode = PRO_MODES_ENABLED ? savedMode : 'user';

  if (currentMode === 'stylist') {
    return (
      <Tab.Navigator key="stylist" screenOptions={tabScreenOptions}>
        <Tab.Screen
          name="Clients"
          component={ProClientsStack}
          options={{
            tabBarLabel: 'Clients',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="people-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Schedule"
          component={ProScheduleStack}
          options={{
            tabBarLabel: 'Schedule',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="calendar-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Messages"
          component={ProInboxStack}
          options={{
            tabBarLabel: 'Messages',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="chatbubbles-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: 'Settings',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="person-outline" size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    );
  }

  // Default: Personal (user) mode
  return (
    <Tab.Navigator key="user" screenOptions={tabScreenOptions}>
      <Tab.Screen 
        name="Home" 
        component={HomeStack}
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Icon name="home-outline" size={24} color={color} />
          )
        }}
      />
      <Tab.Screen 
        name="Wardrobe" 
        component={WardrobeStack}
        options={{
          title: 'My Wardrobe',
          tabBarLabel: 'Wardrobe',
          // Every screen in this stack draws its own header (AddClothing included).
          // Without this the tab's own "My Wardrobe" bar sat above them, doubling the header.
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Icon name="shirt-outline" size={24} color={color} />
          )
        }}
      />
      <Tab.Screen 
        name="Outfits" 
        component={OutfitStack}
        options={{
          title: 'Outfit Suggestions',
          tabBarLabel: 'Outfits',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Icon name="albums-outline" size={24} color={color} />
          )
        }}
      />
      <Tab.Screen 
        name="Wishlist" 
        component={WishlistStack}
        options={{
          title: 'My Wishlist',
          tabBarLabel: 'Wishlist',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Icon name="heart-outline" size={24} color={color} />
          )
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarLabel: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Icon name="person-outline" size={24} color={color} />
          )
        }}
      />
    </Tab.Navigator>
  );
};

export default App;
