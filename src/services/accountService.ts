import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountMode } from '../types/pro';
import { PRO_MODES_ENABLED } from '../config/features';

// The one thing the device keeps about professional accounts: which tab set the person last used.
// Roles themselves are server facts (get_pro_status); AccountModeContext honours 'stylist' only
// while the server confirms an active stylist role.
const CURRENT_MODE_KEY = '@smartcloset_current_mode';

// ==================== Mode Management ====================

export const getCurrentMode = async (): Promise<AccountMode> => {
  try {
    const mode = await AsyncStorage.getItem(CURRENT_MODE_KEY);
    if (!PRO_MODES_ENABLED && mode && mode !== 'user') {
      // Saved by an earlier build, or by this one before the feature was switched off. Nothing in
      // Settings can switch it back, so put the device back or it could never leave.
      await setCurrentMode('user');
      return 'user';
    }
    // Only the two modes exist; anything else, a stored 'client' from an older build included, is personal.
    return mode === 'stylist' ? 'stylist' : 'user';
  } catch (error) {
    console.error('Error getting current mode:', error);
    return 'user';
  }
};

export const setCurrentMode = async (mode: AccountMode): Promise<void> => {
  try {
    await AsyncStorage.setItem(CURRENT_MODE_KEY, mode === 'stylist' ? 'stylist' : 'user');
  } catch (error) {
    console.error('Error setting current mode:', error);
    throw error;
  }
};

// ==================== Mode Onboarding ====================

/**
 * Tracks (per device, per Supabase user id) whether the new-signup "how will
 * you use Smart Closet?" prompt has been shown, so it only appears once per
 * account per device rather than on every app launch.
 */
const modeOnboardingKey = (userId: string) => `@smartcloset_mode_onboarded_${userId}`;

export const hasCompletedModeOnboarding = async (userId: string): Promise<boolean> => {
  // With the pro modes off there is nothing to choose between, so never prompt.
  if (!PRO_MODES_ENABLED) return true;
  try {
    const value = await AsyncStorage.getItem(modeOnboardingKey(userId));
    return value === 'true';
  } catch (error) {
    console.error('Error checking mode onboarding status:', error);
    return true; // fail open: never block sign-in on a storage read error
  }
};

export const markModeOnboardingComplete = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(modeOnboardingKey(userId), 'true');
  } catch (error) {
    console.error('Error marking mode onboarding complete:', error);
  }
};
