import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import WardrobeScreen from './src/screens/WardrobeScreen';
import OutfitScreen from './src/screens/OutfitScreen';
import WishlistScreen from './src/screens/WishlistScreen';
import AddClothingScreen from './src/screens/AddClothingScreen';
import { StatusBar, Platform } from 'react-native';

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
    </Stack.Navigator>
  );
};

const App = (): React.JSX.Element => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8E8E93',
          tabBarStyle: {
            height: Platform.OS === 'ios' ? 88 : 60,
            paddingBottom: Platform.OS === 'ios' ? 30 : 8,
            paddingTop: 8,
            backgroundColor: '#ffffff',
            borderTopWidth: 0.5,
            borderTopColor: '#C5C5C7',
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
          headerStyle: {
            backgroundColor: '#f8f8f8',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 0.5 },
            shadowOpacity: 0.15,
            shadowRadius: 0,
          },
          headerTintColor: '#007AFF',
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
          },
        }}
      >
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
          component={OutfitScreen}
          options={{
            title: 'Outfit Suggestions',
            tabBarLabel: 'Outfits',
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
