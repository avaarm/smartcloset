import React from 'react';
import renderer, { act } from 'react-test-renderer';

// Focus is a plain effect here, unless a test asks for the real hook, which needs a navigation container
// (the 'mount' tests below prove the hook never asks for one).
const mockFocusCalls = jest.fn();
let mockRealNavigation = false;
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocusCalls();
      const useFocusAsEffect = (fn: () => void) => useEffect(fn, [fn]);
      const run = mockRealNavigation ? jest.requireActual('@react-navigation/native').useFocusEffect : useFocusAsEffect;
      return run(cb);
    },
  };
});
const mockStatus = jest.fn();
const mockAccept = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
}));

import { accessFromStatus, proUpdateMessage, useProAccess } from '../../src/hooks/useProAccess';
import type { ProAccess } from '../../src/hooks/useProAccess';
import { ProError } from '../../src/services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION, PRO_SERVER_BEHIND_MESSAGE, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION, PRO_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/proRules';
import type { ProStatus } from '../../src/types/pro';

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

let latest: ReturnType<typeof useProAccess>;
const Probe = ({ refreshOn }: { refreshOn?: 'focus' | 'mount' }) => {
  latest = useProAccess(refreshOn ? { refreshOn } : undefined);
  return null;
};
const LazyProbe = () => {
  latest = useProAccess({ refreshOn: 'mount', lazy: true });
  return null;
};
const mount = async (refreshOn?: 'focus' | 'mount') => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe refreshOn={refreshOn} />); });
  return tree;
};
const refresh = async () => { await act(async () => { await latest.refresh(); }); };
const ready = () => latest.access as Extract<ProAccess, { state: 'ready' }>;

beforeEach(() => {
  mockStatus.mockReset();
  mockAccept.mockReset();
  mockFocusCalls.mockClear();
});

describe('useProAccess states', () => {
  it('is loading until the first answer', async () => {
    let release!: (s: ProStatus) => void;
    mockStatus.mockReturnValue(new Promise<ProStatus>(r => { release = r; }));
    await mount();
    expect(latest.access.state).toBe('loading');
    await act(async () => { release(status()); });
    expect(latest.access.state).toBe('ready');
  });

  it('is ready for a person with the terms accepted for both roles', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    expect(ready()).toMatchObject({ state: 'ready', stylist: 'available', client: 'available' });
    expect(ready().status.badge).toBe(0);
  });

  it.each([
    ['a guest', new ProError('not_authenticated'), 'guest'],
    ['the server switch, as an error', new ProError('pro_disabled'), 'paused'],
    ['a server without the functions', { message: 'x', code: 'PGRST202' }, 'not_deployed'],
    ['being offline', { message: 'Network request failed' }, 'error'],
    ['anything unexpected', { message: 'boom' }, 'error'],
  ])('maps %s', async (_n, failure, state) => {
    mockStatus.mockRejectedValue(failure);
    await mount();
    expect(latest.access.state).toBe(state);
  });

  it('gives a plain message for an error, never a code', async () => {
    mockStatus.mockRejectedValue({ message: 'Network request failed' });
    await mount();
    expect(latest.access).toEqual({ state: 'error', message: 'You seem to be offline. Please try again.' });
    mockStatus.mockRejectedValue({ message: 'boom' });
    await refresh();
    expect((latest.access as any).message).toBe("Couldn't load professional features. Please try again.");
  });

  it('is paused when the server switch is off, suspended when the account is, and paused wins', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    await mount();
    expect(latest.access).toEqual({ state: 'paused' });
    mockStatus.mockResolvedValue(status({ suspended: true }));
    await refresh();
    expect(latest.access.state).toBe('suspended');
    expect((latest.access as any).status.suspended).toBe(true);
    mockStatus.mockResolvedValue(status({ proEnabled: false, suspended: true }));
    await refresh();
    expect(latest.access.state).toBe('paused');
  });

  it('comes back from a pause on the next refresh', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    await mount();
    mockStatus.mockResolvedValue(status());
    await refresh();
    expect(latest.access.state).toBe('ready');
  });
});

describe('useProAccess when a re-read fails (pro-accounts.md 7.8: refresh failed with data on screen)', () => {
  it('keeps a ready state, says the read failed, and drops the flag on the next good read', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    const before = ready();
    expect(latest.refreshFailed).toBe(false);
    mockStatus.mockRejectedValue({ message: 'Network request failed' });
    await refresh();
    expect(latest.access).toBe(before);                      // the very same state: nothing on screen is taken away
    expect(latest.refreshFailed).toBe(true);
    mockStatus.mockResolvedValue(status({ badge: 3 }));
    await refresh();
    expect(ready().status.badge).toBe(3);
    expect(latest.refreshFailed).toBe(false);
  });

  it.each([
    ['paused', status({ proEnabled: false })],
    ['suspended', status({ suspended: true })],
  ])('keeps %s too', async (state, held) => {
    mockStatus.mockResolvedValue(held);
    await mount();
    mockStatus.mockRejectedValue({ message: 'boom' });
    await refresh();
    expect(latest.access.state).toBe(state);
    expect(latest.refreshFailed).toBe(true);
  });

  it('keeps it for any failure that is not a change of state, whatever the error', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    for (const failure of [{ message: 'Network request failed' }, { message: 'boom' }, new ProError('pro_rate_limited'), new ProError('unknown')]) {
      mockStatus.mockRejectedValue(failure);
      await refresh();
      expect(latest.access.state).toBe('ready');
      expect(latest.refreshFailed).toBe(true);
    }
  });

  it.each([
    ['signing out', new ProError('not_authenticated'), 'guest'],
    ['the switch going off', new ProError('pro_disabled'), 'paused'],
    ['a server with no pro functions', { message: 'x', code: 'PGRST202' }, 'not_deployed'],
  ])('still changes state for %s, which is an answer and not a failure', async (_n, failure, state) => {
    mockStatus.mockResolvedValue(status());
    await mount();
    mockStatus.mockRejectedValue(failure);
    await refresh();
    expect(latest.access.state).toBe(state);
    expect(latest.refreshFailed).toBe(false);
  });

  it('is an error only when there is nothing to keep: the first read, or a read after a guest, an error or a missing server', async () => {
    mockStatus.mockRejectedValue({ message: 'Network request failed' });
    await mount();
    expect(latest.access.state).toBe('error');
    expect(latest.refreshFailed).toBe(false);
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    await refresh();
    expect(latest.access.state).toBe('guest');
    mockStatus.mockRejectedValue({ message: 'boom' });
    await refresh();
    expect(latest.access.state).toBe('error');
  });

  it('answers a late failure from an older read with nothing', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    let fail!: (e: unknown) => void;
    mockStatus.mockReturnValueOnce(new Promise((_r, rej) => { fail = rej; }));
    let slow!: Promise<void>;
    await act(async () => { slow = latest.refresh(); });
    mockStatus.mockResolvedValueOnce(status({ badge: 7 }));
    await refresh();
    expect(ready().status.badge).toBe(7);
    await act(async () => { fail({ message: 'late' }); await slow; });
    expect(ready().status.badge).toBe(7);
    expect(latest.refreshFailed).toBe(false);
  });
});

describe('useProAccess roles', () => {
  it('needs terms for the client when they are not current, and leaves the stylist role alone', async () => {
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 0, connectionLimit: 5 } }));
    await mount();
    expect(ready()).toMatchObject({ stylist: 'available', client: 'needs_terms' });
  });

  it('needs terms for the stylist when they are not current', async () => {
    mockStatus.mockResolvedValue(status({ stylist: { termsCurrent: false, accepting: true, approved: false, invitesHeld: false, activeClients: 0, clientLimit: 3, liveInvites: 0, inviteLimit: 1 } }));
    await mount();
    expect(ready()).toMatchObject({ stylist: 'needs_terms', client: 'available' });
  });

  it('needs terms for both roles until the 18+ confirmation is stored', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }));
    await mount();
    expect(ready()).toMatchObject({ stylist: 'needs_terms', client: 'needs_terms' });
  });

  it('needs terms for the stylist role while there is no profile (the server does not say whether they accepted before)', async () => {
    mockStatus.mockResolvedValue(status({ stylist: null }));
    await mount();
    expect(ready()).toMatchObject({ stylist: 'needs_terms', client: 'available' });
    expect(ready().status.stylist).toBeNull();
  });

  describe('when the server and this build disagree about a terms version', () => {
    const ahead = (v: string) => `${v}x`.replace(/\d{2}x$/, '99');   // a later month than this build's

    it('a newer server version means "update the app" for that role only, and nothing is recorded', async () => {
      mockStatus.mockResolvedValue(status({
        client: { termsCurrent: false, connections: 0, connectionLimit: 5 },
        versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: ahead(PRO_CLIENT_TERMS_VERSION), shareText: PRO_SHARE_TEXT_VERSION },
      }));
      await mount();
      expect(ready()).toMatchObject({ client: 'update_required', stylist: 'available' });
      await act(async () => { await latest.acceptTerms('client', true); });
      expect(mockAccept).not.toHaveBeenCalled();
      expect(proUpdateMessage(ready().status, 'client')).toBe(PRO_UPDATE_REQUIRED_MESSAGE);
    });

    it('so does a person who already agreed to the newer text on another phone', async () => {
      mockStatus.mockResolvedValue(status({
        versions: { stylistTerms: ahead(PRO_STYLIST_TERMS_VERSION), clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
      }));
      await mount();
      expect(ready()).toMatchObject({ stylist: 'update_required', client: 'available' });
      await act(async () => { await latest.acceptTerms('stylist', true); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('an older server version (this build is ahead of the database) is its own message, and records nothing', async () => {
      mockStatus.mockResolvedValue(status({
        client: { termsCurrent: false, connections: 0, connectionLimit: 5 },
        versions: { stylistTerms: '2026-09', clientTerms: '2026-09', shareText: PRO_SHARE_TEXT_VERSION },
      }));
      await mount();
      expect(ready()).toMatchObject({ stylist: 'update_required', client: 'update_required' });
      expect(proUpdateMessage(ready().status, 'client')).toBe(PRO_SERVER_BEHIND_MESSAGE);
      expect(proUpdateMessage(ready().status, 'stylist')).toBe(PRO_SERVER_BEHIND_MESSAGE);
      await act(async () => { await latest.acceptTerms('client', true); await latest.acceptTerms('stylist', true); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('paused and suspended still win, so those people see their own message', async () => {
      const skewed = { stylistTerms: '2026-11', clientTerms: '2026-11', shareText: PRO_SHARE_TEXT_VERSION };
      mockStatus.mockResolvedValue(status({ proEnabled: false, versions: skewed }));
      await mount();
      expect(latest.access.state).toBe('paused');
      mockStatus.mockResolvedValue(status({ suspended: true, versions: skewed }));
      await refresh();
      expect(latest.access.state).toBe('suspended');
    });

    it('names the two cases apart only by which side is older', () => {
      const s = (clientTerms: string) => status({ versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms, shareText: PRO_SHARE_TEXT_VERSION } });
      expect(proUpdateMessage(s('2099-01'), 'client')).toBe(PRO_UPDATE_REQUIRED_MESSAGE);
      expect(proUpdateMessage(s('2000-01'), 'client')).toBe(PRO_SERVER_BEHIND_MESSAGE);
      expect(PRO_UPDATE_REQUIRED_MESSAGE).not.toBe(PRO_SERVER_BEHIND_MESSAGE);
    });
  });

  it('accessFromStatus is the whole decision, as a pure function', () => {
    expect(accessFromStatus(status())).toMatchObject({ state: 'ready', stylist: 'available', client: 'available' });
    expect(accessFromStatus(status({ proEnabled: false }))).toEqual({ state: 'paused' });
  });
});

describe('acceptTerms', () => {
  it('records agreement for the role, passing no version (the service sends the one in this build), then becomes available', async () => {
    mockStatus.mockResolvedValueOnce(status({ client: { termsCurrent: false, connections: 0, connectionLimit: 5 }, adultConfirmed: false }));
    await mount();
    expect(ready().client).toBe('needs_terms');
    mockAccept.mockResolvedValue(undefined);
    mockStatus.mockResolvedValue(status());
    await act(async () => { await latest.acceptTerms('client', true); });
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept.mock.calls[0]).toEqual(['client', true]);
    expect(ready().client).toBe('available');
  });

  it('does nothing for a role that is already available, or before there is an answer', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    await act(async () => { await latest.acceptTerms('client', true); await latest.acceptTerms('stylist', true); });
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('does nothing while paused, suspended, signed out or loading', async () => {
    for (const result of [status({ proEnabled: false }), status({ suspended: true })]) {
      mockStatus.mockResolvedValue(result);
      const tree = await mount();
      await act(async () => { await latest.acceptTerms('client', true); });
      tree.unmount();
    }
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    await mount();
    await act(async () => { await latest.acceptTerms('client', true); });
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('passes the failure to the caller as a ProError, keeps the state, and does not reload', async () => {
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 0, connectionLimit: 5 } }));
    await mount();
    mockAccept.mockRejectedValue({ message: 'adult_required', code: '22023' });
    let thrown: any;
    await act(async () => { try { await latest.acceptTerms('client', false); } catch (e) { thrown = e; } });
    expect(thrown).toBeInstanceOf(ProError);
    expect(thrown.code).toBe('adult_required');
    expect(ready().client).toBe('needs_terms');
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });
});

describe('refreshing', () => {
  it('drops a late answer that was overtaken by a newer one', async () => {
    mockStatus.mockResolvedValueOnce(status());
    await mount();
    let releaseSlow!: (s: ProStatus) => void;
    mockStatus.mockReturnValueOnce(new Promise<ProStatus>(r => { releaseSlow = r; }));
    mockStatus.mockResolvedValueOnce(status({ proEnabled: false }));
    let slow!: Promise<void>;
    await act(async () => { slow = latest.refresh(); });
    await refresh();
    expect(latest.access.state).toBe('paused');
    await act(async () => { releaseSlow(status()); await slow; });
    expect(latest.access.state).toBe('paused');
  });

  it('does not set state after the screen is gone', async () => {
    let release!: (s: ProStatus) => void;
    mockStatus.mockReturnValue(new Promise<ProStatus>(r => { release = r; }));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const tree = await mount();
    tree.unmount();
    await act(async () => { release(status()); });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('says nothing on the console for a guest or a failure', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    await mount();
    mockStatus.mockRejectedValue({ message: 'Network request failed' });
    await refresh();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });
});

describe('refreshOn', () => {
  it('refreshes on focus by default', async () => {
    mockStatus.mockResolvedValue(status());
    await mount();
    expect(mockFocusCalls).toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it("with 'mount' refreshes once, in a plain effect, and never calls a navigation hook", async () => {
    mockStatus.mockResolvedValue(status());
    await mount('mount');
    expect(mockFocusCalls).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledTimes(1);
    expect(ready().state).toBe('ready');
    await refresh();
    expect(mockStatus).toHaveBeenCalledTimes(2);
  });

  it("with 'lazy' reads nothing until it is asked to, and then reads once", async () => {
    mockStatus.mockResolvedValue(status());
    await act(async () => {
      renderer.create(<LazyProbe />);
    });
    expect(mockStatus).not.toHaveBeenCalled();
    expect(latest.access.state).toBe('loading');
    await refresh();
    expect(mockStatus).toHaveBeenCalledTimes(1);
    expect(ready().state).toBe('ready');
  });

  it("with 'lazy' still answers a read that is asked for, and stops after unmount", async () => {
    let release!: (s: ProStatus) => void;
    mockStatus.mockReturnValue(new Promise<ProStatus>(r => { release = r; }));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<LazyProbe />); });
    let pending!: Promise<void>;
    await act(async () => { pending = latest.refresh(); });
    tree.unmount();
    await act(async () => { release(status()); await pending; });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("with 'mount' stops updating after unmount", async () => {
    let release!: (s: ProStatus) => void;
    mockStatus.mockReturnValue(new Promise<ProStatus>(r => { release = r; }));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const tree = await mount('mount');
    tree.unmount();
    await act(async () => { release(status()); });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('with no navigation container at all', () => {
  // Settings tests mock only `auth` and jest.setup.js has no global navigation mock (7.9): a hook that asks for
  // navigation there throws. Here every call to useFocusEffect is the real one.
  afterEach(() => { mockRealNavigation = false; });

  it("'mount' renders and loads", async () => {
    mockRealNavigation = true;
    mockStatus.mockResolvedValue(status());
    const tree = await mount('mount');
    expect(ready().state).toBe('ready');
    tree.unmount();
  });

  it('the default needs a navigation container, and throws without one', async () => {
    mockRealNavigation = true;
    mockStatus.mockResolvedValue(status());
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(mount()).rejects.toThrow(/navigation/i);
    error.mockRestore();
  });
});
