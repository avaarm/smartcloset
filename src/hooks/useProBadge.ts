import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getProBadge } from '../services/proService';

/**
 * How many things are waiting for the signed-in person (the Home "Stylists" cell): unread messages, sessions
 * proposed to them and, as a client, looks not yet viewed. Refreshes each time the screen is focused. Never throws
 * and never logs: a failure, a guest, or a build whose server has no pro functions yet is simply 0, so Home and its
 * tests keep working with only auth mocked.
 */
export const useProBadge = (enabled: boolean): number => {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!enabled) {
        setCount(0);
        return undefined;
      }
      getProBadge()
        .then(n => { if (alive) setCount(n); })
        .catch(() => {});
      return () => { alive = false; };
    }, [enabled]),
  );
  return count;
};
