import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import {
  getClientById,
  updateClient,
  deleteClient,
  getAppointmentsByClient,
  getRecommendationsByClient,
  getNotesByClient,
} from '../services/stylistService';
import { Client, Appointment, StylingRecommendation, StylistNote } from '../types/stylist';
import theme from '../styles/theme';

type ClientDetailsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ params: { client: Client; clientId?: string } }, 'params'>;
};

const ClientDetailsScreen = ({ navigation, route }: ClientDetailsScreenProps) => {
  const [client, setClient] = useState<Client | null>(route.params.client || null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [recommendations, setRecommendations] = useState<StylingRecommendation[]>([]);
  const [notes, setNotes] = useState<StylistNote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadClientData();
  }, []);

  const loadClientData = async () => {
    try {
      setLoading(true);
      const clientId = client?.id || route.params.clientId;
      
      if (!clientId) return;

      const [clientData, appts, recs, clientNotes] = await Promise.all([
        client ? Promise.resolve(client) : getClientById(clientId),
        getAppointmentsByClient(clientId),
        getRecommendationsByClient(clientId),
        getNotesByClient(clientId),
      ]);

      if (clientData) setClient(clientData);
      setAppointments(appts);
      setRecommendations(recs);
      setNotes(clientNotes.filter(n => !n.isPrivate)); // Only show non-private notes
    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = () => {
    Alert.alert(
      'Delete Client',
      `Are you sure you want to delete ${client?.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (client) {
              await deleteClient(client.id);
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  const handleToggleStatus = async () => {
    if (!client) return;
    
    const newStatus = client.status === 'active' ? 'inactive' : 'active';
    const updated = await updateClient(client.id, { status: newStatus });
    if (updated) setClient(updated);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!client) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text>Client not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} />

      {/* Header */}
      <LinearGradient colors={theme.colors.gradient.luxury} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('EditClient', { client })}
            >
              <Icon name="create-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={handleDeleteClient}>
              <Icon name="trash-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileSection}>
          {client.profileImage ? (
            <Image source={{ uri: client.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Text style={styles.profileInitials}>{getInitials(client.name)}</Text>
            </View>
          )}
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientEmail}>{client.email}</Text>
          
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: client.status === 'active' ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.statusText}>
              {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{client.totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{recommendations.length}</Text>
            <Text style={styles.statLabel}>Recommendations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{appointments.length}</Text>
            <Text style={styles.statLabel}>Appointments</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                navigation.navigate('CreateAppointment', { clientId: client.id, clientName: client.name })
              }
            >
              <Icon name="calendar-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                navigation.navigate('CreateRecommendation', { clientId: client.id, clientName: client.name })
              }
            >
              <Icon name="bulb-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Recommend</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('AddNote', { clientId: client.id })}
            >
              <Icon name="document-text-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>Add Note</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleToggleStatus}>
              <Icon
                name={client.status === 'active' ? 'pause-outline' : 'play-outline'}
                size={24}
                color={theme.colors.primary}
              />
              <Text style={styles.actionButtonText}>
                {client.status === 'active' ? 'Deactivate' : 'Activate'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Icon name="mail-outline" size={20} color={theme.colors.mediumGray} />
              <Text style={styles.infoText}>{client.email}</Text>
            </View>
            {client.phone && (
              <View style={styles.infoRow}>
                <Icon name="call-outline" size={20} color={theme.colors.mediumGray} />
                <Text style={styles.infoText}>{client.phone}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Icon name="calendar-outline" size={20} color={theme.colors.mediumGray} />
              <Text style={styles.infoText}>Client since {formatDate(client.dateAdded)}</Text>
            </View>
            {client.lastSession && (
              <View style={styles.infoRow}>
                <Icon name="time-outline" size={20} color={theme.colors.mediumGray} />
                <Text style={styles.infoText}>Last session: {formatDate(client.lastSession)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Style Preferences */}
        {client.preferences && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Style Preferences</Text>
            <View style={styles.card}>
              {client.preferences.style && client.preferences.style.length > 0 && (
                <View style={styles.preferenceItem}>
                  <Text style={styles.preferenceLabel}>Style</Text>
                  <View style={styles.tagsContainer}>
                    {client.preferences.style.map((style, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{style}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {client.preferences.colors && client.preferences.colors.length > 0 && (
                <View style={styles.preferenceItem}>
                  <Text style={styles.preferenceLabel}>Preferred Colors</Text>
                  <View style={styles.tagsContainer}>
                    {client.preferences.colors.map((color, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{color}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {client.preferences.budget && (
                <View style={styles.preferenceItem}>
                  <Text style={styles.preferenceLabel}>Budget Range</Text>
                  <Text style={styles.preferenceValue}>
                    ${client.preferences.budget.min} - ${client.preferences.budget.max}
                  </Text>
                </View>
              )}

              {client.preferences.sizes && (
                <View style={styles.preferenceItem}>
                  <Text style={styles.preferenceLabel}>Sizes</Text>
                  <View style={styles.sizesGrid}>
                    {client.preferences.sizes.tops && (
                      <Text style={styles.sizeText}>Tops: {client.preferences.sizes.tops}</Text>
                    )}
                    {client.preferences.sizes.bottoms && (
                      <Text style={styles.sizeText}>Bottoms: {client.preferences.sizes.bottoms}</Text>
                    )}
                    {client.preferences.sizes.shoes && (
                      <Text style={styles.sizeText}>Shoes: {client.preferences.sizes.shoes}</Text>
                    )}
                    {client.preferences.sizes.dresses && (
                      <Text style={styles.sizeText}>Dresses: {client.preferences.sizes.dresses}</Text>
                    )}
                  </View>
                </View>
              )}

              {client.preferences.bodyType && (
                <View style={styles.preferenceItem}>
                  <Text style={styles.preferenceLabel}>Body Type</Text>
                  <Text style={styles.preferenceValue}>{client.preferences.bodyType}</Text>
                </View>
              )}

              {client.preferences.lifestyle && (
                <View style={styles.preferenceItem}>
                  <Text style={styles.preferenceLabel}>Lifestyle</Text>
                  <Text style={styles.preferenceValue}>{client.preferences.lifestyle}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Goals */}
        {client.goals && client.goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Goals</Text>
            <View style={styles.card}>
              {client.goals.map((goal, index) => (
                <View key={index} style={styles.goalItem}>
                  <Icon name="checkmark-circle-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.goalText}>{goal}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {client.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.card}>
              <Text style={styles.notesText}>{client.notes}</Text>
            </View>
          </View>
        )}

        {/* Recent Appointments */}
        {appointments.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Appointments</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('AppointmentsList', { clientId: client.id })}
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {appointments.slice(0, 3).map(appointment => (
              <TouchableOpacity
                key={appointment.id}
                style={styles.appointmentCard}
                onPress={() => navigation.navigate('AppointmentDetails', { appointment })}
              >
                <View style={styles.appointmentIcon}>
                  <Icon name="calendar-outline" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentType}>
                    {appointment.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Text style={styles.appointmentDate}>
                    {formatDate(appointment.date)} • {appointment.startTime}
                  </Text>
                </View>
                <View
                  style={[
                    styles.appointmentStatus,
                    { backgroundColor: appointment.status === 'completed' ? '#D1FAE5' : '#DBEAFE' },
                  ]}
                >
                  <Text
                    style={[
                      styles.appointmentStatusText,
                      { color: appointment.status === 'completed' ? '#10B981' : '#3B82F6' },
                    ]}
                  >
                    {appointment.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('RecommendationsList', { clientId: client.id })}
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {recommendations.slice(0, 3).map(rec => (
              <TouchableOpacity
                key={rec.id}
                style={styles.recommendationCard}
                onPress={() => navigation.navigate('RecommendationDetails', { recommendation: rec })}
              >
                <Icon name="bulb-outline" size={24} color={theme.colors.primary} />
                <View style={styles.recommendationInfo}>
                  <Text style={styles.recommendationTitle}>{rec.title}</Text>
                  <Text style={styles.recommendationCategory}>{rec.category}</Text>
                </View>
                <View
                  style={[
                    styles.recStatus,
                    { backgroundColor: rec.status === 'implemented' ? '#D1FAE5' : '#FEF3C7' },
                  ]}
                >
                  <Text
                    style={[
                      styles.recStatusText,
                      { color: rec.status === 'implemented' ? '#10B981' : '#F59E0B' },
                    ]}
                  >
                    {rec.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
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
  header: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  profilePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileInitials: {
    fontSize: 36,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  clientName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  clientEmail: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoText: {
    fontSize: 15,
    color: theme.colors.text,
    flex: 1,
  },
  preferenceItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.mediumGray,
    marginBottom: 8,
  },
  preferenceValue: {
    fontSize: 15,
    color: theme.colors.text,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  sizesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sizeText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  goalText: {
    fontSize: 15,
    color: theme.colors.text,
    flex: 1,
  },
  notesText: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  appointmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F0FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentType: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  appointmentDate: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  appointmentStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  appointmentStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recommendationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  recommendationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  recommendationCategory: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  recStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default ClientDetailsScreen;
