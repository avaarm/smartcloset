/* eslint-env jest */

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock vector icons (avoid font/native side-effects)
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');
jest.mock('react-native-vector-icons/Feather', () => 'Icon');

// Mock reanimated
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

// Silence the gesture-handler / screens native warnings in tests
jest.mock('react-native-gesture-handler', () => ({}), { virtual: true });

// Mock react-native-dotenv @env imports — values aren't relevant to render tests
jest.mock(
  '@env',
  () => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    GOOGLE_VISION_API_KEY: '',
    GOOGLE_CLOUD_PROJECT_ID: '',
    GOOGLE_VISION_LOCATION: 'us-west1',
    GOOGLE_CSE_ID: '',
    GOOGLE_CSE_API_KEY: '',
    OPENAI_API_KEY: '',
    GOOGLE_WEB_CLIENT_ID: '',
    GOOGLE_IOS_CLIENT_ID: '',
    APPLE_SERVICE_ID: '',
    APP_ENV: 'test',
    APP_VERSION: '1.0.0',
    ENABLE_AI_SUGGESTIONS: 'false',
    ENABLE_VISION_API: 'false',
    ENABLE_AI_BODY_ANALYSIS: 'false',
    ENABLE_REVERSE_IMAGE_SEARCH: 'false',
    ENABLE_OFFLINE_MODE: 'true',
    MAX_IMAGE_SIZE_MB: '10',
    IMAGE_QUALITY: '80',
    THUMBNAIL_SIZE: '300',
    SENTRY_DSN: '',
  }),
  { virtual: true },
);

// Native screens mock
jest.mock('react-native-screens', () => {
  const actual = jest.requireActual('react-native-screens');
  return { ...actual, enableScreens: jest.fn() };
});

// ── Native modules that have no JS fallback in the test environment ──────────
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/mock/documents',
    TemporaryDirectoryPath: '/mock/tmp',
    exists: jest.fn(async () => false),
    readFile: jest.fn(async () => ''),
    writeFile: jest.fn(async () => undefined),
    copyFile: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
  },
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ data: { idToken: 'mock-token' } })),
    signOut: jest.fn(async () => undefined),
  },
}));
jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    isSupported: true,
    performRequest: jest.fn(),
    Operation: { LOGIN: 0 },
    Scope: { EMAIL: 0, FULL_NAME: 1 },
  },
  AppleButton: 'AppleButton',
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
  launchCamera: jest.fn(async () => ({ didCancel: true })),
}));
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: { IOS: {} },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
  check: jest.fn(async () => 'granted'),
  request: jest.fn(async () => 'granted'),
}));
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('@react-native-picker/picker', () => {
  const Picker = 'Picker';
  Picker.Item = 'PickerItem';
  return { Picker };
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
