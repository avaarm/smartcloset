# SmartCloset Color Scheme Update

## New Color Palette - Modern Purple Theme

The app has been updated with a fresh, modern color scheme featuring a sophisticated purple palette with warm accents.

### Primary Colors

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Primary Purple** | `#8B7FD9` | Main brand color, buttons, active states, accents |
| **Accent Purple** | `#8B7FD9` | Same as primary for consistency |
| **Dark Purple** | `#6B5FB9` | Hover states, pressed states |
| **Light Purple** | `#A599E9` | Subtle accents, gradients |
| **Background** | `#F8F7FF` | Soft lavender white background |
| **Card Background** | `#FFFFFF` | Pure white for cards and surfaces |

### Text Colors

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Primary Text** | `#1F1B2E` | Deep purple-black for main text |
| **Secondary Text** | `#6B7280` | Cool gray for secondary text |
| **Medium Gray** | `#9CA3AF` | Medium gray for labels |
| **Dark Gray** | `#374151` | Dark gray for emphasis |

### Functional Colors

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Success** | `#10B981` | Modern green for success states |
| **Warning** | `#F59E0B` | Amber for warnings |
| **Error** | `#EF4444` | Modern red for errors |
| **Info** | `#3B82F6` | Blue for informational messages |

### UI Element Colors

| Element | Color | Hex Code |
|---------|-------|----------|
| **Light Gray** | Borders, dividers | `#E5E7EB` |
| **Muted Background** | Sections, cards | `#F3F4F6` |
| **Category Tags** | Tag backgrounds | `#EDE9FE` |
| **Shadow** | Drop shadows | `#8B7FD9` |

### Gradients

#### Primary Gradient
```typescript
['#8B7FD9', '#A599E9']
```
Used for: Main buttons, CTAs, featured elements

#### Secondary Gradient
```typescript
['#F3F4F6', '#F8F7FF']
```
Used for: Backgrounds, subtle sections

#### Dark Gradient
```typescript
['#6B5FB9', '#4C3F99']
```
Used for: Dark mode elements, headers

#### Luxury Gradient
```typescript
['#8B7FD9', '#9D8FE3', '#AFA3ED']
```
Used for: Premium features, special highlights

#### Accent Gradient
```typescript
['#A599E9', '#C4B5FD']
```
Used for: Subtle accents, overlays

## Updated Components

### Navigation
- **Tab Bar Active Color**: `#8B7FD9` (purple)
- **Tab Bar Inactive Color**: `#9CA3AF` (gray)
- **Header Text**: `#1F1B2E` (deep purple-black)
- **Shadow Color**: Purple-tinted shadows

### Screens Updated

1. **WardrobeScreen**
   - Load Sample button: Purple border and text
   - Add button: Purple gradient
   - Loading indicator: Purple

2. **AddClothingScreen**
   - Camera icon: Purple
   - Save button: Purple background
   - Favorite toggle: Purple thumb
   - AI suggestions: Purple accent border

3. **OutfitScreen**
   - Loading indicators: Purple
   - Refresh control: Purple
   - Action buttons: Purple accents

4. **Components**
   - OutfitCard: Purple bookmark icon
   - WeatherWidget: Purple error states
   - SmartCameraButton: Purple background

## Design Philosophy

### Modern & Fresh
The purple color scheme brings a modern, fresh feel to the app while maintaining sophistication and elegance.

### Accessibility
- High contrast ratios between text and backgrounds
- Clear visual hierarchy with purple accents
- Consistent color usage across the app

### Brand Identity
- Purple conveys creativity, luxury, and innovation
- Perfect for a fashion/wardrobe app
- Memorable and distinctive

## Color Psychology

**Purple** represents:
- 👗 **Luxury & Sophistication** - Perfect for fashion
- 🎨 **Creativity** - Encourages outfit experimentation
- ✨ **Innovation** - Modern, tech-forward feel
- 💜 **Uniqueness** - Stands out from typical fashion apps

## Implementation Details

### Theme File
All colors are centralized in `/src/styles/theme.ts` for easy maintenance and consistency.

### Usage Example
```typescript
import { theme } from '../styles/theme';

// Use theme colors
backgroundColor: theme.colors.primary
color: theme.colors.text
```

### Gradients
```typescript
import LinearGradient from 'react-native-linear-gradient';

<LinearGradient
  colors={theme.colors.gradient.primary}
  style={styles.button}
>
  {/* Content */}
</LinearGradient>
```

## Before & After

### Old Color Scheme
- Primary: Dusty Rose `#D4A5A5`
- Accent: Pink/Red `#FF385C`
- Overall: Warm, pink-toned

### New Color Scheme
- Primary: Vibrant Purple `#8B7FD9`
- Accent: Light Purple `#A599E9`
- Overall: Cool, modern, sophisticated

## Benefits of the New Scheme

1. **More Modern** - Purple is trending in modern app design
2. **Better Contrast** - Improved readability with new text colors
3. **Gender Neutral** - Purple appeals to all users
4. **Distinctive** - Stands out from competitors
5. **Versatile** - Works well with various clothing colors
6. **Professional** - Conveys quality and sophistication

## Future Enhancements

- Dark mode variant with deeper purples
- Seasonal color themes
- User-customizable accent colors
- Color-blind friendly mode
