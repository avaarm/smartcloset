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
import { ThemeProvider } from './src/styles/ThemeProvider';
import StylistDashboardScreen from './src/screens/StylistDashboardScreen';
import ClientsListScreen from './src/screens/ClientsListScreen';
import ClientDetailsScreen from './src/screens/ClientDetailsScreen';
import CreateAppointmentScreen from './src/screens/CreateAppointmentScreen';
import MessagesListScreen from './src/screens/MessagesListScreen';
import ChatScreen from './src/screens/ChatScreen';
import ClientDashboardScreen from './src/screens/ClientDashboardScreen';
import MyStylistScreen from './src/screens/MyStylistScreen';
import ClientAppointmentsScreen from './src/screens/ClientAppointmentsScreen';
import RecommendationsScreen from './src/screens/RecommendationsScreen';
import StylistMarketplaceScreen from './src/screens/StylistMarketplaceScreen';
import StylistProfileViewScreen from './src/screens/StylistProfileViewScreen';
import BookStylistScreen from './src/screens/BookStylistScreen';
import ClientRecommendationsScreen from './src/screens/ClientRecommendationsScreen';
import BodyProfileOnboardingScreen from './src/screens/BodyProfileOnboardingScreen';
import BodyProfileScreen from './src/screens/BodyProfileScreen';
import LensSearchScreen from './src/screens/LensSearchScreen';
import { initCrashReporting, setUser as setCrashUser } from './src/services/crashReporting';
import env from './src/config/env';
import AddClientScreen from './src/screens/AddClientScreen';
import RecommendationDetailsScreen from './src/screens/RecommendationDetailsScreen';
import CreateRecommendationScreen from './src/screens/CreateRecommendationScreen';
import AppointmentDetailsScreen from './src/screens/AppointmentDetailsScreen';
import WardrobeInsightsScreen from './src/screens/WardrobeInsightsScreen';
import OutfitCalendarScreen from './src/screens/OutfitCalendarScreen';

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
        name="CreateOutfit"
        component={CreateOutfitScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WardrobeInsights"
        component={WardrobeInsightsScreen}
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
        name="StylistMarketplace"
        component={StylistMarketplaceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StylistProfileView"
        component={StylistProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BookStylist"
        component={BookStylistScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
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
    </Stack.Navigator>
  );
};

// ==================== Stylist Mode Stacks ====================

const StylistDashboardStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="StylistDashboardMain"
        component={StylistDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateAppointment"
        component={CreateAppointmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddClient"
        component={AddClientScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AppointmentDetails"
        component={AppointmentDetailsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const ClientsStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ClientsListMain"
        component={ClientsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ClientDetails"
        component={ClientDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddClient"
        component={AddClientScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AppointmentDetails"
        component={AppointmentDetailsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const StylistMessagesStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MessagesMain"
        component={MessagesListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const StylistRecommendationsStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="RecommendationsMain"
        component={RecommendationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RecommendationDetails"
        component={RecommendationDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateRecommendation"
        component={CreateRecommendationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ClientDetails"
        component={ClientDetailsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

// ==================== Client Mode Stacks ====================

const ClientDashboardStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ClientDashboardMain"
        component={ClientDashboardScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const MyStylistStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MyStylistMain"
        component={MyStylistScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const ClientMessagesStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ClientMessagesMain"
        component={MessagesListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const ClientAppointmentsStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ClientAppointmentsMain"
        component={ClientAppointmentsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const ClientRecommendationsStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ClientRecommendationsMain"
        component={ClientRecommendationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const ClientMyStylistStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MyStylistMainInner"
        component={MyStylistScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StylistMarketplace"
        component={StylistMarketplaceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StylistProfileView"
        component={StylistProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BookStylist"
        component={BookStylistScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
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

  useEffect(() => {
    if (!showSplash) {
      configureGoogleSignIn();

      // Check for existing session
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        setSession(s);
        setIsAuthLoading(false);
        // Set crash reporting user context
        if (s?.user) {
          setCrashUser({ id: s.user.id, email: s.user.email });
        }
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

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleGuestContinue = useCallback(() => {
    setIsGuest(true);
  }, []);

  const handleSignInComplete = useCallback((newSession: Session) => {
    setSession(newSession);
  }, []);

  const isSignedIn = !!session || isGuest;

  if (showSplash) {
    return <SplashScreen onAnimationComplete={handleSplashComplete} />;
  }

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#8B7FD9" />
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
  tabBarActiveTintColor: '#8B7FD9',
  tabBarInactiveTintColor: '#9CA3AF',
  tabBarStyle: {
    height: Platform.OS === 'ios' ? 88 : 60,
    paddingBottom: Platform.OS === 'ios' ? 30 : 8,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    elevation: 10,
    shadowColor: 'rgba(139, 127, 217, 0.15)',
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
    shadowColor: 'rgba(139, 127, 217, 0.1)',
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
  const { currentMode } = useAccountMode();

  if (currentMode === 'stylist') {
    return (
      <Tab.Navigator key="stylist" screenOptions={tabScreenOptions}>
        <Tab.Screen
          name="Dashboard"
          component={StylistDashboardStack}
          options={{
            tabBarLabel: 'Dashboard',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="grid-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Clients"
          component={ClientsStack}
          options={{
            tabBarLabel: 'Clients',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="people-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Recommendations"
          component={StylistRecommendationsStack}
          options={{
            tabBarLabel: 'Recs',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="sparkles-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Messages"
          component={StylistMessagesStack}
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
            tabBarLabel: 'Profile',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="person-outline" size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    );
  }

  if (currentMode === 'client') {
    return (
      <Tab.Navigator key="client" screenOptions={tabScreenOptions}>
        <Tab.Screen
          name="Dashboard"
          component={ClientDashboardStack}
          options={{
            tabBarLabel: 'Dashboard',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="grid-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MyStylist"
          component={ClientMyStylistStack}
          options={{
            tabBarLabel: 'My Stylist',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="person-circle-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Recs"
          component={ClientRecommendationsStack}
          options={{
            tabBarLabel: 'Recs',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="sparkles-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Appointments"
          component={ClientAppointmentsStack}
          options={{
            tabBarLabel: 'Appts',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Icon name="calendar-outline" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Messages"
          component={ClientMessagesStack}
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
            tabBarLabel: 'Profile',
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
