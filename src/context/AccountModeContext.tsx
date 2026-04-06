import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentMode, setCurrentMode as persistMode } from '../services/accountService';
import { AccountType } from '../types/stylist';

interface AccountModeContextType {
  currentMode: AccountType;
  switchMode: (mode: AccountType) => Promise<void>;
}

const AccountModeContext = createContext<AccountModeContextType>({
  currentMode: 'user',
  switchMode: async () => {},
});

export const useAccountMode = () => useContext(AccountModeContext);

export const AccountModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentMode, setCurrentModeState] = useState<AccountType>('user');

  useEffect(() => {
    getCurrentMode().then(setCurrentModeState);
  }, []);

  const switchMode = async (mode: AccountType) => {
    await persistMode(mode);
    setCurrentModeState(mode);
  };

  return (
    <AccountModeContext.Provider value={{ currentMode, switchMode }}>
      {children}
    </AccountModeContext.Provider>
  );
};
