/**
 * ProAppointmentSheet: ask for a session, or read one and answer it (documentation/design/pro-accounts.md 7.7).
 *
 *   propose  a date and time, a length, virtual or in person, a short place and note, and "Send request". The
 *            attempt's clientRef is made once when the sheet opens and reused by every retry, so a request that
 *            reached the server but whose answer was lost returns the same session instead of a second one. A
 *            failed send keeps everything typed.
 *   view     every field in the viewer's time zone. Confirm and Decline appear only when the server says the
 *            viewer may (`canConfirm`, `canDecline`), Cancel only when `canCancel`. There is no fee, no paid
 *            flag and no link field anywhere, and nothing here is tappable text.
 *
 * The sheet holds no navigation. "Report this request" calls `onReport`; the host closes this sheet and opens
 * ProSafetySheet (sheets are never nested: a second modal opened while the first is closing is unreliable on iOS).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { PRO_DURATION, PRO_LIMITS, PRO_SAFETY_TIPS, PRO_SAFETY_TIPS_TITLE, PRO_TEXT_LIMITS } from '../config/proRules';
import { cancelProSession, proposeProSession, respondProSession } from '../services/proService';
import { proErrorMessage, toProError } from '../services/proErrors';
import { connectionTitle, deviceTimeZone, deviceUtcOffsetMinutes, newClientRef, sessionWhen, utcOffsetLabel } from '../utils/proFormat';
import type { ProAppointment, ProSessionMode } from '../types/pro';
import { KeyboardDoneBar, keyboardDoneProps, singleLineDoneProps } from './KeyboardSafe';
import { KeyboardLift, useKeyboardHeight } from './KeyboardLift';
import ProStatusBadge from './ProStatusBadge';

export type ProAppointmentSheetProps = {
  visible: boolean;
  mode: 'propose' | 'view';
  /** The connection a new request is for (propose mode). */
  connectionId?: string;
  /** The session to read and answer (view mode). */
  appointment?: ProAppointment;
  onClose: () => void;
  /** Something changed on the server (a request was sent, or a session answered or cancelled): the host reloads. */
  onChanged: () => void;
  /** The viewer wants to report the request. The host closes the sheet and opens the report sheet. */
  onReport?: (appointment: ProAppointment) => void;
};

type Busy = 'send' | 'confirm' | 'decline' | 'cancel' | null;

/** The lengths offered; every one is inside PRO_DURATION and a multiple of its step. */
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480] as const;
const DEFAULT_DURATION = 60;
const MODES: { value: ProSessionMode; label: string }[] = [
  { value: 'virtual', label: 'Virtual' },
  { value: 'in_person', label: 'In person' },
];
const MS_MINUTE = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MINUTE;

/** 90 -> "1 h 30 min", 45 -> "45 min". */
export const durationText = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

/** Tomorrow at about this time, on a quarter hour: a start the person can nudge rather than build from nothing. */
const defaultStart = (): Date => {
  const next = new Date(Date.now() + MS_DAY);
  next.setSeconds(0, 0);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15);
  return next;
};

const withDate = (base: Date, day: Date): Date => {
  const next = new Date(base);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  next.setSeconds(0, 0);
  return next;
};

const withTime = (base: Date, time: Date): Date => {
  const next = new Date(base);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return next;
};

const dateText = (d: Date): string => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const timeText = (d: Date): string => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The line under the details in view mode. The one place this sentence is written. */
const paymentLine = (label: string): string =>
  `Payment, if any, is arranged directly between you and ${label}. SmartCloset does not take payments.`;

type ChoiceProps = { label: string; accessibilityLabel?: string; selected: boolean; disabled?: boolean; onPress: () => void };

const Choice: React.FC<ChoiceProps> = ({ label, accessibilityLabel, selected, disabled, onPress }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          borderRadius: theme.radius.full,
        },
      ]}
    >
      <Text variant="caption" weight="600" style={{ color: selected ? theme.colors.accentText : theme.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detail}>
    <Text variant="label" color="muted" style={styles.detailLabel}>{label}</Text>
    <Text variant="body" style={styles.detailValue}>{value}</Text>
  </View>
);

export const ProAppointmentSheet: React.FC<ProAppointmentSheetProps> = ({
  visible,
  mode,
  connectionId,
  appointment,
  onClose,
  onChanged,
  onReport,
}) => {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const [startsAt, setStartsAt] = useState<Date>(defaultStart);
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [heldAs, setHeldAs] = useState<ProSessionMode>('virtual');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  // Android shows one picker at a time as a dialog; iOS draws both inline.
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // The session changed under the viewer (answered elsewhere, ended): the buttons would only fail, so they go.
  const [stale, setStale] = useState(false);

  // One reference per opening, kept by every retry and replaced only after a send succeeded.
  const clientRef = useRef('');
  // A new number each time the sheet opens, closes or is pointed at something else: an answer that arrives under
  // an older number belongs to a sheet that is gone.
  const session = useRef(0);

  useEffect(() => {
    session.current++;
    if (!visible) return;
    clientRef.current = newClientRef();
    setStartsAt(defaultStart());
    setDuration(DEFAULT_DURATION);
    setHeldAs('virtual');
    setPlace('');
    setNote('');
    setPicker(null);
    setBusy(null);
    setError(null);
    setStale(false);
  }, [visible, mode, connectionId, appointment?.id]);

  // A request in flight cannot be taken back, so the sheet stays until it has an answer.
  const close = () => {
    if (!busy) onClose();
  };

  const lead = PRO_LIMITS.appointment_lead_minutes;
  const horizon = PRO_LIMITS.appointment_max_days_ahead;
  const earliest = new Date(Date.now() + lead * MS_MINUTE);
  const latest = new Date(Date.now() + horizon * MS_DAY);

  const onPick = (kind: 'date' | 'time') => (event: { type?: string } | undefined, picked?: Date) => {
    if (Platform.OS === 'android') setPicker(null);
    if (event?.type === 'dismissed' || !picked) return;
    setError(null);
    setStartsAt(prev => (kind === 'date' ? withDate(prev, picked) : withTime(prev, picked)));
  };

  const send = async () => {
    if (busy || !connectionId) return;
    const start = startsAt.getTime();
    const now = Date.now();
    if (start < now + lead * MS_MINUTE || start > now + horizon * MS_DAY) {
      setError(`Choose a start at least ${lead} minutes from now and within ${horizon} days.`);
      return;
    }
    const mine = session.current;
    setBusy('send');
    setError(null);
    try {
      await proposeProSession({
        connectionId,
        startsAt,
        durationMinutes: duration,
        mode: heldAs,
        place: place.trim(),
        note: note.trim(),
        clientRef: clientRef.current,
      });
      if (mine !== session.current) return;
      clientRef.current = newClientRef();
      onChanged();
      onClose();
    } catch (e) {
      if (mine === session.current) setError(proErrorMessage(e, "Couldn't send your request. Please try again."));
    } finally {
      if (mine === session.current) setBusy(null);
    }
  };

  const answer = async (kind: 'confirm' | 'decline' | 'cancel') => {
    if (busy || !appointment) return;
    const mine = session.current;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'cancel') await cancelProSession(appointment.id);
      else await respondProSession(appointment.id, kind);
      if (mine !== session.current) return;
      onChanged();
      onClose();
    } catch (e) {
      if (mine === session.current) {
        setError(proErrorMessage(e, "Couldn't update the session. Please try again."));
        const code = toProError(e).code;
        if (code === 'appointment_closed' || code === 'pro_unavailable' || code === 'connection_ended') {
          setStale(true);
          onChanged();
        }
      }
    } finally {
      if (mine === session.current) setBusy(null);
    }
  };

  const errorText = error ? (
    <Text variant="caption" color="danger" style={styles.gapSmall} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;

  // What is left of the screen once the sheet's fixed parts and the keyboard are taken out.
  const bodyMax = Math.max(120, Math.min(windowHeight * 0.55, windowHeight - keyboardHeight - 300));

  let title = 'Session';
  let body: React.ReactNode = null;

  if (mode === 'propose') {
    title = 'Propose a session';
    const tooSoon = startsAt.getTime() < Date.now() + lead * MS_MINUTE;
    body = (
      <KeyboardLift>
        <ScrollView style={{ maxHeight: bodyMax }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text variant="overline" color="muted">When</Text>
          {Platform.OS === 'ios' ? (
            <View style={styles.pickers}>
              <DateTimePicker
                value={startsAt}
                mode="date"
                display="compact"
                minimumDate={earliest}
                maximumDate={latest}
                onChange={onPick('date')}
              />
              <DateTimePicker value={startsAt} mode="time" display="compact" minuteInterval={5} onChange={onPick('time')} />
            </View>
          ) : (
            <View style={styles.pickers}>
              <Button label={dateText(startsAt)} variant="secondary" size="sm" onPress={() => setPicker('date')} accessibilityLabel="Choose date" />
              <Button label={timeText(startsAt)} variant="secondary" size="sm" onPress={() => setPicker('time')} accessibilityLabel="Choose time" />
              {picker ? (
                <DateTimePicker
                  value={startsAt}
                  mode={picker}
                  display="default"
                  minimumDate={picker === 'date' ? earliest : undefined}
                  maximumDate={picker === 'date' ? latest : undefined}
                  onChange={onPick(picker)}
                />
              ) : null}
            </View>
          )}
          <Text variant="caption" color={tooSoon ? 'danger' : 'muted'} style={styles.gapTiny}>
            {`Times are in your time zone (${deviceTimeZone()}). They see your offset from UTC (${utcOffsetLabel(deviceUtcOffsetMinutes(startsAt))}), not a place. Start at least ${lead} minutes from now.`}
          </Text>

          <Text variant="overline" color="muted" style={styles.gap}>Length</Text>
          <View style={styles.choices}>
            {DURATIONS.filter(m => m >= PRO_DURATION.min && m <= PRO_DURATION.max).map(m => (
              <Choice
                key={m}
                label={durationText(m)}
                accessibilityLabel={`${m} minutes`}
                selected={duration === m}
                disabled={Boolean(busy)}
                onPress={() => setDuration(m)}
              />
            ))}
          </View>

          <Text variant="overline" color="muted" style={styles.gap}>How</Text>
          <View style={styles.choices}>
            {MODES.map(m => (
              <Choice key={m.value} label={m.label} selected={heldAs === m.value} disabled={Boolean(busy)} onPress={() => setHeldAs(m.value)} />
            ))}
          </View>

          <Input
            label="Place"
            placeholder="Where? e.g. a café name, or 'video call'"
            value={place}
            onChangeText={t => {
              setPlace(t);
              setError(null);
            }}
            maxLength={PRO_TEXT_LIMITS.place}
            editable={!busy}
            containerStyle={styles.gap}
            accessibilityLabel="Place"
            {...singleLineDoneProps}
          />
          <Input
            label="Note (optional)"
            value={note}
            onChangeText={t => {
              setNote(t);
              setError(null);
            }}
            multiline
            maxLength={PRO_TEXT_LIMITS.session_note}
            editable={!busy}
            containerStyle={styles.gap}
            inputStyle={styles.note}
            helper={`${note.length}/${PRO_TEXT_LIMITS.session_note}`}
            accessibilityLabel="Session note"
            {...keyboardDoneProps}
          />
        </ScrollView>
        {errorText}
        <View style={styles.buttons}>
          <Button label="Close" variant="secondary" onPress={close} disabled={Boolean(busy)} style={styles.flex} />
          <Button
            label="Send request"
            onPress={send}
            loading={busy === 'send'}
            disabled={!connectionId || tooSoon}
            style={styles.flex}
          />
        </View>
        <KeyboardDoneBar />
      </KeyboardLift>
    );
  } else if (appointment) {
    const mineRequest = appointment.proposedBy === appointment.myRole;
    const who = connectionTitle(appointment);
    const canAnswer = !stale;
    body = (
      <View>
        <ScrollView style={{ maxHeight: bodyMax }} showsVerticalScrollIndicator={false}>
          <View style={styles.statusRow}>
            <ProStatusBadge kind="session" status={appointment.status} mine={mineRequest} />
          </View>
          <Detail label="With" value={who} />
          <Detail label="When" value={sessionWhen(appointment)} />
          <Detail label="Length" value={durationText(appointment.durationMinutes)} />
          <Detail label="How" value={appointment.mode === 'in_person' ? 'In person' : 'Virtual'} />
          {appointment.place ? <Detail label="Where" value={appointment.place} /> : null}
          {appointment.note ? <Detail label="Note" value={appointment.note} /> : null}

          {appointment.mode === 'in_person' ? (
            <View style={[styles.tips, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
              <View style={styles.tipsHeader}>
                <Icon name="shield-checkmark-outline" size={18} color={theme.colors.textMuted} />
                <Text variant="body" weight="600" style={styles.tipsTitle}>{PRO_SAFETY_TIPS_TITLE}</Text>
              </View>
              {PRO_SAFETY_TIPS.map(tip => (
                <View key={tip} style={styles.tip}>
                  <Text variant="bodySmall" style={styles.bullet}>•</Text>
                  <Text variant="bodySmall" color="muted" style={styles.flex}>{tip}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text variant="caption" color="muted" style={styles.gap}>{paymentLine(who)}</Text>
        </ScrollView>
        {errorText}
        <View style={styles.buttons}>
          {canAnswer && appointment.canConfirm ? (
            <Button label="Confirm" onPress={() => answer('confirm')} loading={busy === 'confirm'} disabled={Boolean(busy)} style={styles.flex} />
          ) : null}
          {canAnswer && appointment.canDecline ? (
            <Button
              label="Decline"
              variant="secondary"
              onPress={() => answer('decline')}
              loading={busy === 'decline'}
              disabled={Boolean(busy)}
              style={styles.flex}
            />
          ) : null}
          {canAnswer && appointment.canCancel ? (
            <Button
              label="Cancel session"
              variant="secondary"
              onPress={() => answer('cancel')}
              loading={busy === 'cancel'}
              disabled={Boolean(busy)}
              style={styles.flex}
            />
          ) : null}
        </View>
        {onReport ? (
          <Pressable
            onPress={() => onReport(appointment)}
            disabled={Boolean(busy)}
            accessibilityRole="button"
            accessibilityLabel="Report this request"
            style={[styles.reportRow, { borderTopColor: theme.colors.border }]}
          >
            <Icon name="flag-outline" size={18} color={theme.colors.textMuted} />
            <Text variant="body" color="muted" style={styles.reportText}>Report this request</Text>
          </Pressable>
        ) : null}
        <Button label="Close" variant="ghost" onPress={close} disabled={Boolean(busy)} fullWidth style={styles.gapSmall} />
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {body}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  pickers: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
  note: { minHeight: 64 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  flex: { flex: 1 },
  gap: { marginTop: 14 },
  gapSmall: { marginTop: 8 },
  gapTiny: { marginTop: 6 },
  statusRow: { marginBottom: 8 },
  detail: { flexDirection: 'row', paddingVertical: 4 },
  detailLabel: { width: 64 },
  detailValue: { flex: 1 },
  tips: { marginTop: 12, paddingBottom: 6 },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  tipsTitle: { marginLeft: 8 },
  tip: { flexDirection: 'row', paddingHorizontal: 14, marginBottom: 4 },
  bullet: { width: 14 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reportText: { marginLeft: 8 },
});

export default ProAppointmentSheet;
