import 'react-native';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InputAccessoryView, ScrollView, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockJoin = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  joinSwapCommunity: (...a: any[]) => mockJoin(...a),
}));

import SwapJoinCommunitySheet from '../../src/components/SwapJoinCommunitySheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { SWAP_COMMUNITY_SCAN_NOTICE, SWAP_TERMS } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';

type Props = React.ComponentProps<typeof SwapJoinCommunitySheet>;

const ADULT = 'I am 18 or older';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onJoined: jest.fn(), onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapJoinCommunitySheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapJoinCommunitySheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const pressable = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const aliasField = () => tree.root.findAllByType(TextInput)[0];
  const typeAlias = async (value: string) => {
    await act(async () => {
      aliasField().props.onChangeText(value);
    });
  };
  const joinDisabled = () => pressable('Join').props.accessibilityState.disabled as boolean;
  const ready = async (alias = 'Velvet Otter') => {
    await typeAlias(alias);
    await press(ADULT);
    await press(SWAP_COMMUNITY_SCAN_NOTICE);
  };
  return { tree, text, press, pressable, aliasField, typeAlias, joinDisabled, ready, update, props };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockJoin.mockReset().mockResolvedValue(undefined);
});

describe('SwapJoinCommunitySheet', () => {
  it('asks for an alias and the two acknowledgements, with a link to the terms', async () => {
    const { text, pressable, aliasField } = await render();
    expect(text()).toContain('Join community swaps');
    expect(aliasField().props.accessibilityLabel).toBe('Alias');
    expect(text()).toContain(ADULT);
    expect(text()).toContain(SWAP_COMMUNITY_SCAN_NOTICE);
    expect(pressable('Read the swap terms')).toBeTruthy();
    expect(pressable(ADULT).props.accessibilityRole).toBe('checkbox');
    expect(pressable(SWAP_COMMUNITY_SCAN_NOTICE).props.accessibilityRole).toBe('checkbox');
  });

  it('keeps Join disabled until the alias has 3 characters and both boxes are ticked', async () => {
    const { joinDisabled, typeAlias, press } = await render();
    expect(joinDisabled()).toBe(true);

    await typeAlias('Vel');
    expect(joinDisabled()).toBe(true);
    await press(ADULT);
    expect(joinDisabled()).toBe(true);
    await press(SWAP_COMMUNITY_SCAN_NOTICE);
    expect(joinDisabled()).toBe(false);

    await typeAlias('ab');
    expect(joinDisabled()).toBe(true);
    await typeAlias('   ab   ');
    expect(joinDisabled()).toBe(true);
    await typeAlias('abc');
    expect(joinDisabled()).toBe(false);

    await press(ADULT);
    expect(joinDisabled()).toBe(true);
  });

  it('does nothing when Join is pressed while it is disabled', async () => {
    const { pressable, typeAlias } = await render();
    await typeAlias('Velvet Otter');
    await act(async () => {
      pressable('Join').props.onPress();
    });
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('trims the alias and joins without any version, then tells the screen', async () => {
    const { ready, typeAlias, press, props } = await render();
    await ready();
    await typeAlias('  Velvet Otter  ');
    await press('Join');
    expect(mockJoin).toHaveBeenCalledTimes(1);
    // Exactly these three keys: the service adds SWAP_TERMS_VERSION, the sheet has none to send.
    expect(mockJoin).toHaveBeenCalledWith({ alias: 'Velvet Otter', adult: true, photoScanOk: true });
    expect(props.onJoined).toHaveBeenCalledTimes(1);
  });

  it('limits the alias field to 20 characters', async () => {
    const { aliasField } = await render();
    expect(aliasField().props.maxLength).toBe(20);
  });

  it.each([
    ['alias_taken', 'That alias is taken. Try another.'],
    ['alias_invalid', 'Choose an alias of 3 to 20 letters, numbers, spaces or . _ -, without staff-like or contact words.'],
    ['account_too_new', 'Community swaps unlock two days after you create your account.'],
    ['community_unavailable', 'Community swaps aren’t open yet.'],
    ['swap_terms_required', 'Please read and accept the swap terms first.'],
    ['terms_version_mismatch', 'The swap terms were updated. Please reopen swaps and accept them.'],
  ] as const)('shows %s in plain words and stays open', async (code, message) => {
    mockJoin.mockRejectedValue(new SwapError(code));
    const { ready, press, text, props } = await render();
    await ready();
    await press('Join');
    expect(text()).toContain(message);
    expect(text()).not.toContain(code);
    expect(props.onJoined).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('maps the server’s own error text too (as supabase-js delivers it)', async () => {
    mockJoin.mockRejectedValue({ message: 'alias_taken', code: '23505' });
    const { ready, press, text } = await render();
    await ready();
    await press('Join');
    expect(text()).toContain('That alias is taken. Try another.');
  });

  it('shows an offline or unexpected failure without a raw message, and lets the member retry', async () => {
    mockJoin.mockRejectedValueOnce({ message: 'Network request failed' });
    const { ready, press, text, props } = await render();
    await ready();
    await press('Join');
    expect(text()).toContain('You seem to be offline. Check your connection and try again.');

    mockJoin.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "swap_members_alias_key"'));
    await press('Join');
    expect(text()).toContain('Couldn’t join community swaps. Please try again.');
    expect(text()).not.toContain('duplicate key');

    await press('Join');
    expect(props.onJoined).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain('Couldn’t join');
  });

  it('refuses an alias with a character the database would refuse, without asking it', async () => {
    const { ready, press, text, props } = await render();
    await ready('Otter!!!');
    await press('Join');
    expect(mockJoin).not.toHaveBeenCalled();
    expect(text()).toContain('Choose an alias of 3 to 20 letters, numbers, spaces or . _ -');
    expect(props.onJoined).not.toHaveBeenCalled();
  });

  it('accepts letters, digits and the allowed punctuation inside the alias', async () => {
    const { ready, press } = await render();
    await ready('a.b_c-d 9');
    await press('Join');
    expect(mockJoin).toHaveBeenCalledWith({ alias: 'a.b_c-d 9', adult: true, photoScanOk: true });
  });

  it('does not join twice while a request is in flight', async () => {
    const pending = deferred();
    mockJoin.mockReturnValue(pending.promise);
    const { ready, press, joinDisabled, props } = await render();
    await ready();
    await press('Join');
    expect(joinDisabled()).toBe(true);
    await press('Join');
    expect(mockJoin).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve();
    });
    expect(props.onJoined).toHaveBeenCalledTimes(1);
  });

  it('ignores a result that arrives after the sheet was closed', async () => {
    const pending = deferred();
    mockJoin.mockReturnValue(pending.promise);
    const { ready, press, update, props } = await render();
    await ready();
    await press('Join');
    await update({ visible: false });
    await act(async () => {
      pending.resolve();
    });
    expect(props.onJoined).not.toHaveBeenCalled();
  });

  it('starts empty each time it opens', async () => {
    const { ready, update, aliasField, joinDisabled, text } = await render();
    await ready();
    expect(joinDisabled()).toBe(false);
    await update({ visible: false });
    await update({ visible: true });
    expect(aliasField().props.value).toBe('');
    expect(joinDisabled()).toBe(true);
    expect(text()).not.toContain('Choose an alias');
  });

  it('closes with Cancel without joining', async () => {
    const { ready, press, props } = await render();
    await ready();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('lets the member read the swap terms inside the sheet and come back with the form as it was', async () => {
    const { ready, press, text, aliasField, joinDisabled } = await render();
    await ready();
    await press('Read the swap terms');
    expect(text()).toContain('Swap terms');
    for (const section of SWAP_TERMS.sections) expect(text()).toContain(section.heading);
    expect(text()).not.toContain('Alias');

    await press('Back');
    expect(aliasField().props.value).toBe('Velvet Otter');
    expect(joinDisabled()).toBe(false);
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('keeps the alias field above the keyboard, with a Return key and no Done bar', async () => {
    const { tree, aliasField } = await render();
    const field = aliasField();
    expect(field.props.multiline).toBeFalsy();
    expect(field.props.returnKeyType).toBe('done');
    expect(field.props.blurOnSubmit).not.toBe(false);
    expect(field.props.inputAccessoryViewID).toBeUndefined();
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);

    let above = field.parent;
    const ancestors = [];
    while (above) {
      ancestors.push(above);
      above = above.parent;
    }
    expect(ancestors.some(a => a.type === KeyboardLift)).toBe(true);
    // The sheet is already lifted, so its scroll view must not add keyboard insets of its own.
    const scroll = ancestors.find(a => a.type === ScrollView);
    expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBeFalsy();
  });

  it('stores nothing on the device', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const { ready, press } = await render();
    await ready();
    await press('Join');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
