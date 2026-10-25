/**
 * ProSafetySheet — the "Report or block" menu for a stylist, a client, a message, a look or a session:
 * report it, or block the person behind it.
 *
 * It works from a reference, never from a person's id: the server resolves who the other person is, so the screen
 * only ever knows the label it already shows (an alias, a stylist's name, "Former client"). A report needs a
 * connection, a look, a session or an invite; a block needs a connection or an invite (an invite block is for a
 * stylist a client previewed and does not want, before ever connecting), so Block is offered only when one of
 * those two ids is given.
 *
 * Every step lives in this one sheet. Opening a second modal while the first is still closing is unreliable on
 * iOS, so menu -> reason -> details -> thanks (and block) are steps, not modals. Reporting and blocking need only
 * a sign-in on the server, so they work under every pause, suspension and terms state.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import {
  PRO_BLOCK_EXPLANATION,
  PRO_REPORT_REASONS,
  PRO_REPORT_THANKS,
  PRO_SHARING_STOPPED_NOTE,
  PRO_TEXT_LIMITS,
} from '../config/proRules';
import { blockProMember, getProConnection, reportProContent } from '../services/proService';
import { proErrorMessage } from '../services/proErrors';
import type { ProReportReason, ProReportRefType } from '../types/pro';
import { KeyboardDoneBar, keyboardDoneProps } from './KeyboardSafe';
import { KeyboardLift } from './KeyboardLift';

type Step = 'menu' | 'reason' | 'details' | 'reported' | 'block';

/** A client who reports one of these has their own sharing with that stylist stopped by the server (4.6, group 9). */
const SERIOUS_REASONS: readonly ProReportReason[] = ['harassment', 'data_misuse', 'unsafe_meeting', 'underage'];

export type ProSafetySheetProps = {
  visible: boolean;
  /** What is being reported: a connection (the other person, or one of their messages), a look, a session or an invite. */
  refType: ProReportRefType;
  refId: string;
  /** How the other person is shown on screen (an alias, a stylist's name). */
  label: string;
  /** A message inside a connection, when the report is about that message. */
  messageId?: number;
  /** The connection to block from, and to learn the viewer's role from. */
  connectionId?: string;
  /** The invite of a previewed stylist, when there is no connection yet. */
  inviteId?: string;
  onClose: () => void;
  /** Called after a successful block so the screen can refresh or leave. */
  onBlocked: () => void;
};

export const ProSafetySheet: React.FC<ProSafetySheetProps> = ({
  visible,
  refType,
  refId,
  label,
  messageId,
  connectionId,
  inviteId,
  onClose,
  onBlocked,
}) => {
  const { theme } = useTheme();
  const canBlock = Boolean(connectionId || inviteId);
  const firstStep: Step = canBlock ? 'menu' : 'reason';
  const [step, setStep] = useState<Step>(firstStep);
  const [reason, setReason] = useState<ProReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharingStopped, setSharingStopped] = useState(false);
  // A new number each time the sheet opens, closes, or is pointed at something else. A request that finishes
  // under an older number changes nothing and tells the screen nothing: the sheet it was made in is gone.
  const session = useRef(0);

  useEffect(() => {
    session.current++;
    if (visible) {
      setStep(firstStep);
      setReason(null);
      setDetails('');
      setBusy(false);
      setError(null);
      setSharingStopped(false);
    }
  }, [visible, refType, refId, messageId, connectionId, inviteId, firstStep]);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const back = (to: Step) => (to === 'menu' && !canBlock ? onClose() : goTo(to));

  // The server stops a client's own sharing when they make a serious report. It does not say so, and the sheet does
  // not know the viewer's role, so it asks the connection once the report is in. Any failure just leaves the line out.
  const learnIfSharingStopped = async (mine: number) => {
    const id = connectionId ?? (refType === 'connection' ? refId : undefined);
    if (!id) return;
    try {
      const connection = await getProConnection(id);
      if (mine === session.current && connection.myRole === 'client') setSharingStopped(true);
    } catch {
      // Not knowing is fine; the report itself was sent.
    }
  };

  const submitReport = async () => {
    if (!reason || busy) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await reportProContent({ refType, refId, reason, details, messageId });
      if (mine === session.current) {
        setStep('reported');
        if (SERIOUS_REASONS.includes(reason)) learnIfSharingStopped(mine);
      }
    } catch (e) {
      if (mine === session.current) setError(proErrorMessage(e, "Couldn't send your report. Please try again."));
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
      await blockProMember(connectionId ? { connectionId } : { inviteId });
      if (mine === session.current) onBlocked();
    } catch (e) {
      if (mine === session.current) setError(proErrorMessage(e, "Couldn't block this person. Please try again."));
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
          What's the problem?
        </Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {PRO_REPORT_REASONS.map(r => (
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
        </ScrollView>
        <Button label="Back" variant="ghost" onPress={() => back('menu')} fullWidth style={{ marginTop: 12 }} />
      </View>
    );
  } else if (step === 'details') {
    title = `Report ${label}`;
    const reasonLabel = PRO_REPORT_REASONS.find(r => r.value === reason)?.label;
    body = (
      // KeyboardLift, not KeyboardAvoidingView: that one measures against its parent, which in a sheet only as
      // tall as its content is never near the keyboard, so it did nothing.
      <KeyboardLift>
        <Text variant="label" color="muted" style={{ marginBottom: 8 }}>
          {reasonLabel}
        </Text>
        <Input
          placeholder="Add details (optional)"
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={PRO_TEXT_LIMITS.report_details}
          inputStyle={styles.details}
          helper={`${details.length}/${PRO_TEXT_LIMITS.report_details}`}
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
          {PRO_REPORT_THANKS}
        </Text>
        {sharingStopped ? (
          <Text variant="body" color="muted" style={{ marginTop: 10 }}>
            {PRO_SHARING_STOPPED_NOTE}
          </Text>
        ) : null}
        {canBlock ? (
          <Button
            label={`Block ${label}`}
            variant="secondary"
            onPress={() => goTo('block')}
            fullWidth
            style={{ marginTop: 20 }}
          />
        ) : null}
        <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
      </View>
    );
  } else {
    title = `Block ${label}?`;
    body = (
      <View>
        <Text variant="body" color="muted">
          {PRO_BLOCK_EXPLANATION}
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

export default ProSafetySheet;
