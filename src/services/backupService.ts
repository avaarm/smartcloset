import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Share, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { ClothingItem } from '../types';
import { supabase } from '../config/supabase';
import { getClothingItems } from './storage';
import { getSavedOutfits, type Outfit } from './outfitService';

const STORAGE_KEY = '@smartcloset_items';
const OUTFITS_KEY = '@smartcloset_saved_outfits';
const BACKUP_VERSION = '1.0';

export interface BackupData {
  version: string;
  timestamp: string;
  items: ClothingItem[];
  outfits: Outfit[];
  metadata: {
    /** Items the user owns; wishlist entries are counted in wishlistCount instead. */
    totalItems: number;
    /** Absent in backups made before wishlist entries were counted apart. */
    wishlistCount?: number;
    totalOutfits: number;
    exportDate: string;
  };
}

/**
 * Export all wardrobe data to JSON
 */
export const exportData = async (): Promise<BackupData> => {
  try {
    // These read the signed-in user's cloud data, or the on-device data for a guest.
    const items: ClothingItem[] = await getClothingItems({ all: true });
    const outfits: Outfit[] = await getSavedOutfits();
    // The file keeps the wishlist (a restore must bring it back), but it is not part of the closet count.
    const ownedCount = items.filter(item => !item.isWishlist).length;

    const backupData: BackupData = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      items,
      outfits,
      metadata: {
        totalItems: ownedCount,
        wishlistCount: items.length - ownedCount,
        totalOutfits: outfits.length,
        exportDate: new Date().toLocaleDateString(),
      },
    };

    return backupData;
  } catch (error) {
    console.error('Error exporting data:', error);
    throw new Error('Failed to export data');
  }
};

/**
 * Import wardrobe data from JSON
 */
export const importData = async (backupData: BackupData): Promise<void> => {
  try {
    // Validate backup data
    if (!backupData.version || !backupData.items || !backupData.outfits) {
      throw new Error('Invalid backup data format');
    }

    // Store items and outfits
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(backupData.items));
    await AsyncStorage.setItem(OUTFITS_KEY, JSON.stringify(backupData.outfits));

    console.log('Data imported successfully');
  } catch (error) {
    console.error('Error importing data:', error);
    throw new Error('Failed to import data');
  }
};

/**
 * Save backup to file and share
 */
export const saveAndShareBackup = async (): Promise<void> => {
  try {
    const backupData = await exportData();
    const jsonString = JSON.stringify(backupData, null, 2);
    const fileName = `smartcloset_backup_${new Date().getTime()}.json`;
    
    const path = `${RNFS.DocumentDirectoryPath}/${fileName}`;
    
    // Write file
    await RNFS.writeFile(path, jsonString, 'utf8');
    
    // Share file
    const shareOptions = {
      title: 'SmartCloset Backup',
      message: `Backup created on ${backupData.metadata.exportDate}`,
      url: Platform.OS === 'ios' ? path : `file://${path}`,
      type: 'application/json',
    };

    try {
      const result = await Share.share(shareOptions);
      if (result.action !== Share.dismissedAction) {
        await AsyncStorage.setItem('@smartcloset_last_backup', new Date().toISOString());
      }
    } finally {
      // Clean up the temporary backup file regardless of share outcome
      await RNFS.unlink(path).catch(() => {});
    }
  } catch (error) {
    console.error('Error saving and sharing backup:', error);
    throw error;
  }
};

/**
 * Load backup from file
 */
export const loadBackupFromFile = async (filePath: string): Promise<BackupData> => {
  try {
    const fileContent = await RNFS.readFile(filePath, 'utf8');
    const backupData: BackupData = JSON.parse(fileContent);
    
    // Validate backup data
    if (!backupData.version || !backupData.items) {
      throw new Error('Invalid backup file format');
    }
    
    return backupData;
  } catch (error) {
    console.error('Error loading backup from file:', error);
    throw new Error('Failed to load backup file');
  }
};

/**
 * Get backup statistics
 */
export const getBackupStats = async (): Promise<{
  itemsCount: number;
  outfitsCount: number;
  lastBackup?: string;
  storageSize: number;
}> => {
  const lastBackupDate = await AsyncStorage.getItem('@smartcloset_last_backup').catch(() => null);
  const lastBackup = lastBackupDate || undefined;
  const { data: { session } } = await supabase.auth.getSession();
  const signedIn = !!session?.user?.id;

  const [items, outfits] = await Promise.all([
    getClothingItems({ all: true }).catch(() => null),
    getSavedOutfits().catch(() => null),
  ]);

  // Storage is only meaningful for guests, whose data lives on this device.
  let storageSize = 0;
  if (!signedIn) {
    const [itemsData, outfitsData] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
      AsyncStorage.getItem(OUTFITS_KEY).catch(() => null),
    ]);
    storageSize = (itemsData?.length || 0) + (outfitsData?.length || 0);
  }

  return {
    itemsCount: items?.filter(item => !item.isWishlist).length ?? 0,
    outfitsCount: outfits?.length ?? 0,
    lastBackup,
    storageSize,
  };
};

/**
 * Clear all data (with confirmation)
 */
export const clearAllData = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to delete all wardrobe data? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => reject(new Error('User cancelled')),
        },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                STORAGE_KEY,
                OUTFITS_KEY,
                '@smartcloset_auto_backup',
                '@smartcloset_last_backup',
                '@smartcloset_initialized',
              ]);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
        },
      ]
    );
  });
};
