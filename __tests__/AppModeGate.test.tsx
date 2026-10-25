/**
 * The launch gate for a signed-in user. While PRO_MODES_ENABLED is off the "How will you use the app?" prompt never
 * appears, the server is never asked about a stylist role, and a device whose saved mode is Stylist (or the retired
 * Client) opens the normal closet app. With it on, the prompt is shown once per account, and the Stylist workspace
 * opens only for a saved stylist mode that the server confirms with an active stylist role.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import { resetProEntry, takeProEntry } from '../src/services/proEntry';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
} from '../src/config/proRules';
import type { ProStatus } from '../src/types/pro';

let mockProModes = false;
const mockGetProStatus = jest.fn();

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
jest.mock('../src/services/proService', () => ({
  ...jest.requireActual('../src/services/proService'),
  getProStatus: (...a: unknown[]) => mockGetProStatus(...a),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Stand-ins for the first screen of each mode, so the test can tell which
// tab set was built without rendering real screens and their data loads.
jest.mock('../src/screens/HomeScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_HOME</Text>;
});
jest.mock('../src/screens/ProClientsScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_STYLIST</Text>;
});
jest.mock('../src/screens/ProOnboardingScreen', () => {
  const { Text, Pressable } = require('react-native');
  return ({ onComplete }: { onComplete: (choice: string) => void }) => (
    <>
      <Text>SCREEN_MODE_PROMPT</Text>
      <Pressable testID="choose-personal" onPress={() => onComplete('personal')} />
      <Pressable testID="choose-stylist" onPress={() => onComplete('stylist')} />
      <Pressable testID="choose-client" onPress={() => onComplete('client')} />
    </>
  );
});

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: { termsCurrent: true, accepting: true, approved: false, invitesHeld: false, activeClients: 0, clientLimit: 3, liveInvites: 0, inviteLimit: 1 },
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const open = async (): Promise<renderer.ReactTestRenderer> => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  await settle();
  return tree;
};

const launch = async (): Promise<string> => {
  const tree = await open();
  const text = flatten(tree.toJSON());
  await act(async () => {
    tree.unmount();
  });
  return text;
};

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  resetProEntry();
  mockProModes = false;
  mockGetProStatus.mockReset();
  mockGetProStatus.mockRejectedValue(new Error('no server in this test'));
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
    mockGetProStatus.mockResolvedValue(status());

    const text = await launch();

    expect(text).toContain('SCREEN_HOME');
    expect(text).not.toContain('SCREEN_STYLIST');
    expect(await AsyncStorage.getItem('@smartcloset_current_mode')).toBe('user');
  });

  it('never asks the server about a stylist role', async () => {
    await AsyncStorage.setItem('@smartcloset_current_mode', 'stylist');
    mockGetProStatus.mockResolvedValue(status());

    await launch();

    expect(mockGetProStatus).not.toHaveBeenCalled();
  });
});

describe('signed-in launch with the pro modes on', () => {
  beforeEach(() => {
    mockProModes = true;
  });

  it('asks a first-time account how they will use the app, and only once', async () => {
    const first = await launch();

    expect(first).toContain('SCREEN_MODE_PROMPT');
    expect(first).not.toContain('SCREEN_HOME');
    // Showing the prompt does not answer it: the flag is stored when the person chooses.
    expect(await AsyncStorage.getItem('@smartcloset_mode_onboarded_user-1')).toBeNull();

    await AsyncStorage.setItem('@smartcloset_mode_onboarded_user-1', 'true');
    const second = await launch();

    expect(second).toContain('SCREEN_HOME');
    expect(second).not.toContain('SCREEN_MODE_PROMPT');
  });

  it.each([
    ['personal', null],
    ['stylist', 'stylist'],
    ['client', 'client'],
  ] as const)('after "%s": marks the prompt done, keeps the intent for Home (%s), and opens the closet app', async (choice, intent) => {
    const tree = await open();

    await act(async () => {
      tree.root.findByProps({ testID: `choose-${choice}` }).props.onPress();
    });
    await settle();

    expect(flatten(tree.toJSON())).toContain('SCREEN_HOME');
    expect(flatten(tree.toJSON())).not.toContain('SCREEN_MODE_PROMPT');
    expect(await AsyncStorage.getItem('@smartcloset_mode_onboarded_user-1')).toBe('true');
    expect(takeProEntry()).toBe(intent);
    expect(takeProEntry()).toBeNull();
    // Nothing is stored for the intent and the mode preference is not touched by the prompt.
    expect(await AsyncStorage.getItem('@smartcloset_current_mode')).toBeNull();

    await act(async () => {
      tree.unmount();
    });
  });

  describe('for an account that already answered', () => {
    beforeEach(async () => {
      await AsyncStorage.setItem('@smartcloset_mode_onboarded_user-1', 'true');
    });

    it('opens the Stylist workspace for a saved stylist mode the server confirms', async () => {
      await AsyncStorage.setItem('@smartcloset_current_mode', 'stylist');
      mockGetProStatus.mockResolvedValue(status());

      const text = await launch();

      expect(text).toContain('SCREEN_STYLIST');
      expect(text).not.toContain('SCREEN_HOME');
    });

    it('opens the closet app for a saved stylist mode when the server has no stylist role for the account', async () => {
      await AsyncStorage.setItem('@smartcloset_current_mode', 'stylist');
      mockGetProStatus.mockResolvedValue(status({ stylist: null }));

      const text = await launch();

      expect(text).toContain('SCREEN_HOME');
      expect(text).not.toContain('SCREEN_STYLIST');
    });

    it.each([
      ['suspended', { suspended: true }],
      ['paused', { proEnabled: false }],
    ] as [string, Partial<ProStatus>][])('opens the closet app for a stylist whose account is %s', async (_name, over) => {
      await AsyncStorage.setItem('@smartcloset_current_mode', 'stylist');
      mockGetProStatus.mockResolvedValue(status(over));

      expect(await launch()).toContain('SCREEN_HOME');
    });

    it('opens the closet app when the server cannot be reached, and logs nothing', async () => {
      await AsyncStorage.setItem('@smartcloset_current_mode', 'stylist');
      mockGetProStatus.mockRejectedValue(new Error('offline'));

      const text = await launch();

      expect(text).toContain('SCREEN_HOME');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('opens the closet app, not a client mode, for a client mode saved by an older build', async () => {
      await AsyncStorage.setItem('@smartcloset_current_mode', 'client');
      mockGetProStatus.mockResolvedValue(status());

      const text = await launch();

      expect(text).toContain('SCREEN_HOME');
      expect(text).not.toContain('SCREEN_STYLIST');
    });

    it('opens the closet app for a confirmed stylist who has not chosen the workspace', async () => {
      mockGetProStatus.mockResolvedValue(status());

      expect(await launch()).toContain('SCREEN_HOME');
    });
  });
});

describe('launch housekeeping', () => {
  it('removes what the old on-device stylist and client simulation left, and keeps the mode and the prompt flag', async () => {
    await AsyncStorage.multiSet([
      ['@smartcloset_stylist_clients', '[]'],
      ['@smartcloset_message_threads', '[]'],
      ['@smartcloset_account_type', 'stylist'],
      ['@smartcloset_current_mode', 'user'],
      ['@smartcloset_mode_onboarded_user-1', 'true'],
    ]);

    await launch();

    expect((await AsyncStorage.getAllKeys()).slice().sort()).toEqual([
      '@smartcloset_current_mode',
      '@smartcloset_mode_onboarded_user-1',
    ]);
  });
});
