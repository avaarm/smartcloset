/**
 * Settings must not advertise Stylist/Client modes while PRO_MODES_ENABLED is
 * off, and must not leave an empty "Account Mode" heading behind.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import SettingsScreen from '../../src/screens/SettingsScreen';

let mockProModes = false;
let mockSignedIn = true;

jest.mock('../../src/config/features', () => ({
  get PRO_MODES_ENABLED() {
    return mockProModes;
  },
}));
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => ({ currentMode: 'user', switchMode: jest.fn() }),
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: mockSignedIn
            ? { user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada Lovelace' } } }
            : null,
        },
      }),
    },
  },
}));
jest.mock('../../src/services/backupService', () => ({
  saveAndShareBackup: jest.fn(),
  clearAllData: jest.fn(),
  getBackupStats: jest.fn(async () => ({ itemsCount: 3, outfitsCount: 1, storageSize: 2048 })),
}));
jest.mock('../../src/services/seedDemoData', () => ({ reseedAllDemoData: jest.fn() }));
jest.mock('../../src/services/storage', () => ({ resetStorage: jest.fn() }));
jest.mock('../../src/services/productContributions', () => ({
  getContributionHistory: jest.fn(async () => []),
  isSharingEnabled: jest.fn(async () => false),
  setSharingEnabled: jest.fn(),
  deleteMySharedContributions: jest.fn(),
}));
jest.mock('../../src/services/accountDeletion', () => ({ deleteAccount: jest.fn() }));
jest.mock('../../src/services/aiConsent', () => ({
  getAiConsent: jest.fn(async () => null),
  setAiConsent: jest.fn(),
}));
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SettingsScreen />);
  });
  // Let the session / account-mode loads settle.
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
};

const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

const devFlag = (global as any).__DEV__;

beforeEach(() => {
  mockProModes = false;
  mockSignedIn = true;
  // Judge what a release build shows: the dev-only demo-data reset mentions stylists.
  (global as any).__DEV__ = false;
});

afterEach(() => {
  (global as any).__DEV__ = devFlag;
});

describe('SettingsScreen account modes', () => {
  it('signed in, pro modes off: shows the account but no mode switcher or mode names', async () => {
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Ada Lovelace');
    expect(texts).toContain('Sign Out');
    expect(texts).not.toContain('Account Mode');
    for (const name of ['Personal', 'Professional Stylist', 'Client']) {
      expect(texts).not.toContain(name);
    }
    expect(texts.some(t => /stylist/i.test(t))).toBe(false);
  });

  it('signed in, pro modes off: every section still has a heading with content under it', async () => {
    const tree = await render();
    const texts = textsOf(tree);

    for (const heading of ['Account', 'Privacy', 'Community', 'Data & Backup', 'About', 'Danger Zone']) {
      expect(texts).toContain(heading);
    }
    expect(texts).toContain('Privacy Policy');
    expect(texts).toContain('Delete Account');
  });

  it('guest, pro modes off: no mode switcher', async () => {
    mockSignedIn = false;
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Browsing as Guest');
    expect(texts).not.toContain('Account Mode');
  });

  it('signed in, pro modes on: the switcher is back', async () => {
    mockProModes = true;
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Account Mode');
    expect(texts).toContain('Professional Stylist');
    expect(texts).toContain('Client');
  });
});
