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
import { getCurrentClientAccount } from '../services/marketplaceService';
import { getStylistProfile, getAppointmentsByClient } from '../services/stylistService';
import { getRelationship, getUnreadMessageCount } from '../services/messagingService';
import { ClientAccount, StylistProfile, StylistClientRelationship } from '../types/stylist';

const MyStylistScreen = ({ navigation }: any) => {
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [stylist, setStylist] = useState<StylistProfile | null>(null);
  const [relationship, setRelationship] = useState<StylistClientRelationship | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [upcomingSessions, setUpcomingSessions] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStylistData();
  }, []);

  const loadStylistData = async () => {
    try {
      const account = await getCurrentClientAccount();
      setClientAccount(account);

      if (account?.currentStylistId) {
        const [stylistProfile, relationshipData, appointments] = await Promise.all([
          getStylistProfile(),
          getRelationship(account.currentStylistId, account.id),
          getAppointmentsByClient(account.id),
        ]);

        setStylist(stylistProfile);
        setRelationship(relationshipData);

        // Count upcoming sessions
        const upcoming = appointments.filter(
          (apt: any) => apt.status === 'scheduled' || apt.status === 'confirmed'
        ).length;
        setUpcomingSessions(upcoming);

        // Get unread messages
        const unread = await getUnreadMessageCount(account.id, 'client');
        setUnreadMessages(unread);
      }
    } catch (error) {
      console.error('Error loading stylist data:', error);
      Alert.alert('Error', 'Failed to load stylist information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadStylistData();
  };

  const handleMessage = () => {
    navigation.navigate('MessagesList');
  };

  const handleBookSession = () => {
    navigation.navigate('ClientAppointments');
  };

  const handleViewRecommendations = () => {
    navigation.navigate('ClientRecommendations');
  };

  const handleViewAppointments = () => {
    navigation.navigate('ClientAppointments');
  };

  const handleEndRelationship = () => {
    Alert.alert(
      'End Relationship',
      'Are you sure you want to end your relationship with this stylist? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Relationship',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Success', 'Your relationship has been ended. You can find a new stylist in the Discover tab.');
            navigation.navigate('ClientDashboard');
          },
        },
      ]
    );
  };

  const handleToggleWardrobeAccess = () => {
    const newStatus = !relationship?.wardrobeAccessGranted;
    Alert.alert(
      newStatus ? 'Grant Wardrobe Access' : 'Revoke Wardrobe Access',
      newStatus
        ? 'Allow your stylist to view your wardrobe items?'
        : 'Remove your stylist\'s access to your wardrobe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newStatus ? 'Grant Access' : 'Revoke Access',
          onPress: () => {
            Alert.alert('Success', `Wardrobe access ${newStatus ? 'granted' : 'revoked'}`);
            loadStylistData();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!clientAccount?.currentStylistId || !stylist) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="person-outline" size={80} color="#ccc" />
        <Text style={styles.emptyTitle}>No Stylist Yet</Text>
        <Text style={styles.emptyText}>
          Find your perfect stylist in the Discover tab
        </Text>
        <TouchableOpacity
          style={styles.findStylistButton}
          onPress={() => navigation.navigate('StylistMarketplace')}
        >
          <Text style={styles.findStylistButtonText}>Browse Stylists</Text>
        </TouchableOpacity>
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
      {/* Stylist Profile Card */}
      <View style={styles.profileCard}>
        <Image
          source={{ uri: stylist.profileImage || 'https://via.placeholder.com/120' }}
          style={styles.profileImage}
        />
        <Text style={styles.stylistName}>{stylist.name}</Text>
        {stylist.businessName && (
          <Text style={styles.businessName}>{stylist.businessName}</Text>
        )}
        <View style={styles.specialtiesContainer}>
          {stylist.specialties.slice(0, 3).map((specialty, index) => (
            <View key={index} style={styles.specialtyTag}>
              <Text style={styles.specialtyText}>{specialty}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleMessage}>
          <View style={styles.actionIconContainer}>
            <Icon name="chatbubble-ellipses" size={24} color="#fff" />
            {unreadMessages > 0 && (
              <View style={styles.actionBadge}>
                <Text style={styles.actionBadgeText}>{unreadMessages}</Text>
              </View>
            )}
          </View>
          <Text style={styles.actionButtonText}>Message</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleBookSession}>
          <View style={styles.actionIconContainer}>
            <Icon name="calendar" size={24} color="#fff" />
          </View>
          <Text style={styles.actionButtonText}>Book Session</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleViewRecommendations}>
          <View style={styles.actionIconContainer}>
            <Icon name="shirt" size={24} color="#fff" />
          </View>
          <Text style={styles.actionButtonText}>Recommendations</Text>
        </TouchableOpacity>
      </View>

      {/* Relationship Stats */}
      {relationship && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Journey Together</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Icon name="calendar-outline" size={28} color={theme.colors.primary} />
              <Text style={styles.statValue}>{relationship.totalSessions}</Text>
              <Text style={styles.statLabel}>Total Sessions</Text>
            </View>

            <View style={styles.statCard}>
              <Icon name="time-outline" size={28} color={theme.colors.primary} />
              <Text style={styles.statValue}>{upcomingSessions}</Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>

            <View style={styles.statCard}>
              <Icon name="cash-outline" size={28} color={theme.colors.primary} />
              <Text style={styles.statValue}>${relationship.totalSpent}</Text>
              <Text style={styles.statLabel}>Total Invested</Text>
            </View>

            <View style={styles.statCard}>
              <Icon name="calendar-number-outline" size={28} color={theme.colors.primary} />
              <Text style={styles.statValue}>
                {Math.floor(
                  (new Date().getTime() - new Date(relationship.startDate).getTime()) /
                    (1000 * 60 * 60 * 24)
                )}
              </Text>
              <Text style={styles.statLabel}>Days Together</Text>
            </View>
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Relationship Status</Text>
              <View style={[styles.statusBadge, styles[`status${relationship.status}`]]}>
                <Text style={styles.statusText}>{relationship.status.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Started</Text>
              <Text style={styles.statusValue}>
                {new Date(relationship.startDate).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Communication</Text>
              <Text style={styles.statusValue}>
                {relationship.communicationPreference === 'in-app'
                  ? 'In-App Only'
                  : relationship.communicationPreference === 'all'
                  ? 'All Channels'
                  : relationship.communicationPreference}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Wardrobe Access */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wardrobe Access</Text>
        <TouchableOpacity
          style={styles.accessCard}
          onPress={handleToggleWardrobeAccess}
        >
          <View style={styles.accessInfo}>
            <Icon
              name={relationship?.wardrobeAccessGranted ? 'lock-open' : 'lock-closed'}
              size={24}
              color={relationship?.wardrobeAccessGranted ? '#4CAF50' : '#FF5252'}
            />
            <View style={styles.accessText}>
              <Text style={styles.accessTitle}>
                {relationship?.wardrobeAccessGranted
                  ? 'Access Granted'
                  : 'Access Not Granted'}
              </Text>
              <Text style={styles.accessDescription}>
                {relationship?.wardrobeAccessGranted
                  ? 'Your stylist can view your wardrobe items'
                  : 'Grant access to let your stylist view your wardrobe'}
              </Text>
            </View>
          </View>
          <Icon name="chevron-forward" size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Session History */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Session History</Text>
          <TouchableOpacity onPress={handleViewAppointments}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.historyCard}>
          <Icon name="calendar-outline" size={32} color={theme.colors.primary} />
          <View style={styles.historyInfo}>
            <Text style={styles.historyTitle}>
              {relationship?.totalSessions || 0} sessions completed
            </Text>
            <Text style={styles.historyDescription}>
              View your complete appointment history and upcoming sessions
            </Text>
          </View>
        </View>
      </View>

      {/* End Relationship */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.endRelationshipButton}
          onPress={handleEndRelationship}
        >
          <Icon name="close-circle-outline" size={20} color="#FF5252" />
          <Text style={styles.endRelationshipText}>End Relationship</Text>
        </TouchableOpacity>
        <Text style={styles.endRelationshipNote}>
          This will end your professional relationship with {stylist.name}. You can always
          book a new stylist later.
        </Text>
      </View>

      <View style={{ height: 40 }} />
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#f8f8f8',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  findStylistButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
    marginTop: 24,
  },
  findStylistButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileCard: {
    backgroundColor: '#fff',
    alignItems: 'center',
    padding: 32,
    marginBottom: 8,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    marginBottom: 16,
  },
  stylistName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  businessName: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  specialtyTag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  specialtyText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  quickActions: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  actionBadge: {
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
  actionBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionButtonText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f9f9f9',
    margin: 8,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  statusValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusactive: {
    backgroundColor: '#E8F5E9',
  },
  statuspaused: {
    backgroundColor: '#FFF3E0',
  },
  statusended: {
    backgroundColor: '#FFEBEE',
  },
  statuspending: {
    backgroundColor: '#E3F2FD',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  accessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
  },
  accessInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accessText: {
    marginLeft: 16,
    flex: 1,
  },
  accessTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  accessDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
  },
  historyInfo: {
    marginLeft: 16,
    flex: 1,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  historyDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 12,
  },
  endRelationshipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF5252',
    marginBottom: 12,
  },
  endRelationshipText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF5252',
    marginLeft: 8,
  },
  endRelationshipNote: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default MyStylistScreen;
