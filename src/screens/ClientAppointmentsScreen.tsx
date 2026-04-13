import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { theme } from '../styles/theme';
import { getCurrentClientAccount } from '../services/marketplaceService';
import { getAppointmentsByClient } from '../services/stylistService';
import { Appointment } from '../types/stylist';

const ClientAppointmentsScreen = ({ navigation }: any) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAppointments();
  }, []);

  useEffect(() => {
    filterAppointments();
  }, [activeTab, appointments]);

  const loadAppointments = async () => {
    try {
      const clientAccount = await getCurrentClientAccount();
      if (clientAccount) {
        const apts = await getAppointmentsByClient(clientAccount.id);
        setAppointments(apts);
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
      Alert.alert('Error', 'Failed to load appointments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterAppointments = () => {
    const now = new Date();
    if (activeTab === 'upcoming') {
      const upcoming = appointments.filter(
        (apt) =>
          new Date(`${apt.date} ${apt.startTime}`) >= now &&
          (apt.status === 'scheduled' || apt.status === 'confirmed')
      );
      setFilteredAppointments(upcoming.sort((a, b) => 
        new Date(`${a.date} ${a.startTime}`).getTime() - new Date(`${b.date} ${b.startTime}`).getTime()
      ));
    } else {
      const past = appointments.filter(
        (apt) =>
          new Date(`${apt.date} ${apt.startTime}`) < now ||
          apt.status === 'completed' ||
          apt.status === 'cancelled'
      );
      setFilteredAppointments(past.sort((a, b) => 
        new Date(`${b.date} ${b.startTime}`).getTime() - new Date(`${a.date} ${a.startTime}`).getTime()
      ));
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAppointments();
  };

  const handleCancelAppointment = (appointment: Appointment) => {
    Alert.alert(
      'Cancel Appointment',
      `Are you sure you want to cancel your ${appointment.type} on ${new Date(
        appointment.date
      ).toLocaleDateString()}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Cancelled', 'Your appointment has been cancelled. Your stylist will be notified.');
            loadAppointments();
          },
        },
      ]
    );
  };

  const handleReschedule = (appointment: Appointment) => {
    Alert.alert(
      'Reschedule',
      'Contact your stylist to reschedule this appointment',
      [
        { text: 'OK' },
        {
          text: 'Message Stylist',
          onPress: () => navigation.navigate('MessagesList'),
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '#4CAF50';
      case 'scheduled':
        return '#2196F3';
      case 'completed':
        return '#9E9E9E';
      case 'cancelled':
        return '#FF5252';
      default:
        return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'checkmark-circle';
      case 'scheduled':
        return 'time';
      case 'completed':
        return 'checkmark-done-circle';
      case 'cancelled':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  const formatDateTime = (dateStr: string, timeStr: string) => {
    const date = new Date(`${dateStr} ${timeStr}`);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  };

  const renderAppointment = ({ item }: { item: Appointment }) => {
    const { date, time } = formatDateTime(item.date, item.startTime);
    const isUpcoming = activeTab === 'upcoming';

    return (
      <View style={styles.appointmentCard}>
        <View style={styles.appointmentHeader}>
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>{date}</Text>
            <Text style={styles.timeText}>{time}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Icon name={getStatusIcon(item.status)} size={16} color={getStatusColor(item.status)} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.appointmentBody}>
          <View style={styles.typeRow}>
            <Icon name="calendar-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.typeText}>{item.type}</Text>
          </View>

          {item.isVirtual ? (
            <View style={styles.detailRow}>
              <Icon name="videocam-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.detailText}>Virtual Session</Text>
            </View>
          ) : item.location ? (
            <View style={styles.detailRow}>
              <Icon name="location-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.detailText}>{item.location}</Text>
            </View>
          ) : null}

          <View style={styles.detailRow}>
            <Icon name="time-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>{item.duration} minutes</Text>
          </View>

          {item.fee && (
            <View style={styles.detailRow}>
              <Icon name="cash-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.detailText}>${item.fee}</Text>
            </View>
          )}

          {item.notes && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          )}
        </View>

        {isUpcoming && item.status !== 'cancelled' && (
          <View style={styles.appointmentActions}>
            <TouchableOpacity
              style={styles.actionButtonSecondary}
              onPress={() => handleReschedule(item)}
            >
              <Icon name="calendar-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.actionButtonSecondaryText}>Reschedule</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonDanger}
              onPress={() => handleCancelAppointment(item)}
            >
              <Icon name="close-circle-outline" size={18} color="#FF5252" />
              <Text style={styles.actionButtonDangerText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.isVirtual && item.meetingLink && isUpcoming && item.status === 'confirmed' && (
          <TouchableOpacity style={styles.joinButton}>
            <Icon name="videocam" size={20} color="#fff" />
            <Text style={styles.joinButtonText}>Join Virtual Session</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <Text style={styles.loadingText}>Loading appointments...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Appointments</Text>
      </View>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            Upcoming
          </Text>
          {appointments.filter(
            (apt) =>
              new Date(`${apt.date} ${apt.startTime}`) >= new Date() &&
              (apt.status === 'scheduled' || apt.status === 'confirmed')
          ).length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>
                {
                  appointments.filter(
                    (apt) =>
                      new Date(`${apt.date} ${apt.startTime}`) >= new Date() &&
                      (apt.status === 'scheduled' || apt.status === 'confirmed')
                  ).length
                }
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {/* Appointments List */}
      <FlatList
        data={filteredAppointments}
        renderItem={renderAppointment}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon
              name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
              size={64}
              color="#ccc"
            />
            <Text style={styles.emptyText}>
              {activeTab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'upcoming'
                ? 'Book a session with your stylist to get started'
                : 'Your completed appointments will appear here'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  tabBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.medium,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dateContainer: {
    flex: 1,
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  appointmentBody: {
    marginBottom: 16,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginLeft: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
  notesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  appointmentActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginLeft: 6,
  },
  actionButtonDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
  },
  actionButtonDangerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF5252',
    marginLeft: 6,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default ClientAppointmentsScreen;
