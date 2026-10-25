/**
 * Settings has no Professional section while PRO_MODES_ENABLED is off, and the old
 * "Account Mode" switcher (a local simulation of Stylist and Client modes) is gone for
 * good. With the flag on, a signed-in person gets the Professional section directly
 * after the swap one. These cases mock only `auth` on the Supabase client, which proves
 * the section needs no navigation context and keeps Settings quiet when the server
 * cannot answer.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import SettingsScreen from '../../src/screens/SettingsScreen';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
} from '../../src/config/proRules';

let mockProModes = false;
let mockSignedIn = true;
// When set, the professional status read is answered with this; otherwise the real service runs against the
// auth-only Supabase mock below and fails, as it does for a server without the functions.
let mockStatusAnswer: null | (() => Promise<unknown>) = null;
const mockStatusReads = jest.fn();

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
jest.mock('../../src/services/proService', () => {
  const actual = jest.requireActual('../../src/services/proService');
  return {
    ...actual,
    getProStatus: (...a: unknown[]) => {
      mockStatusReads();
      return mockStatusAnswer ? mockStatusAnswer() : actual.getProStatus(...a);
    },
  };
});
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

const proStatus = (stylist: unknown = null) => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist,
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
});

beforeEach(() => {
  mockProModes = false;
  mockSignedIn = true;
  mockStatusAnswer = null;
  mockStatusReads.mockClear();
  // Judge what a release build shows: the dev-only demo-data reset mentions stylists.
  (global as any).__DEV__ = false;
});

afterEach(() => {
  (global as any).__DEV__ = devFlag;
});

const MODE_NAMES = ['Account Mode', 'Personal', 'Professional Stylist', 'Client'];

describe('SettingsScreen professional accounts', () => {
  it('signed in, pro modes off: shows the account but no Professional section, mode switcher or mode names', async () => {
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Ada Lovelace');
    expect(texts).toContain('Sign Out');
    expect(texts).not.toContain('Professional');
    for (const name of MODE_NAMES) {
      expect(texts).not.toContain(name);
    }
    // The only word about stylists is what deleting the account removes.
    expect(texts.filter(t => /stylist/i.test(t))).toEqual([
      'Permanently deletes your account, wardrobe, ratings, body profile, swap listings and messages, stylist connections, and all uploaded images. Cannot be undone.',
    ]);
    expect(mockStatusReads).not.toHaveBeenCalled();
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

  it('guest, pro modes on: no Professional section and no read of the server', async () => {
    mockProModes = true;
    mockSignedIn = false;
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Browsing as Guest');
    expect(texts).not.toContain('Professional');
    expect(mockStatusReads).not.toHaveBeenCalled();
  });

  it('signed in, pro modes on, nothing but auth mocked: no switcher, and Settings stays quiet when the read fails', async () => {
    mockProModes = true;
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warns = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = await render();
    const texts = textsOf(tree);

    expect(mockStatusReads).toHaveBeenCalledTimes(1);
    expect(texts).toContain('Ada Lovelace');
    expect(texts).toContain('Sign Out');
    expect(texts).not.toContain('Professional');
    for (const name of MODE_NAMES) {
      expect(texts).not.toContain(name);
    }
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
    errors.mockRestore();
    warns.mockRestore();
  });

  it('signed in, pro modes on: the Professional section replaces the switcher, with no navigation context', async () => {
    mockProModes = true;
    mockStatusAnswer = async () => proStatus();
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Professional');
    expect(texts).toContain('Become a stylist');
    expect(texts).toContain('Connect with a stylist');
    expect(texts).toContain('Blocked stylists and clients');
    expect(texts).toContain('Professional guidelines');
    for (const name of MODE_NAMES) {
      expect(texts).not.toContain(name);
    }
    // After the Community switches and the swap section, before Data & Backup.
    expect(texts.indexOf('Professional')).toBeGreaterThan(texts.indexOf('Community'));
    expect(texts.indexOf('Professional')).toBeLessThan(texts.indexOf('Data & Backup'));
  });

  it('signed in, pro modes on, a stylist: offers the workspace and the profile', async () => {
    mockProModes = true;
    mockStatusAnswer = async () =>
      proStatus({ termsCurrent: true, accepting: true, approved: false, invitesHeld: false, activeClients: 0, clientLimit: 3, liveInvites: 0, inviteLimit: 1 });
    const tree = await render();
    const texts = textsOf(tree);

    expect(texts).toContain('Open the Stylist workspace');
    expect(texts).toContain('Edit stylist profile');
    expect(texts).toContain('Stop being a stylist');
    expect(texts).not.toContain('Become a stylist');
  });
});
