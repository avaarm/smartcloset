import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Share } from 'react-native';
import renderer, { act } from 'react-test-renderer';

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockRevoke = jest.fn();
jest.mock('../../src/services/proService', () => ({
  listMyProInvites: (...a: any[]) => mockList(...a),
  createProInvite: (...a: any[]) => mockCreate(...a),
  revokeProInvite: (...a: any[]) => mockRevoke(...a),
}));

import ProInvitesSheet, { inviteShareMessage } from '../../src/components/ProInvitesSheet';
import { ProError } from '../../src/services/proErrors';
import type { ProInvite } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProInvitesSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const invite = (over: Partial<ProInvite> = {}): ProInvite => ({
  id: 'i1',
  code: '0123456789',
  status: 'live',
  createdAt: '2026-10-20T10:00:00Z',
  expiresAt: '2026-10-27T10:00:00Z',
  connected: false,
  ...over,
});

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const mounted: renderer.ReactTestRenderer[] = [];
const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProInvitesSheet {...props} />);
  });
  mounted.push(tree);
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProInvitesSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  // A Button shows up as the component, the Pressable and the host view under it; keep the outermost of each chain.
  const byLabel = (label: string) => {
    const nodes = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    return nodes.filter(n => {
      for (let p = n.parent; p; p = p.parent) if (nodes.includes(p)) return false;
      return true;
    });
  };
  const press = async (label: string, at = 0) => {
    const nodes = byLabel(label);
    if (!nodes[at]) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[at].props.onPress();
    });
  };
  const type = async (label: string, value: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function');
    await act(async () => {
      node.props.onChangeText(value);
    });
  };
  const field = () => tree.root.find(n => n.props.accessibilityLabel === 'Label for the invite code' && typeof n.props.onChangeText === 'function');
  return { tree, props, update, text, byLabel, press, type, field };
};

/** Runs the confirm button of the last Alert. */
const confirmAlert = async (buttonText: string) => {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  const button = call[2].find((b: any) => b.text === buttonText);
  await act(async () => {
    await button.onPress();
  });
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockCreate.mockReset().mockImplementation(async ({ label }: any) => invite({ id: 'new', code: 'ABCDE23456', label }));
  mockRevoke.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProInvitesSheet: the list', () => {
  it('reads the codes when it opens, and not before', async () => {
    await render({ visible: false });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('shows each code grouped, with its status', async () => {
    mockList.mockResolvedValue([
      invite({ id: 'a', code: '0123456789', label: 'Sam' }),
      invite({ id: 'b', code: 'ABCDEFGHJK', status: 'used', connected: true, usedAt: '2026-10-21T10:00:00Z' }),
      invite({ id: 'c', code: 'MNPQRSTVWX', status: 'revoked' }),
      invite({ id: 'd', code: 'YZ01234567', status: 'expired' }),
    ]);
    const { text } = await render();
    const t = text();
    expect(t).toContain('01234-56789');
    expect(t).toContain('ABCDE-FGHJK');
    expect(t).toContain('Live');
    expect(t).toContain('Connected');
    expect(t).toContain('Revoked');
    expect(t).toContain('Expired');
    expect(t).toContain('Sam');
    expect(t).toContain('Live codes');
    expect(t).toContain('Recent');
  });

  it('offers Share and Revoke only on a live code', async () => {
    mockList.mockResolvedValue([invite({ id: 'a' }), invite({ id: 'b', status: 'used', code: 'ABCDEFGHJK' })]);
    const { byLabel } = await render();
    expect(byLabel('Share')).toHaveLength(1);
    expect(byLabel('Revoke')).toHaveLength(1);
  });

  it('says there are none yet, never while they are still coming', async () => {
    const pending = deferred<ProInvite[]>();
    mockList.mockReturnValue(pending.promise);
    const { text } = await render();
    expect(text()).not.toContain('No codes yet');
    await act(async () => {
      pending.resolve([]);
    });
    expect(text()).toContain('No codes yet. Create one and give it to your client.');
  });

  it('shows Try again when the list cannot be read, and reads it again', async () => {
    mockList.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce([invite()]);
    const { text, press } = await render();
    expect(text()).toContain('Couldn\'t load your invite codes');
    await press('Try again to load your invite codes');
    expect(text()).toContain('01234-56789');
  });

  it('ignores a list that arrives after the sheet was closed', async () => {
    const slow = deferred<ProInvite[]>();
    mockList.mockReturnValue(slow.promise);
    const { update, text } = await render();
    await update({ visible: false });
    await act(async () => {
      slow.resolve([invite()]);
    });
    expect(text()).toBe('');
  });
});

describe('ProInvitesSheet: creating a code', () => {
  it('makes a code with the label and shows it at the top of the list', async () => {
    mockList.mockResolvedValue([invite({ id: 'old', code: 'ABCDEFGHJK' })]);
    const { type, press, text } = await render();
    await type('Label for the invite code', '  Sam  ');
    await press('Create invite code');
    expect(mockCreate).toHaveBeenCalledWith({ label: 'Sam', clientRef: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(text().indexOf('ABCDE-23456')).toBeGreaterThan(-1);
    expect(text().indexOf('ABCDE-23456')).toBeLessThan(text().indexOf('ABCDE-FGHJK'));
  });

  it('sends no label when none was typed, and clears the label after a code was made', async () => {
    const { type, press, field } = await render();
    await press('Create invite code');
    expect(mockCreate.mock.calls[0][0].label).toBeUndefined();
    await type('Label for the invite code', 'Sam');
    await press('Create invite code');
    expect(field().props.value).toBe('');
  });

  it('keeps the label and reuses the same reference when the attempt is retried, then uses a new one for the next code', async () => {
    mockCreate
      .mockRejectedValueOnce(new ProError('offline'))
      .mockImplementation(async () => invite({ id: `n${mockCreate.mock.calls.length}`, code: 'ABCDE23456' }));
    const { type, press, field, text } = await render();
    await type('Label for the invite code', 'Sam');
    await press('Create invite code');
    expect(text()).toContain('You seem to be offline. Please try again.');
    expect(field().props.value).toBe('Sam');
    await press('Create invite code');
    await press('Create invite code');
    const refs = mockCreate.mock.calls.map(c => c[0].clientRef);
    expect(refs[1]).toBe(refs[0]);
    expect(refs[2]).not.toBe(refs[1]);
  });

  it('asks again with a fresh reference each time the sheet is opened', async () => {
    mockCreate.mockRejectedValue(new ProError('offline'));
    const { press, update } = await render();
    await press('Create invite code');
    await update({ visible: false });
    await update({ visible: true });
    await press('Create invite code');
    expect(mockCreate.mock.calls[1][0].clientRef).not.toBe(mockCreate.mock.calls[0][0].clientRef);
  });

  it.each([
    ['invite_limit', 'You have too many live invite codes. Revoke one or wait for one to expire.'],
    ['invites_held', 'Your invites are paused while we review your profile. Email support if you think this is a mistake.'],
    ['account_too_new', 'Your account is too new to create invite codes. Please try again in a day or two.'],
    ['pro_rate_limited', 'You\'re going a bit fast. Please wait a moment.'],
  ] as const)('explains %s in plain words', async (code, words) => {
    mockCreate.mockRejectedValue(new ProError(code));
    const { press, text } = await render();
    await press('Create invite code');
    expect(text()).toContain(words);
    expect(text()).not.toContain(code);
  });

  it('makes one code for two quick taps', async () => {
    const slow = deferred<ProInvite>();
    mockCreate.mockReturnValue(slow.promise);
    const { press } = await render();
    await press('Create invite code');
    await press('Create invite code');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      slow.resolve(invite({ id: 'x' }));
    });
  });

  it('limits the label to what the server accepts', async () => {
    const { field } = await render();
    expect(field().props.maxLength).toBe(40);
  });
});

describe('ProInvitesSheet: sharing and revoking', () => {
  it('shares a plain sentence and the code, with no link', async () => {
    mockList.mockResolvedValue([invite({ code: '0123456789' })]);
    const { press } = await render();
    await press('Share');
    const message = (Share.share as jest.Mock).mock.calls[0][0].message as string;
    expect(message).toBe(
      'Join me on SmartCloset. In the app, open Home > Stylists and enter this code: 01234-56789. It works once and expires in 7 days.',
    );
    expect(message).not.toMatch(/https?:|www\./i);
    expect(inviteShareMessage('0123456789')).toBe(message);
  });

  it('confirms before revoking, then withdraws the code and reads the list again', async () => {
    mockList.mockResolvedValueOnce([invite({ id: 'a' })]).mockResolvedValueOnce([invite({ id: 'a', status: 'revoked' })]);
    const { press, text } = await render();
    await press('Revoke');
    expect(Alert.alert).toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
    await confirmAlert('Revoke');
    expect(mockRevoke).toHaveBeenCalledWith('a');
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Revoked');
  });

  it('does nothing when the confirmation is cancelled', async () => {
    mockList.mockResolvedValue([invite({ id: 'a' })]);
    const { press } = await render();
    await press('Revoke');
    const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
    expect(call[2].find((b: any) => b.text === 'Cancel').style).toBe('cancel');
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('says why a revoke failed and keeps the list', async () => {
    mockList.mockResolvedValue([invite({ id: 'a' })]);
    mockRevoke.mockRejectedValue(new ProError('pro_unavailable'));
    const { press, text } = await render();
    await press('Revoke');
    await confirmAlert('Revoke');
    expect(text()).toContain('This is no longer available.');
    expect(text()).toContain('01234-56789');
  });
});

describe('ProInvitesSheet: the rest', () => {
  it('is closed by the Close button', async () => {
    const { press, props } = await render();
    await press('Close');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('holds no navigation, and its field closes the keyboard on Return', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProInvitesSheet.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation|AsyncStorage/);
    expect(source).toMatch(/\{\.\.\.singleLineDoneProps\}/);
  });
});
