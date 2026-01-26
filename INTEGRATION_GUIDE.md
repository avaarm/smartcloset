# Integration Guide for New Features

## Adding the Stats Screen to Navigation

To integrate the new Statistics screen into your app navigation, follow these steps:

### Step 1: Import the StatsScreen

In your main navigation file (likely `App.tsx` or `src/navigation/AppNavigator.tsx`), add the import:

```typescript
import { StatsScreen } from './src/screens/StatsScreen';
```

### Step 2: Add to Tab Navigator

If you're using a Bottom Tab Navigator, add a new tab:

```typescript
<Tab.Screen 
  name="Stats" 
  component={StatsScreen}
  options={{
    tabBarLabel: 'Analytics',
    tabBarIcon: ({ color, size }) => (
      <Icon name="stats-chart" size={size} color={color} />
    ),
  }}
/>
```

### Step 3: Or Add to Stack Navigator

If you prefer a stack navigator approach:

```typescript
<Stack.Screen 
  name="Stats" 
  component={StatsScreen}
  options={{
    title: 'Wardrobe Analytics',
    headerShown: false, // StatsScreen has its own header
  }}
/>
```

### Step 4: Add Navigation Button

You can add a button to navigate to stats from the Home screen:

```typescript
<TouchableOpacity 
  style={styles.statsButton}
  onPress={() => navigation.navigate('Stats')}
>
  <Icon name="stats-chart-outline" size={24} color="#fff" />
  <Text style={styles.statsButtonText}>View Analytics</Text>
</TouchableOpacity>
```

---

## Loading Enhanced Sample Data

To populate your app with the enhanced sample data:

### Option 1: Initialize on First Launch

```typescript
import { enhancedClothingItems } from './src/data/enhancedSampleData';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@smartcloset_items';
const INITIALIZED_KEY = '@smartcloset_initialized';

async function initializeSampleData() {
  const initialized = await AsyncStorage.getItem(INITIALIZED_KEY);
  
  if (!initialized) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(enhancedClothingItems));
    await AsyncStorage.setItem(INITIALIZED_KEY, 'true');
    console.log('Sample data initialized');
  }
}

// Call this in your App.tsx useEffect
useEffect(() => {
  initializeSampleData();
}, []);
```

### Option 2: Add a Debug Button

For development, add a button to load sample data:

```typescript
import { enhancedClothingItems } from './src/data/enhancedSampleData';

const loadSampleData = async () => {
  try {
    await AsyncStorage.setItem(
      '@smartcloset_items', 
      JSON.stringify(enhancedClothingItems)
    );
    Alert.alert('Success', 'Sample data loaded!');
  } catch (error) {
    Alert.alert('Error', 'Failed to load sample data');
  }
};

// In your component
<TouchableOpacity onPress={loadSampleData}>
  <Text>Load Sample Data</Text>
</TouchableOpacity>
```

---

## Testing the Wear Tracking Feature

### Test Flow:

1. **Navigate to Wardrobe**
2. **Select an item** to view details
3. **Tap "Mark as Worn Today"**
4. **Verify:**
   - Wear count increments
   - Last worn shows "Today"
   - Cost-per-wear updates
   - Success alert appears

### Test in Stats Screen:

1. **Navigate to Stats**
2. **Verify:**
   - Total items count is correct
   - Most worn items appear
   - Unworn items alert shows (if any)
   - Category breakdown displays
   - Season breakdown displays

---

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test __tests__/services/statsService.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

---

## Troubleshooting

### Issue: Stats screen shows 0 items

**Solution:** Make sure you've loaded the sample data or added items through the app.

```typescript
// Check if data exists
const items = await getClothingItems();
console.log('Items count:', items.length);
```

### Issue: Wear count not updating

**Solution:** Verify the storage service is working:

```typescript
import { getClothingItems } from './src/services/storage';

const checkItem = async (itemId: string) => {
  const items = await getClothingItems();
  const item = items.find(i => i.id === itemId);
  console.log('Item wear count:', item?.wearCount);
};
```

### Issue: TypeScript errors

**Solution:** Make sure all imports use the correct types:

```typescript
// Use types from the types folder
import { ClothingItem, Season, ClothingCategory } from '../types';

// NOT from sampleClothes
// import { ClothingItem } from '../data/sampleClothes'; // ❌ Wrong
```

---

## Quick Start Checklist

- [ ] Install @types/jest: `npm install --save-dev @types/jest`
- [ ] Import StatsScreen in navigation
- [ ] Add Stats tab/screen to navigator
- [ ] Load enhanced sample data
- [ ] Test wear tracking on an item
- [ ] View stats screen
- [ ] Run unit tests
- [ ] Verify all features work

---

## Feature Flags (Optional)

If you want to enable/disable features:

```typescript
// src/config/features.ts
export const FEATURES = {
  WEAR_TRACKING: true,
  ANALYTICS: true,
  COST_TRACKING: true,
  OUTFIT_HISTORY: true,
};

// Usage
import { FEATURES } from './config/features';

{FEATURES.WEAR_TRACKING && (
  <TouchableOpacity onPress={handleMarkAsWorn}>
    <Text>Mark as Worn</Text>
  </TouchableOpacity>
)}
```

---

## Performance Considerations

### Lazy Loading Stats

For better performance, lazy load the stats screen:

```typescript
const StatsScreen = React.lazy(() => import('./src/screens/StatsScreen'));

// In navigator
<Tab.Screen 
  name="Stats" 
  component={StatsScreen}
/>
```

### Memoization

The StatsScreen already uses proper memoization, but you can add more:

```typescript
const stats = useMemo(() => 
  StatsService.calculateWardrobeStats(items),
  [items]
);
```

---

## Next Steps

1. **Add Stats to Navigation** (5 minutes)
2. **Load Sample Data** (2 minutes)
3. **Test Features** (10 minutes)
4. **Run Tests** (2 minutes)
5. **Deploy** 🚀

---

## Support

If you encounter any issues:

1. Check the console for errors
2. Verify AsyncStorage is working
3. Ensure all dependencies are installed
4. Review the FEATURES_ADDED.md for detailed documentation

---

**Happy Coding!** 🎉
