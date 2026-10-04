/**
 * Stylist/Client modes are a local simulation, so PRO_MODES_ENABLED keeps them
 * off: no first-run prompt, and a device that saved one of those modes is put
 * back to the personal mode instead of being stranded in it.
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

describe('with the pro modes off (shipping configuration)', () => {
  it('ships off', () => {
    expect(jest.requireActual('../../src/config/features').PRO_MODES_ENABLED).toBe(false);
  });

  it.each(['stylist', 'client'] as const)('puts a device saved in %s mode back to personal', async mode => {
    await setCurrentMode(mode);

    expect(await getCurrentMode()).toBe('user');

    // Persisted, not just masked, so the next launch starts clean too.
    expect(await AsyncStorage.getItem(CURRENT_MODE)).toBe('user');
    expect(await AsyncStorage.getItem(ACCOUNT_TYPE)).toBe('user');
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
    await setCurrentMode('stylist');
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    expect(await getCurrentMode()).toBe('user');
  });
});

describe('with the pro modes on', () => {
  beforeEach(() => {
    mockProModes = true;
  });

  it('keeps the saved stylist or client mode', async () => {
    await setCurrentMode('stylist');
    expect(await getCurrentMode()).toBe('stylist');
    await setCurrentMode('client');
    expect(await getCurrentMode()).toBe('client');
  });

  it('prompts each account once', async () => {
    expect(await hasCompletedModeOnboarding('u1')).toBe(false);
    await markModeOnboardingComplete('u1');
    expect(await hasCompletedModeOnboarding('u1')).toBe(true);
    expect(await hasCompletedModeOnboarding('u2')).toBe(false);
  });
});
