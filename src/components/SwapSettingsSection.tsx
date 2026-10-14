/**
 * SwapSettingsSection — the "Community swaps" switch that lives at the end of Settings' Community section.
 *
 * Mounted inside Settings, so it takes no props and uses no navigation hook, and it keeps Settings
 * quiet: it renders nothing until the server has answered, and nothing at all for a guest, a server
 * without swaps, a paused or suspended account, or while the community tier is off. A failed read is
 * swallowed (the Settings tests mock only auth, so the read fails there on purpose).
 *
 * The row is shown only when this build carries the same terms version as the server: joining records
 * agreement to the text in the build, so a member who could not be shown the current text must not
 * be offered the switch. It is also offered only once the member has accepted the current terms on the
 * swap board: the join step can only read them, so joining without that would fail after the form was
 * filled in. A member who is already in keeps the switch so they can still leave, whatever their terms
 * state (leaving has no terms gate). Turning it on opens SwapJoinCommunitySheet; turning it off asks
 * first. Nothing is stored on the device: the state lives on the server.
 *
 * It uses Settings' own palette (not the theme tokens) so it sits in the list like its neighbours.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { SWAP_TERMS_VERSION } from '../config/swapRules';
import { getSwapSettings, leaveSwapCommunity } from '../services/swapService';
import { swapErrorMessage } from '../services/swapErrors';
import type { SwapSettings } from '../types/swap';
import SwapJoinCommunitySheet from './SwapJoinCommunitySheet';

const GOLD = '#C4975A';
const INK = '#100E0B';
const IVORY = '#FDFAF5';
const BORDER = '#EDE5D8';
const TEXT_MUTED = '#6B5F52';
const DANGER = '#C0392B';

const LEAVE_TEXT = 'Your pieces go back to friends only and swaps with people who are not friends end.';

export const SwapSettingsSection: React.FC = () => {
  const [settings, setSettings] = useState<SwapSettings | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  // A failed read leaves things as they are: nothing shown the first time, the last known state later.
  const refresh = useCallback(async () => {
    try {
      const next = await getSwapSettings();
      if (alive.current && next && typeof next === 'object') setSettings(next);
    } catch {
      // A guest, a server without swaps, or being offline: the section is simply not there.
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  const available =
    settings !== null &&
    settings.swapsEnabled &&
    !settings.suspended &&
    settings.communityAvailable &&
    settings.currentTermsVersion === SWAP_TERMS_VERSION &&
    (settings.termsCurrent || settings.communityJoined);
  if (!settings || !available) return null;

  const joined = settings.communityJoined;

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      await leaveSwapCommunity();
      if (alive.current) setSettings(s => (s ? { ...s, communityJoined: false, alias: null } : s));
      await refresh();
    } catch (e) {
      if (alive.current) setError(swapErrorMessage(e, 'Couldn’t leave community swaps. Please try again.'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const onToggle = (next: boolean) => {
    if (busy) return;
    setError(null);
    if (next) {
      if (!joined) setJoinOpen(true);
      return;
    }
    if (!joined) return;
    Alert.alert('Leave community swaps?', LEAVE_TEXT, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  };

  const onJoined = () => {
    setJoinOpen(false);
    setSettings(s => (s ? { ...s, communityJoined: true } : s));
    refresh();
  };

  return (
    <View>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={styles.toggleLabel}>Community swaps</Text>
          <Text style={styles.toggleDesc}>
            {joined
              ? `Joined${settings.alias ? ` as ${settings.alias}` : ''}. People who aren’t your friends see only your alias.`
              : 'Swap with people who aren’t your friends. They see an alias you choose, never your name.'}
          </Text>
        </View>
        <Switch
          value={joined}
          onValueChange={onToggle}
          disabled={busy}
          trackColor={{ false: BORDER, true: GOLD }}
          thumbColor={IVORY}
          accessibilityLabel="Community swaps"
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <SwapJoinCommunitySheet visible={joinOpen} onJoined={onJoined} onClose={() => setJoinOpen(false)} />
    </View>
  );
};

// Same metrics as the toggle rows in SettingsScreen.
const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: INK,
    marginBottom: 3,
  },
  toggleDesc: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },
  error: {
    fontSize: 12,
    color: DANGER,
    marginBottom: 8,
  },
});

export default SwapSettingsSection;
