import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const mockSettings = jest.fn();
const mockAccept = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));

import { useSwapAccess } from '../../src/hooks/useSwapAccess';
import { SwapError } from '../../src/services/swapErrors';
import { SWAP_TERMS_VERSION } from '../../src/config/swapRules';

const settings = (over: object = {}) => ({
  swapsEnabled: true, termsAccepted: true, termsCurrent: true, currentTermsVersion: SWAP_TERMS_VERSION, communityAvailable: false,
  communityJoined: false, alias: null, adultConfirmed: false, suspended: false, needsYou: 0, ...over,
});

let latest: ReturnType<typeof useSwapAccess>;
const Probe = () => { latest = useSwapAccess(); return null; };
const mount = async () => { await act(async () => { renderer.create(<Probe />); }); };

beforeEach(() => { mockSettings.mockReset(); mockAccept.mockReset(); });

describe('useSwapAccess', () => {
  it('is ready for a member who accepted the terms', async () => {
    mockSettings.mockResolvedValue(settings());
    await mount();
    expect(latest.access.state).toBe('ready');
  });

  it.each([
    ['a guest', new SwapError('not_authenticated'), 'guest'],
    ['the server switch', new SwapError('swaps_disabled'), 'paused'],
    ['a server without swaps', { message: 'x', code: 'PGRST202' }, 'not_deployed'],
    ['being offline', { message: 'Network request failed' }, 'error'],
  ])('maps %s', async (_n, failure, state) => {
    mockSettings.mockRejectedValue(failure);
    await mount();
    expect(latest.access.state).toBe(state);
  });

  it('knows when swaps are paused, the account is suspended, or the terms are new', async () => {
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    await mount();
    expect(latest.access.state).toBe('paused');
    mockSettings.mockResolvedValue(settings({ suspended: true }));
    await act(async () => { await latest.refresh(); });
    expect(latest.access.state).toBe('suspended');
    mockSettings.mockResolvedValue(settings({ termsCurrent: false }));
    await act(async () => { await latest.refresh(); });
    expect(latest.access.state).toBe('needs_terms');
  });

  it('records agreement to the version in this build, then becomes ready', async () => {
    mockSettings.mockResolvedValueOnce(settings({ termsAccepted: false, termsCurrent: false }));
    await mount();
    expect(latest.access.state).toBe('needs_terms');
    mockAccept.mockResolvedValue(undefined);
    mockSettings.mockResolvedValue(settings());
    await act(async () => { await latest.acceptTerms(); });
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept.mock.calls[0]).toEqual([]);      // no version is passed: the service sends the one in this build
    expect(latest.access.state).toBe('ready');
  });

  describe('when the server and this build disagree about the terms version', () => {
    it('a newer server version means "update the app", and no agreement is recorded', async () => {
      mockSettings.mockResolvedValue(settings({ termsAccepted: false, termsCurrent: false, currentTermsVersion: '2026-11' }));
      await mount();
      expect(latest.access).toMatchObject({ state: 'update_required', appIsOlder: true });
      await act(async () => { await latest.acceptTerms(); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('so does a member who already agreed to the newer text on another phone', async () => {
      mockSettings.mockResolvedValue(settings({ termsAccepted: true, termsCurrent: true, currentTermsVersion: '2026-11' }));
      await mount();
      expect(latest.access.state).toBe('update_required');
      await act(async () => { await latest.acceptTerms(); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('an older server version (this build is ahead of the database) is its own case, and records nothing', async () => {
      mockSettings.mockResolvedValue(settings({ termsAccepted: false, termsCurrent: false, currentTermsVersion: '2026-09' }));
      await mount();
      expect(latest.access).toMatchObject({ state: 'update_required', appIsOlder: false });
      await act(async () => { await latest.acceptTerms(); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('paused and suspended still win, so those members see their own message', async () => {
      mockSettings.mockResolvedValue(settings({ swapsEnabled: false, currentTermsVersion: '2026-11' }));
      await mount();
      expect(latest.access.state).toBe('paused');
      mockSettings.mockResolvedValue(settings({ suspended: true, currentTermsVersion: '2026-11' }));
      await act(async () => { await latest.refresh(); });
      expect(latest.access.state).toBe('suspended');
    });
  });
});
