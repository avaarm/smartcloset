import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import WardrobeScreen from './src/screens/WardrobeScreen';
import OutfitScreen from './src/screens/OutfitScreen';
import WishlistScreen from './src/screens/WishlistScreen';

const Tab = createBottomTabNavigator();

const App = (): React.JSX.Element => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#6200ee',
          tabBarInactiveTintColor: 'gray',
        }}
      >
        <Tab.Screen 
          name="Wardrobe" 
          component={WardrobeScreen}
          options={{
            title: 'My Wardrobe',
            tabBarLabel: 'Wardrobe'
          }}
        />
        <Tab.Screen 
          name="Outfits" 
          component={OutfitScreen}
          options={{
            title: 'Outfit Suggestions',
            tabBarLabel: 'Outfits'
          }}
        />
        <Tab.Screen 
          name="Wishlist" 
          component={WishlistScreen}
          options={{
            title: 'My Wishlist',
            tabBarLabel: 'Wishlist'
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default App;
