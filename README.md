# SmartCloset

A React Native mobile application that helps you manage your wardrobe, create outfits, and make mindful fashion choices. Built with React Native and TypeScript for iOS and Android platforms.

## Features

- 📸 Clothing Inventory Management
  - Add items with retailer images
  - Upload your own photos
  - Organize by categories
- 👔 Outfit Suggestion System
  - Get personalized outfit recommendations
  - Mix and match from your existing wardrobe
- 💭 Wishlist Management
  - Track potential purchases
  - Make informed buying decisions
- 🌟 Smart Features
  - Reduce overpurchasing
  - Track wear frequency
  - Organize by seasons and occasions

## Getting Started

>**Note**: Make sure you have completed the [React Native - Environment Setup](https://reactnative.dev/docs/environment-setup) instructions till "Creating a new application" step, before proceeding.

## Step 1: Start the Metro Server

First, you will need to start **Metro**, the JavaScript _bundler_ that ships _with_ React Native.

To start Metro, run the following command from the _root_ of your React Native project:

```bash
# using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Start your Application

Let Metro Bundler run in its _own_ terminal. Open a _new_ terminal from the _root_ of your React Native project. Run the following command to start your _Android_ or _iOS_ app:

### For Android

```bash
# using npm
npm run android

# OR using Yarn
yarn android
```

### For iOS

```bash
# using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up _correctly_, you should see your new app running in your _Android Emulator_ or _iOS Simulator_ shortly provided you have set up your emulator/simulator correctly.

This is one way to run your app — you can also run it directly from within Android Studio and Xcode respectively.

## Project Structure

```
smartcloset/
├── src/               # Source files
│   ├── components/    # Reusable UI components
│   ├── screens/      # Screen components
│   ├── navigation/   # Navigation configuration
│   ├── services/     # API and business logic
│   └── utils/        # Helper functions and utilities
├── ios/              # iOS native code
├── android/          # Android native code
└── __tests__/        # Test files
```

## Development

### Prerequisites

- Node.js >= 14
- npm or yarn
- iOS: XCode and CocoaPods
- Android: Android Studio and SDK

### Environment Setup

1. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

2. iOS specific setup:
   ```bash
   cd ios && pod install && cd ..
   ```

### Running in Development

Follow the steps in the 'Getting Started' section above to run the app in development mode.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

1. Open `App.tsx` in your text editor of choice and edit some lines.
2. For **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Developer Menu** (<kbd>Ctrl</kbd> + <kbd>M</kbd> (on Window and Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (on macOS)) to see your changes!

   For **iOS**: Hit <kbd>Cmd ⌘</kbd> + <kbd>R</kbd> in your iOS Simulator to reload the app and see your changes!

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [Introduction to React Native](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you can't get this to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
