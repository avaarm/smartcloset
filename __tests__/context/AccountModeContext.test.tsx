/**
 * AccountModeProvider (pro-accounts.md 7.3): the tab set to show is the device's saved preference, honoured only
 * while the server says the account holds an active stylist role. The role is read on mount and when the app returns
 * to the foreground, every failure counts as "not allowed", nothing is logged, and with PRO_MODES_ENABLED off the
 * server is never asked.
 */
import React from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

let mockProModes = true;
jest.mock('../../src/config/features', () => ({
  get PRO_MODES_ENABLED() {
    return mockProModes;
  },
}));
// useProAccess (imported for the one definition of "available") reads this at import only.
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
const mockStatus = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
}));

import { AccountModeProvider, isStylistRoleActive, useAccountMode } from '../../src/context/AccountModeContext';
import { ProError } from '../../src/services/proErrors';
import { PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION } from '../../src/config/proRules';
import type { ProStatus } from '../../src/types/pro';

const CURRENT_MODE = '@smartcloset_current_mode';

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

let latest!: ReturnType<typeof useAccountMode>;
const Probe = () => {
  latest = useAccountMode();
  return null;
};

let listeners: ((state: string) => void)[] = [];
let removed = 0;
const mounted: renderer.ReactTestRenderer[] = [];

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <AccountModeProvider>
        <Probe />
      </AccountModeProvider>,
    );
  });
  mounted.push(tree);
  return tree;
};

const foreground = async () => {
  await act(async () => {
    listeners.forEach(fn => fn('active'));
  });
};

let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockProModes = true;
  mockStatus.mockReset();
  listeners = [];
  removed = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, fn: (state: string) => void) => {
    listeners.push(fn);
    return {
      remove: () => {
        removed += 1;
        listeners = listeners.filter(l => l !== fn);
      },
    };
  }) as any);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop()!;
    await act(async () => tree.unmount());
  }
  jest.restoreAllMocks();
});

describe('isStylistRoleActive', () => {
  it('is true for a stylist whose terms are current, on a live feature', () => {
    expect(isStylistRoleActive(status())).toBe(true);
  });

  it.each([
    ['no stylist profile', { stylist: null }],
    ['the feature switched off', { proEnabled: false }],
    ['a suspension', { suspended: true }],
    ['a removal', { stylistRemoved: true }],
    ['no 18+ confirmation', { adultConfirmed: false }],
    ['stale stylist terms', { stylist: { termsCurrent: false, accepting: true, approved: false, invitesHeld: false, activeClients: 0, clientLimit: 3, liveInvites: 0, inviteLimit: 1 } }],
    ['a server on another terms version than this build', { versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }],
  ] as [string, Partial<ProStatus>][])('is false for %s', (_name, over) => {
    expect(isStylistRoleActive(status(over))).toBe(false);
  });
});

describe('without a provider', () => {
  it('is the personal app, with nothing to refresh', async () => {
    let seen!: ReturnType<typeof useAccountMode>;
    const Bare = () => {
      seen = useAccountMode();
      return null;
    };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Bare />);
    });
    mounted.push(tree);
    expect(seen.currentMode).toBe('user');
    expect(seen.stylistAllowed).toBe(false);
    expect(await seen.refreshRole()).toBe(false);
    await expect(seen.switchMode('stylist')).resolves.toBeUndefined();
  });
});

describe('with the pro modes on', () => {
  it('opens the stylist workspace for a saved stylist mode the server confirms', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    mockStatus.mockResolvedValue(status());

    await mount();

    expect(latest.currentMode).toBe('stylist');
    expect(latest.stylistAllowed).toBe(true);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('stays personal for a saved stylist mode when the server has no stylist role for the account', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    mockStatus.mockResolvedValue(status({ stylist: null }));

    await mount();

    expect(latest.currentMode).toBe('user');
    expect(latest.stylistAllowed).toBe(false);
  });

  it('stays personal for a confirmed stylist who never chose the workspace on this device', async () => {
    mockStatus.mockResolvedValue(status());

    await mount();

    expect(latest.stylistAllowed).toBe(true);
    expect(latest.currentMode).toBe('user');
  });

  it('reads a stored client mode from an older build as personal', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'client');
    mockStatus.mockResolvedValue(status());

    await mount();

    expect(latest.currentMode).toBe('user');
  });

  it('shows no workspace until the server has answered', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    let answer!: (s: ProStatus) => void;
    mockStatus.mockReturnValue(new Promise<ProStatus>(resolve => { answer = resolve; }));

    await mount();
    expect(latest.currentMode).toBe('user');

    await act(async () => answer(status()));
    expect(latest.currentMode).toBe('stylist');
  });

  it.each([
    ['a guest', new ProError('not_authenticated')],
    ['no connection', new ProError('offline')],
    ['a server without the functions', new ProError('not_deployed')],
    ['an unexpected failure', new Error('boom')],
  ])('counts %s as not allowed, and logs nothing', async (_name, failure) => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    mockStatus.mockRejectedValue(failure);

    await mount();
    await foreground();

    expect(latest.currentMode).toBe('user');
    expect(latest.stylistAllowed).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('reads the role again when the app returns to the foreground, and sends a suspended stylist back to the closet', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    mockStatus.mockResolvedValueOnce(status());
    await mount();
    expect(latest.currentMode).toBe('stylist');

    mockStatus.mockResolvedValueOnce(status({ suspended: true }));
    await foreground();

    expect(mockStatus).toHaveBeenCalledTimes(2);
    expect(latest.currentMode).toBe('user');
    // The preference itself is untouched: an unsuspended account is back in the workspace.
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('stylist');
    mockStatus.mockResolvedValueOnce(status());
    await foreground();
    expect(latest.currentMode).toBe('stylist');
  });

  it('ignores the other app states', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    await act(async () => {
      listeners.forEach(fn => fn('background'));
      listeners.forEach(fn => fn('inactive'));
    });
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('refreshRole resolves with the new answer, so a caller can switch right after saving a profile', async () => {
    mockStatus.mockResolvedValueOnce(status({ stylist: null }));
    await mount();
    expect(latest.stylistAllowed).toBe(false);

    mockStatus.mockResolvedValueOnce(status());
    let answer: boolean | undefined;
    await act(async () => {
      answer = await latest.refreshRole();
    });
    expect(answer).toBe(true);
    expect(latest.stylistAllowed).toBe(true);

    await act(async () => latest.switchMode('stylist'));
    expect(latest.currentMode).toBe('stylist');
  });

  it('refreshRole never rejects', async () => {
    mockStatus.mockRejectedValue(new Error('boom'));
    await mount();
    await act(async () => {
      await expect(latest.refreshRole()).resolves.toBe(false);
    });
  });

  it('drops an older answer that arrives after a newer one', async () => {
    let slow!: (s: ProStatus) => void;
    mockStatus.mockReturnValueOnce(new Promise<ProStatus>(resolve => { slow = resolve; }));
    await mount();

    mockStatus.mockResolvedValueOnce(status({ stylist: null }));
    await act(async () => {
      await latest.refreshRole();
    });
    expect(latest.stylistAllowed).toBe(false);

    await act(async () => slow(status()));
    expect(latest.stylistAllowed).toBe(false);
  });

  it('switchMode saves the preference and changes the tab set at once for a confirmed stylist', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    expect(latest.currentMode).toBe('user');

    await act(async () => latest.switchMode('stylist'));
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('stylist');
    expect(latest.currentMode).toBe('stylist');

    await act(async () => latest.switchMode('user'));
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('user');
    expect(latest.currentMode).toBe('user');
  });

  it('switchMode rejects when the preference cannot be saved, and nothing changes', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await act(async () => {
      await expect(latest.switchMode('stylist')).rejects.toThrow('disk full');
    });
    expect(latest.currentMode).toBe('user');
  });

  it('stops listening and drops late answers once unmounted', async () => {
    mockStatus.mockResolvedValue(status());
    const tree = await mount();
    expect(listeners).toHaveLength(1);

    await act(async () => tree.unmount());
    mounted.pop();

    expect(removed).toBe(1);
    expect(listeners).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('with the pro modes off (shipping configuration)', () => {
  beforeEach(() => {
    mockProModes = false;
  });

  it('never asks the server, and is personal whatever the device saved', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    mockStatus.mockResolvedValue(status());

    await mount();
    await foreground();
    let answer: boolean | undefined;
    await act(async () => {
      answer = await latest.refreshRole();
    });

    expect(mockStatus).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
    expect(answer).toBe(false);
    expect(latest.stylistAllowed).toBe(false);
    expect(latest.currentMode).toBe('user');
    // The saved preference is put back, so a later build with the feature on does not surprise the person.
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('user');
  });
});
