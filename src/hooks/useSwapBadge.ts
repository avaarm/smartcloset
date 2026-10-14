import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getSwapBadge } from '../services/swapService';

/**
 * How many swaps are waiting for the signed-in member (the Home "Swap" cell). Refreshes each time
 * the screen is focused. Never throws and never logs: a failure, a guest, or a build whose server
 * has no swaps yet is simply 0, so Home and its tests keep working with only auth mocked.
 */
export const useSwapBadge = (enabled: boolean): number => {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!enabled) {
        setCount(0);
        return undefined;
      }
      getSwapBadge()
        .then(n => { if (alive) setCount(n); })
        .catch(() => {});
      return () => { alive = false; };
    }, [enabled]),
  );
  return count;
};
