import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getStylistProfile,
  getStylistStats,
  getUpcomingAppointments,
  getActiveClients,
} from '../services/stylistService';
import { StylistProfile, StylistStats, Appointment } from '../types/stylist';
import theme from '../styles/theme';

type StylistDashboardScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

const StylistDashboardScreen = ({ navigation }: StylistDashboardScreenProps) => {
  const [profile, setProfile] = useState<StylistProfile | null>(null);
  const [stats, setStats] = useState<StylistStats | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [profileData, statsData, appointments] = await Promise.all([
        getStylistProfile(),
        getStylistStats(),
        getUpcomingAppointments(),
      ]);

      setProfile(profileData);
      setStats(statsData);
      setUpcomingAppointments(appointments.slice(0, 3)); // Show next 3
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getAppointmentIcon = (type: string) => {
    switch (type) {
      case 'consultation':
        return 'chatbubbles-outline';
      case 'shopping':
        return 'cart-outline';
      case 'wardrobe-audit':
        return 'file-tray-full-outline';
      case 'styling-session':
        return 'color-palette-outline';
      case 'virtual':
        return 'videocam-outline';
      default:
        return 'calendar-outline';
    }
  };

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} />
      
      {/* Header */}
      <LinearGradient
        colors={theme.colors.gradient.primary}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.stylistName}>{profile?.name || 'Stylist'}</Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('StylistProfile')}
          >
            <Icon name="person-circle-outline" size={40} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('ClientsList')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#EDE9FE' }]}>
              <Icon name="people-outline" size={24} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{stats?.activeClients || 0}</Text>
            <Text style={styles.statLabel}>Active Clients</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('AppointmentsList')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
              <Icon name="calendar-outline" size={24} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{stats?.upcomingAppointments || 0}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#D1FAE5' }]}>
              <Icon name="checkmark-done-outline" size={24} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{stats?.completedSessions || 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Icon name="star-outline" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{profile?.rating?.toFixed(1) || 'N/A'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AddClient')}
            >
              <LinearGradient
                colors={['#8B7FD9', '#A599E9']}
                style={styles.actionGradient}
              >
                <Icon name="person-add-outline" size={28} color="#FFFFFF" />
                <Text style={styles.actionText}>Add Client</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateAppointment')}
            >
              <LinearGradient
                colors={['#3B82F6', '#60A5FA']}
                style={styles.actionGradient}
              >
                <Icon name="calendar-outline" size={28} color="#FFFFFF" />
                <Text style={styles.actionText}>Schedule</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateRecommendation')}
            >
              <LinearGradient
                colors={['#10B981', '#34D399']}
                style={styles.actionGradient}
              >
                <Icon name="bulb-outline" size={28} color="#FFFFFF" />
                <Text style={styles.actionText}>Recommend</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('ClientsList')}
            >
              <LinearGradient
                colors={['#F59E0B', '#FBBF24']}
                style={styles.actionGradient}
              >
                <Icon name="people-outline" size={28} color="#FFFFFF" />
                <Text style={styles.actionText}>Clients</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Upcoming Appointments */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AppointmentsList')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {upcomingAppointments.length > 0 ? (
            upcomingAppointments.map((appointment) => (
              <TouchableOpacity
                key={appointment.id}
                style={styles.appointmentCard}
                onPress={() => navigation.navigate('AppointmentDetails', { appointment })}
              >
                <View style={styles.appointmentIcon}>
                  <Icon
                    name={getAppointmentIcon(appointment.type)}
                    size={24}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentClient}>{appointment.clientName}</Text>
                  <Text style={styles.appointmentType}>
                    {appointment.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Text style={styles.appointmentTime}>
                    {formatDate(appointment.date)} • {appointment.startTime}
                  </Text>
                </View>
                <View style={styles.appointmentStatus}>
                  <View
                    style={[
                      styles.statusBadge,
                      appointment.status === 'confirmed' && styles.statusConfirmed,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Icon name="calendar-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No upcoming appointments</Text>
            </View>
          )}
        </View>

        {/* Revenue Summary */}
        {stats != null && stats.totalRevenue != null && stats.totalRevenue > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Revenue</Text>
            <View style={styles.revenueCard}>
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.revenueGradient}
              >
                <Icon name="cash-outline" size={32} color="#FFFFFF" />
                <Text style={styles.revenueAmount}>
                  {'$' + stats.totalRevenue.toLocaleString()}
                </Text>
                <Text style={styles.revenueLabel}>Total Earnings</Text>
              </LinearGradient>
            </View>
          </View>
        )}

        {/* Tips Section */}
        <View style={styles.section}>
          <View style={styles.tipCard}>
            <Icon name="bulb-outline" size={24} color="#F59E0B" />
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Pro Tip</Text>
              <Text style={styles.tipText}>
                Follow up with clients within 24 hours after a session to maintain engagement
                and gather feedback.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F7FF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  stylistName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  profileButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  actionCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionGradient: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  appointmentCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  appointmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F0FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentClient: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  appointmentType: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  appointmentTime: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  appointmentStatus: {
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  statusConfirmed: {
    backgroundColor: '#D1FAE5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 12,
  },
  revenueCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  revenueGradient: {
    padding: 24,
    alignItems: 'center',
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
  },
  revenueLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    marginTop: 12,
    marginBottom: 24,
  },
  tipContent: {
    flex: 1,
    marginLeft: 12,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
});

export default StylistDashboardScreen;
