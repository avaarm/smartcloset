import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { theme } from '../styles/theme';
import { getClientDashboardStats, getCurrentClientAccount } from '../services/marketplaceService';
import { getStylistProfile } from '../services/stylistService';
import { getUnreadMessageCount } from '../services/messagingService';
import { ClientDashboardStats, ClientAccount, StylistProfile } from '../types/stylist';

const ClientDashboardScreen = ({ navigation }: any) => {
  const [stats, setStats] = useState<ClientDashboardStats | null>(null);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [stylist, setStylist] = useState<StylistProfile | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const account = await getCurrentClientAccount();
      setClientAccount(account);

      if (account) {
        const dashboardStats = await getClientDashboardStats(account.id);
        setStats(dashboardStats);

        if (account.currentStylistId) {
          const stylistProfile = await getStylistProfile();
          setStylist(stylistProfile);

          const unread = await getUnreadMessageCount(account.id, 'client');
          setUnreadMessages(unread);
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const handleMessageStylist = () => {
    if (clientAccount?.currentStylistId) {
      navigation.navigate('MessagesList');
    } else {
      Alert.alert('No Stylist', 'You need to book a stylist first');
    }
  };

  const handleBookAppointment = () => {
    if (clientAccount?.currentStylistId) {
      navigation.navigate('ClientAppointments');
    } else {
      Alert.alert('No Stylist', 'Please find a stylist in the Discover tab');
    }
  };

  const handleViewRecommendations = () => {
    navigation.navigate('ClientRecommendations');
  };

  const handleFindStylist = () => {
    // StylistMarketplace lives inside the MyStylist tab's stack; navigate to
    // that tab and specify the nested screen.
    navigation.navigate('MyStylist', { screen: 'StylistMarketplace' });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.userName}>{clientAccount?.name || 'Client'}</Text>
        </View>
        {unreadMessages > 0 && (
          <TouchableOpacity
            style={styles.notificationBadge}
            onPress={() => navigation.navigate('MessagesList')}
          >
            <Icon name="chatbubbles" size={24} color={theme.colors.primary} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadMessages}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Current Stylist Card */}
      {stylist && clientAccount?.currentStylistId ? (
        <TouchableOpacity
          style={styles.stylistCard}
          onPress={() => navigation.navigate('MyStylist')}
        >
          <Image
            source={{ uri: stylist.profileImage || 'https://via.placeholder.com/80' }}
            style={styles.stylistImage}
          />
          <View style={styles.stylistInfo}>
            <Text style={styles.stylistLabel}>Your Stylist</Text>
            <Text style={styles.stylistName}>{stylist.name}</Text>
            {stats?.currentStylist && (
              <View style={styles.nextAppointment}>
                <Icon name="calendar-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.nextAppointmentText}>
                  {stats.upcomingAppointments > 0
                    ? `${stats.upcomingAppointments} upcoming session${stats.upcomingAppointments > 1 ? 's' : ''}`
                    : 'No upcoming sessions'}
                </Text>
              </View>
            )}
          </View>
          <Icon name="chevron-forward" size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.findStylistCard} onPress={handleFindStylist}>
          <Icon name="search" size={32} color={theme.colors.primary} />
          <View style={styles.findStylistInfo}>
            <Text style={styles.findStylistTitle}>Find Your Perfect Stylist</Text>
            <Text style={styles.findStylistSubtitle}>
              Browse professional stylists and book your first session
            </Text>
          </View>
          <Icon name="chevron-forward" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      )}

      {/* Stats Grid */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Icon name="calendar" size={28} color={theme.colors.primary} />
            <Text style={styles.statValue}>{stats.totalSessions}</Text>
            <Text style={styles.statLabel}>Total Sessions</Text>
          </View>

          <View style={styles.statCard}>
            <Icon name="time" size={28} color={theme.colors.primary} />
            <Text style={styles.statValue}>{stats.upcomingAppointments}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>

          <View style={styles.statCard}>
            <Icon name="bulb" size={28} color={theme.colors.primary} />
            <Text style={styles.statValue}>{stats.recommendationsReceived}</Text>
            <Text style={styles.statLabel}>Recommendations</Text>
          </View>

          <View style={styles.statCard}>
            <Icon name="checkmark-circle" size={28} color="#4CAF50" />
            <Text style={styles.statValue}>{stats.recommendationsImplemented}</Text>
            <Text style={styles.statLabel}>Implemented</Text>
          </View>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleMessageStylist}
            disabled={!clientAccount?.currentStylistId}
          >
            <View style={[
              styles.actionIcon,
              !clientAccount?.currentStylistId && styles.actionIconDisabled
            ]}>
              <Icon
                name="chatbubble-ellipses-outline"
                size={24}
                color={clientAccount?.currentStylistId ? theme.colors.primary : '#ccc'}
              />
            </View>
            <Text style={[
              styles.actionLabel,
              !clientAccount?.currentStylistId && styles.actionLabelDisabled
            ]}>
              Message Stylist
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleBookAppointment}
            disabled={!clientAccount?.currentStylistId}
          >
            <View style={[
              styles.actionIcon,
              !clientAccount?.currentStylistId && styles.actionIconDisabled
            ]}>
              <Icon
                name="calendar-outline"
                size={24}
                color={clientAccount?.currentStylistId ? theme.colors.primary : '#ccc'}
              />
            </View>
            <Text style={[
              styles.actionLabel,
              !clientAccount?.currentStylistId && styles.actionLabelDisabled
            ]}>
              Book Session
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleViewRecommendations}>
            <View style={styles.actionIcon}>
              <Icon name="shirt-outline" size={24} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Recommendations</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleFindStylist}>
            <View style={styles.actionIcon}>
              <Icon name="search-outline" size={24} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Find Stylist</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Section */}
      {stats && stats.totalSessions > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Progress</Text>
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Implementation Rate</Text>
              <Text style={styles.progressValue}>
                {stats.recommendationsReceived > 0
                  ? Math.round((stats.recommendationsImplemented / stats.recommendationsReceived) * 100)
                  : 0}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: stats.recommendationsReceived > 0
                      ? `${(stats.recommendationsImplemented / stats.recommendationsReceived) * 100}%`
                      : '0%'
                  }
                ]}
              />
            </View>
            <Text style={styles.progressSubtext}>
              You've implemented {stats.recommendationsImplemented} out of {stats.recommendationsReceived} recommendations
            </Text>
          </View>

          {stats.totalSpent > 0 && (
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Total Investment</Text>
                <Text style={styles.progressValue}>${stats.totalSpent.toFixed(2)}</Text>
              </View>
              <Text style={styles.progressSubtext}>
                Across {stats.totalSessions} styling session{stats.totalSessions > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Tips Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Styling Tips</Text>
        <View style={styles.tipCard}>
          <Icon name="bulb-outline" size={24} color="#FFA726" />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Make the Most of Your Sessions</Text>
            <Text style={styles.tipText}>
              Prepare photos of your wardrobe and any specific events you're styling for before your session.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  greeting: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 4,
  },
  notificationBadge: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF5252',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stylistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    ...theme.shadows.medium,
  },
  stylistImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
  },
  stylistInfo: {
    flex: 1,
    marginLeft: 16,
  },
  stylistLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stylistName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 4,
  },
  nextAppointment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  nextAppointmentText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  findStylistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
  },
  findStylistInfo: {
    flex: 1,
    marginLeft: 16,
  },
  findStylistTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  findStylistSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    margin: 8,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    ...theme.shadows.small,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIconDisabled: {
    backgroundColor: '#f5f5f5',
  },
  actionLabel: {
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'center',
  },
  actionLabelDisabled: {
    color: '#ccc',
  },
  progressCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    ...theme.shadows.small,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  progressSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E1',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA726',
  },
  tipContent: {
    flex: 1,
    marginLeft: 12,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F57C00',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    color: '#795548',
    lineHeight: 20,
  },
});

export default ClientDashboardScreen;
