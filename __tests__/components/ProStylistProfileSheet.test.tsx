import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InputAccessoryView, Modal, ScrollView, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockGetProfile = jest.fn();
const mockSave = jest.fn();
const mockRefreshRole = jest.fn();
let mockHasRefreshRole = true;

// The real access hook runs on top of these, with no navigation container anywhere.
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getMyStylistProfile: (...a: any[]) => mockGetProfile(...a),
  saveStylistProfile: (...a: any[]) => mockSave(...a),
}));
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => ({
    currentMode: 'user',
    switchMode: jest.fn(),
    ...(mockHasRefreshRole ? { refreshRole: (...a: any[]) => mockRefreshRole(...a) } : {}),
  }),
}));
jest.mock('../../src/components/ProStylistCard', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ stylist }: any) => (
      <Text>
        {`CARD ${stylist.name} | ${stylist.headline} | ${stylist.bio} | ${stylist.services.join(',')} | ${stylist.languages.join(',')} | ${stylist.ratesText}`}
      </Text>
    ),
  };
});

import ProStylistProfileSheet from '../../src/components/ProStylistProfileSheet';
import { Input } from '../../src/ui';
import ChoiceChip from '../../src/components/ChoiceChip';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_LANGUAGES,
  PRO_SERVICES,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS,
  PRO_STYLIST_TERMS_VERSION,
} from '../../src/config/proRules';
import { ProError } from '../../src/services/proErrors';
import type { ProStatus, StylistProfile } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProStylistProfileSheet>;

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
  stylist: stylistPart(),
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

// A person who has never been a stylist: no profile, so the server cannot say whether they agreed to the terms.
const newcomer = (over: Partial<ProStatus> = {}) => status({ stylist: null, ...over });

const profile = (over: Partial<StylistProfile> = {}): StylistProfile => ({
  displayName: 'Maya Stylist',
  headline: 'Capsule wardrobes',
  bio: 'I help people shop their own closets.',
  services: ['wardrobe_audit', 'outfit_styling'],
  languages: ['en', 'hy'],
  ratesText: 'From $80 per session',
  accepting: true,
  approved: false,
  invitesHeld: false,
  createdAt: '2026-10-01T10:00:00Z',
  ...over,
});

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onClose: jest.fn(), onSaved: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProStylistProfileSheet {...props} />);
  });
  await act(async () => {});
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProStylistProfileSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const pressable = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const has = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const disabled = (label: string) => Boolean(pressable(label).props.accessibilityState?.disabled);
  const field = (label: string) =>
    tree.root.find(n => n.type === TextInput && n.props.accessibilityLabel === label);
  const hasField = (label: string) =>
    tree.root.findAll(n => n.type === TextInput && n.props.accessibilityLabel === label).length > 0;
  const type = async (label: string, value: string) => {
    await act(async () => {
      field(label).props.onChangeText(value);
    });
  };
  const chip = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
  const tap = async (label: string) => {
    const node = chip(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const checked = (label: string) => Boolean(chip(label).props.accessibilityState?.checked);
  const fill = async (name = 'Maya Stylist', service = 'Wardrobe audit') => {
    await type('Display name', name);
    await tap(service);
  };
  return { tree, props, update, text, pressable, has, press, disabled, field, hasField, type, chip, tap, checked, fill };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
  mockHasRefreshRole = true;
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockGetProfile.mockReset().mockResolvedValue(profile());
  mockSave.mockReset().mockImplementation(async () => profile());
  mockRefreshRole.mockReset().mockResolvedValue(undefined);
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('ProStylistProfileSheet: the terms', () => {
  beforeEach(() => {
    mockStatus.mockResolvedValue(newcomer({ adultConfirmed: false }));
    mockGetProfile.mockResolvedValue(null);
  });

  it('starts a new stylist with the stylist terms and the 18+ switch, and nothing created yet', async () => {
    const { text, tree, disabled, hasField } = await render();
    expect(text()).toContain('Stylist terms');
    for (const section of PRO_STYLIST_TERMS.sections) expect(text()).toContain(section.heading);
    expect(tree.root.findAllByType(Switch)).toHaveLength(1);
    expect(disabled('I agree')).toBe(true);
    expect(hasField('Display name')).toBe(false);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('records agreement with the stylist role, then shows the form even though the server still has no profile', async () => {
    const { press, tree, text, hasField } = await render();
    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(true);
    });
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith('stylist', true);
    expect(hasField('Display name')).toBe(true);
    expect(text()).toContain('Become a stylist');
  });

  it('shows no 18+ switch to someone who already confirmed', async () => {
    mockStatus.mockResolvedValue(newcomer());
    const { tree, press } = await render();
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledWith('stylist', true);
  });

  it('shows the terms again to a stylist whose terms went out of date, then the profile as it was', async () => {
    mockStatus.mockResolvedValue(status({ stylist: stylistPart({ termsCurrent: false }) }));
    mockGetProfile.mockResolvedValue(profile());
    const { press, field, text } = await render();
    expect(text()).toContain('Stylist terms');
    mockStatus.mockResolvedValue(status());
    await press('I agree');
    expect(field('Display name').props.value).toBe('Maya Stylist');
  });

  it('stays on the terms and says why when recording agreement fails', async () => {
    mockStatus.mockResolvedValue(newcomer());
    mockAccept.mockRejectedValue({ message: 'Network request failed' });
    const { press, text, hasField } = await render();
    await press('I agree');
    expect(text()).toContain('You seem to be offline. Please try again.');
    expect(hasField('Display name')).toBe(false);
  });

  it('says the terms were updated, and stops offering to agree, when the server’s version moved on', async () => {
    mockStatus.mockResolvedValue(newcomer());
    mockAccept.mockRejectedValue(new ProError('terms_version_mismatch'));
    const { press, text, disabled } = await render();
    await press('I agree');
    expect(text()).toContain('The terms were updated. Please reopen and read them again.');
    expect(disabled('I agree')).toBe(true);
  });

  it('closes with Not now and creates nothing', async () => {
    const { press, props } = await render();
    await press('Not now');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('ProStylistProfileSheet: the form', () => {
  it('is titled for a new stylist, and empty with the accepting switch on', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockStatus.mockResolvedValue(newcomer());
    const { press, text, field, tree } = await render();
    await press('I agree');
    expect(text()).toContain('Become a stylist');
    expect(field('Display name').props.value).toBe('');
    expect(field('Headline').props.value).toBe('');
    expect(field('Bio').props.value).toBe('');
    expect(field('Rates').props.value).toBe('');
    const accepting = tree.root.find(n => n.type === Switch && n.props.accessibilityLabel === 'Accepting new clients');
    expect(accepting.props.value).toBe(true);
  });

  it('loads an existing profile into the form', async () => {
    const { text, field, checked, tree } = await render();
    expect(text()).toContain('Stylist profile');
    expect(text()).not.toContain('Stylist terms');
    expect(field('Display name').props.value).toBe('Maya Stylist');
    expect(field('Headline').props.value).toBe('Capsule wardrobes');
    expect(field('Bio').props.value).toBe('I help people shop their own closets.');
    expect(field('Rates').props.value).toBe('From $80 per session');
    expect(checked('Wardrobe audit')).toBe(true);
    expect(checked('Outfit styling')).toBe(true);
    expect(checked('Color analysis')).toBe(false);
    expect(checked('English')).toBe(true);
    expect(checked('Armenian')).toBe(true);
    expect(checked('French')).toBe(false);
    void tree;
  });

  it('offers exactly the closed lists', async () => {
    const { tree } = await render();
    expect(tree.root.findAllByType(ChoiceChip).map(c => c.props.label)).toEqual([
      ...PRO_SERVICES.map(s => s.label),
      ...PRO_LANGUAGES.map(l => l.label),
    ]);
  });

  it('keeps Save profile off until there is a name of 2 to 40 characters and a service', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockStatus.mockResolvedValue(newcomer());
    const { press, disabled, type, tap } = await render();
    await press('I agree');
    expect(disabled('Save profile')).toBe(true);
    await type('Display name', 'Maya');
    expect(disabled('Save profile')).toBe(true);
    await tap('Wardrobe audit');
    expect(disabled('Save profile')).toBe(false);
    await type('Display name', 'M');
    expect(disabled('Save profile')).toBe(true);
    await type('Display name', '    ');
    expect(disabled('Save profile')).toBe(true);
    await type('Display name', 'Maya');
    await tap('Wardrobe audit');
    expect(disabled('Save profile')).toBe(true);
  });

  it('does nothing when Save profile is pressed while it is off', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockStatus.mockResolvedValue(newcomer());
    const { press, pressable } = await render();
    await press('I agree');
    await act(async () => {
      pressable('Save profile').props.onPress();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('limits each field to the length the database accepts', async () => {
    const { field } = await render();
    expect(field('Display name').props.maxLength).toBe(40);
    expect(field('Headline').props.maxLength).toBe(80);
    expect(field('Bio').props.maxLength).toBe(500);
    expect(field('Rates').props.maxLength).toBe(120);
  });

  it('allows at most five languages and keeps the chosen ones removable', async () => {
    const { checked, tap, chip } = await render();
    // en and hy are already chosen.
    await tap('French');
    await tap('German');
    await tap('Italian');
    expect(checked('Italian')).toBe(true);
    expect(chip('Spanish').props.accessibilityState.disabled).toBe(true);
    await tap('French');
    expect(checked('French')).toBe(false);
    expect(chip('Spanish').props.accessibilityState.disabled).toBe(false);
  });

  it('shows the profile as a client will see it, as it is typed', async () => {
    const { text, type, tap } = await render();
    expect(text()).toContain('How clients see this');
    expect(text()).toContain('CARD Maya Stylist | Capsule wardrobes | I help people shop their own closets. | wardrobe_audit,outfit_styling | en,hy | From $80 per session');
    await type('Display name', '  Zoe  ');
    await type('Headline', 'Colour first');
    await tap('Color analysis');
    expect(text()).toContain('CARD Zoe | Colour first |');
    expect(text()).toContain('wardrobe_audit,outfit_styling,color_analysis');
  });

  it('says plainly that rates are information only', async () => {
    const { text } = await render();
    expect(text()).toContain('Information only. Payment is arranged directly with your clients.');
  });

  it('closes with Cancel without saving', async () => {
    const { press, props } = await render();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('ProStylistProfileSheet: saving', () => {
  it('saves exactly what is on screen, trimmed, then re-reads the role, then tells the host', async () => {
    const { press, type, tap, props, tree } = await render();
    await type('Display name', '  Zoe Styles  ');
    await type('Headline', ' Colour first ');
    await type('Bio', 'Hello there ');
    await type('Rates', ' From $60 ');
    await tap('Virtual sessions');
    await tap('Wardrobe audit');
    await tap('French');
    await act(async () => {
      tree.root.find(n => n.type === Switch && n.props.accessibilityLabel === 'Accepting new clients').props.onValueChange(false);
    });
    await press('Save profile');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({
      displayName: 'Zoe Styles',
      headline: 'Colour first',
      bio: 'Hello there',
      services: ['outfit_styling', 'virtual_sessions'],
      languages: ['en', 'hy', 'fr'],
      ratesText: 'From $60',
      accepting: false,
    });
    expect(mockRefreshRole).toHaveBeenCalledTimes(1);
    expect(props.onSaved).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(mockRefreshRole.mock.invocationCallOrder[0]);
    expect(mockRefreshRole.mock.invocationCallOrder[0]).toBeLessThan((props.onSaved as jest.Mock).mock.invocationCallOrder[0]);
    // The host closes the sheet from onSaved; the sheet does not close itself.
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('still reports the save when the role cannot be re-read, or the context has no way to', async () => {
    mockRefreshRole.mockRejectedValue(new Error('offline'));
    const first = await render();
    await first.press('Save profile');
    expect(first.props.onSaved).toHaveBeenCalledTimes(1);

    mockHasRefreshRole = false;
    const second = await render();
    await second.press('Save profile');
    expect(second.props.onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not save twice while a request is in flight', async () => {
    const pending = deferred();
    mockSave.mockReturnValue(pending.promise);
    const { press, disabled, pressable, props } = await render();
    await press('Save profile');
    expect(disabled('Save profile')).toBe(true);
    await act(async () => {
      pressable('Save profile').props.onPress();
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(profile());
    });
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it('will not close while the profile is being saved', async () => {
    const pending = deferred();
    mockSave.mockReturnValue(pending.promise);
    const { press, tree, props } = await render();
    await press('Save profile');
    await act(async () => {
      tree.root.findByType(Modal).props.onRequestClose();
    });
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(profile());
    });
  });

  it.each([
    ['bio', 'contact', 'Bio', "Links and contact details can't go here."],
    ['headline', 'payment', 'Headline', "Payment wording isn't allowed here."],
    ['rates', 'content', 'Rates', "That wording isn't allowed."],
    ['display_name', 'name', 'Display name', 'Choose a different name.'],
  ] as const)('shows a refused %s (%s) under that field, with the plain reason, and keeps everything typed', async (detail, hint, label, message) => {
    mockSave.mockRejectedValue(new ProError('text_not_allowed', 'text_not_allowed', detail, hint));
    const { press, text, field, tree } = await render();
    await press('Save profile');
    expect(text()).toContain(message);
    expect(text()).not.toContain('text_not_allowed');
    expect(field(label).props.value).not.toBe('');
    expect(field('Display name').props.value).toBe('Maya Stylist');
    expect(tree.root.findAllByType(TextInput).filter(i => i.props.accessibilityLabel).length).toBe(4);
  });

  it('puts the refusal on the field it names, not as a general error', async () => {
    mockSave.mockRejectedValue(new ProError('text_not_allowed', 'text_not_allowed', 'bio', 'contact'));
    const { press, tree } = await render();
    await press('Save profile');
    const inputs = tree.root.findAll(n => n.type === Input);
    const errors = Object.fromEntries(inputs.map(i => [i.props.accessibilityLabel, i.props.error]));
    expect(errors).toEqual({
      'Display name': undefined,
      Headline: undefined,
      Bio: "Links and contact details can't go here.",
      Rates: undefined,
    });
  });

  it('repeats the refusal with the field’s name below the form, where the field may be out of sight', async () => {
    mockSave.mockRejectedValue(new ProError('text_not_allowed', 'text_not_allowed', 'rates', 'payment'));
    const { press, text } = await render();
    await press('Save profile');
    expect(text()).toContain("Rates: Payment wording isn't allowed here.");
  });

  it('clears a field’s refusal as soon as that field is edited', async () => {
    mockSave.mockRejectedValue(new ProError('text_not_allowed', 'text_not_allowed', 'bio', 'contact'));
    const { press, text, type } = await render();
    await press('Save profile');
    expect(text()).toContain("Links and contact details can't go here.");
    await type('Bio', 'Hello');
    expect(text()).not.toContain("Links and contact details can't go here.");
  });

  it.each([
    ['services', 'Choose at least one service.'],
    ['display_name', 'Choose a name of 2 to 40 characters.'],
  ] as const)('shows invalid_profile for %s in plain words', async (detail, message) => {
    mockSave.mockRejectedValue(new ProError('invalid_profile', 'invalid_profile', detail));
    const { press, text } = await render();
    await press('Save profile');
    expect(text()).toContain(message);
  });

  it('shows other failures as a general message, keeps the form, and lets the person retry', async () => {
    mockSave.mockRejectedValueOnce({ message: 'Network request failed' });
    const { press, text, props, field } = await render();
    await press('Save profile');
    expect(text()).toContain('You seem to be offline. Please try again.');
    expect(field('Display name').props.value).toBe('Maya Stylist');
    expect(props.onSaved).not.toHaveBeenCalled();

    mockSave.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "pro_stylists_pkey"'));
    await press('Save profile');
    expect(text()).toContain("Couldn't save your profile. Please try again.");
    expect(text()).not.toContain('pro_stylists_pkey');

    await press('Save profile');
    expect(props.onSaved).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain("Couldn't save");
  });

  it('shows the removal and no form when saving answers stylist_profile_removed', async () => {
    mockSave.mockRejectedValue(new ProError('stylist_profile_removed'));
    const { press, text, hasField } = await render();
    await press('Save profile');
    expect(text()).toContain('Your stylist profile was removed. Email support if you think this is a mistake.');
    expect(hasField('Display name')).toBe(false);
    expect(mockRefreshRole).not.toHaveBeenCalled();
  });

  it('goes back to the terms when saving says they are required', async () => {
    mockSave.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'stylist'));
    mockStatus.mockResolvedValue(status({ stylist: stylistPart({ termsCurrent: false }) }));
    const { press, text } = await render();
    // The status says the terms are not current, so the sheet opens on them.
    expect(text()).toContain('Stylist terms');
    mockStatus.mockResolvedValue(status());
    await press('I agree');
    mockStatus.mockResolvedValue(status({ stylist: stylistPart({ termsCurrent: false }) }));
    await press('Save profile');
    expect(text()).toContain('Please read and accept the terms to continue.');
    expect(text()).toContain('Stylist terms');
  });
});

describe('ProStylistProfileSheet: a profile that was removed', () => {
  it('shows the message and no form, from the status alone', async () => {
    mockStatus.mockResolvedValue(newcomer({ stylistRemoved: true }));
    mockGetProfile.mockResolvedValue(null);
    const { text, hasField, press } = await render();
    expect(text()).toContain('Your stylist profile was removed. Email support if you think this is a mistake.');
    expect(hasField('Display name')).toBe(false);
    expect(mockAccept).not.toHaveBeenCalled();
    await press('Close');
  });
});

describe('ProStylistProfileSheet: when professional features are not available', () => {
  it.each([
    ['paused', status({ proEnabled: false }), null, 'Professional features are paused for now.'],
    ['suspended', status({ suspended: true }), null, 'Professional features are paused on your account.'],
    [
      'out of date',
      status({ versions: { stylistTerms: '2099-01', clientTerms: '2026-10', shareText: '2026-10' } }),
      null,
      'Update SmartCloset to keep using professional features.',
    ],
    ['signed out', null, new ProError('not_authenticated'), 'Sign in to work with a stylist.'],
    ['not deployed', null, { message: 'Could not find the function', code: 'PGRST202' }, "Professional features aren't available yet in this version."],
    ['offline', null, { message: 'Network request failed' }, 'You seem to be offline. Please try again.'],
  ] as const)('shows the plain reason and no form when %s', async (_name, st, failure, message) => {
    if (failure) mockStatus.mockRejectedValue(failure);
    else mockStatus.mockResolvedValue(st);
    const { text, tree, has } = await render();
    expect(text()).toContain(message);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(has('Save profile')).toBe(false);
    expect(has('I agree')).toBe(false);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('offers Try again when the read failed, and then shows the form', async () => {
    mockStatus.mockRejectedValueOnce({ message: 'Network request failed' });
    const { press, hasField } = await render();
    expect(hasField('Display name')).toBe(false);
    await press('Try again');
    expect(hasField('Display name')).toBe(true);
  });

  it('says so, with Try again, when the profile cannot be loaded', async () => {
    mockGetProfile.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press, hasField } = await render();
    expect(text()).toContain("Couldn't load your profile.");
    expect(hasField('Display name')).toBe(false);
    await press('Try again');
    expect(hasField('Display name')).toBe(true);
  });
});

describe('ProStylistProfileSheet: opening and closing', () => {
  it('starts from the saved profile each time it opens, dropping what was typed', async () => {
    const { type, update, field } = await render();
    await type('Display name', 'Typed and abandoned');
    await update({ visible: false });
    await update({ visible: true });
    expect(field('Display name').props.value).toBe('Maya Stylist');
  });

  it('ignores a profile that arrives after the sheet was closed and reopened', async () => {
    const slow = deferred();
    mockGetProfile.mockReturnValueOnce(slow.promise);
    const { update, text, field } = await render();
    expect(text()).toContain('Loading');
    await update({ visible: false });
    await update({ visible: true });
    expect(field('Display name').props.value).toBe('Maya Stylist');
    await act(async () => {
      slow.resolve(profile({ displayName: 'Stale Name' }));
    });
    expect(field('Display name').props.value).toBe('Maya Stylist');
    expect(text()).not.toContain('Stale Name');
  });
});

describe('ProStylistProfileSheet: the keyboard', () => {
  it('gives the bio the Done bar and every other field a Return key, inside the lift', async () => {
    const { tree, field } = await render();
    const bio = field('Bio');
    expect(bio.props.multiline).toBe(true);
    expect(bio.props.inputAccessoryViewID).toBeTruthy();
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(1);
    for (const label of ['Display name', 'Headline', 'Rates']) {
      expect(field(label).props.multiline).toBeFalsy();
      expect(field(label).props.returnKeyType).toBeTruthy();
      expect(field(label).props.inputAccessoryViewID).toBeUndefined();
    }
    expect(field('Display name').props.returnKeyType).toBe('next');
    expect(field('Rates').props.returnKeyType).toBe('done');
    let above = bio.parent;
    const ancestors = [];
    while (above) {
      ancestors.push(above);
      above = above.parent;
    }
    expect(ancestors.some(a => a.type === KeyboardLift)).toBe(true);
    const scroll = ancestors.find(a => a.type === ScrollView);
    expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBeFalsy();
  });

  it('moves from the name to the headline to the bio with the Return key', async () => {
    const { field } = await render();
    const focusHeadline = jest.fn();
    const focusBio = jest.fn();
    field('Headline').instance.focus = focusHeadline;
    field('Bio').instance.focus = focusBio;
    expect(field('Display name').props.blurOnSubmit).toBe(false);
    expect(field('Headline').props.blurOnSubmit).toBe(false);
    await act(async () => {
      field('Display name').props.onSubmitEditing();
    });
    expect(focusHeadline).toHaveBeenCalledTimes(1);
    expect(focusBio).not.toHaveBeenCalled();
    await act(async () => {
      field('Headline').props.onSubmitEditing();
    });
    expect(focusBio).toHaveBeenCalledTimes(1);
  });
});

describe('ProStylistProfileSheet: the device', () => {
  it('stores nothing in AsyncStorage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    const { press } = await render();
    await press('Save profile');
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('uses no navigation or storage, renders one Done bar, and never logs an error', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/components/ProStylistProfileSheet.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/@react-navigation|useNavigation|navigate\(|AsyncStorage|console\.error/);
    expect((code.match(/<KeyboardDoneBar\b/g) ?? []).length).toBe(1);
    expect(code).not.toMatch(/Book|Checkout|Premium|Featured|Verified|Certified/);
  });
});

describe('ProStylistProfileSheet, the cost of having it mounted', () => {
  it('reads the person\'s access only when it opens, and once each time, so a screen that hosts it pays for nothing while it is closed', async () => {
    const { update } = await render({ visible: false });
    expect(mockStatus).not.toHaveBeenCalled();
    await update({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(1);
    await update({ visible: false });
    await update({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(2);
  });
});

describe('ProStylistProfileSheet, the rates field', () => {
  it('suggests no amount and no currency: the app takes no money and must not look as if it tracks any', async () => {
    const { field } = await render();
    const placeholder = String(field('Rates').props.placeholder ?? '');
    expect(placeholder).not.toBe('');
    expect(placeholder).not.toMatch(/[$€£¥]|\d|per session|\bUSD\b|\bfrom\b/i);
  });
});
