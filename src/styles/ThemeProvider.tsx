/**
 * ThemeProvider — supplies the resolved theme (light or dark) to the app.
 *
 * Usage:
 *   In App.tsx: wrap the root with <ThemeProvider>...</ThemeProvider>
 *   In screens: `const { theme, colorScheme, setColorScheme } = useTheme();`
 *
 * The provider auto-follows the device color scheme, but a user can pin
 * light/dark via Settings. Preference is persisted to AsyncStorage.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTheme, Theme } from './tokens';

const STORAGE_KEY = '@smartcloset_color_scheme_preference';

type ColorScheme = 'light' | 'dark';
type Preference = ColorScheme | 'system';

type ThemeContextValue = {
  theme: Theme;
  colorScheme: ColorScheme;
  preference: Preference;
  /** Pin light/dark, or follow device with 'system'. Persisted. */
  setPreference: (pref: Preference) => void;
};

const resolveScheme = (pref: Preference, deviceScheme: ColorSchemeName): ColorScheme => {
  if (pref === 'light' || pref === 'dark') return pref;
  return deviceScheme === 'dark' ? 'dark' : 'light';
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<Preference>('system');
  const [deviceScheme, setDeviceScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => {
        if (val === 'light' || val === 'dark' || val === 'system') {
          setPreferenceState(val);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for device color-scheme changes (e.g. iOS auto dark-mode schedule)
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setPreference = useCallback((pref: Preference) => {
    setPreferenceState(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  }, []);

  const colorScheme = resolveScheme(preference, deviceScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: buildTheme(colorScheme),
      colorScheme,
      preference,
      setPreference,
    }),
    [colorScheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/** Get the current theme + controls. Safe fallback outside a provider. */
export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Fallback — lets screens use the hook even if provider isn't mounted yet.
  // Prevents crashes during splash / auth flow.
  return {
    theme: buildTheme('light'),
    colorScheme: 'light',
    preference: 'system',
    setPreference: () => {},
  };
};
