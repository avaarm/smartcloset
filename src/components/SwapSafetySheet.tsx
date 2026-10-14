/**
 * SwapSafetySheet — the "..." menu for a swap listing, a swap, or one message in a swap:
 * report it, or block the member behind it.
 *
 * It follows UserSafetySheet (which is not touched) but works from a reference, never from a
 * member's id: the server resolves who the other member is, so the screen only ever knows the
 * label it already shows (a friend's name or an alias).
 *
 * Every step lives in this one sheet. Opening a second modal while the first is still closing
 * is unreliable on iOS, so report -> reason -> details -> thanks (and block) are steps, not modals.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { SWAP_REPORT_REASONS } from '../config/swapRules';
import { blockSwapMember, reportSwapContent } from '../services/swapService';
import { swapErrorMessage } from '../services/swapErrors';
import type { SwapReportReason, SwapReportRefType } from '../types/swap';
import { KeyboardDoneBar, keyboardDoneProps } from './KeyboardSafe';
import { KeyboardLift } from './KeyboardLift';

type Step = 'menu' | 'reason' | 'details' | 'reported' | 'block';

/** The most the report details can hold; the service and the database cut at the same length. */
const MAX_DETAILS = 500;

export type SwapSafetySheetProps = {
  visible: boolean;
  /** What is being reported or blocked from: a listing, or a swap (and then possibly one of its messages). */
  refType: SwapReportRefType;
  refId: string;
  /** How the other member is shown on screen (a friend's name or an alias). */
  label: string;
  /** A message inside a swap, when the report is about that message. */
  messageId?: number;
  onClose: () => void;
  /** Called after a successful block so the screen can refresh or leave. */
  onBlocked: () => void;
};

export const SwapSafetySheet: React.FC<SwapSafetySheetProps> = ({
  visible,
  refType,
  refId,
  label,
  messageId,
  onClose,
  onBlocked,
}) => {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<SwapReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new number each time the sheet opens, closes, or is pointed at something else. A request that
  // finishes under an older number changes nothing and tells the screen nothing: the sheet it was
  // made in is gone.
  const session = useRef(0);

  useEffect(() => {
    session.current++;
    if (visible) {
      setStep('menu');
      setReason(null);
      setDetails('');
      setBusy(false);
      setError(null);
    }
  }, [visible, refType, refId, messageId]);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const submitReport = async () => {
    if (!reason || busy) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await reportSwapContent({ refType, refId, reason, details, messageId });
      if (mine === session.current) setStep('reported');
    } catch (e) {
      if (mine === session.current) setError(swapErrorMessage(e, 'Couldn’t send your report. Please try again.'));
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const confirmBlock = async () => {
    if (busy) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await blockSwapMember(refType, refId);
      if (mine === session.current) onBlocked();
    } catch (e) {
      if (mine === session.current) setError(swapErrorMessage(e, 'Couldn’t block this person. Please try again.'));
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const errorText = error ? (
    <Text variant="caption" color="danger" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;

  const menuRow = (icon: string, text: string, onPress: () => void, danger = false) => (
    <Pressable
      key={text}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={text}
    >
      <Icon name={icon} size={20} color={danger ? theme.colors.danger : theme.colors.text} />
      <Text variant="body" color={danger ? 'danger' : 'primary'} style={{ marginLeft: 12 }}>
        {text}
      </Text>
    </Pressable>
  );

  let title = label;
  let body: React.ReactNode = null;

  if (step === 'menu') {
    body = (
      <View>
        {menuRow('flag-outline', 'Report', () => goTo('reason'))}
        {menuRow('ban-outline', 'Block', () => goTo('block'), true)}
        <Button label="Cancel" variant="secondary" onPress={onClose} fullWidth style={{ marginTop: 16 }} />
      </View>
    );
  } else if (step === 'reason') {
    title = `Report ${label}`;
    body = (
      <View>
        <Text variant="body" color="muted" style={{ marginBottom: 8 }}>
          What’s the problem?
        </Text>
        {SWAP_REPORT_REASONS.map(r => (
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
    title = `Report ${label}`;
    const reasonLabel = SWAP_REPORT_REASONS.find(r => r.value === reason)?.label;
    body = (
      // KeyboardLift, not KeyboardAvoidingView: that one measures against its parent, which in a
      // sheet only as tall as its content is never near the keyboard, so it did nothing.
      <KeyboardLift>
        <Text variant="label" color="muted" style={{ marginBottom: 8 }}>
          {reasonLabel}
        </Text>
        <Input
          placeholder="Add details (optional)"
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={MAX_DETAILS}
          inputStyle={styles.details}
          helper={`${details.length}/${MAX_DETAILS}`}
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
    title = 'Report sent';
    body = (
      <View>
        <Text variant="body" color="muted">
          Thanks for letting us know. We review reports, aiming for within 24 hours. They won’t be told it was you.
        </Text>
        <Button
          label={`Block ${label}`}
          variant="secondary"
          onPress={() => goTo('block')}
          fullWidth
          style={{ marginTop: 20 }}
        />
        <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
      </View>
    );
  } else {
    title = `Block ${label}?`;
    body = (
      <View>
        <Text variant="body" color="muted">
          They won’t be able to see your pieces or message you, and any open swaps with them end. They won’t be told.
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

export default SwapSafetySheet;
