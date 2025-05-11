import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem } from '../data/sampleClothes';

const STORAGE_KEY = '@smartcloset_items';

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
    const items = await AsyncStorage.getItem(STORAGE_KEY);
    return items ? JSON.parse(items) : [];
  } catch (error) {
    console.error('Error getting clothing items:', error);
    return [];
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
