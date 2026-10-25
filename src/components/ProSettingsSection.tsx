/**
 * ProSettingsSection — "Professional" in Settings: becoming a stylist, connecting with one, the Stylist workspace,
 * and the lists and rules that go with them.
 *
 * Mounted inside Settings, so it takes no props and uses no navigation hook; it opens sheets and switches the
 * account mode, and goes nowhere. It keeps Settings quiet: nothing is shown until the server has answered, and
 * nothing at all for a guest, a server without the professional functions, a paused feature, or a failed read (the
 * Settings tests mock only auth, so the read fails there on purpose). It reads the person's access with
 * useProAccess in 'mount' mode and never logs a failure.
 *
 * What is offered follows the server's word about the person (useProAccess), not anything kept on the device:
 *   - no stylist profile: Become a stylist, Connect with a stylist;
 *   - a stylist in the personal app: Open the Stylist workspace, Edit stylist profile, Connect with a stylist;
 *   - a stylist in the workspace: Back to my closet, Edit stylist profile;
 *   - always: Blocked stylists and clients, Professional guidelines; and, for a stylist, Stop being a stylist.
 * A suspended account is offered only what needs no consent (the blocked list, the guidelines, closing the profile),
 * and a build that cannot show the server's current terms offers nothing that would record agreement.
 *
 * Sheets are never nested: one is open at a time, and each is mounted the first time it is opened, so Settings does
 * not read the person's access once per sheet on every visit. A report about a code (from the redeem sheet) closes
 * that sheet and, after a short pause on iOS, opens the safety sheet.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PRO_INDEPENDENT_LINE, PRO_SUSPENDED_MESSAGE } from '../config/proRules';
import { useAccountMode } from '../context/AccountModeContext';
import { proUpdateMessage, useProAccess } from '../hooks/useProAccess';
import { closeStylistProfile } from '../services/proService';
import { proErrorMessage } from '../services/proErrors';
import ProBlockedSheet from './ProBlockedSheet';
import ProGuidelinesSheet from './ProGuidelinesSheet';
import ProRedeemSheet from './ProRedeemSheet';
import ProSafetySheet from './ProSafetySheet';
import ProStylistProfileSheet from './ProStylistProfileSheet';

const GOLD = '#C4975A';
const GOLD_SUBTLE = 'rgba(196,151,90,0.10)';
const INK = '#100E0B';
const IVORY = '#FDFAF5';
const WARM_MUTED = '#F7F3EC';
const BORDER = '#EDE5D8';
const TEXT_MUTED = '#6B5F52';
const TEXT_SUBTLE = '#A8987E';
const DANGER = '#C0392B';

/** How long one modal is given to leave on iOS before the next is shown. */
const HANDOFF_MS = 400;

const STOP_TITLE = 'Stop being a stylist?';
const STOP_TEXT = 'Your clients will be disconnected and your profile and invite codes deleted.';
const CONNECTED_NOTE = "You're connected. Open Stylists on Home to choose what to share.";

type SheetName = 'redeem' | 'profile' | 'blocked' | 'guidelines' | 'safety';

/** What the account mode gives; a mocked context may return only the first two, and the role is then read again on its own. */
type RoleMode = {
  currentMode: string;
  switchMode: (mode: 'user' | 'stylist') => Promise<void> | void;
  refreshRole?: () => Promise<unknown> | void;
};

type RowProps = {
  icon: string;
  title: string;
  desc: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
};

const SectionRow: React.FC<RowProps> = ({ icon, title, desc, onPress, danger, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[styles.row, disabled && styles.rowDisabled]}
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={desc}
    accessibilityState={{ disabled: Boolean(disabled) }}
  >
    <View style={styles.rowIcon}>
      <Icon name={icon} size={18} color={danger ? DANGER : GOLD} />
    </View>
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, danger && { color: DANGER }]}>{title}</Text>
      <Text style={styles.rowDesc}>{desc}</Text>
    </View>
    <Icon name="chevron-forward" size={16} color={TEXT_SUBTLE} />
  </Pressable>
);

export const ProSettingsSection: React.FC = () => {
  const { access, refresh } = useProAccess({ refreshOn: 'mount' });
  const { currentMode, switchMode, refreshRole } = useAccountMode() as RoleMode;

  const [open, setOpen] = useState<SheetName | null>(null);
  const [seen, setSeen] = useState<Partial<Record<SheetName, true>>>({});
  const [safety, setSafety] = useState<{ inviteId: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedNote, setConnectedNote] = useState<string | null>(null);
  const alive = useRef(true);
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (handoff.current !== null) clearTimeout(handoff.current);
    };
  }, []);

  const show = (name: SheetName | null) => {
    if (handoff.current !== null) {
      clearTimeout(handoff.current);
      handoff.current = null;
    }
    if (name) setSeen(cur => (cur[name] ? cur : { ...cur, [name]: true }));
    setOpen(name);
  };

  const openSheet = (name: SheetName) => {
    setError(null);
    setConnectedNote(null);
    show(name);
  };

  const reportInvite = (inviteId: string, label: string) => {
    setSafety({ inviteId, label });
    if (Platform.OS !== 'ios') {
      show('safety');
      return;
    }
    show(null);
    handoff.current = setTimeout(() => {
      handoff.current = null;
      show('safety');
    }, HANDOFF_MS);
  };

  const changeMode = async (mode: 'user' | 'stylist') => {
    setError(null);
    try {
      // The server's word on the role first, so the workspace opens at once for a profile saved a moment ago.
      if (mode === 'stylist') await refreshRole?.();
      await switchMode(mode);
    } catch {
      // The preference could not be saved; the tabs stay as they are and the row can be pressed again.
    }
  };

  const closeProfile = async () => {
    setBusy(true);
    setError(null);
    try {
      await closeStylistProfile();
      if (currentMode === 'stylist') await changeMode('user');
      try {
        await refreshRole?.();
      } catch {
        // Read again when the app returns to the foreground.
      }
    } catch (e) {
      if (alive.current) setError(proErrorMessage(e, "Couldn't close your stylist profile. Please try again."));
    } finally {
      if (alive.current) setBusy(false);
      refresh();
    }
  };

  const confirmStop = () => {
    if (busy) return;
    Alert.alert(STOP_TITLE, STOP_TEXT, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop being a stylist', style: 'destructive', onPress: closeProfile },
    ]);
  };

  // Nothing until the server has said who this is; nothing for a guest, a paused feature, or a failed read.
  const status = access.state === 'ready' || access.state === 'suspended' ? access.status : null;
  if (!status) return null;

  const suspended = access.state === 'suspended';
  const stylistAccess = access.state === 'ready' ? access.stylist : null;
  const clientAccess = access.state === 'ready' ? access.client : null;
  const hasProfile = status.stylist !== null;
  const inWorkspace = currentMode === 'stylist';

  let notice: string | null = null;
  if (suspended) notice = PRO_SUSPENDED_MESSAGE;
  else if (access.state === 'ready' && (stylistAccess === 'update_required' || clientAccess === 'update_required')) {
    notice = proUpdateMessage(access.status, clientAccess === 'update_required' ? 'client' : 'stylist');
  }

  const rows: RowProps[] = [];
  if (!suspended) {
    if (hasProfile) {
      if (stylistAccess === 'available') {
        rows.push(
          inWorkspace
            ? { icon: 'home-outline', title: 'Back to my closet', desc: 'Leave the workspace. Your stylist profile stays.', onPress: () => changeMode('user') }
            : { icon: 'briefcase-outline', title: 'Open the Stylist workspace', desc: 'Your clients, schedule and messages.', onPress: () => changeMode('stylist') },
        );
      }
      if (stylistAccess !== 'update_required') {
        rows.push({ icon: 'create-outline', title: 'Edit stylist profile', desc: 'What a client sees before they connect with you.', onPress: () => openSheet('profile') });
      }
    } else if (stylistAccess !== 'update_required') {
      rows.push({ icon: 'color-wand-outline', title: 'Become a stylist', desc: 'Set up a short profile and invite your clients.', onPress: () => openSheet('profile') });
    }
    if (!inWorkspace && clientAccess !== 'update_required') {
      rows.push({ icon: 'key-outline', title: 'Connect with a stylist', desc: 'Enter the code your stylist gave you.', onPress: () => openSheet('redeem') });
    }
  }
  rows.push({ icon: 'ban-outline', title: 'Blocked stylists and clients', desc: "People you've blocked. You can unblock them here.", onPress: () => openSheet('blocked') });
  rows.push({ icon: 'shield-checkmark-outline', title: 'Professional guidelines', desc: 'How stylists and clients work together safely.', onPress: () => openSheet('guidelines') });
  if (hasProfile) {
    rows.push({ icon: 'close-circle-outline', title: 'Stop being a stylist', desc: 'Disconnect your clients and delete your profile.', onPress: confirmStop, danger: true });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Professional</Text>
      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>
      ) : null}
      {connectedNote ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">{connectedNote}</Text>
      ) : null}
      {rows.map(row => (
        <SectionRow key={row.title} {...row} disabled={busy} />
      ))}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
      ) : null}
      <Text style={styles.fine}>{PRO_INDEPENDENT_LINE}</Text>

      {seen.redeem ? (
        <ProRedeemSheet
          visible={open === 'redeem'}
          opensConnection={false}
          onClose={() => show(null)}
          onConnected={() => {
            // Settings goes nowhere, so the sheet offers only Done and the connection's own page is reached from Home.
            show(null);
            setConnectedNote(CONNECTED_NOTE);
            refresh();
          }}
          onReport={reportInvite}
        />
      ) : null}
      {seen.profile ? (
        <ProStylistProfileSheet
          visible={open === 'profile'}
          onClose={() => show(null)}
          onSaved={() => {
            show(null);
            refresh();
          }}
        />
      ) : null}
      {seen.blocked ? <ProBlockedSheet visible={open === 'blocked'} onClose={() => show(null)} /> : null}
      {seen.guidelines ? <ProGuidelinesSheet visible={open === 'guidelines'} onClose={() => show(null)} /> : null}
      {seen.safety && safety ? (
        <ProSafetySheet
          visible={open === 'safety'}
          refType="invite"
          refId={safety.inviteId}
          inviteId={safety.inviteId}
          label={safety.label}
          onClose={() => show(null)}
          onBlocked={() => {}}
        />
      ) : null}
    </View>
  );
};

// Same palette and metrics as the mode cards this replaces in SettingsScreen.
const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: TEXT_SUBTLE,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  notice: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    padding: 14,
    marginBottom: 8,
    backgroundColor: IVORY,
    gap: 12,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WARM_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: INK,
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },
  error: {
    fontSize: 12,
    color: DANGER,
    marginBottom: 8,
  },
  fine: {
    fontSize: 11,
    color: TEXT_SUBTLE,
    lineHeight: 15,
    marginTop: 2,
    marginBottom: 8,
    backgroundColor: GOLD_SUBTLE,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 2,
  },
});

export default ProSettingsSection;
