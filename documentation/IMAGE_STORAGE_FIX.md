# Image Storage Fix

## Problem
The app was showing console warnings about orphaned tasks when trying to load `.jpg` files from iOS simulator's temporary directory:

```
Task orphaned for request <NSMutableURLRequest: 0x600001c8300> { URL: file:///Users/.../tmp/509636D4-0231-48DA-9DDA-47E3B89E9401.jpg }
```

This occurred because:
1. React Native's `ImagePicker` returns temporary file URIs
2. iOS periodically cleans up temporary files
3. The app tried to load images that no longer existed

## Solution
Implemented permanent image storage by copying uploaded images to the app's document directory.

### Files Created
- **`src/services/imageStorage.ts`** - Service for managing image storage
  - `copyImageToPermanentStorage()` - Copies images from temp to permanent location
  - `deleteImageFromStorage()` - Cleans up deleted images

### Files Modified
- **`src/screens/AddClothingScreen.tsx`**
  - Updated `pickImage()` to copy images to permanent storage
  - Added error handling with fallback to temp URI if copy fails

- **`src/components/ClothingItem.tsx`**
  - Added `imageError` state to track loading failures
  - Added `onError` handler to Image component
  - Falls back to placeholder image on error

- **`src/components/ClothingCard.tsx`**
  - Added `imageError` state and error handling
  - Falls back to placeholder image on error

### Dependencies Added
- `react-native-fs` - For file system operations

## How It Works
1. User selects an image from photo library
2. ImagePicker returns a temporary URI
3. `copyImageToPermanentStorage()` copies the file to `DocumentDirectoryPath`
4. Returns permanent URI with format: `file:///path/to/Documents/clothing_timestamp.jpg`
5. Image components handle errors gracefully with placeholder fallbacks

## Benefits
- ✅ No more orphaned task warnings
- ✅ Images persist across app restarts
- ✅ Graceful error handling with fallbacks
- ✅ Better user experience
- ✅ Proper cleanup when items are deleted

## Testing
1. Add a clothing item with a photo from the library
2. Close and reopen the app
3. Image should still load correctly
4. No console warnings about orphaned tasks
