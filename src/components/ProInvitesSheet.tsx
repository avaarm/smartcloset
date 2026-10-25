/**
 * ProInvitesSheet — a stylist's invite codes: make one, send it, and withdraw one that is still live.
 *
 * A code is how a client connects, and it works once. The stylist gives it to the client by any channel they
 * like; the system share sheet carries a plain sentence and the code, never a link. The optional label is the
 * stylist's own reminder of who the code was for: only they ever see it. A code's creation is idempotent on a
 * reference made for each attempt, so a tap that is retried after a dropped connection returns the same code;
 * the reference is replaced once a code has been made, so the next tap makes another.
 *
 * The sheet has no navigation. Why a code cannot be made (too many live codes, invites paused, account too
 * new, terms out of date) is said in plain words from proErrorMessage; the screen under the sheet reads the
 * person's access again when the sheet closes.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Badge, BadgeTone, Button, Input, Sheet, Skeleton, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from './LoadError';
import { singleLineDoneProps } from './KeyboardSafe';
import { KeyboardLift, useKeyboardHeight } from './KeyboardLift';
import { PRO_LIMITS, PRO_TEXT_LIMITS } from '../config/proRules';
import { createProInvite, listMyProInvites, revokeProInvite } from '../services/proService';
import { proErrorMessage } from '../services/proErrors';
import { groupCode, newClientRef } from '../utils/proFormat';
import type { ProInvite } from '../types/pro';

export type ProInvitesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** "Oct 24", or '' for a date that cannot be read. */
const shortDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

/** The words that go with a code when it is sent. */
export const inviteShareMessage = (code: string): string =>
  `Join me on SmartCloset. In the app, open Home > Stylists and enter this code: ${groupCode(code)}. ` +
  `It works once and expires in ${PRO_LIMITS.invite_expiry_days} days.`;

const STATUS_TONE: Record<ProInvite['status'], BadgeTone> = {
  live: 'success',
  used: 'accent',
  expired: 'neutral',
  revoked: 'neutral',
};

const statusText = (invite: ProInvite): string => {
  switch (invite.status) {
    case 'live': return 'Live';
    case 'used': return invite.connected ? 'Connected' : 'Used';
    case 'expired': return 'Expired';
    case 'revoked': return 'Revoked';
    default: return '';
  }
};

const detailText = (invite: ProInvite): string => {
  switch (invite.status) {
    case 'live': return `Expires ${shortDate(invite.expiresAt)}`.trim();
    case 'used': return invite.usedAt ? `Used ${shortDate(invite.usedAt)}` : 'Used';
    case 'expired': return `Expired ${shortDate(invite.expiresAt)}`.trim();
    default: return '';
  }
};

export const ProInvitesSheet: React.FC<ProInvitesSheetProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const [invites, setInvites] = useState<ProInvite[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new number each time the sheet opens or closes; an answer under an older number is dropped.
  const session = useRef(0);
  const clientRef = useRef(newClientRef());
  const creatingNow = useRef(false);

  const load = useCallback(async (silent = false) => {
    const mine = session.current;
    if (!silent) {
      setInvites(null);
      setLoadFailed(false);
    }
    try {
      const list = await listMyProInvites();
      if (mine !== session.current) return;
      setInvites(list);
      setLoadFailed(false);
    } catch {
      if (mine !== session.current) return;
      // A quiet re-read that fails leaves the list as it is.
      if (!silent) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    session.current++;
    creatingNow.current = false;
    if (!visible) return;
    clientRef.current = newClientRef();
    setLabel('');
    setError(null);
    setCreating(false);
    load();
  }, [visible, load]);

  const create = async () => {
    if (creatingNow.current) return;
    const mine = session.current;
    creatingNow.current = true;
    setCreating(true);
    setError(null);
    try {
      const invite = await createProInvite({ label: label.trim() || undefined, clientRef: clientRef.current });
      if (mine !== session.current) return;
      clientRef.current = newClientRef();
      setLabel('');
      setInvites(cur => [invite, ...(cur ?? []).filter(i => i.id !== invite.id)]);
    } catch (e) {
      if (mine === session.current) setError(proErrorMessage(e, 'Couldn’t make a code. Please try again.'));
    } finally {
      if (mine === session.current) {
        creatingNow.current = false;
        setCreating(false);
      }
    }
  };

  const share = async (invite: ProInvite) => {
    try {
      await Share.share({ message: inviteShareMessage(invite.code) });
    } catch {
      // The share sheet was dismissed or is not available; nothing to report.
    }
  };

  const revoke = (invite: ProInvite) => {
    Alert.alert(
      'Revoke this code?',
      'Anyone you gave it to won’t be able to use it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            const mine = session.current;
            setError(null);
            try {
              await revokeProInvite(invite.id);
              if (mine === session.current) load(true);
            } catch (e) {
              if (mine === session.current) setError(proErrorMessage(e, 'Couldn’t revoke the code. Please try again.'));
            }
          },
        },
      ],
    );
  };

  const live = (invites ?? []).filter(i => i.status === 'live');
  const recent = (invites ?? []).filter(i => i.status !== 'live');

  const row = (invite: ProInvite) => (
    <View key={invite.id} style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.rowTop}>
        <Text variant="h4" style={styles.code} accessibilityLabel={`Code ${groupCode(invite.code)}`}>
          {groupCode(invite.code)}
        </Text>
        <Badge label={statusText(invite)} tone={STATUS_TONE[invite.status]} />
      </View>
      {invite.label ? <Text variant="bodySmall" color="muted" numberOfLines={1}>{invite.label}</Text> : null}
      {detailText(invite) ? <Text variant="caption" color="subtle" style={styles.detail}>{detailText(invite)}</Text> : null}
      {invite.status === 'live' ? (
        <View style={styles.rowActions}>
          <Button
            label="Share"
            variant="secondary"
            size="sm"
            onPress={() => share(invite)}
            accessibilityLabel="Share"
          />
          <Button
            label="Revoke"
            variant="ghost"
            size="sm"
            onPress={() => revoke(invite)}
            accessibilityLabel="Revoke"
          />
        </View>
      ) : null}
    </View>
  );

  let list: React.ReactNode;
  if (invites === null) {
    list = loadFailed ? (
      <LoadError what="invite codes" onRetry={() => load()} />
    ) : (
      <View accessibilityLabel="Loading invite codes">
        {[0, 1].map(i => <Skeleton key={i} height={64} style={styles.skeleton} />)}
      </View>
    );
  } else if (invites.length === 0) {
    list = (
      <Text variant="body" color="muted" align="center" style={styles.empty}>
        No codes yet. Create one and give it to your client.
      </Text>
    );
  } else {
    list = (
      <View>
        {live.length > 0 ? (
          <View style={styles.group}>
            <Text variant="overline" color="muted" style={styles.groupTitle}>Live codes</Text>
            {live.map(row)}
          </View>
        ) : null}
        {recent.length > 0 ? (
          <View style={styles.group}>
            <Text variant="overline" color="muted" style={styles.groupTitle}>Recent</Text>
            {recent.map(row)}
          </View>
        ) : null}
      </View>
    );
  }

  // The sheet is lifted by the keyboard's height, so the list gets what is left above it.
  const bodyMax = Math.max(200, Math.min(520, height - keyboard - 220));

  return (
    <Sheet visible={visible} onClose={onClose} title="Invite codes">
      <KeyboardLift>
        <ScrollView style={{ maxHeight: bodyMax }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text variant="bodySmall" color="muted">
            A code works once and expires in {PRO_LIMITS.invite_expiry_days} days. Give it to your client in a text
            message or in person; they enter it under Home, then Stylists.
          </Text>
          <Input
            label="Label (only you see this)"
            placeholder="Who is it for?"
            value={label}
            onChangeText={setLabel}
            maxLength={PRO_TEXT_LIMITS.label}
            autoCorrect={false}
            {...singleLineDoneProps}
            containerStyle={styles.field}
            accessibilityLabel="Label for the invite code"
          />
          <Button
            label="Create invite code"
            onPress={create}
            loading={creating}
            fullWidth
            accessibilityLabel="Create invite code"
          />
          {error ? (
            <Text variant="caption" color="danger" style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
          ) : null}
          <View style={styles.list}>{list}</View>
          <Button label="Close" variant="secondary" onPress={onClose} fullWidth style={styles.close} />
        </ScrollView>
      </KeyboardLift>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  field: { marginTop: 14, marginBottom: 12 },
  error: { marginTop: 10 },
  list: { marginTop: 18 },
  group: { marginBottom: 12 },
  groupTitle: { marginBottom: 8 },
  row: { padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  code: { letterSpacing: 1.5 },
  detail: { marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  skeleton: { marginBottom: 8 },
  empty: { paddingVertical: 20 },
  close: { marginTop: 8 },
});

export default ProInvitesSheet;
