import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Linking } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ProAccessNotice from '../../src/components/ProAccessNotice';
import type { ProAccess } from '../../src/hooks/useProAccess';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_SAFETY_ELSEWHERE_NOTE,
  PRO_SAFETY_ONLY_NOTE,
  PRO_SERVER_BEHIND_MESSAGE,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
  PRO_SUSPENDED_MESSAGE,
  PRO_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/proRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../src/config/legal';
import type { ProStatus } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProAccessNotice>;

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
  stylist: { termsCurrent: true, accepting: true, approved: false, invitesHeld: false, activeClients: 0, clientLimit: 3, liveInvites: 0, inviteLimit: 1 },
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const ready = (over: Partial<Extract<ProAccess, { state: 'ready' }>> = {}): ProAccess => ({
  state: 'ready',
  status: status(),
  stylist: 'available',
  client: 'available',
  ...over,
});

const render = (props: Props) => {
  const tree = renderer.create(<ProAccessNotice {...props} />);
  const text = () => flatten(tree.toJSON());
  const button = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  return { tree, text, button, json: () => tree.toJSON() };
};

describe('ProAccessNotice, one plain state for each way in', () => {
  it('draws nothing while loading', () => {
    expect(render({ access: { state: 'loading' } }).json()).toBeNull();
  });

  it('draws nothing for a person who can go ahead', () => {
    expect(render({ access: ready() }).json()).toBeNull();
    expect(render({ access: ready(), role: 'stylist' }).json()).toBeNull();
  });

  it('asks a guest to sign in, with a Sign in button that calls the screen', () => {
    const onSignIn = jest.fn();
    const { text, button } = render({ access: { state: 'guest' }, onSignIn });
    expect(text()).toContain('Sign in to work with a stylist');
    act(() => { button('Sign in').props.onPress(); });
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('has no Sign in button when the screen gave no handler', () => {
    const { text, button } = render({ access: { state: 'guest' } });
    expect(text()).toContain('Sign in to work with a stylist');
    expect(button('Sign in')).toBeUndefined();
  });

  it('says features are paused, and that the ways out still work', () => {
    const { text } = render({ access: { state: 'paused' } });
    expect(text()).toContain(PRO_PAUSED_MESSAGE);                                    // the constant, not a retyped copy
    expect(text()).toContain(PRO_SAFETY_ONLY_NOTE);
    expect(text()).toContain('You can still stop sharing, end a connection, report or block while this is paused.');
  });

  it('points to the tab that has the safety actions when the screen has none of its own, and promises nothing when told not to', () => {
    const paused = render({ access: { state: 'paused' }, safetyNote: PRO_SAFETY_ELSEWHERE_NOTE });
    expect(paused.text()).toContain(PRO_PAUSED_MESSAGE);
    expect(paused.text()).toContain(PRO_SAFETY_ELSEWHERE_NOTE);
    expect(paused.text()).not.toContain(PRO_SAFETY_ONLY_NOTE);
    const suspended = render({ access: { state: 'suspended', status: status({ suspended: true }) }, safetyNote: null });
    expect(suspended.text()).toContain(PRO_SUSPENDED_MESSAGE);
    expect(suspended.text()).not.toMatch(/stop sharing|report or block/);
  });

  it('says it is not available yet on a server without the functions', () => {
    const { text } = render({ access: { state: 'not_deployed' } });
    expect(text()).toContain(PRO_NOT_DEPLOYED_MESSAGE);
    expect(text()).toContain("Professional features aren't available yet in this version.");
    expect(text()).not.toContain(PRO_SAFETY_ONLY_NOTE);
  });

  it('says the account is paused, offers Email support, and keeps the ways out', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const { text, button } = render({ access: { state: 'suspended', status: status({ suspended: true }) } });
    expect(text()).toContain(PRO_SUSPENDED_MESSAGE);
    expect(text()).toContain(PRO_SAFETY_ONLY_NOTE);
    await act(async () => { await button('Email support').props.onPress(); });
    expect(open).toHaveBeenCalledWith(SUPPORT_MAILTO);
    open.mockRestore();
  });

  it('shows the address when Email support cannot open the mail app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { button } = render({ access: { state: 'suspended', status: status({ suspended: true }) } });
    await act(async () => { await button('Email support').props.onPress(); });
    expect(alert).toHaveBeenCalledWith('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
    open.mockRestore();
    alert.mockRestore();
  });

  it('shows the load error with Try again, and Try again calls the screen', async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const { text, button } = render({ access: { state: 'error', message: 'You seem to be offline. Please try again.' }, onRefresh });
    expect(text()).toContain("Couldn't load professional features");
    await act(async () => { await button('Try again to load your professional features').props.onPress(); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not crash on Try again when the screen gave no handler', async () => {
    const { button } = render({ access: { state: 'error', message: 'x' } });
    await act(async () => { await button('Try again to load your professional features').props.onPress(); });
  });
});

describe('ProAccessNotice, the ready state for a role', () => {
  const olderServer = status({ versions: { stylistTerms: '2026-09', clientTerms: '2026-09', shareText: PRO_SHARE_TEXT_VERSION } });
  const newerServer = status({ versions: { stylistTerms: '2026-11', clientTerms: '2026-11', shareText: PRO_SHARE_TEXT_VERSION } });

  it('says to update when the server has newer terms than this build', () => {
    const { text } = render({ access: ready({ status: newerServer, client: 'update_required' }) });
    expect(text()).toContain('Update needed');
    expect(text()).toContain(PRO_UPDATE_REQUIRED_MESSAGE);
    expect(text()).toContain('Update SmartCloset to keep using professional features.');
  });

  it('says to check back when this build is the newer one', () => {
    const { text } = render({ access: ready({ status: olderServer, client: 'update_required' }) });
    expect(text()).toContain('Check back soon');
    expect(text()).toContain(PRO_SERVER_BEHIND_MESSAGE);
    expect(text()).not.toContain(PRO_UPDATE_REQUIRED_MESSAGE);
  });

  it('looks at the client side by default and at the stylist side when asked', () => {
    const access = ready({ status: newerServer, stylist: 'update_required', client: 'available' });
    expect(render({ access }).json()).toBeNull();
    expect(render({ access, role: 'stylist' }).text()).toContain('Update needed');
    const other = ready({ status: newerServer, stylist: 'available', client: 'update_required' });
    expect(render({ access: other, role: 'stylist' }).json()).toBeNull();
    expect(render({ access: other, role: 'client' }).text()).toContain('Update needed');
  });

  it('offers to read the terms only when the screen can open them', () => {
    const access = ready({ client: 'needs_terms' });
    expect(render({ access }).json()).toBeNull();

    const onReadTerms = jest.fn();
    const { text, button } = render({ access, onReadTerms });
    expect(text()).toContain('Read the terms to get started');
    act(() => { button('Read the terms').props.onPress(); });
    expect(onReadTerms).toHaveBeenCalledTimes(1);
  });

  it('prefers the update line to the terms line', () => {
    const { text } = render({ access: ready({ status: newerServer, client: 'update_required' }), onReadTerms: jest.fn() });
    expect(text()).toContain('Update needed');
    expect(text()).not.toContain('Read the terms');
  });
});

describe('ProAccessNotice, how it is built', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProAccessNotice.tsx'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('contains no navigation, so any screen can host it', () => {
    expect(code).not.toMatch(/navigate\(|useNavigation|useFocusEffect/);
  });

  it('calls nothing at all on the server', () => {
    expect(code).not.toMatch(/proService|supabase/);
  });

  it('says nothing that sounds like a purchase', () => {
    for (const state of [{ state: 'guest' }, { state: 'paused' }, { state: 'not_deployed' }, { state: 'suspended', status: status({ suspended: true }) }] as ProAccess[]) {
      expect(render({ access: state, onSignIn: jest.fn() }).text()).not.toMatch(/\b(book|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    }
  });
});
