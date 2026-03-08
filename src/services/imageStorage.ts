import RNFS from 'react-native-fs';

/**
 * Copies an image from a temporary location to the app's permanent document directory
 * @param tempUri - The temporary URI from ImagePicker
 * @returns The permanent file path
 */
export const copyImageToPermanentStorage = async (tempUri: string): Promise<string> => {
  try {
    // If it's already a permanent path or a URL, return as-is
    if (tempUri.startsWith('http') || tempUri.includes(RNFS.DocumentDirectoryPath)) {
      return tempUri;
    }

    // Generate a unique filename
    const timestamp = Date.now();
    const filename = `clothing_${timestamp}.jpg`;
    const destPath = `${RNFS.DocumentDirectoryPath}/${filename}`;

    // Remove file:// prefix if present
    const sourcePath = tempUri.replace('file://', '');

    // Copy the file
    await RNFS.copyFile(sourcePath, destPath);

    // Return the permanent path with file:// prefix for React Native Image component
    return `file://${destPath}`;
  } catch (error) {
    console.error('Error copying image to permanent storage:', error);
    throw error;
  }
};

/**
 * Deletes an image from permanent storage
 * @param imageUri - The URI of the image to delete
 */
export const deleteImageFromStorage = async (imageUri: string): Promise<void> => {
  try {
    // Only delete if it's a local file in our document directory
    if (!imageUri.startsWith('http') && imageUri.includes(RNFS.DocumentDirectoryPath)) {
      const filePath = imageUri.replace('file://', '');
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await RNFS.unlink(filePath);
      }
    }
  } catch (error) {
    console.error('Error deleting image from storage:', error);
    // Don't throw - deletion failures shouldn't break the app
  }
};
