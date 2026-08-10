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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getStylistProfile,
  getStylistStats,
  getUpcomingAppointments,
} from '../services/stylistService';
import { StylistProfile, StylistStats, Appointment } from '../types/stylist';

const GOLD = '#C4975A';
const GOLD_SUBTLE = 'rgba(196,151,90,0.15)';
const INK = '#100E0B';
const CREAM = '#FDFAF5';
const SURFACE = '#FFFFFF';
const MUTED_BG = '#F7F3EC';
const MUTED_TEXT = '#6B5F52';
const BORDER = '#EDE5D8';
const CHARCOAL_HEADER = '#0F0D0A';
const CREAM_HEADER = '#F5EDE0';
const MUTED_HEADER = 'rgba(245,237,224,0.5)';

type StylistDashboardScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

const StylistDashboardScreen = ({ navigation }: StylistDashboardScreenProps) => {
  const [profile, setProfile] = useState<StylistProfile | null>(null);
  const [stats, setStats] = useState<StylistStats | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadDashboardData(); }, []);

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
      setUpcomingAppointments(appointments.slice(0, 3));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadDashboardData(); };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const apptTypeLabel = (type: string) =>
    type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loader}>
          <View style={styles.goldDot} />
        </View>
      </SafeAreaView>
    );
  }

  const TOOLS = [
    { icon: 'albums-outline', title: 'Lookbook Creator', sub: 'Compose & present curated looks', screen: 'Lookbook' },
    { icon: 'shirt-outline', title: 'Capsule Builder', sub: 'Build a capsule · see outfit combos', screen: 'CapsuleWardrobe' },
    { icon: 'checkmark-done-outline', title: 'Wardrobe Audit', sub: 'Keep · Donate · Store — item by item', screen: 'WardrobeEdit' },
  ];

  const ACTIONS = [
    { icon: 'person-add-outline', label: 'New Client', screen: 'AddClient' },
    { icon: 'calendar-outline', label: 'Schedule', screen: 'CreateAppointment' },
    { icon: 'bulb-outline', label: 'Recommend', screen: 'CreateRecommendation' },
    { icon: 'people-outline', label: 'Clients', screen: 'ClientsList' },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={CHARCOAL_HEADER} />

      {/* ── Editorial header ── */}
      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerEyebrow}>Dashboard</Text>
              <Text style={styles.headerName}>{profile?.name || 'Stylist'}</Text>
            </View>
            <TouchableOpacity
              style={styles.profileAvatar}
              onPress={() => navigation.navigate('StylistProfile')}
            >
              <Icon name="person-outline" size={20} color={GOLD} />
            </TouchableOpacity>
          </View>

          {/* Stat strip */}
          <View style={styles.statStrip}>
            {[
              { value: stats?.activeClients ?? 0, label: 'Clients', nav: 'ClientsList' },
              { value: stats?.upcomingAppointments ?? 0, label: 'Upcoming', nav: 'AppointmentsList' },
              { value: stats?.completedSessions ?? 0, label: 'Sessions' },
              { value: profile?.rating?.toFixed(1) ?? '—', label: 'Rating' },
            ].map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.statItem, i < 3 && styles.statItemBorder]}
                onPress={() => s.nav && navigation.navigate(s.nav)}
                activeOpacity={s.nav ? 0.7 : 1}
              >
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* ── Quick Actions ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            {ACTIONS.map(a => (
              <TouchableOpacity
                key={a.screen}
                style={styles.actionPill}
                onPress={() => navigation.navigate(a.screen)}
              >
                <View style={styles.actionIconWrap}>
                  <Icon name={a.icon} size={20} color={GOLD} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Revenue banner ── */}
        {stats?.totalRevenue != null && stats.totalRevenue > 0 && (
          <View style={styles.section}>
            <View style={styles.revenueBanner}>
              <View>
                <Text style={styles.revenueEyebrow}>Total Earnings</Text>
                <Text style={styles.revenueAmount}>
                  {'$' + stats.totalRevenue.toLocaleString()}
                </Text>
              </View>
              <Icon name="trending-up-outline" size={28} color={GOLD} />
            </View>
          </View>
        )}

        {/* ── Upcoming Appointments ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Upcoming</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AppointmentsList')}>
              <Text style={styles.seeAll}>View all</Text>
            </TouchableOpacity>
          </View>

          {upcomingAppointments.length > 0 ? (
            <View style={styles.appointmentList}>
              {upcomingAppointments.map((appt, idx) => (
                <TouchableOpacity
                  key={appt.id}
                  style={[styles.apptRow, idx < upcomingAppointments.length - 1 && styles.apptRowBorder]}
                  onPress={() => navigation.navigate('AppointmentDetails', { appointment: appt })}
                >
                  <View style={styles.apptDateBox}>
                    <Text style={styles.apptDay}>
                      {new Date(appt.date).toLocaleDateString('en-US', { day: '2-digit' })}
                    </Text>
                    <Text style={styles.apptMonth}>
                      {new Date(appt.date).toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.apptInfo}>
                    <Text style={styles.apptClient}>{appt.clientName}</Text>
                    <Text style={styles.apptType}>{apptTypeLabel(appt.type)}</Text>
                    <Text style={styles.apptTime}>{appt.startTime}</Text>
                  </View>
                  <View style={[
                    styles.apptStatus,
                    appt.status === 'confirmed' && styles.apptStatusConfirmed,
                  ]}>
                    <Text style={[
                      styles.apptStatusText,
                      appt.status === 'confirmed' && styles.apptStatusTextConfirmed,
                    ]}>
                      {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No upcoming appointments</Text>
            </View>
          )}
        </View>

        {/* ── Stylist Tools ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Stylist Tools</Text>
          <View style={styles.toolList}>
            {TOOLS.map((tool, idx) => (
              <TouchableOpacity
                key={tool.screen}
                style={[styles.toolRow, idx < TOOLS.length - 1 && styles.toolRowBorder]}
                onPress={() => navigation.navigate(tool.screen)}
              >
                <View style={styles.toolIconWrap}>
                  <Icon name={tool.icon} size={20} color={GOLD} />
                </View>
                <View style={styles.toolText}>
                  <Text style={styles.toolTitle}>{tool.title}</Text>
                  <Text style={styles.toolSub}>{tool.sub}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={BORDER} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CREAM,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },

  // Header
  headerSafe: {
    backgroundColor: CHARCOAL_HEADER,
  },
  header: {
    backgroundColor: CHARCOAL_HEADER,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: {},
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerName: {
    fontSize: 30,
    fontWeight: '300',
    color: CREAM_HEADER,
    letterSpacing: -0.3,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(196,151,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,151,90,0.3)',
  },

  // Stat strip
  statStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,151,90,0.15)',
    marginTop: 8,
  },
  statItem: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statItemBorder: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(196,151,90,0.15)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '300',
    color: CREAM_HEADER,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: MUTED_HEADER,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 4 },

  // Section
  section: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED_TEXT,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 13,
    color: GOLD,
    fontWeight: '500',
  },

  // Quick actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionPill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 8,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GOLD_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: INK,
    letterSpacing: 0.2,
  },

  // Revenue
  revenueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CHARCOAL_HEADER,
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  revenueEyebrow: {
    fontSize: 10,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  revenueAmount: {
    fontSize: 32,
    fontWeight: '300',
    color: CREAM_HEADER,
    letterSpacing: -0.5,
  },

  // Appointments
  appointmentList: {
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  apptRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  apptDateBox: {
    width: 40,
    alignItems: 'center',
  },
  apptDay: {
    fontSize: 20,
    fontWeight: '300',
    color: INK,
    lineHeight: 22,
  },
  apptMonth: {
    fontSize: 10,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  apptInfo: { flex: 1 },
  apptClient: {
    fontSize: 14,
    fontWeight: '600',
    color: INK,
    marginBottom: 2,
  },
  apptType: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginBottom: 1,
  },
  apptTime: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
  apptStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
    backgroundColor: MUTED_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  apptStatusConfirmed: {
    backgroundColor: GOLD_SUBTLE,
    borderColor: 'rgba(196,151,90,0.3)',
  },
  apptStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED_TEXT,
    letterSpacing: 0.5,
  },
  apptStatusTextConfirmed: {
    color: '#8B6520',
  },
  emptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyText: {
    fontSize: 14,
    color: MUTED_TEXT,
  },

  // Tools
  toolList: {
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  toolRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  toolIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GOLD_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { flex: 1 },
  toolTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: INK,
    marginBottom: 2,
  },
  toolSub: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
});

export default StylistDashboardScreen;
