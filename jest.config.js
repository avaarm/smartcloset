module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      'react-native' +
      '|@react-native' +
      '|@react-native-community' +
      '|@react-navigation' +
      '|react-native-vector-icons' +
      '|react-native-linear-gradient' +
      '|react-native-reanimated' +
      '|react-native-screens' +
      '|react-native-safe-area-context' +
      '|react-native-pager-view' +
      '|react-native-tab-view' +
      '|react-native-gesture-handler' +
      '|@sentry/react-native' +
      '|@invertase/react-native-apple-authentication' +
      '|@react-native-google-signin' +
      '|@react-native-async-storage' +
      '|@react-native-picker' +
      '|react-native-image-picker' +
      '|react-native-permissions' +
      '|react-native-fs' +
      '|react-native-url-polyfill' +
    ')/)',
  ],
};
