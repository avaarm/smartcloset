/**
 * UserSafetySheet — the "..." menu for another person (a friend request or a
 * friend's closet): report them, block them, or remove the friendship.
 *
 * Everything happens inside one sheet that changes its content. Opening a
 * second modal while the first is still closing is unreliable on iOS, so
 * report -> reason -> details -> thanks (and block confirm) are steps of this
 * sheet rather than separate modals.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  ReportContext,
  ReportReason,
} from '../config/communityGuidelines';
import { blockUser, reportUser } from '../services/friendService';
import { KeyboardDoneBar, keyboardDoneProps } from './KeyboardSafe';
import { KeyboardLift } from './KeyboardLift';

type Step = 'menu' | 'reason' | 'details' | 'reported' | 'block' | 'remove';

export type UserSafetySheetProps = {
  visible: boolean;
  userId: string;
  userName: string;
  /** Where the person was seen; stored with a report. */
  context: ReportContext;
  onClose: () => void;
  /** Called after a successful block so the screen can refresh or leave. */
  onBlocked: () => void;
  /** When given, the menu also offers "Remove friend"; the sheet closes once it resolves. */
  onRemoveFriend?: () => Promise<void>;
};

export const UserSafetySheet: React.FC<UserSafetySheetProps> = ({
  visible,
  userId,
  userName,
  context,
  onClose,
  onBlocked,
  onRemoveFriend,
}) => {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped each time the sheet opens, so a request that finishes after the sheet
  // was dismissed and reopened can't change the new session's state.
  const session = useRef(0);

  // Always start from the menu, with nothing left over from the last person.
  useEffect(() => {
    if (visible) {
      session.current++;
      setStep('menu');
      setReason(null);
      setDetails('');
      setBusy(false);
      setError(null);
    }
  }, [visible, userId]);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const submitReport = async () => {
    if (!reason) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await reportUser(userId, context, reason, details);
      if (mine === session.current) setStep('reported');
    } catch (e: any) {
      if (mine === session.current) setError(e?.message || 'Couldn’t send your report. Please try again.');
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!onRemoveFriend) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await onRemoveFriend();
      if (mine === session.current) onClose();
    } catch (e: any) {
      if (mine === session.current) setError(e?.message || 'Couldn’t remove this friend. Please try again.');
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const confirmBlock = async () => {
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await blockUser(userId);
      // The block happened whatever the sheet is doing now, so always tell the screen.
      onBlocked();
    } catch (e: any) {
      if (mine === session.current) setError(e?.message || 'Couldn’t block this person. Please try again.');
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const errorText = error ? (
    <Text variant="caption" color="danger" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;

  const menuRow = (icon: string, label: string, onPress: () => void, danger = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={20} color={danger ? theme.colors.danger : theme.colors.text} />
      <Text variant="body" color={danger ? 'danger' : 'primary'} style={{ marginLeft: 12 }}>
        {label}
      </Text>
    </Pressable>
  );

  let title = userName;
  let body: React.ReactNode = null;

  if (step === 'menu') {
    body = (
      <View>
        {onRemoveFriend ? menuRow('person-remove-outline', 'Remove friend', () => goTo('remove')) : null}
        {menuRow('flag-outline', 'Report', () => goTo('reason'))}
        {menuRow('ban-outline', 'Block', () => goTo('block'), true)}
        <Button label="Cancel" variant="secondary" onPress={onClose} fullWidth style={{ marginTop: 16 }} />
      </View>
    );
  } else if (step === 'reason') {
    title = `Report ${userName}`;
    body = (
      <View>
        <Text variant="body" color="muted" style={{ marginBottom: 8 }}>
          What’s the problem?
        </Text>
        {REPORT_REASONS.map(r => (
          <Pressable
            key={r.value}
            onPress={() => {
              setReason(r.value);
              goTo('details');
            }}
            style={[styles.row, { borderBottomColor: theme.colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={r.label}
          >
            <Text variant="body" style={{ flex: 1 }}>{r.label}</Text>
            <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
          </Pressable>
        ))}
        <Button label="Back" variant="ghost" onPress={() => goTo('menu')} fullWidth style={{ marginTop: 12 }} />
      </View>
    );
  } else if (step === 'details') {
    title = `Report ${userName}`;
    const reasonLabel = REPORT_REASONS.find(r => r.value === reason)?.label;
    body = (
      // KeyboardLift, not KeyboardAvoidingView: that one measures against its parent, which in
      // a sheet only as tall as its content is never near the keyboard, so it did nothing.
      <KeyboardLift>
        <Text variant="label" color="muted" style={{ marginBottom: 8 }}>
          {reasonLabel}
        </Text>
        <Input
          placeholder="Add details (optional)"
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={MAX_REPORT_DETAILS}
          inputStyle={styles.details}
          helper={`${details.length}/${MAX_REPORT_DETAILS}`}
          accessibilityLabel="Report details"
          {...keyboardDoneProps}
        />
        {errorText}
        <View style={[styles.buttons, { marginTop: 16 }]}>
          <Button label="Back" variant="secondary" onPress={() => goTo('reason')} disabled={busy} style={{ flex: 1 }} />
          <Button label="Submit report" onPress={submitReport} loading={busy} style={{ flex: 1 }} />
        </View>
        <KeyboardDoneBar />
      </KeyboardLift>
    );
  } else if (step === 'reported') {
    title = 'Thanks for letting us know';
    body = (
      <View>
        <Text variant="body" color="muted">
          We review reports and take action on anything that breaks our community guidelines. {userName} won’t be told
          it was you.
        </Text>
        <Button
          label={`Block ${userName}`}
          variant="secondary"
          onPress={() => goTo('block')}
          fullWidth
          style={{ marginTop: 20 }}
        />
        <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
      </View>
    );
  } else if (step === 'remove') {
    title = `Remove ${userName}?`;
    body = (
      <View>
        <Text variant="body" color="muted">
          You’ll both lose access to each other’s closets. You can send a new request later.
        </Text>
        {errorText}
        <View style={[styles.buttons, { marginTop: 20 }]}>
          <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label="Remove" variant="destructive" onPress={confirmRemove} loading={busy} style={{ flex: 1 }} />
        </View>
      </View>
    );
  } else {
    title = `Block ${userName}?`;
    body = (
      <View>
        <Text variant="body" color="muted">
          They won’t be able to find you, send you requests or see your closet, and you’ll lose access to theirs. Any
          friend request or friendship between you ends. They won’t be told. You can unblock them any time from Blocked
          users.
        </Text>
        {errorText}
        <View style={[styles.buttons, { marginTop: 20 }]}>
          <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label="Block" variant="destructive" onPress={confirmBlock} loading={busy} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {body}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  details: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});

export default UserSafetySheet;
