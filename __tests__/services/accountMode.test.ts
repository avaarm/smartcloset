/**
 * The device keeps one thing about professional accounts: which tab set the person last used ('user' or
 * 'stylist'). With PRO_MODES_ENABLED off the stylist workspace cannot be opened, so there is no first-run prompt and
 * a device that saved the stylist mode (or the retired client mode) is put back to the personal mode instead of being
 * stranded in it. With it on, the preference is read as saved; AccountModeContext honours 'stylist' only while the
 * server confirms the role.
 */
let mockProModes = false;
jest.mock('../../src/config/features', () => ({
  get PRO_MODES_ENABLED() {
    return mockProModes;
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCurrentMode,
  setCurrentMode,
  hasCompletedModeOnboarding,
  markModeOnboardingComplete,
} from '../../src/services/accountService';

const CURRENT_MODE = '@smartcloset_current_mode';
const ACCOUNT_TYPE = '@smartcloset_account_type';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockProModes = false;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('ships on (the professional accounts are in this build; the server switch pro_enabled is the other half)', () => {
  expect(jest.requireActual('../../src/config/features').PRO_MODES_ENABLED).toBe(true);
});

describe('with the pro modes off (the build switch turned off for these cases)', () => {

  it.each(['stylist', 'client'])('puts a device saved in %s mode back to personal', async mode => {
    await AsyncStorage.setItem(CURRENT_MODE, mode);

    expect(await getCurrentMode()).toBe('user');

    // Persisted, not just masked, so the next launch starts clean too.
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('user');
  });

  it('leaves personal mode alone and defaults to it', async () => {
    expect(await getCurrentMode()).toBe('user');
    await setCurrentMode('user');
    expect(await getCurrentMode()).toBe('user');
  });

  it('never shows the first-run mode prompt, even for a never-onboarded account', async () => {
    expect(await hasCompletedModeOnboarding('new-user')).toBe(true);
  });

  it('still returns personal mode if the reset cannot be saved', async () => {
    await AsyncStorage.setItem(CURRENT_MODE, 'stylist');
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    expect(await getCurrentMode()).toBe('user');
  });
});

describe('with the pro modes on', () => {
  beforeEach(() => {
    mockProModes = true;
  });

  it('keeps the saved stylist mode', async () => {
    await setCurrentMode('stylist');
    expect(await getCurrentMode()).toBe('stylist');
    await setCurrentMode('user');
    expect(await getCurrentMode()).toBe('user');
  });

  it.each(['client', 'admin', ''])('reads a stored "%s" as personal', async stored => {
    await AsyncStorage.setItem(CURRENT_MODE, stored);
    expect(await getCurrentMode()).toBe('user');
  });

  it('saves only the two modes, whatever it is handed', async () => {
    await setCurrentMode('client' as any);
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('user');
    await setCurrentMode('stylist');
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('stylist');
  });

  it('writes the current-mode key and nothing else (no mirrored account type, no new key)', async () => {
    await setCurrentMode('stylist');
    expect(await AsyncStorage.getAllKeys()).toEqual([CURRENT_MODE]);
    expect(await AsyncStorage.getItem(ACCOUNT_TYPE)).toBeNull();
  });

  it('lets a failed save reach the caller, so the tabs do not change', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(setCurrentMode('stylist')).rejects.toThrow('disk full');
  });

  it('prompts each account once, under the existing per-account key', async () => {
    expect(await hasCompletedModeOnboarding('u1')).toBe(false);
    await markModeOnboardingComplete('u1');
    expect(await AsyncStorage.getItem('@smartcloset_mode_onboarded_u1')).toBe('true');
    expect(await hasCompletedModeOnboarding('u1')).toBe(true);
    expect(await hasCompletedModeOnboarding('u2')).toBe(false);
  });

  it('does not block sign-in if the flag cannot be read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unreadable'));
    expect(await hasCompletedModeOnboarding('u1')).toBe(true);
  });
});

describe('what the service no longer carries', () => {
  it('has only the four functions the launch gate and the mode context use', () => {
    const exported = Object.keys(jest.requireActual('../../src/services/accountService')).sort();
    expect(exported).toEqual(['getCurrentMode', 'hasCompletedModeOnboarding', 'markModeOnboardingComplete', 'setCurrentMode']);
  });
});
