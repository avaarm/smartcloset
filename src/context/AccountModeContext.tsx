import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getCurrentMode, setCurrentMode as persistMode } from '../services/accountService';
import { getProStatus } from '../services/proService';
import { accessFromStatus } from '../hooks/useProAccess';
import { PRO_MODES_ENABLED } from '../config/features';
import type { AccountMode, ProStatus } from '../types/pro';

interface AccountModeContextType {
  /** The tab set to show: 'stylist' only while the saved preference is 'stylist' and the server confirms the role. */
  currentMode: AccountMode;
  /** Saves the device preference. It rejects if the preference cannot be stored, and then nothing changes. */
  switchMode: (mode: AccountMode) => Promise<void>;
  /** The server's last word on whether this account may use the Stylist workspace. False until it has answered. */
  stylistAllowed: boolean;
  /** Reads the role again (after saving or closing a stylist profile). Resolves to the new answer; never rejects. */
  refreshRole: () => Promise<boolean>;
}

const AccountModeContext = createContext<AccountModeContextType>({
  currentMode: 'user',
  switchMode: async () => {},
  stylistAllowed: false,
  refreshRole: async () => false,
});

// A mocked context may supply only { currentMode, switchMode }; consumers read the other two as
// `refreshRole?.()` and `stylistAllowed ?? false`.
export const useAccountMode = () => useContext(AccountModeContext);

/**
 * Whether the server says this account holds an active stylist role: the feature is on, the account is not
 * suspended, the profile exists, and the stylist terms and the 18+ confirmation are current for this build. The same
 * test gives the Settings rows that open and leave the workspace, so a stylist who is shown the workspace can always
 * be shown the way back.
 */
export const isStylistRoleActive = (status: ProStatus): boolean => {
  if (status.stylistRemoved || status.stylist === null) return false;
  const access = accessFromStatus(status);
  return access.state === 'ready' && access.stylist === 'available';
};

export const AccountModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedMode, setSavedMode] = useState<AccountMode>('user');
  const [stylistAllowed, setStylistAllowed] = useState(false);
  const alive = useRef(true);
  const latest = useRef(0);

  const refreshRole = useCallback(async (): Promise<boolean> => {
    const mine = ++latest.current;
    let allowed = false;
    if (PRO_MODES_ENABLED) {
      try {
        allowed = isStylistRoleActive(await getProStatus());
      } catch {
        // A guest, no connection, or a server without the professional functions: not a stylist as far as this
        // device can tell. Nothing is logged; the next foreground reads again.
      }
    }
    if (alive.current && mine === latest.current) setStylistAllowed(allowed);
    return allowed;
  }, []);

  useEffect(() => {
    alive.current = true;
    getCurrentMode()
      .then(mode => {
        if (alive.current) setSavedMode(mode);
      })
      .catch(() => {});
    if (!PRO_MODES_ENABLED) {
      return () => {
        alive.current = false;
      };
    }
    refreshRole();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshRole();
    });
    return () => {
      alive.current = false;
      sub.remove();
    };
  }, [refreshRole]);

  const switchMode = useCallback(async (mode: AccountMode) => {
    await persistMode(mode);
    setSavedMode(mode === 'stylist' ? 'stylist' : 'user');
  }, []);

  const currentMode: AccountMode = stylistAllowed && savedMode === 'stylist' ? 'stylist' : 'user';
  const value = useMemo(
    () => ({ currentMode, switchMode, stylistAllowed, refreshRole }),
    [currentMode, switchMode, stylistAllowed, refreshRole],
  );

  return <AccountModeContext.Provider value={value}>{children}</AccountModeContext.Provider>;
};
