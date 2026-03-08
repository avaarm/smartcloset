import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Share, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { ClothingItem, Outfit } from '../types';

const STORAGE_KEY = '@smartcloset_items';
const OUTFITS_KEY = '@smartcloset_outfits';
const BACKUP_VERSION = '1.0';

export interface BackupData {
  version: string;
  timestamp: string;
  items: ClothingItem[];
  outfits: Outfit[];
  metadata: {
    totalItems: number;
    totalOutfits: number;
    exportDate: string;
  };
}

/**
 * Export all wardrobe data to JSON
 */
export const exportData = async (): Promise<BackupData> => {
  try {
    const itemsData = await AsyncStorage.getItem(STORAGE_KEY);
    const outfitsData = await AsyncStorage.getItem(OUTFITS_KEY);

    const items: ClothingItem[] = itemsData ? JSON.parse(itemsData) : [];
    const outfits: Outfit[] = outfitsData ? JSON.parse(outfitsData) : [];

    const backupData: BackupData = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      items,
      outfits,
      metadata: {
        totalItems: items.length,
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

    await Share.share(shareOptions);
    
    // Clean up file after sharing (optional)
    // await RNFS.unlink(path);
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
  try {
    const itemsData = await AsyncStorage.getItem(STORAGE_KEY);
    const outfitsData = await AsyncStorage.getItem(OUTFITS_KEY);
    const lastBackupDate = await AsyncStorage.getItem('@smartcloset_last_backup');

    const items: ClothingItem[] = itemsData ? JSON.parse(itemsData) : [];
    const outfits: Outfit[] = outfitsData ? JSON.parse(outfitsData) : [];

    // Calculate approximate storage size
    const storageSize = (itemsData?.length || 0) + (outfitsData?.length || 0);

    return {
      itemsCount: items.length,
      outfitsCount: outfits.length,
      lastBackup: lastBackupDate || undefined,
      storageSize,
    };
  } catch (error) {
    console.error('Error getting backup stats:', error);
    return {
      itemsCount: 0,
      outfitsCount: 0,
      storageSize: 0,
    };
  }
};

/**
 * Create automatic backup
 */
export const createAutoBackup = async (): Promise<void> => {
  try {
    const backupData = await exportData();
    const jsonString = JSON.stringify(backupData);
    
    // Store backup in AsyncStorage
    await AsyncStorage.setItem('@smartcloset_auto_backup', jsonString);
    await AsyncStorage.setItem('@smartcloset_last_backup', new Date().toISOString());
    
    console.log('Auto backup created successfully');
  } catch (error) {
    console.error('Error creating auto backup:', error);
  }
};

/**
 * Restore from automatic backup
 */
export const restoreAutoBackup = async (): Promise<boolean> => {
  try {
    const backupString = await AsyncStorage.getItem('@smartcloset_auto_backup');
    
    if (!backupString) {
      return false;
    }
    
    const backupData: BackupData = JSON.parse(backupString);
    await importData(backupData);
    
    return true;
  } catch (error) {
    console.error('Error restoring auto backup:', error);
    return false;
  }
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
