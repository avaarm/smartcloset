/**
 * useLoadable — load data for a screen and keep it on screen across reloads.
 *
 * A failed reload never wipes what was already loaded: it only sets `failed`.
 * `blocked` (failed with nothing to show yet) is the one state where a screen
 * should replace its content with an error; otherwise show a banner over the
 * stale data. `loading` is true only until the first load settles, so focus
 * refreshes happen in the background instead of tearing the screen down.
 *
 * Overlapping reloads are safe: only the most recent one may write state, so a
 * slow earlier response can't overwrite a newer one. `A` is an optional
 * argument passed through to the loader (e.g. "force a fresh result").
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type LoadState<T> = { data: T; hasLoaded: boolean; failed: boolean };

export const useLoadable = <T, A = void>(load: (arg: A) => Promise<T>, initial: T) => {
  const [state, setState] = useState<LoadState<T>>({
    data: initial,
    hasLoaded: false,
    failed: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const latest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Resolves true if the loader succeeded, false if it threw. */
  const reload = useCallback(async (arg: A): Promise<boolean> => {
    const id = ++latest.current;
    // Retrying after a failed first load goes back to the loading state.
    setState(s => (s.hasLoaded || !s.failed ? s : { ...s, failed: false }));
    try {
      const data = await loadRef.current(arg);
      if (mounted.current && id === latest.current) {
        setState({ data, hasLoaded: true, failed: false });
      }
      return true;
    } catch (error) {
      console.error('[useLoadable] load failed:', error);
      if (mounted.current && id === latest.current) {
        setState(s => ({ ...s, failed: true }));
      }
      return false;
    }
  }, []);

  /** reload() with the pull-to-refresh spinner. */
  const refresh = useCallback(
    async (arg: A) => {
      setRefreshing(true);
      await reload(arg);
      if (mounted.current) setRefreshing(false);
    },
    [reload],
  );

  /** Edit the loaded data in place (e.g. drop a deleted row without refetching). */
  const update = useCallback((fn: (prev: T) => T) => {
    // A reload already running was requested before this edit, so its result
    // would put back what was just removed: let it finish but not write.
    latest.current++;
    setState(s => ({ ...s, data: fn(s.data) }));
  }, []);

  return {
    data: state.data,
    hasLoaded: state.hasLoaded,
    failed: state.failed,
    loading: !state.hasLoaded && !state.failed,
    blocked: !state.hasLoaded && state.failed,
    refreshing,
    reload,
    refresh,
    update,
  };
};
