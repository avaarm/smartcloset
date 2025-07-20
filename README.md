# SmartCloset

A modern wardrobe management app that helps you organize your clothing, create outfits, and make mindful fashion choices. Built with React Native and TypeScript for iOS and Android platforms.

## Features

- 📸 **Clothing Inventory Management**
  - Add items with retailer images or your own photos
  - Organize by categories, seasons, and occasions
  - Track wear frequency and usage patterns

- 👔 **Outfit Suggestion System**
  - Get personalized outfit recommendations
  - Mix and match from your existing wardrobe
  - Save favorite combinations

- 💭 **Wishlist Management**
  - Track potential purchases
  - Make informed buying decisions
  - Reduce overpurchasing through better wardrobe visibility

## Tech Stack

- React Native with TypeScript
- React Navigation (Stack & Tab navigation)
- React Native Vector Icons
- Local storage for data persistence
- Native camera integration

## Project Structure

```
smartcloset/
├── src/
│   ├── components/    # Reusable UI components
│   ├── screens/       # Main screen components
│   ├── assets/       # Images and static assets
│   ├── data/         # Data models and storage
│   ├── services/     # Business logic
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

## Development

- iOS hot reload: Press Cmd + R in simulator
- Android hot reload: Press R twice
- Access dev menu: 
  - iOS: Cmd + D
  - Android: Cmd + M (macOS) or Ctrl + M (Windows/Linux)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
