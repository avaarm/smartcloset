import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem, Outfit } from '../types';

// Storage keys
const STORAGE_KEYS = {
  WARDROBE: '@smartcloset/wardrobe',
  OUTFITS: '@smartcloset/outfits',
  WISHLIST: '@smartcloset/wishlist',
};

// Wardrobe Storage
export const saveWardrobeItems = async (items: ClothingItem[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WARDROBE, JSON.stringify(items));
  } catch (error) {
    console.error('Error saving wardrobe items:', error);
    throw error;
  }
};

export const getWardrobeItems = async (): Promise<ClothingItem[]> => {
  try {
    const items = await AsyncStorage.getItem(STORAGE_KEYS.WARDROBE);
    return items ? JSON.parse(items) : [];
  } catch (error) {
    console.error('Error getting wardrobe items:', error);
    return [];
  }
};

// Wishlist Storage
export const saveWishlistItems = async (items: ClothingItem[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(items));
  } catch (error) {
    console.error('Error saving wishlist items:', error);
    throw error;
  }
};

export const getWishlistItems = async (): Promise<ClothingItem[]> => {
  try {
    const items = await AsyncStorage.getItem(STORAGE_KEYS.WISHLIST);
    return items ? JSON.parse(items) : [];
  } catch (error) {
    console.error('Error getting wishlist items:', error);
    return [];
  }
};

// Outfits Storage
export const saveOutfits = async (outfits: Outfit[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.OUTFITS, JSON.stringify(outfits));
  } catch (error) {
    console.error('Error saving outfits:', error);
    throw error;
  }
};

export const getOutfits = async (): Promise<Outfit[]> => {
  try {
    const outfits = await AsyncStorage.getItem(STORAGE_KEYS.OUTFITS);
    return outfits ? JSON.parse(outfits) : [];
  } catch (error) {
    console.error('Error getting outfits:', error);
    return [];
  }
};
