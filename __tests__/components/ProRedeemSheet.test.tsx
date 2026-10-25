import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InputAccessoryView, Modal, ScrollView, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockPreview = jest.fn();
const mockRedeem = jest.fn();
let mockAccountName: string | undefined = 'Ada Lovelace';

// The real access hook runs on top of these, with no navigation container anywhere.
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  previewProInvite: (...a: any[]) => mockPreview(...a),
  redeemProInvite: (...a: any[]) => mockRedeem(...a),
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: mockAccountName } } } },
      }),
    },
  },
}));
jest.mock('../../src/components/ProStylistCard', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ stylist }: any) => <Text>{`CARD ${stylist.name} | ${stylist.headline} | ${stylist.ratesText}`}</Text>,
  };
});

import ProRedeemSheet from '../../src/components/ProRedeemSheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import {
  PRO_CLIENT_TERMS,
  PRO_CLIENT_TERMS_VERSION,
  PRO_CONNECT_NOTE,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
} from '../../src/config/proRules';
import { ProError } from '../../src/services/proErrors';
import type { InvitePreview, ProStatus } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProRedeemSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

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

const preview = (over: Partial<InvitePreview> = {}): InvitePreview => ({
  inviteId: 'inv-1',
  alreadyConnected: false,
  clientTermsCurrent: true,
  stylist: {
    name: 'Maya Stylist',
    headline: 'Capsule wardrobes',
    bio: 'I help people shop their own closets.',
    services: ['wardrobe_audit'],
    languages: ['en'],
    ratesText: 'From $80 per session',
  },
  ...over,
});

const CODE = 'ABCDE-FGHJK';

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onClose: jest.fn(), onConnected: jest.fn(), onReport: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProRedeemSheet {...props} />);
  });
  await act(async () => {});
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProRedeemSheet {...props} {...next} />);
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
  const type = async (label: string, value: string) => {
    await act(async () => {
      field(label).props.onChangeText(value);
    });
  };
  const toPreview = async (code = CODE) => {
    await type('Invite code', code);
    await press('Continue');
  };
  return { tree, props, update, text, pressable, has, press, disabled, field, type, toPreview };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
  mockAccountName = 'Ada Lovelace';
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockPreview.mockReset().mockResolvedValue(preview());
  mockRedeem.mockReset().mockResolvedValue({ connectionId: 'conn-1', alreadyConnected: false });
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('ProRedeemSheet: the code', () => {
  it('asks for the code, with Continue off until it is whole', async () => {
    const { text, field, type, disabled } = await render();
    expect(text()).toContain('Connect with a stylist');
    expect(field('Invite code').props.placeholder).toBe('XXXXX-XXXXX');
    expect(disabled('Continue')).toBe(true);
    await type('Invite code', 'ABCDE');
    expect(disabled('Continue')).toBe(true);
    await type('Invite code', 'ABCDE-FGHJ');
    expect(disabled('Continue')).toBe(true);
    await type('Invite code', CODE);
    expect(disabled('Continue')).toBe(false);
  });

  it('takes a pasted code in any casing, with spaces or without the hyphen, and shows it grouped', async () => {
    const { field, type, disabled } = await render();
    await type('Invite code', 'abcde-fghjk');
    expect(field('Invite code').props.value).toBe(CODE);
    await type('Invite code', ' abcde fghjk ');
    expect(field('Invite code').props.value).toBe(CODE);
    await type('Invite code', 'ABCDEFGHJK');
    expect(field('Invite code').props.value).toBe(CODE);
    expect(disabled('Continue')).toBe(false);
    await type('Invite code', 'ABCDEFGHJKMNP');
    expect(field('Invite code').props.value).toBe(CODE);
  });

  it('reads O as 0 and I or L as 1, as the server does', async () => {
    const { field, type } = await render();
    await type('Invite code', 'OIL23-4567A');
    expect(field('Invite code').props.value).toBe('01123-4567A');
  });

  it('is a single-line field that capitalises, has a Go key and looks the code up from it', async () => {
    const { field, type, tree } = await render();
    const input = field('Invite code');
    expect(input.props.multiline).toBeFalsy();
    expect(input.props.autoCapitalize).toBe('characters');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.returnKeyType).toBe('go');
    await type('Invite code', CODE);
    await act(async () => {
      field('Invite code').props.onSubmitEditing();
    });
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(flatten(tree.toJSON())).toContain('CARD Maya Stylist');
  });

  it('does not look up an incomplete code from the Go key', async () => {
    const { field, type } = await render();
    await type('Invite code', 'ABC');
    await act(async () => {
      field('Invite code').props.onSubmitEditing();
    });
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it.each([
    ['invite_invalid', "That code isn't valid or has expired. Ask your stylist for a new one."],
    ['stylist_not_accepting', "This stylist isn't taking new clients right now."],
    ['pro_rate_limited', "You're going a bit fast. Please wait a moment."],
    ['not_authenticated', 'Sign in to work with a stylist.'],
  ] as const)('shows %s in plain words, keeps the code and stays on the code', async (code, message) => {
    mockPreview.mockRejectedValue(new ProError(code));
    const { text, field, toPreview, has } = await render();
    await toPreview();
    expect(text()).toContain(message);
    expect(text()).not.toContain(code);
    expect(field('Invite code').props.value).toBe(CODE);
    expect(has('Continue')).toBe(true);
  });

  it('turns the server’s own error text into plain words too (as supabase-js delivers it)', async () => {
    mockPreview.mockRejectedValue({ message: 'pro_rate_limited', code: '54000', details: 'invite_lookup_hour' });
    const { text, toPreview } = await render();
    await toPreview();
    expect(text()).toContain("You're going a bit fast. Please wait a moment.");
  });

  it('shows an offline or unexpected failure without a raw message, and lets the person retry', async () => {
    mockPreview.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press, toPreview } = await render();
    await toPreview();
    expect(text()).toContain('You seem to be offline. Please try again.');

    mockPreview.mockRejectedValueOnce(new Error('relation "pro_invites" does not exist'));
    await press('Continue');
    expect(text()).toContain("Couldn't check that code. Please try again.");
    expect(text()).not.toContain('pro_invites');

    await press('Continue');
    expect(text()).toContain('CARD Maya Stylist');
  });

  it('clears the message as soon as the code is edited', async () => {
    mockPreview.mockRejectedValue(new ProError('invite_invalid'));
    const { text, type, toPreview } = await render();
    await toPreview();
    expect(text()).toContain("That code isn't valid");
    await type('Invite code', 'ABCDE-FGHJM');
    expect(text()).not.toContain("That code isn't valid");
  });

  it('looks up only once while a request is in flight', async () => {
    const pending = deferred();
    mockPreview.mockReturnValue(pending.promise);
    const { toPreview, press, disabled } = await render();
    await toPreview();
    expect(disabled('Continue')).toBe(true);
    await press('Continue');
    expect(mockPreview).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(preview());
    });
  });
});

describe('ProRedeemSheet: the preview', () => {
  it('shows the stylist, and says nothing is shared by connecting', async () => {
    const { text, toPreview } = await render();
    await toPreview();
    expect(text()).toContain('CARD Maya Stylist | Capsule wardrobes | From $80 per session');
    expect(text()).toContain(PRO_CONNECT_NOTE);
    expect(text()).toContain('Nothing is shared when you connect.');
    expect(mockPreview).toHaveBeenCalledWith(CODE);
  });

  it('goes back to the code, which is kept', async () => {
    const { toPreview, press, field } = await render();
    await toPreview();
    await press('Back');
    expect(field('Invite code').props.value).toBe(CODE);
  });

  it('closes itself and hands the invite to the host for Report or block, in that order', async () => {
    const { toPreview, press, props } = await render();
    await toPreview();
    await press('Report or block Maya Stylist');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onReport).toHaveBeenCalledTimes(1);
    expect(props.onReport).toHaveBeenCalledWith('inv-1', 'Maya Stylist');
    expect((props.onClose as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (props.onReport as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it('offers nothing but the preview until Continue: no terms, no name, no connection yet', async () => {
    const { toPreview, text } = await render();
    await toPreview();
    expect(mockRedeem).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
    expect(text()).not.toContain('Name your stylist will see');
  });

  it('wraps a long stylist in a scroll view, so Continue stays reachable', async () => {
    const { toPreview, tree } = await render();
    await toPreview();
    expect(tree.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });
});

describe('ProRedeemSheet: the name, and connecting', () => {
  it('walks code, preview, name and connect, and says where the person stands', async () => {
    const { toPreview, press, type, text, props } = await render();
    await toPreview();
    await press('Continue');
    expect(text()).toContain('Name your stylist will see');
    await type('Name your stylist will see', 'Ada');
    await press('Connect');
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    expect(mockRedeem).toHaveBeenCalledWith(CODE, 'Ada');
    expect(text()).toContain("You're connected to Maya Stylist.");
    expect(text()).toContain(PRO_CONNECT_NOTE);
    expect(props.onConnected).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('prefills the name with the first word of the account name', async () => {
    const { toPreview, press, field } = await render();
    await toPreview();
    await press('Continue');
    expect(field('Name your stylist will see').props.value).toBe('Ada');
  });

  it('does not prefill from an email, a one-letter name or a missing name', async () => {
    mockAccountName = 'A';
    const first = await render();
    await first.toPreview();
    await first.press('Continue');
    expect(first.field('Name your stylist will see').props.value).toBe('');

    mockAccountName = undefined;
    const second = await render();
    await second.toPreview();
    await second.press('Continue');
    expect(second.field('Name your stylist will see').props.value).toBe('');
  });

  it('is a single-line field with a Done key, limited to 30 characters, above the keyboard', async () => {
    const { toPreview, press, field, tree } = await render();
    await toPreview();
    await press('Continue');
    const input = field('Name your stylist will see');
    expect(input.props.multiline).toBeFalsy();
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.maxLength).toBe(30);
    expect(input.props.inputAccessoryViewID).toBeUndefined();
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
    let above = input.parent;
    const ancestors = [];
    while (above) {
      ancestors.push(above);
      above = above.parent;
    }
    expect(ancestors.some(a => a.type === KeyboardLift)).toBe(true);
  });

  it('keeps Connect off until the name has 2 to 30 characters, and sends it trimmed', async () => {
    const { toPreview, press, type, disabled } = await render();
    await toPreview();
    await press('Continue');
    await type('Name your stylist will see', '');
    expect(disabled('Connect')).toBe(true);
    await type('Name your stylist will see', 'A');
    expect(disabled('Connect')).toBe(true);
    await type('Name your stylist will see', '   a   ');
    expect(disabled('Connect')).toBe(true);
    await type('Name your stylist will see', '  Ada L  ');
    expect(disabled('Connect')).toBe(false);
    await press('Connect');
    expect(mockRedeem).toHaveBeenCalledWith(CODE, 'Ada L');
  });

  it('does nothing when Connect is pressed while it is off', async () => {
    mockAccountName = undefined;
    const { toPreview, press, pressable } = await render();
    await toPreview();
    await press('Continue');
    await act(async () => {
      pressable('Connect').props.onPress();
    });
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it('goes back from the name to the preview', async () => {
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    await press('Back');
    expect(text()).toContain('CARD Maya Stylist');
  });

  it('tells the host to open the connection only when the person asks to choose what to share', async () => {
    const { toPreview, press, props } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    await press('Choose what to share');
    expect(props.onConnected).toHaveBeenCalledTimes(1);
    expect(props.onConnected).toHaveBeenCalledWith('conn-1');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  describe('in a host that cannot open the connection (Settings)', () => {
    it('offers no "Choose what to share", says where the choice is made, and has only Done', async () => {
      const { toPreview, press, has, text } = await render({ opensConnection: false });
      await toPreview();
      await press('Continue');
      await press('Connect');
      expect(has('Choose what to share')).toBe(false);
      expect(has('Done')).toBe(true);
      expect(text()).toContain("You're connected to Maya Stylist.");
      expect(text()).toContain(PRO_CONNECT_NOTE);
    });

    it('lets the host finish when Done is pressed: onConnected with the connection, and not onClose', async () => {
      const { toPreview, press, props } = await render({ opensConnection: false });
      await toPreview();
      await press('Continue');
      await press('Connect');
      await press('Done');
      expect(props.onConnected).toHaveBeenCalledWith('conn-1');
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('still offers the choice to a host that can open it, which is the default', async () => {
      const { toPreview, press, has } = await render();
      await toPreview();
      await press('Continue');
      await press('Connect');
      expect(has('Choose what to share')).toBe(true);
      expect(has('Done')).toBe(true);
    });
  });

  it('closes with Done without opening anything', async () => {
    const { toPreview, press, props } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    await press('Done');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConnected).not.toHaveBeenCalled();
  });

  it.each([
    ['client_connection_limit', "You're connected to as many stylists as you can be. End one first."],
    ['invalid_alias', 'Choose a name of 2 to 30 characters.'],
    ['pro_rate_limited', "You're going a bit fast. Please wait a moment."],
  ] as const)('shows %s on the name step and keeps what was typed', async (code, message) => {
    mockRedeem.mockRejectedValue(new ProError(code));
    const { toPreview, press, type, text, field } = await render();
    await toPreview();
    await press('Continue');
    await type('Name your stylist will see', 'Ada');
    await press('Connect');
    expect(text()).toContain(message);
    expect(text()).not.toContain(code);
    expect(field('Name your stylist will see').props.value).toBe('Ada');
    mockRedeem.mockResolvedValue({ connectionId: 'conn-1', alreadyConnected: false });
    await press('Connect');
    expect(text()).toContain("You're connected to Maya Stylist.");
  });

  it('shows a refused name with the plain reason', async () => {
    mockRedeem.mockRejectedValue(new ProError('text_not_allowed', 'text_not_allowed', 'alias', 'name'));
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    expect(text()).toContain('Choose a different name.');
  });

  it.each([
    ['invite_invalid', "That code isn't valid or has expired. Ask your stylist for a new one."],
    ['stylist_not_accepting', "This stylist isn't taking new clients right now."],
  ] as const)('goes back to the code with the message when connecting answers %s', async (code, message) => {
    mockRedeem.mockRejectedValue(new ProError(code));
    const { toPreview, press, text, field } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    expect(text()).toContain(message);
    expect(field('Invite code').props.value).toBe(CODE);
    expect(text()).not.toContain('CARD Maya Stylist');
  });

  it('does not connect twice while a request is in flight', async () => {
    const pending = deferred();
    mockRedeem.mockReturnValue(pending.promise);
    const { toPreview, press, disabled, pressable } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    expect(disabled('Connect')).toBe(true);
    await act(async () => {
      pressable('Connect').props.onPress();
    });
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ connectionId: 'conn-1', alreadyConnected: false });
    });
  });

  it('will not close while the connection is being made, and shows the result when it arrives', async () => {
    const pending = deferred();
    mockRedeem.mockReturnValue(pending.promise);
    const { toPreview, press, tree, props, text } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    await act(async () => {
      tree.root.findByType(Modal).props.onRequestClose();
    });
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ connectionId: 'conn-1', alreadyConnected: false });
    });
    expect(text()).toContain("You're connected to Maya Stylist.");
  });

  it('connects again to the same stylist with the same code without a name (a retry after a lost answer)', async () => {
    mockPreview.mockResolvedValue(preview({ alreadyConnected: true }));
    mockRedeem.mockResolvedValue({ connectionId: 'conn-1', alreadyConnected: true });
    const { toPreview, press, text, has } = await render();
    await toPreview();
    expect(text()).toContain("You're already connected to Maya Stylist.");
    expect(has('Open')).toBe(true);
    await press('Open');
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    expect(text()).toContain("You're already connected to Maya Stylist.");
    expect(has('Choose what to share')).toBe(true);
  });
});

describe('ProRedeemSheet: the client terms', () => {
  const needTerms = (over: Partial<ProStatus> = {}) => {
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 0, connectionLimit: 5 }, ...over }));
    mockPreview.mockResolvedValue(preview({ clientTermsCurrent: false }));
  };

  it('shows the client terms between the preview and the name when they are not on record', async () => {
    needTerms();
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    expect(text()).toContain('Client terms');
    for (const section of PRO_CLIENT_TERMS.sections) expect(text()).toContain(section.heading);
    expect(text()).not.toContain('Name your stylist will see');
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('records agreement with the client role, then asks for the name', async () => {
    needTerms();
    mockAccept.mockImplementation(async () => {
      mockStatus.mockResolvedValue(status());
    });
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith('client', true);
    expect(text()).toContain('Name your stylist will see');
  });

  it('asks for the 18+ confirmation when it is not stored yet, and sends it', async () => {
    needTerms({ adultConfirmed: false });
    const { toPreview, press, tree, disabled } = await render();
    await toPreview();
    await press('Continue');
    expect(tree.root.findAllByType(Switch)).toHaveLength(1);
    expect(disabled('I agree')).toBe(true);
    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(true);
    });
    expect(disabled('I agree')).toBe(false);
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledWith('client', true);
  });

  it('shows no 18+ switch to someone who already confirmed', async () => {
    needTerms();
    const { toPreview, press, tree } = await render();
    await toPreview();
    await press('Continue');
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
  });

  it('shows the terms when only the 18+ confirmation is missing, even if the preview calls the terms current', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }));
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    expect(text()).toContain('Client terms');
  });

  it('skips the terms for someone who has agreed to the current version', async () => {
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    expect(text()).not.toContain('Client terms');
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('shows a failure to record agreement in plain words and stays on the terms', async () => {
    needTerms();
    mockAccept.mockRejectedValue({ message: 'Network request failed' });
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    await press('I agree');
    expect(text()).toContain('You seem to be offline. Please try again.');
    expect(text()).toContain('Client terms');
  });

  it('says the terms were updated, and stops offering to agree, when the server’s version moved on', async () => {
    needTerms();
    mockAccept.mockRejectedValue(new ProError('terms_version_mismatch'));
    const { toPreview, press, text, disabled } = await render();
    await toPreview();
    await press('Continue');
    await press('I agree');
    expect(text()).toContain('The terms were updated. Please reopen and read them again.');
    expect(disabled('I agree')).toBe(true);
  });

  it('goes back to the preview with Not now, recording nothing', async () => {
    needTerms();
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    await press('Not now');
    expect(text()).toContain('CARD Maya Stylist');
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('goes to the terms when connecting says they are required, and can then try again', async () => {
    mockRedeem.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    expect(text()).toContain('Please read and accept the terms to continue.');
    expect(text()).toContain('Client terms');
  });

  it('records agreement for an already-connected code and opens the connection', async () => {
    needTerms();
    mockPreview.mockResolvedValue(preview({ clientTermsCurrent: false, alreadyConnected: true }));
    mockRedeem.mockResolvedValue({ connectionId: 'conn-1', alreadyConnected: true });
    mockAccept.mockImplementation(async () => {
      mockStatus.mockResolvedValue(status());
    });
    const { toPreview, press, text } = await render();
    await toPreview();
    await press('Open');
    expect(text()).toContain('Client terms');
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledWith('client', true);
    expect(mockRedeem).toHaveBeenCalledTimes(1);
    expect(text()).toContain("You're already connected to Maya Stylist.");
  });
});

describe('ProRedeemSheet: when professional features are not available', () => {
  it.each([
    ['paused', status({ proEnabled: false }), null, 'Professional features are paused for now.'],
    ['suspended', status({ suspended: true }), null, 'Professional features are paused on your account.'],
    [
      'out of date (the server’s terms are newer than this build’s)',
      status({ versions: { stylistTerms: '2026-10', clientTerms: '2099-01', shareText: '2026-10' } }),
      null,
      'Update SmartCloset to keep using professional features.',
    ],
    [
      'ahead of the server (this build’s terms are newer)',
      status({ versions: { stylistTerms: '2026-10', clientTerms: '2020-01', shareText: '2026-10' } }),
      null,
      'Professional features are being updated. Please try again soon.',
    ],
    ['signed out', null, new ProError('not_authenticated'), 'Sign in to work with a stylist.'],
    ['not deployed', null, { message: 'Could not find the function', code: 'PGRST202' }, "Professional features aren't available yet in this version."],
  ] as const)('shows the plain reason and no code field when %s', async (_name, st, failure, message) => {
    if (failure) mockStatus.mockRejectedValue(failure);
    else mockStatus.mockResolvedValue(st);
    const { text, tree, has } = await render();
    expect(text()).toContain(message);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(has('Continue')).toBe(false);
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('calls nothing that records agreement when the build cannot show the current terms', async () => {
    mockStatus.mockResolvedValue(
      status({ versions: { stylistTerms: '2026-10', clientTerms: '2099-01', shareText: '2026-10' } }),
    );
    const { press } = await render();
    await press('Close');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it('still offers the code while the first read is on its way or has failed (the server decides)', async () => {
    mockStatus.mockRejectedValue({ message: 'Network request failed' });
    const { tree } = await render();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });
});

describe('ProRedeemSheet: opening and closing', () => {
  it('starts empty each time it opens, and reads the access again', async () => {
    const { toPreview, update, field, press, props } = await render();
    await toPreview();
    await press('Continue');
    const readsBefore = mockStatus.mock.calls.length;
    await update({ visible: false });
    await update({ visible: true });
    expect(field('Invite code').props.value).toBe('');
    expect(mockStatus.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('ignores a lookup that comes back after the sheet was closed', async () => {
    const pending = deferred();
    mockPreview.mockReturnValue(pending.promise);
    const { toPreview, update, text } = await render();
    await toPreview();
    await update({ visible: false });
    await update({ visible: true });
    await act(async () => {
      pending.resolve(preview());
    });
    expect(text()).not.toContain('CARD Maya Stylist');
  });

  it('ignores a failure that comes back after the sheet was closed', async () => {
    const pending = deferred();
    mockPreview.mockReturnValue(pending.promise);
    const { toPreview, update, text } = await render();
    await toPreview();
    await update({ visible: false });
    await update({ visible: true });
    await act(async () => {
      pending.reject(new ProError('invite_invalid'));
    });
    expect(text()).not.toContain("That code isn't valid");
  });

  it('cancels from the code step', async () => {
    const { press, props } = await render();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ProRedeemSheet: the device', () => {
  it('stores nothing in AsyncStorage across the whole walk', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    const { toPreview, press } = await render();
    await toPreview();
    await press('Continue');
    await press('Connect');
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('uses no navigation, no KeyboardDoneBar and no storage, and never logs an error', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/components/ProRedeemSheet.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/@react-navigation|useNavigation|navigate\(|AsyncStorage|console\.error/);
    expect(code).not.toMatch(/KeyboardDoneBar|keyboardDoneProps|multiline/);
    expect(code).not.toMatch(/Book|Checkout|Premium|Featured|Verified|Certified/);
  });
});

describe('ProRedeemSheet, the cost of having it mounted', () => {
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
