import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountType, UserRole } from '../types/stylist';

const STORAGE_KEYS = {
  ACCOUNT_TYPE: '@smartcloset_account_type',
  CURRENT_MODE: '@smartcloset_current_mode',
  USER_PROFILE: '@smartcloset_user_profile',
  AVAILABLE_MODES: '@smartcloset_available_modes',
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  profileImage?: string;
  availableModes: AccountType[];
  currentMode: AccountType;
  personalUserId?: string;
  stylistId?: string;
  clientId?: string;
}

// ==================== Mode Management ====================

export const getCurrentMode = async (): Promise<AccountType> => {
  try {
    const mode = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_MODE);
    return (mode as AccountType) || 'user';
  } catch (error) {
    console.error('Error getting current mode:', error);
    return 'user';
  }
};

export const setCurrentMode = async (mode: AccountType): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_MODE, mode);
    await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNT_TYPE, mode);
  } catch (error) {
    console.error('Error setting current mode:', error);
    throw error;
  }
};

export const getAvailableModes = async (): Promise<AccountType[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.AVAILABLE_MODES);
    return data ? JSON.parse(data) : ['user'];
  } catch (error) {
    console.error('Error getting available modes:', error);
    return ['user'];
  }
};

export const addAvailableMode = async (mode: AccountType): Promise<void> => {
  try {
    const modes = await getAvailableModes();
    if (!modes.includes(mode)) {
      modes.push(mode);
      await AsyncStorage.setItem(STORAGE_KEYS.AVAILABLE_MODES, JSON.stringify(modes));
    }
  } catch (error) {
    console.error('Error adding available mode:', error);
    throw error;
  }
};

// ==================== Mode Switching ====================

export const switchToPersonalMode = async (): Promise<void> => {
  try {
    await setCurrentMode('user');
    console.log('Switched to Personal Mode');
  } catch (error) {
    console.error('Error switching to personal mode:', error);
    throw error;
  }
};

export const switchToStylistMode = async (): Promise<void> => {
  try {
    // Check if user has stylist account
    const { getStylistProfile } = require('./stylistService');
    const profile = await getStylistProfile();
    
    if (!profile) {
      throw new Error('No stylist profile found. Please create a stylist account first.');
    }
    
    await setCurrentMode('stylist');
    await addAvailableMode('stylist');
    console.log('Switched to Stylist Mode');
  } catch (error) {
    console.error('Error switching to stylist mode:', error);
    throw error;
  }
};

export const switchToClientMode = async (): Promise<void> => {
  try {
    // Check if user has client account
    const { getCurrentClientAccount } = require('./marketplaceService');
    const clientAccount = await getCurrentClientAccount();
    
    if (!clientAccount) {
      throw new Error('No client account found. Please create a client account or book a stylist first.');
    }
    
    await setCurrentMode('client');
    await addAvailableMode('client');
    console.log('Switched to Client Mode');
  } catch (error) {
    console.error('Error switching to client mode:', error);
    throw error;
  }
};

// ==================== User Profile ====================

export const getUserProfile = async (): Promise<UserProfile | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

export const createUserProfile = async (
  profile: Omit<UserProfile, 'id' | 'availableModes' | 'currentMode'>
): Promise<UserProfile> => {
  try {
    const newProfile: UserProfile = {
      ...profile,
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      availableModes: ['user'],
      currentMode: 'user',
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(newProfile));
    return newProfile;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

export const updateUserProfile = async (updates: Partial<UserProfile>): Promise<UserProfile | null> => {
  try {
    const profile = await getUserProfile();
    if (!profile) return null;
    
    const updatedProfile = {
      ...profile,
      ...updates,
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedProfile));
    return updatedProfile;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return null;
  }
};

// ==================== Account Setup ====================

export const setupStylistAccount = async (stylistId: string): Promise<void> => {
  try {
    await addAvailableMode('stylist');
    await updateUserProfile({ stylistId });
    console.log('Stylist account setup complete');
  } catch (error) {
    console.error('Error setting up stylist account:', error);
    throw error;
  }
};

export const setupClientAccount = async (clientId: string): Promise<void> => {
  try {
    await addAvailableMode('client');
    await updateUserProfile({ clientId });
    console.log('Client account setup complete');
  } catch (error) {
    console.error('Error setting up client account:', error);
    throw error;
  }
};

// ==================== Mode Checking ====================

export const canAccessStylistMode = async (): Promise<boolean> => {
  try {
    const modes = await getAvailableModes();
    return modes.includes('stylist');
  } catch (error) {
    console.error('Error checking stylist mode access:', error);
    return false;
  }
};

export const canAccessClientMode = async (): Promise<boolean> => {
  try {
    const modes = await getAvailableModes();
    return modes.includes('client');
  } catch (error) {
    console.error('Error checking client mode access:', error);
    return false;
  }
};

export const isInStylistMode = async (): Promise<boolean> => {
  try {
    const mode = await getCurrentMode();
    return mode === 'stylist';
  } catch (error) {
    console.error('Error checking if in stylist mode:', error);
    return false;
  }
};

export const isInClientMode = async (): Promise<boolean> => {
  try {
    const mode = await getCurrentMode();
    return mode === 'client';
  } catch (error) {
    console.error('Error checking if in client mode:', error);
    return false;
  }
};

export const isInPersonalMode = async (): Promise<boolean> => {
  try {
    const mode = await getCurrentMode();
    return mode === 'user';
  } catch (error) {
    console.error('Error checking if in personal mode:', error);
    return true;
  }
};

// ==================== Account Type (Legacy Support) ====================

export const getAccountType = async (): Promise<AccountType> => {
  return getCurrentMode();
};

export const switchToUserMode = async (): Promise<void> => {
  return switchToPersonalMode();
};

// ==================== Initialization ====================

export const initializeAccount = async (): Promise<void> => {
  try {
    // Check if user profile exists
    let profile = await getUserProfile();
    
    if (!profile) {
      // Create default profile
      profile = await createUserProfile({
        name: 'User',
        email: 'user@smartcloset.app',
      });
    }
    
    // Ensure current mode is set
    const currentMode = await getCurrentMode();
    if (!currentMode) {
      await setCurrentMode('user');
    }
    
    console.log('Account initialized:', profile);
  } catch (error) {
    console.error('Error initializing account:', error);
    throw error;
  }
};

// ==================== Sample Data ====================

export const loadSampleAccountData = async (): Promise<void> => {
  try {
    // Create sample user profile with all modes available
    const sampleProfile: UserProfile = {
      id: 'user_sample_001',
      name: 'Alex Morgan',
      email: 'alex@smartcloset.app',
      profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400',
      availableModes: ['user', 'stylist', 'client'],
      currentMode: 'user',
      personalUserId: 'user_sample_001',
      stylistId: 'stylist_sample_001',
      clientId: 'client_sample_001',
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(sampleProfile));
    await AsyncStorage.setItem(STORAGE_KEYS.AVAILABLE_MODES, JSON.stringify(['user', 'stylist', 'client']));
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_MODE, 'user');
    
    console.log('Sample account data loaded successfully');
  } catch (error) {
    console.error('Error loading sample account data:', error);
    throw error;
  }
};

export const clearAccountData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCOUNT_TYPE,
      STORAGE_KEYS.CURRENT_MODE,
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.AVAILABLE_MODES,
    ]);
  } catch (error) {
    console.error('Error clearing account data:', error);
    throw error;
  }
};

// ==================== Mode Display Helpers ====================

export const getModeName = (mode: AccountType): string => {
  switch (mode) {
    case 'user':
      return 'Personal';
    case 'stylist':
      return 'Professional Stylist';
    case 'client':
      return 'Client';
    default:
      return 'Unknown';
  }
};

export const getModeDescription = (mode: AccountType): string => {
  switch (mode) {
    case 'user':
      return 'Manage your personal wardrobe and outfits';
    case 'stylist':
      return 'Run your styling business and manage clients';
    case 'client':
      return 'Work with your professional stylist';
    default:
      return '';
  }
};

export const getModeIcon = (mode: AccountType): string => {
  switch (mode) {
    case 'user':
      return 'person-outline';
    case 'stylist':
      return 'briefcase-outline';
    case 'client':
      return 'people-outline';
    default:
      return 'help-outline';
  }
};
