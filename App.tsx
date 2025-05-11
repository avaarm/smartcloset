import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddClothingScreen from './src/screens/AddClothingScreen';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import WardrobeScreen from './src/screens/WardrobeScreen';
import OutfitScreen from './src/screens/OutfitScreen';
import WishlistScreen from './src/screens/WishlistScreen';

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
          tabBarActiveTintColor: '#6200ee',
          tabBarInactiveTintColor: 'gray',
        }}
      >
        <Tab.Screen 
          name="Wardrobe" 
          component={WardrobeStack}
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
