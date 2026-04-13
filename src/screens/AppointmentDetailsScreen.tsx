/**
 * AppointmentDetailsScreen — view a single appointment's details.
 */

import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';
import { Text, Badge, Card } from '../ui';

type Props = {
  navigation: any;
  route: {
    params: {
      appointment: any;
    };
  };
};

const getStatusTone = (status: string) => {
  switch (status) {
    case 'scheduled': return 'info' as const;
    case 'confirmed': return 'success' as const;
    case 'completed': return 'success' as const;
    case 'cancelled': return 'danger' as const;
    case 'no-show': return 'warning' as const;
    default: return 'neutral' as const;
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'consultation': return 'chatbubble-outline';
    case 'shopping': return 'cart-outline';
    case 'wardrobe-audit': return 'shirt-outline';
    case 'styling-session': return 'color-palette-outline';
    case 'virtual': return 'videocam-outline';
    case 'follow-up': return 'refresh-outline';
    default: return 'calendar-outline';
  }
};

const AppointmentDetailsScreen = ({ navigation, route }: Props) => {
  const { theme } = useTheme();
  const appt = route.params.appointment;

  const formattedDate = (() => {
    try {
      return new Date(appt.date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return appt.date || 'Unknown date';
    }
  })();

  const formatTime = (time: string) => {
    if (!time) return '';
    // If already has AM/PM, return as-is
    if (/[ap]m/i.test(time)) return time;
    // Convert 24h to 12h
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Appointment</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Type + Status */}
        <View style={styles.badges}>
          <Badge
            label={(appt.type || 'appointment').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            tone="accent"
            leftIcon={<Icon name={getTypeIcon(appt.type)} size={14} color={theme.colors.accentText} />}
          />
          <Badge
            label={(appt.status || 'scheduled').charAt(0).toUpperCase() + (appt.status || 'scheduled').slice(1)}
            tone={getStatusTone(appt.status)}
          />
        </View>

        {/* Client */}
        <Card style={{ marginBottom: 16 }}>
          <View style={styles.row}>
            <Icon name="person-outline" size={20} color={theme.colors.textSubtle} />
            <Text variant="body" style={{ marginLeft: 10, flex: 1 }}>
              {appt.clientName || 'Unknown Client'}
            </Text>
          </View>
        </Card>

        {/* Date & Time */}
        <Text variant="overline" color="muted" style={styles.sectionLabel}>Date & Time</Text>
        <Card style={{ marginBottom: 16 }}>
          <View style={styles.row}>
            <Icon name="calendar-outline" size={20} color={theme.colors.textSubtle} />
            <Text variant="body" style={{ marginLeft: 10 }}>{formattedDate}</Text>
          </View>
          {(appt.startTime || appt.endTime) && (
            <View style={[styles.row, { marginTop: 10 }]}>
              <Icon name="time-outline" size={20} color={theme.colors.textSubtle} />
              <Text variant="body" style={{ marginLeft: 10 }}>
                {formatTime(appt.startTime)}{appt.endTime ? ` – ${formatTime(appt.endTime)}` : ''}
              </Text>
            </View>
          )}
          {appt.duration && (
            <View style={[styles.row, { marginTop: 10 }]}>
              <Icon name="hourglass-outline" size={20} color={theme.colors.textSubtle} />
              <Text variant="body" color="muted" style={{ marginLeft: 10 }}>
                {appt.duration} minutes
              </Text>
            </View>
          )}
        </Card>

        {/* Location / Meeting Link */}
        {(appt.location || appt.meetingLink) && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>Location</Text>
            <Card style={{ marginBottom: 16 }}>
              {appt.isVirtual && (
                <View style={styles.row}>
                  <Icon name="videocam-outline" size={20} color={theme.colors.textSubtle} />
                  <Text variant="body" style={{ marginLeft: 10 }}>Virtual meeting</Text>
                </View>
              )}
              {appt.location && !appt.isVirtual && (
                <View style={styles.row}>
                  <Icon name="location-outline" size={20} color={theme.colors.textSubtle} />
                  <Text variant="body" style={{ marginLeft: 10, flex: 1 }}>{appt.location}</Text>
                </View>
              )}
              {appt.meetingLink && (
                <Pressable
                  onPress={() => Linking.openURL(appt.meetingLink).catch(() => {})}
                  style={[styles.row, { marginTop: 10 }]}
                >
                  <Icon name="link-outline" size={20} color={theme.colors.accent} />
                  <Text variant="body" style={{ marginLeft: 10, color: theme.colors.accent }}>
                    Join meeting
                  </Text>
                </Pressable>
              )}
            </Card>
          </>
        )}

        {/* Fee */}
        {appt.fee != null && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>Fee</Text>
            <Card style={{ marginBottom: 16 }}>
              <View style={styles.row}>
                <Icon name="cash-outline" size={20} color={theme.colors.textSubtle} />
                <Text variant="body" style={{ marginLeft: 10 }}>
                  ${typeof appt.fee === 'number' ? appt.fee.toFixed(0) : appt.fee}
                </Text>
                {appt.paid != null && (
                  <Badge
                    label={appt.paid ? 'Paid' : 'Unpaid'}
                    tone={appt.paid ? 'success' : 'warning'}
                    style={{ marginLeft: 12 }}
                  />
                )}
              </View>
            </Card>
          </>
        )}

        {/* Notes */}
        {appt.notes && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>Notes</Text>
            <Card style={{ marginBottom: 16 }}>
              <Text variant="body">{appt.notes}</Text>
            </Card>
          </>
        )}

        {/* Prep Notes */}
        {appt.prepNotes && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>Prep Notes</Text>
            <Card style={{ marginBottom: 16 }}>
              <Text variant="body">{appt.prepNotes}</Text>
            </Card>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  content: {
    padding: 20,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default AppointmentDetailsScreen;
