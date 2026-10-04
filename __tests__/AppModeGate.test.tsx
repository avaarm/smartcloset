/**
 * The launch gate for a signed-in user. While PRO_MODES_ENABLED is off the
 * "How will you use the app?" prompt never appears and a device whose saved
 * mode is Stylist or Client opens the normal closet app; with it on, the prompt
 * and saved modes work as before.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

let mockProModes = false;

jest.mock('../src/config/features', () => ({
  get PRO_MODES_ENABLED() {
    return mockProModes;
  },
}));
jest.mock('../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'user-1', email: 'ada@example.com', user_metadata: {} } } },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Stand-ins for the first screen of each mode, so the test can tell which
// tab set was built without rendering real screens and their data loads.
jest.mock('../src/screens/HomeScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_HOME</Text>;
});
jest.mock('../src/screens/StylistDashboardScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_STYLIST</Text>;
});
jest.mock('../src/screens/ClientDashboardScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_CLIENT</Text>;
});
jest.mock('../src/screens/AccountTypeOnboardingScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_MODE_PROMPT</Text>;
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const launch = async (): Promise<string> => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  const text = flatten(tree.toJSON());
  await act(async () => {
    tree.unmount();
  });
  return text;
};

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  mockProModes = false;
  (global as any).fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('signed-in launch with the pro modes off (shipping configuration)', () => {
  it('goes straight to the closet app, skipping the mode prompt', async () => {
    const text = await launch();

    expect(text).toContain('SCREEN_HOME');
    expect(text).not.toContain('SCREEN_MODE_PROMPT');
  });

  it.each(['stylist', 'client'])('opens the closet app, not %s mode, if that was saved on the device', async mode => {
    await AsyncStorage.setItem('@smartcloset_current_mode', mode);

    const text = await launch();

    expect(text).toContain('SCREEN_HOME');
    expect(text).not.toContain('SCREEN_STYLIST');
    expect(text).not.toContain('SCREEN_CLIENT');
    expect(await AsyncStorage.getItem('@smartcloset_current_mode')).toBe('user');
  });
});

describe('signed-in launch with the pro modes on', () => {
  beforeEach(() => {
    mockProModes = true;
  });

  it('asks a first-time account how they will use the app', async () => {
    const text = await launch();

    expect(text).toContain('SCREEN_MODE_PROMPT');
    expect(text).not.toContain('SCREEN_HOME');
  });

  it('opens the saved mode for an account that already answered', async () => {
    await AsyncStorage.setItem('@smartcloset_mode_onboarded_user-1', 'true');
    await AsyncStorage.setItem('@smartcloset_current_mode', 'stylist');

    const text = await launch();

    expect(text).toContain('SCREEN_STYLIST');
    expect(text).not.toContain('SCREEN_HOME');
  });
});
