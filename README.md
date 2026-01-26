# SmartCloset

A modern wardrobe management app that helps you organize your clothing, create outfits, track how you wear your clothes, and make mindful fashion choices. Built with React Native and TypeScript for iOS and Android.

## Features

- **Clothing Inventory Management**
  - Add items with retailer images or your own photos
  - Organize by categories, seasons, and occasions
  - Store rich details like cost, purchase date, tags, notes, favorites, and more

- **Outfit Suggestion System**
  - Generate outfit suggestions based on your existing wardrobe
  - Season‑aware filtering of clothing items
  - Save favorite outfit combinations for quick access

- **Wear Tracking**
  - Mark clothing items and outfits as worn
  - Track wear counts and last worn dates
  - See cost‑per‑wear over time

- **Wardrobe Analytics & Insights**
  - Category and season breakdowns of your wardrobe
  - Most‑worn and least‑worn items
  - Unworn item alerts and best‑value pieces

- **Wishlist Management**
  - Track potential purchases in a dedicated wishlist
  - Make more intentional buying decisions
  - Reduce overpurchasing through better wardrobe visibility

## Tech Stack

- React Native with TypeScript
- React Navigation (Stack & Tab navigation)
- React Native Vector Icons
- Async storage and local persistence for wardrobe data
- Native camera & image picker integration

## Project Structure

```
smartcloset/
├── src/
│   ├── components/    # Reusable UI components
│   ├── screens/       # Main screen components
│   ├── assets/        # Images and static assets
│   ├── data/          # Sample data and data helpers
│   ├── services/      # Domain logic (outfits, stats, wear tracking, storage)
│   ├── types/        # TypeScript type definitions
│   └── utils/        # Helper functions
├── ios/              # iOS native code
├── android/          # Android native code
└── __tests__/        # Test files
```

## Getting Started

### Prerequisites

- Node.js >= 14
- npm or yarn
- iOS: XCode and CocoaPods
- Android: Android Studio and SDK

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/smartcloset.git
   cd smartcloset
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. iOS setup:
   ```bash
   cd ios && pod install && cd ..
   ```

### Running the App

1. Start Metro bundler:
   ```bash
   npm start
   ```

2. Run on iOS:
   ```bash
   npm run ios
   ```

   Or Android:
   ```bash
   npm run android
   ```

## Development Tips

- iOS hot reload: press `Cmd + R` in the simulator
- Android hot reload: double‑press `R` in the emulator
- Dev menu:
  - iOS: `Cmd + D` (simulator) or shake device
  - Android: `Cmd + M` / `Ctrl + M` or shake device

If you see **"No bundle URL present"** in iOS:
- Ensure Metro is running (`npm start` or `npx react-native start`)
- Reload the app (`Cmd + R`) or stop and re‑run `npm run ios`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
