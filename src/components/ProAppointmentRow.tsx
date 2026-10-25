/**
 * ProAppointmentRow: one session in a list (documentation/design/pro-accounts.md 7.7). When it starts, in the
 * viewer's own time zone; who it is with; how it is held; and where it stands. The status sits under the text and not
 * beside it: "Waiting for your answer" is wide, and on a 375pt screen it would leave the time and the name about 95pt.
 * The row holds no navigation: the host passes `onPress` (usually to open ProAppointmentSheet).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { connectionTitle, sessionWhen, statusLabel } from '../utils/proFormat';
import type { ProAppointment } from '../types/pro';
import ProStatusBadge from './ProStatusBadge';

export type ProAppointmentRowProps = {
  appointment: ProAppointment;
  onPress: () => void;
};

const MODE_TEXT: Record<ProAppointment['mode'], string> = { virtual: 'Virtual', in_person: 'In person' };
const MODE_ICON: Record<ProAppointment['mode'], string> = { virtual: 'videocam-outline', in_person: 'location-outline' };

export const ProAppointmentRow: React.FC<ProAppointmentRowProps> = ({ appointment, onPress }) => {
  const { theme } = useTheme();
  const mine = appointment.proposedBy === appointment.myRole;
  const when = sessionWhen(appointment);
  const who = connectionTitle(appointment);
  const mode = MODE_TEXT[appointment.mode] ?? '';
  const status = statusLabel('session', appointment.status, mine);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[who, when, mode, status].filter(Boolean).join(', ')}
      style={[
        styles.row,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.full }]}>
        <Icon name={MODE_ICON[appointment.mode] ?? 'calendar-outline'} size={20} color={theme.colors.textMuted} />
      </View>
      <View style={styles.body}>
        <Text variant="body" weight="600" numberOfLines={2}>{when}</Text>
        <Text variant="caption" color="muted" numberOfLines={1}>{`${who} · ${mode}`}</Text>
        <View style={styles.status}>
          <ProStatusBadge kind="session" status={appointment.status} mine={mine} />
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  status: { alignSelf: 'flex-start', marginTop: 6 },
});

export default ProAppointmentRow;
