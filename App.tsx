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
import SplashScreen from './src/components/SplashScreen';
import { StatusBar, Platform, ActivityIndicator, View } from 'react-native';
import SignInScreen from './src/screens/SignInScreen';
import { supabase } from './src/config/supabase';
import { configureGoogleSignIn } from './src/services/authService';
import { Session } from '@supabase/supabase-js';

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
        options={{ title: 'Add New Item' }}
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
    </Stack.Navigator>
  );
};

const SignInNavigable = ({ navigation }: any) => {
  const handleDone = () => {
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
        options={{ title: 'Add to Wishlist' }}
      />
      <Stack.Screen 
        name="ItemDetails" 
        component={ItemDetailsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

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
      });

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, s) => {
          setSession(s);
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
        onGuestContinue={handleGuestContinue}
      />
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
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
            fontWeight: '500',
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
            fontWeight: '600',
            color: '#1F1B2E',
          },
        }}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeStack}
          options={{
            title: 'Home',
            tabBarLabel: 'Home',
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
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
            tabBarIcon: ({ color, size }) => (
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
            tabBarIcon: ({ color, size }) => (
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
            tabBarIcon: ({ color, size }) => (
              <Icon name="heart-outline" size={24} color={color} />
            )
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default App;
