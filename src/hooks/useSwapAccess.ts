import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { acceptSwapTerms, getSwapSettings } from '../services/swapService';
import { SwapError, swapErrorMessage, toSwapError } from '../services/swapErrors';
import { SWAP_TERMS_VERSION } from '../config/swapRules';
import type { SwapSettings } from '../types/swap';

/**
 * Whether the signed-in member can use swaps right now, and why not. Every swap screen starts here
 * so the empty, paused and sign-in states are the same everywhere.
 *
 *   loading        first load
 *   guest          not signed in
 *   paused         the server switch is off ("Swaps are paused")
 *   not_deployed   this server has no swap functions yet ("Swaps aren't available yet")
 *   suspended      the account is suspended
 *   update_required the server's terms version is not the one this build carries (newer: the member
 *                  cannot be shown the text they would agree to; older: the server is behind this
 *                  build). Show SWAP_UPDATE_REQUIRED_MESSAGE or SWAP_SERVER_BEHIND_MESSAGE and call
 *                  nothing that records consent.
 *   needs_terms    swap terms not accepted at the current version: show SwapTermsSheet (version
 *                  SWAP_TERMS_VERSION, which equals the server's here)
 *   ready          go ahead
 *   error          anything else (offline): show LoadError with refresh()
 */
export type SwapAccess =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'paused' }
  | { state: 'not_deployed' }
  | { state: 'suspended'; settings: SwapSettings }
  | { state: 'update_required'; settings: SwapSettings; appIsOlder: boolean }
  | { state: 'needs_terms'; settings: SwapSettings }
  | { state: 'ready'; settings: SwapSettings }
  | { state: 'error'; message: string };

export const useSwapAccess = () => {
  const [access, setAccess] = useState<SwapAccess>({ state: 'loading' });
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const settings = await getSwapSettings();
      if (!alive.current) return;
      if (!settings.swapsEnabled) setAccess({ state: 'paused' });
      else if (settings.suspended) setAccess({ state: 'suspended', settings });
      else if (settings.currentTermsVersion !== SWAP_TERMS_VERSION) {
        setAccess({ state: 'update_required', settings, appIsOlder: SWAP_TERMS_VERSION < settings.currentTermsVersion });
      } else if (!settings.termsCurrent) setAccess({ state: 'needs_terms', settings });
      else setAccess({ state: 'ready', settings });
    } catch (e) {
      if (!alive.current) return;
      const err = toSwapError(e);
      if (err.code === 'not_authenticated') setAccess({ state: 'guest' });
      else if (err.code === 'swaps_disabled') setAccess({ state: 'paused' });
      else if (err.code === 'not_deployed') setAccess({ state: 'not_deployed' });
      else setAccess({ state: 'error', message: swapErrorMessage(err, 'Couldn’t load swaps. Please try again.') });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      refresh();
      return () => { alive.current = false; };
    }, [refresh]),
  );

  /**
   * Records the member's agreement to the terms they were shown, then reloads. The service sends this
   * build's SWAP_TERMS_VERSION, never the server's value: the member agrees to the text on their screen. It
   * only runs in the needs_terms state, which is reached only when the two versions are equal; in
   * update_required nothing is sent.
   */
  const acceptTerms = useCallback(async () => {
    if (access.state !== 'needs_terms') return;
    try {
      await acceptSwapTerms();
    } catch (e) {
      throw e instanceof SwapError ? e : toSwapError(e);
    }
    await refresh();
  }, [access, refresh]);

  return { access, refresh, acceptTerms };
};
