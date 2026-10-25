import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockClose = jest.fn();
const mockSwitchMode = jest.fn();
const mockRefreshRole = jest.fn();
let mockMode: { currentMode: string; switchMode: (...a: any[]) => any; refreshRole?: (...a: any[]) => any };
const mockSheetProps: Record<string, any> = {};
const mockMounts: Record<string, number> = {};

// Like the Settings screen's own tests: the real service on top of a supabase client that only has auth.
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'ada@example.com' } } } }) },
  },
}));
jest.mock('../../src/services/proService', () => ({
  ...jest.requireActual('../../src/services/proService'),
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  closeStylistProfile: (...a: any[]) => mockClose(...a),
}));
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => mockMode,
}));

// The five sheets are stand-ins that record their props and how often they were mounted.
// A function declaration, so it exists when the hoisted factories below run.
function mockSheet(name: string) {
  const R = require('react');
  const { Text } = require('react-native');
  const StandIn = (props: any) => {
    mockSheetProps[name] = props;
    R.useEffect(() => {
      mockMounts[name] = (mockMounts[name] ?? 0) + 1;
    }, []);
    return props.visible ? <Text>{`${name.toUpperCase()}_OPEN`}</Text> : null;
  };
  return { __esModule: true, default: StandIn };
}
jest.mock('../../src/components/ProRedeemSheet', () => mockSheet('redeem'));
jest.mock('../../src/components/ProStylistProfileSheet', () => mockSheet('profile'));
jest.mock('../../src/components/ProBlockedSheet', () => mockSheet('blocked'));
jest.mock('../../src/components/ProGuidelinesSheet', () => mockSheet('guidelines'));
jest.mock('../../src/components/ProSafetySheet', () => mockSheet('safety'));

import ProSettingsSection from '../../src/components/ProSettingsSection';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_INDEPENDENT_LINE,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
} from '../../src/config/proRules';
import { ProError } from '../../src/services/proErrors';
import type { ProStatus } from '../../src/types/pro';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const stylistPart = (over: Partial<NonNullable<ProStatus['stylist']>> = {}): NonNullable<ProStatus['stylist']> => ({
  termsCurrent: true,
  accepting: true,
  approved: false,
  invitesHeld: false,
  activeClients: 0,
  clientLimit: 3,
  liveInvites: 0,
  inviteLimit: 1,
  ...over,
});

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: null,
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const asStylist = (over: Partial<ProStatus> = {}) => status({ stylist: stylistPart(), ...over });

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProSettingsSection />);
  });
  await act(async () => {});
  const text = () => flatten(tree.toJSON());
  const titles = () =>
    tree.root
      .findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.props.accessibilityHint)
      .map(n => n.props.accessibilityLabel as string)
      .filter((t, i, all) => all.indexOf(t) === i);
  const row = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function' && n.props.accessibilityHint);
  const press = async (label: string) => {
    const node = row(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, titles, row, press };
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
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockClose.mockReset().mockResolvedValue(undefined);
  mockSwitchMode.mockReset().mockResolvedValue(undefined);
  mockRefreshRole.mockReset().mockResolvedValue(undefined);
  mockMode = { currentMode: 'user', switchMode: mockSwitchMode, refreshRole: mockRefreshRole };
  for (const key of Object.keys(mockSheetProps)) delete mockSheetProps[key];
  for (const key of Object.keys(mockMounts)) delete mockMounts[key];
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  alert.mockRestore();
  jest.useRealTimers();
});

describe('ProSettingsSection: when it shows nothing', () => {
  it.each([
    ['a guest', new ProError('not_authenticated')],
    ['a server without the professional functions', { message: 'Could not find the function', code: 'PGRST202' }],
    ['the server switch being off (the error form)', new ProError('pro_disabled')],
    ['being offline', { message: 'Network request failed' }],
    ['an unexpected failure', new Error('boom')],
  ])('renders nothing for %s, and says nothing about it', async (_n, failure) => {
    mockStatus.mockRejectedValue(failure);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('renders nothing with only auth mocked, as in the Settings tests, and does not log', async () => {
    mockStatus.mockImplementation(jest.requireActual('../../src/services/proService').getProStatus);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('renders nothing while the answer is on its way', async () => {
    mockStatus.mockReturnValue(deferred().promise);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it('renders nothing when the feature is paused on the server', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it('works with an account mode that gives only the mode and the switch', async () => {
    mockMode = { currentMode: 'user', switchMode: mockSwitchMode };
    const { titles } = await render();
    expect(titles()).toContain('Become a stylist');
  });
});

describe('ProSettingsSection: the rows', () => {
  it('offers a person with no stylist role Become a stylist and Connect with a stylist, and the shared rows', async () => {
    const { titles, text } = await render();
    expect(titles()).toEqual([
      'Become a stylist',
      'Connect with a stylist',
      'Blocked stylists and clients',
      'Professional guidelines',
    ]);
    expect(text()).toContain('Professional');
    expect(text()).toContain(PRO_INDEPENDENT_LINE);
  });

  it('offers a stylist in the personal app the workspace, the profile and Connect, and a way to stop', async () => {
    mockStatus.mockResolvedValue(asStylist());
    const { titles } = await render();
    expect(titles()).toEqual([
      'Open the Stylist workspace',
      'Edit stylist profile',
      'Connect with a stylist',
      'Blocked stylists and clients',
      'Professional guidelines',
      'Stop being a stylist',
    ]);
  });

  it('offers a stylist in the workspace a way back, the profile, and no Connect', async () => {
    mockMode = { ...mockMode, currentMode: 'stylist' };
    mockStatus.mockResolvedValue(asStylist());
    const { titles } = await render();
    expect(titles()).toEqual([
      'Back to my closet',
      'Edit stylist profile',
      'Blocked stylists and clients',
      'Professional guidelines',
      'Stop being a stylist',
    ]);
  });

  it('offers a stylist whose terms went out of date the profile (which asks again), not the workspace', async () => {
    mockStatus.mockResolvedValue(asStylist({ stylist: stylistPart({ termsCurrent: false }) }));
    const { titles } = await render();
    expect(titles()).toContain('Edit stylist profile');
    expect(titles()).not.toContain('Open the Stylist workspace');
    expect(titles()).toContain('Stop being a stylist');
  });

  it('still offers Become a stylist after a removal, because the sheet explains it', async () => {
    mockStatus.mockResolvedValue(status({ stylistRemoved: true }));
    const { titles } = await render();
    expect(titles()).toContain('Become a stylist');
  });

  it('offers a suspended account only what needs no consent, with the plain reason', async () => {
    mockStatus.mockResolvedValue(asStylist({ suspended: true }));
    const { titles, text } = await render();
    expect(text()).toContain('Professional features are paused on your account.');
    expect(titles()).toEqual(['Blocked stylists and clients', 'Professional guidelines', 'Stop being a stylist']);
  });

  it('offers nothing that would record agreement when the build cannot show the server’s terms', async () => {
    mockStatus.mockResolvedValue(
      asStylist({ versions: { stylistTerms: '2099-01', clientTerms: '2099-01', shareText: '2026-10' } }),
    );
    const { titles, text } = await render();
    expect(text()).toContain('Update SmartCloset to keep using professional features.');
    expect(titles()).toEqual(['Blocked stylists and clients', 'Professional guidelines', 'Stop being a stylist']);
  });

  it('says the server is behind when this build’s terms are newer', async () => {
    mockStatus.mockResolvedValue(
      status({ versions: { stylistTerms: '2020-01', clientTerms: '2020-01', shareText: '2026-10' } }),
    );
    const { titles, text } = await render();
    expect(text()).toContain('Professional features are being updated. Please try again soon.');
    expect(titles()).not.toContain('Connect with a stylist');
    expect(titles()).not.toContain('Become a stylist');
  });

  it('uses none of the words an app that takes no payment must not show', async () => {
    mockStatus.mockResolvedValue(asStylist());
    const { text } = await render();
    expect(text()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
  });
});

describe('ProSettingsSection: the workspace and the mode', () => {
  it('reads the role from the server first, then opens the workspace', async () => {
    mockStatus.mockResolvedValue(asStylist());
    const { press } = await render();
    await press('Open the Stylist workspace');
    expect(mockRefreshRole).toHaveBeenCalledTimes(1);
    expect(mockSwitchMode).toHaveBeenCalledWith('stylist');
    expect(mockRefreshRole.mock.invocationCallOrder[0]).toBeLessThan(mockSwitchMode.mock.invocationCallOrder[0]);
  });

  it('goes back to the closet without asking the server', async () => {
    mockMode = { ...mockMode, currentMode: 'stylist' };
    mockStatus.mockResolvedValue(asStylist());
    const { press } = await render();
    await press('Back to my closet');
    expect(mockSwitchMode).toHaveBeenCalledWith('user');
    expect(mockRefreshRole).not.toHaveBeenCalled();
  });

  it('switches with an account mode that cannot re-read the role', async () => {
    mockMode = { currentMode: 'user', switchMode: mockSwitchMode };
    mockStatus.mockResolvedValue(asStylist());
    const { press } = await render();
    await press('Open the Stylist workspace');
    expect(mockSwitchMode).toHaveBeenCalledWith('stylist');
  });

  it('survives a mode that cannot be saved, and says nothing', async () => {
    mockSwitchMode.mockRejectedValue(new Error('disk full'));
    mockStatus.mockResolvedValue(asStylist());
    const { press, text } = await render();
    await press('Open the Stylist workspace');
    expect(text()).not.toContain('disk full');
  });
});

describe('ProSettingsSection: the sheets', () => {
  it('mounts no sheet until one is opened, so Settings reads the access once', async () => {
    await render();
    expect(Object.keys(mockMounts)).toEqual([]);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('opens the stylist profile sheet from Become a stylist, and closes it when it is saved', async () => {
    const { press, text } = await render();
    await press('Become a stylist');
    expect(text()).toContain('PROFILE_OPEN');
    expect(mockSheetProps.profile.visible).toBe(true);
    const readsBefore = mockStatus.mock.calls.length;
    await act(async () => {
      mockStatus.mockResolvedValue(asStylist());
      mockSheetProps.profile.onSaved();
    });
    expect(text()).not.toContain('PROFILE_OPEN');
    expect(mockStatus.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('shows the rows of a stylist as soon as the profile is saved', async () => {
    const { press, titles } = await render();
    await press('Become a stylist');
    mockStatus.mockResolvedValue(asStylist());
    await act(async () => {
      mockSheetProps.profile.onSaved();
    });
    expect(titles()).toContain('Open the Stylist workspace');
    expect(titles()).not.toContain('Become a stylist');
  });

  it('opens the same sheet from Edit stylist profile, and closes it without saving', async () => {
    mockStatus.mockResolvedValue(asStylist());
    const { press, text } = await render();
    await press('Edit stylist profile');
    expect(text()).toContain('PROFILE_OPEN');
    await act(async () => {
      mockSheetProps.profile.onClose();
    });
    expect(text()).not.toContain('PROFILE_OPEN');
  });

  it('opens the code sheet, and closes it on onClose', async () => {
    const { press, text } = await render();
    await press('Connect with a stylist');
    expect(text()).toContain('REDEEM_OPEN');
    await act(async () => {
      mockSheetProps.redeem.onClose();
    });
    expect(text()).not.toContain('REDEEM_OPEN');
  });

  it('tells the code sheet that Settings cannot open a connection, so it offers no button that would do nothing', async () => {
    const { press } = await render();
    await press('Connect with a stylist');
    expect(mockSheetProps.redeem.opensConnection).toBe(false);
  });

  it('after connecting closes the sheet, says where to choose what to share, and goes nowhere', async () => {
    const { press, text } = await render();
    await press('Connect with a stylist');
    await act(async () => {
      mockSheetProps.redeem.onConnected('conn-1');
    });
    expect(text()).not.toContain('REDEEM_OPEN');
    expect(text()).toContain("You're connected. Open Stylists on Home to choose what to share.");
    // The note goes away when the person opens anything else.
    await press('Professional guidelines');
    expect(text()).not.toContain("You're connected.");
  });

  it('opens the blocked list and the guidelines', async () => {
    const { press, text } = await render();
    await press('Blocked stylists and clients');
    expect(text()).toContain('BLOCKED_OPEN');
    await act(async () => {
      mockSheetProps.blocked.onClose();
    });
    await press('Professional guidelines');
    expect(text()).toContain('GUIDELINES_OPEN');
    expect(text()).not.toContain('BLOCKED_OPEN');
    await act(async () => {
      mockSheetProps.guidelines.onClose();
    });
    expect(text()).not.toContain('GUIDELINES_OPEN');
  });

  it('opens only one sheet at a time', async () => {
    const { press, text } = await render();
    await press('Connect with a stylist');
    await act(async () => {
      mockSheetProps.redeem.onClose();
    });
    await press('Become a stylist');
    expect(text()).toContain('PROFILE_OPEN');
    expect(text()).not.toContain('REDEEM_OPEN');
  });

  describe('a report about a code', () => {
    it('closes the code sheet and, after a short pause on iOS, opens the safety sheet for the invite', async () => {
      jest.useFakeTimers();
      const { press, text } = await render();
      await press('Connect with a stylist');
      await act(async () => {
        mockSheetProps.redeem.onClose();
        mockSheetProps.redeem.onReport('inv-1', 'Maya Stylist');
      });
      expect(text()).not.toContain('REDEEM_OPEN');
      expect(text()).not.toContain('SAFETY_OPEN');
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(text()).toContain('SAFETY_OPEN');
      expect(mockSheetProps.safety).toMatchObject({
        visible: true,
        refType: 'invite',
        refId: 'inv-1',
        inviteId: 'inv-1',
        label: 'Maya Stylist',
      });
      await act(async () => {
        mockSheetProps.safety.onBlocked();
        mockSheetProps.safety.onClose();
      });
      expect(text()).not.toContain('SAFETY_OPEN');
    });

    it('opens the safety sheet at once where there is no modal hand-off to wait for', async () => {
      const original = Platform.OS;
      Platform.OS = 'android';
      try {
        const { press, text } = await render();
        await press('Connect with a stylist');
        await act(async () => {
          mockSheetProps.redeem.onClose();
          mockSheetProps.redeem.onReport('inv-2', 'Zoe');
        });
        expect(text()).toContain('SAFETY_OPEN');
        expect(mockSheetProps.safety.refId).toBe('inv-2');
      } finally {
        Platform.OS = original;
      }
    });

    it('does not open the safety sheet after another sheet was chosen during the pause', async () => {
      jest.useFakeTimers();
      const { press, text } = await render();
      await press('Connect with a stylist');
      await act(async () => {
        mockSheetProps.redeem.onClose();
        mockSheetProps.redeem.onReport('inv-1', 'Maya Stylist');
      });
      await press('Professional guidelines');
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(text()).toContain('GUIDELINES_OPEN');
      expect(text()).not.toContain('SAFETY_OPEN');
    });

    it('cancels the pause when the section goes away', async () => {
      jest.useFakeTimers();
      const { press, tree } = await render();
      await press('Connect with a stylist');
      await act(async () => {
        mockSheetProps.redeem.onClose();
        mockSheetProps.redeem.onReport('inv-1', 'Maya Stylist');
      });
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});

describe('ProSettingsSection: stopping being a stylist', () => {
  const confirm = async () => {
    const buttons = alert.mock.calls[0][2];
    await act(async () => {
      await buttons.find((b: any) => b.text === 'Stop being a stylist').onPress();
    });
  };

  it('asks first, in plain words, and changes nothing until the person confirms', async () => {
    mockStatus.mockResolvedValue(asStylist());
    const { press } = await render();
    await press('Stop being a stylist');
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Stop being a stylist?');
    expect(message).toBe('Your clients will be disconnected and your profile and invite codes deleted.');
    expect(buttons.map((b: any) => b.text)).toEqual(['Cancel', 'Stop being a stylist']);
    expect(buttons[1].style).toBe('destructive');
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('closes the profile once confirmed, re-reads the role, and shows the rows of a person with no profile', async () => {
    mockStatus.mockResolvedValue(asStylist());
    const { press, titles } = await render();
    await press('Stop being a stylist');
    mockStatus.mockResolvedValue(status());
    await confirm();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockRefreshRole).toHaveBeenCalledTimes(1);
    expect(titles()).toContain('Become a stylist');
    expect(titles()).not.toContain('Stop being a stylist');
    expect(mockSwitchMode).not.toHaveBeenCalled();
  });

  it('puts a stylist who was in the workspace back in the personal app', async () => {
    mockMode = { ...mockMode, currentMode: 'stylist' };
    mockStatus.mockResolvedValue(asStylist());
    const { press } = await render();
    await press('Stop being a stylist');
    await confirm();
    expect(mockSwitchMode).toHaveBeenCalledWith('user');
  });

  it('keeps the rows and says why when closing fails, and lets the person try again', async () => {
    mockClose.mockRejectedValueOnce({ message: 'Network request failed' });
    mockStatus.mockResolvedValue(asStylist());
    const { press, text, titles } = await render();
    await press('Stop being a stylist');
    await confirm();
    expect(text()).toContain('You seem to be offline. Please try again.');
    expect(titles()).toContain('Stop being a stylist');

    mockClose.mockRejectedValueOnce(new Error('relation "pro_stylists" does not exist'));
    await press('Stop being a stylist');
    await act(async () => {
      await alert.mock.calls[1][2].find((b: any) => b.text === 'Stop being a stylist').onPress();
    });
    expect(text()).toContain("Couldn't close your stylist profile. Please try again.");
    expect(text()).not.toContain('pro_stylists');
  });

  it('disables the rows while the profile is being closed', async () => {
    const pending = deferred();
    mockClose.mockReturnValue(pending.promise);
    mockStatus.mockResolvedValue(asStylist());
    const { press, row } = await render();
    await press('Stop being a stylist');
    const buttons = alert.mock.calls[0][2];
    await act(async () => {
      buttons.find((b: any) => b.text === 'Stop being a stylist').onPress();
    });
    expect(row('Edit stylist profile').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      pending.resolve();
    });
    expect(row('Edit stylist profile').props.accessibilityState.disabled).toBe(false);
  });

  it('is offered to a suspended stylist too, because ways out never depend on a switch', async () => {
    mockStatus.mockResolvedValue(asStylist({ suspended: true }));
    const { press } = await render();
    await press('Stop being a stylist');
    await confirm();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

describe('ProSettingsSection: the device', () => {
  it('stores nothing in AsyncStorage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    mockStatus.mockResolvedValue(asStylist());
    const { press } = await render();
    await press('Open the Stylist workspace');
    await press('Connect with a stylist');
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('uses no navigation hook, no navigate() and no storage, and never logs an error', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/components/ProSettingsSection.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/@react-navigation|useNavigation|useFocusEffect|navigate\(|AsyncStorage|console\./);
  });
});
