import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem } from '../types';
import { enhancedClothingItems } from '../data/enhancedSampleData';

const STORAGE_KEY = '@smartcloset_items';
const INITIALIZED_KEY = '@smartcloset_initialized';

const initializeStorage = async (): Promise<void> => {
  try {
    const initialized = await AsyncStorage.getItem(INITIALIZED_KEY);
    if (!initialized) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(enhancedClothingItems));
      await AsyncStorage.setItem(INITIALIZED_KEY, 'true');
      console.log('Storage initialized with enhanced sample data');
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
  }
};

export const saveClothingItem = async (item: ClothingItem): Promise<void> => {
  try {
    const existingItems = await getClothingItems();
    const updatedItems = [...existingItems, { ...item, id: Date.now().toString() }];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
  } catch (error) {
    console.error('Error saving clothing item:', error);
    throw error;
  }
};

export const getClothingItems = async (): Promise<ClothingItem[]> => {
  try {
    await initializeStorage();
    const items = await AsyncStorage.getItem(STORAGE_KEY);
    return items ? JSON.parse(items) : [];
  } catch (error) {
    console.error('Error getting clothing items:', error);
    return [];
  }
};

export const updateClothingItem = async (updatedItem: ClothingItem): Promise<void> => {
  try {
    const existingItems = await getClothingItems();
    const updatedItems = existingItems.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
  } catch (error) {
    console.error('Error updating clothing item:', error);
    throw error;
  }
};

export const deleteClothingItem = async (id: string): Promise<void> => {
  try {
    const existingItems = await getClothingItems();
    const updatedItems = existingItems.filter(item => item.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
  } catch (error) {
    console.error('Error deleting clothing item:', error);
    throw error;
  }
};

export const resetStorage = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(INITIALIZED_KEY);
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('Storage reset - will reinitialize on next load');
  } catch (error) {
    console.error('Error resetting storage:', error);
    throw error;
  }
};
