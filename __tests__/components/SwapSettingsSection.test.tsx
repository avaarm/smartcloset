import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Switch } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSettings = jest.fn();
const mockJoin = jest.fn();
const mockLeave = jest.fn();
// Like the Settings screen's own tests: the real service on top of a supabase client that only has auth.
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'ada@example.com' } } } }) },
  },
}));
jest.mock('../../src/services/swapService', () => ({
  ...jest.requireActual('../../src/services/swapService'),
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  joinSwapCommunity: (...a: any[]) => mockJoin(...a),
  leaveSwapCommunity: (...a: any[]) => mockLeave(...a),
}));

import SwapSettingsSection from '../../src/components/SwapSettingsSection';
import { SWAP_COMMUNITY_SCAN_NOTICE, SWAP_TERMS_VERSION } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { SwapSettings } from '../../src/types/swap';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const settings = (over: Partial<SwapSettings> = {}): SwapSettings => ({
  swapsEnabled: true,
  termsAccepted: true,
  termsCurrent: true,
  currentTermsVersion: SWAP_TERMS_VERSION,
  communityAvailable: true,
  communityJoined: false,
  alias: null,
  adultConfirmed: false,
  suspended: false,
  needsYou: 0,
  ...over,
});

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapSettingsSection />);
  });
  const text = () => flatten(tree.toJSON());
  const toggle = () => tree.root.findAllByType(Switch)[0];
  const flip = async (value: boolean) => {
    await act(async () => {
      toggle().props.onValueChange(value);
    });
  };
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, toggle, flip, press };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
let alert: jest.SpyInstance;
beforeEach(() => {
  mockSettings.mockReset().mockResolvedValue(settings());
  mockJoin.mockReset().mockResolvedValue(undefined);
  mockLeave.mockReset().mockResolvedValue(undefined);
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  alert.mockRestore();
});

describe('SwapSettingsSection: when it shows nothing', () => {
  it.each([
    ['a guest', new SwapError('not_authenticated')],
    ['a server without swap functions', { message: 'Could not find the function', code: 'PGRST202' }],
    ['the server switch being off', new SwapError('swaps_disabled')],
    ['being offline', { message: 'Network request failed' }],
    ['an unexpected failure', new Error('boom')],
  ])('renders nothing for %s, and says nothing about it', async (_n, failure) => {
    mockSettings.mockRejectedValue(failure);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('renders nothing with only auth mocked, as in the Settings tests, and does not log', async () => {
    mockSettings.mockImplementation(jest.requireActual('../../src/services/swapService').getSwapSettings);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders nothing while the answer is on its way', async () => {
    mockSettings.mockReturnValue(deferred().promise);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it('renders nothing if the service is replaced by something that returns nothing', async () => {
    mockSettings.mockReturnValue(undefined);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it.each([
    ['swaps are switched off', { swapsEnabled: false }],
    ['the account is suspended', { suspended: true }],
    ['the community tier is off on the server', { communityAvailable: false }],
    ['the server’s terms are newer than this build’s', { currentTermsVersion: `${SWAP_TERMS_VERSION}-next` }],
    ['the server’s terms are older than this build’s', { currentTermsVersion: '2020-01' }],
  ])('hides the row when %s', async (_n, over) => {
    mockSettings.mockResolvedValue(settings(over as Partial<SwapSettings>));
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it('hides the row for a joined member too when this build cannot show the current terms', async () => {
    mockSettings.mockResolvedValue(settings({ communityJoined: true, alias: 'Velvet Otter', currentTermsVersion: '2099-01' }));
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  // Joining needs the current terms accepted, and the join step can only read them, so the switch would
  // lead to a failure after the form was filled in.
  it.each([
    ['has not accepted any swap terms', { termsAccepted: false, termsCurrent: false }],
    ['accepted an older version of the swap terms', { termsAccepted: true, termsCurrent: false }],
  ])('hides the row for a member who has not joined and %s', async (_n, over) => {
    mockSettings.mockResolvedValue(settings(over as Partial<SwapSettings>));
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(mockJoin).not.toHaveBeenCalled();
  });
});

describe('SwapSettingsSection: the Community swaps row', () => {
  it('shows a switch that is off for a member who has not joined', async () => {
    const { text, toggle } = await render();
    expect(text()).toContain('Community swaps');
    expect(toggle().props.value).toBe(false);
    expect(toggle().props.accessibilityLabel).toBe('Community swaps');
    expect(text()).toContain('They see an alias you choose, never your name.');
  });

  it('shows the switch on, with the alias, for a member who has joined', async () => {
    mockSettings.mockResolvedValue(settings({ communityJoined: true, alias: 'Velvet Otter' }));
    const { text, toggle } = await render();
    expect(toggle().props.value).toBe(true);
    expect(text()).toContain('Joined as Velvet Otter');
  });

  it('keeps the switch for a joined member whose terms went stale, so they can still leave', async () => {
    mockSettings.mockResolvedValue(
      settings({ termsAccepted: true, termsCurrent: false, communityJoined: true, alias: 'Velvet Otter' }),
    );
    const { flip, toggle, text, tree } = await render();
    expect(toggle().props.value).toBe(true);
    expect(text()).toContain('Joined as Velvet Otter');

    await flip(false);
    expect(alert).toHaveBeenCalledTimes(1);
    mockSettings.mockResolvedValue(
      settings({ termsAccepted: true, termsCurrent: false, communityJoined: false, alias: null }),
    );
    const leave = alert.mock.calls[0][2].find((b: any) => b.text === 'Leave');
    await act(async () => {
      await leave.onPress();
    });
    expect(mockLeave).toHaveBeenCalledTimes(1);
    // Once out, the switch is gone until the terms are accepted again on the swap board: no way back in from here.
    expect(tree.toJSON()).toBeNull();
  });

  it('turning it on opens the join step and records nothing yet', async () => {
    const { flip, text, toggle } = await render();
    expect(text()).not.toContain('Join community swaps');
    await flip(true);
    expect(text()).toContain('Join community swaps');
    expect(mockJoin).not.toHaveBeenCalled();
    expect(toggle().props.value).toBe(false);
  });

  it('joins, closes the step and shows the switch on', async () => {
    const { flip, press, text, toggle, tree } = await render();
    await flip(true);

    const field = tree.root.find(n => n.props.accessibilityLabel === 'Alias' && n.props.onChangeText);
    await act(async () => {
      field.props.onChangeText('Velvet Otter');
    });
    await press('I am 18 or older');
    await press(SWAP_COMMUNITY_SCAN_NOTICE);
    mockSettings.mockResolvedValue(settings({ communityJoined: true, alias: 'Velvet Otter' }));
    await press('Join');

    expect(mockJoin).toHaveBeenCalledWith({ alias: 'Velvet Otter', adult: true, photoScanOk: true });
    expect(text()).not.toContain('Join community swaps');
    expect(toggle().props.value).toBe(true);
    expect(text()).toContain('Joined as Velvet Otter');
  });

  it('cancelling the join step leaves the switch off', async () => {
    const { flip, press, toggle, text } = await render();
    await flip(true);
    await press('Cancel');
    expect(text()).not.toContain('Join community swaps');
    expect(toggle().props.value).toBe(false);
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('turning it off asks first, in plain words', async () => {
    mockSettings.mockResolvedValue(settings({ communityJoined: true, alias: 'Velvet Otter' }));
    const { flip } = await render();
    await flip(false);
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Leave community swaps?');
    expect(message).toBe('Your pieces go back to friends only and swaps with people who are not friends end.');
    expect(buttons.map((b: any) => b.text)).toEqual(['Cancel', 'Leave']);
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it('leaves only after the member confirms, then shows the switch off', async () => {
    mockSettings.mockResolvedValue(settings({ communityJoined: true, alias: 'Velvet Otter' }));
    const { flip, toggle, text } = await render();
    await flip(false);

    mockSettings.mockResolvedValue(settings({ communityJoined: false, alias: null }));
    const leave = alert.mock.calls[0][2].find((b: any) => b.text === 'Leave');
    await act(async () => {
      await leave.onPress();
    });
    expect(mockLeave).toHaveBeenCalledTimes(1);
    expect(toggle().props.value).toBe(false);
    expect(text()).not.toContain('Joined as');
  });

  it('keeps the member joined and says why when leaving fails', async () => {
    mockSettings.mockResolvedValue(settings({ communityJoined: true, alias: 'Velvet Otter' }));
    mockLeave.mockRejectedValue({ message: 'Network request failed' });
    const { flip, toggle, text } = await render();
    await flip(false);
    const leave = alert.mock.calls[0][2].find((b: any) => b.text === 'Leave');
    await act(async () => {
      await leave.onPress();
    });
    expect(toggle().props.value).toBe(true);
    expect(text()).toContain('You seem to be offline. Check your connection and try again.');

    mockLeave.mockRejectedValue(new Error('strange'));
    await act(async () => {
      await leave.onPress();
    });
    expect(text()).toContain('Couldn’t leave community swaps. Please try again.');
    expect(text()).not.toContain('strange');
  });

  it('turning it off does not ask or call anything for a member who is not joined', async () => {
    const { flip } = await render();
    await flip(false);
    // Off while already off is not a leave: the switch never reports it, but the row must be safe if it does.
    expect(alert).not.toHaveBeenCalled();
    expect(mockLeave).not.toHaveBeenCalled();
  });
});

describe('SwapSettingsSection: the device', () => {
  it('stores nothing in AsyncStorage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    const { flip } = await render();
    await flip(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('uses no navigation and no module-level work', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/components/SwapSettingsSection.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/@react-navigation|useNavigation|navigate\(|AsyncStorage/);
    expect(code).not.toMatch(/console\.error/);
  });
});
