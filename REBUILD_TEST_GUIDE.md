# Rebuild and Test Guide

## Changes Made
1. ✅ Added 15 diverse clothing items to sample data (22 total items)
2. ✅ Added 4 new sample outfits (7 total outfits)
3. ✅ Fixed image storage to prevent "orphaned task" warnings
4. ✅ TypeScript compilation verified - no errors

## How to Rebuild and Test

### Step 1: Rebuild the iOS App
```bash
# Option A: Using React Native CLI (Recommended)
npx react-native run-ios

# Option B: Using Xcode
# Open ios/smartcloset.xcworkspace in Xcode
# Press Cmd+R to build and run
```

### Step 2: Test the Image Storage Fix

**Before the fix:**
- Console showed: "Task orphaned for request <NSMutableURLRequest>..."
- Images would disappear after iOS cleaned temp files

**After the fix:**
1. Open the app
2. Navigate to "Add Item" screen
3. Upload a photo from the library
4. Save the item
5. ✅ Check console - should see NO orphaned task warnings
6. Close and reopen the app
7. ✅ Image should still be visible
8. Navigate to the item
9. ✅ Image loads without errors

### Step 3: Test the New Sample Data

**Test the expanded wardrobe:**
1. Navigate to Wardrobe screen
2. ✅ Should see 22 clothing items (up from 7)
3. ✅ Items should include:
   - 4 tops (White T-Shirt, Black Turtleneck, Striped Breton, Silk Blouse)
   - 4 bottoms (Blue Jeans, Black Jeans, Pleated Skirt, Wide Leg Trousers)
   - 4 dresses (Little Black Dress, Floral Maxi, Wrap Dress)
   - 4 outerwear (Leather Jacket, Wool Coat, Denim Jacket)
   - 4 shoes (White Sneakers, Black Boots, Nude Heels, Loafers)
   - 3 accessories (Leather Tote, Gold Earrings, Silk Scarf)

**Test the new outfits:**
1. Navigate to Outfits screen
2. ✅ Should see 7 outfits (up from 3)
3. ✅ New outfits include:
   - Business Professional
   - Autumn Elegance
   - Summer Bohemian
   - Edgy Chic

### Expected Results
- ✅ No console warnings about orphaned tasks
- ✅ Images persist across app restarts
- ✅ Graceful fallback to placeholder if image fails to load
- ✅ 22 diverse clothing items with realistic Unsplash images
- ✅ 7 complete outfits with varied occasions
- ✅ All items have full metadata (brands, costs, wear counts, etc.)

### Troubleshooting

**If you still see orphaned task warnings:**
- These are from OLD items with temp URIs
- Upload a NEW photo - it should work without warnings
- Old items will gracefully fall back to placeholder images

**If build fails:**
```bash
# Clean everything and rebuild
cd ios
rm -rf build
pod install
cd ..
npx react-native run-ios
```

**If Metro bundler port is in use:**
```bash
# Kill existing Metro processes
lsof -ti:8081 | xargs kill -9
# Restart Metro
npx react-native start --reset-cache
```

## Files Modified
- `src/data/enhancedSampleData.ts` - Added 15 items + 4 outfits
- `src/services/imageStorage.ts` - New service for permanent image storage
- `src/screens/AddClothingScreen.tsx` - Uses permanent image storage
- `src/components/ClothingItem.tsx` - Added error handling
- `src/components/ClothingCard.tsx` - Added error handling

## Next Steps
After testing, consider:
1. Updating MASTER_CHECKLIST.md to mark these items complete
2. Committing changes with: `git commit -m "feat(data): expand sample data and fix image storage"`
3. Testing on a physical device (not just simulator)
