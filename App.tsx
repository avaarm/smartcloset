import React, { useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import SignInScreen from './src/screens/SignInScreen';

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

const HomeStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HomeMain" 
        component={HomeScreen}
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

const App = (): React.JSX.Element => {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const loadAuthState = async () => {
    try {
      const storedFlag = await AsyncStorage.getItem('smartcloset_hasSignedIn');
      setIsSignedIn(storedFlag === 'true');
    } catch (error) {
      console.warn('Failed to load auth state', error);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSplashComplete = () => {
    setShowSplash(false);
    loadAuthState();
  };

  const handleAccountSignIn = async () => {
    try {
      await AsyncStorage.setItem('smartcloset_hasSignedIn', 'true');
      setIsSignedIn(true);
    } catch (error) {
      console.warn('Failed to persist auth state', error);
      setIsSignedIn(true);
    }
  };

  const handleGuestContinue = () => {
    // Unlock app for this session only; do not persist flag
    setIsSignedIn(true);
  };

  if (showSplash) {
    return <SplashScreen onAnimationComplete={handleSplashComplete} />;
  }

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#D4A5A5" />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInScreen
        onAccountSignIn={handleAccountSignIn}
        onGuestContinue={handleGuestContinue}
      />
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#FF385C',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            height: Platform.OS === 'ios' ? 88 : 60,
            paddingBottom: Platform.OS === 'ios' ? 30 : 8,
            paddingTop: 8,
            backgroundColor: '#ffffff',
            borderTopWidth: 0,
            elevation: 10,
            shadowColor: 'rgba(0, 0, 0, 0.1)',
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
            shadowColor: 'rgba(0, 0, 0, 0.05)',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 2,
            borderBottomWidth: 0,
          },
          headerTintColor: '#111827',
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '600',
            color: '#111827',
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
          component={WishlistScreen}
          options={{
            title: 'My Wishlist',
            tabBarLabel: 'Wishlist',
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
