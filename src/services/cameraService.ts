import { launchImageLibrary, launchCamera, ImagePickerResponse, MediaType } from 'react-native-image-picker';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import GoogleVisionService, { GoogleVisionAnalysis } from './googleVisionService';
import { ClothingItem } from '../types';

export interface CameraResult {
  imageUri: string;
  analysis?: GoogleVisionAnalysis;
  clothingItem?: Partial<ClothingItem>;
}

class CameraService {
  private googleVisionService: GoogleVisionService;

  constructor() {
    this.googleVisionService = new GoogleVisionService();
  }

  /**
   * Request camera permissions
   */
  async requestCameraPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'SmartCloset Camera Permission',
            message: 'SmartCloset needs access to your camera to take photos of your clothing items.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  }

  /**
   * Take a photo with camera
   */
  async takePhoto(): Promise<CameraResult | null> {
    const hasPermission = await this.requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
      return null;
    }

    return new Promise((resolve) => {
      const options = {
        mediaType: 'photo' as MediaType,
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8 as const,
      };

      launchCamera(options, async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorMessage) {
          resolve(null);
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          resolve(null);
          return;
        }

        try {
          const result = await this.processImage(asset.uri);
          resolve(result);
        } catch (error) {
          console.error('Error processing image:', error);
          resolve({ imageUri: asset.uri });
        }
      });
    });
  }

  /**
   * Select photo from gallery
   */
  async selectFromGallery(): Promise<CameraResult | null> {
    return new Promise((resolve) => {
      const options = {
        mediaType: 'photo' as MediaType,
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8 as const,
      };

      launchImageLibrary(options, async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorMessage) {
          resolve(null);
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          resolve(null);
          return;
        }

        try {
          const result = await this.processImage(asset.uri);
          resolve(result);
        } catch (error) {
          console.error('Error processing image:', error);
          resolve({ imageUri: asset.uri });
        }
      });
    });
  }

  /**
   * Show action sheet for photo selection
   */
  async showPhotoOptions(): Promise<CameraResult | null> {
    return new Promise((resolve) => {
      Alert.alert(
        'Add Photo',
        'Choose how you want to add a photo of your clothing item',
        [
          {
            text: 'Camera',
            onPress: async () => {
              const result = await this.takePhoto();
              resolve(result);
            },
          },
          {
            text: 'Photo Library',
            onPress: async () => {
              const result = await this.selectFromGallery();
              resolve(result);
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve(null),
          },
        ]
      );
    });
  }

  /**
   * Process image with AI vision (Google Lens-like functionality)
   */
  private async processImage(imageUri: string): Promise<CameraResult> {
    try {
      // Analyze the image with Google Vision AI
      const analysis = await this.googleVisionService.analyzeClothingImage(imageUri);
      
      // Convert analysis to clothing item
      const clothingItem = await this.googleVisionService.createClothingItemFromAnalysis(
        imageUri, 
        analysis
      );

      return {
        imageUri,
        analysis,
        clothingItem,
      };
    } catch (error) {
      console.error('AI analysis failed:', error);
      // Return basic result if AI fails
      return {
        imageUri,
      };
    }
  }

  /**
   * Find similar products online (Google Lens shopping feature)
   */
  async findSimilarProducts(imageUri: string) {
    try {
      return await this.googleVisionService.findSimilarProducts(imageUri);
    } catch (error) {
      console.error('Error finding similar products:', error);
      return [];
    }
  }

  /**
   * Re-analyze an existing image with updated AI models
   */
  async reAnalyzeImage(imageUri: string): Promise<GoogleVisionAnalysis | null> {
    try {
      return await this.googleVisionService.analyzeClothingImage(imageUri);
    } catch (error) {
      console.error('Error re-analyzing image:', error);
      return null;
    }
  }
}

export default CameraService;
