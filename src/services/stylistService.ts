import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StylistProfile,
  Client,
  Appointment,
  StylingRecommendation,
  StylistNote,
  StylistStats,
  AccountType,
} from '../types/stylist';

const STYLIST_PROFILE_KEY = '@smartcloset_stylist_profile';
const CLIENTS_KEY = '@smartcloset_stylist_clients';
const APPOINTMENTS_KEY = '@smartcloset_stylist_appointments';
const RECOMMENDATIONS_KEY = '@smartcloset_stylist_recommendations';
const NOTES_KEY = '@smartcloset_stylist_notes';
const ACCOUNT_TYPE_KEY = '@smartcloset_account_type';

// ============================================
// Account Type Management
// ============================================

export const getAccountType = async (): Promise<AccountType> => {
  try {
    const type = await AsyncStorage.getItem(ACCOUNT_TYPE_KEY);
    return (type as AccountType) || 'user';
  } catch (error) {
    console.error('Error getting account type:', error);
    return 'user';
  }
};

export const setAccountType = async (type: AccountType): Promise<void> => {
  try {
    await AsyncStorage.setItem(ACCOUNT_TYPE_KEY, type);
  } catch (error) {
    console.error('Error setting account type:', error);
    throw error;
  }
};

export const switchToStylistMode = async (): Promise<void> => {
  await setAccountType('stylist');
};

export const switchToUserMode = async (): Promise<void> => {
  await setAccountType('user');
};

// ============================================
// Stylist Profile Management
// ============================================

export const getStylistProfile = async (): Promise<StylistProfile | null> => {
  try {
    const profileData = await AsyncStorage.getItem(STYLIST_PROFILE_KEY);
    return profileData ? JSON.parse(profileData) : null;
  } catch (error) {
    console.error('Error getting stylist profile:', error);
    return null;
  }
};

export const createStylistProfile = async (
  profile: Omit<StylistProfile, 'id' | 'joinedDate' | 'totalClients' | 'isActive'>
): Promise<StylistProfile> => {
  try {
    const newProfile: StylistProfile = {
      ...profile,
      id: `stylist_${Date.now()}`,
      joinedDate: new Date().toISOString(),
      totalClients: 0,
      isActive: true,
    };

    await AsyncStorage.setItem(STYLIST_PROFILE_KEY, JSON.stringify(newProfile));
    await setAccountType('stylist');
    return newProfile;
  } catch (error) {
    console.error('Error creating stylist profile:', error);
    throw error;
  }
};

export const updateStylistProfile = async (
  updates: Partial<StylistProfile>
): Promise<StylistProfile | null> => {
  try {
    const currentProfile = await getStylistProfile();
    if (!currentProfile) return null;

    const updatedProfile = { ...currentProfile, ...updates };
    await AsyncStorage.setItem(STYLIST_PROFILE_KEY, JSON.stringify(updatedProfile));
    return updatedProfile;
  } catch (error) {
    console.error('Error updating stylist profile:', error);
    throw error;
  }
};

// ============================================
// Client Management
// ============================================

export const getClients = async (): Promise<Client[]> => {
  try {
    const clientsData = await AsyncStorage.getItem(CLIENTS_KEY);
    return clientsData ? JSON.parse(clientsData) : [];
  } catch (error) {
    console.error('Error getting clients:', error);
    return [];
  }
};

export const getClientById = async (clientId: string): Promise<Client | null> => {
  try {
    const clients = await getClients();
    return clients.find(c => c.id === clientId) || null;
  } catch (error) {
    console.error('Error getting client:', error);
    return null;
  }
};

export const addClient = async (
  clientData: Omit<Client, 'id' | 'dateAdded' | 'totalSessions' | 'status'>
): Promise<Client> => {
  try {
    const clients = await getClients();
    const newClient: Client = {
      ...clientData,
      id: `client_${Date.now()}`,
      dateAdded: new Date().toISOString(),
      totalSessions: 0,
      status: 'active',
    };

    clients.push(newClient);
    await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));

    // Update stylist total clients count
    const profile = await getStylistProfile();
    if (profile) {
      await updateStylistProfile({ totalClients: (profile.totalClients || 0) + 1 });
    }

    return newClient;
  } catch (error) {
    console.error('Error adding client:', error);
    throw error;
  }
};

export const updateClient = async (
  clientId: string,
  updates: Partial<Client>
): Promise<Client | null> => {
  try {
    const clients = await getClients();
    const index = clients.findIndex(c => c.id === clientId);
    
    if (index === -1) return null;

    clients[index] = { ...clients[index], ...updates };
    await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
    return clients[index];
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
};

export const deleteClient = async (clientId: string): Promise<void> => {
  try {
    const clients = await getClients();
    const filtered = clients.filter(c => c.id !== clientId);
    await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
};

export const getActiveClients = async (): Promise<Client[]> => {
  const clients = await getClients();
  return clients.filter(c => c.status === 'active');
};

// ============================================
// Appointment Management
// ============================================

export const getAppointments = async (): Promise<Appointment[]> => {
  try {
    const appointmentsData = await AsyncStorage.getItem(APPOINTMENTS_KEY);
    return appointmentsData ? JSON.parse(appointmentsData) : [];
  } catch (error) {
    console.error('Error getting appointments:', error);
    return [];
  }
};

export const getAppointmentsByClient = async (clientId: string): Promise<Appointment[]> => {
  const appointments = await getAppointments();
  return appointments.filter(a => a.clientId === clientId);
};

export const getUpcomingAppointments = async (): Promise<Appointment[]> => {
  const appointments = await getAppointments();
  const now = new Date();
  return appointments
    .filter(a => {
      const appointmentDate = new Date(a.date);
      return appointmentDate >= now && a.status === 'scheduled';
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const createAppointment = async (
  appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Appointment> => {
  try {
    const appointments = await getAppointments();
    const newAppointment: Appointment = {
      ...appointmentData,
      id: `appt_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    appointments.push(newAppointment);
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments));
    return newAppointment;
  } catch (error) {
    console.error('Error creating appointment:', error);
    throw error;
  }
};

export const updateAppointment = async (
  appointmentId: string,
  updates: Partial<Appointment>
): Promise<Appointment | null> => {
  try {
    const appointments = await getAppointments();
    const index = appointments.findIndex(a => a.id === appointmentId);
    
    if (index === -1) return null;

    appointments[index] = {
      ...appointments[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments));

    // Update client's last session if appointment is completed
    if (updates.status === 'completed') {
      const client = await getClientById(appointments[index].clientId);
      if (client) {
        await updateClient(client.id, {
          lastSession: appointments[index].date,
          totalSessions: (client.totalSessions || 0) + 1,
        });
      }
    }

    return appointments[index];
  } catch (error) {
    console.error('Error updating appointment:', error);
    throw error;
  }
};

export const deleteAppointment = async (appointmentId: string): Promise<void> => {
  try {
    const appointments = await getAppointments();
    const filtered = appointments.filter(a => a.id !== appointmentId);
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting appointment:', error);
    throw error;
  }
};

// ============================================
// Styling Recommendations
// ============================================

export const getRecommendations = async (): Promise<StylingRecommendation[]> => {
  try {
    const recommendationsData = await AsyncStorage.getItem(RECOMMENDATIONS_KEY);
    return recommendationsData ? JSON.parse(recommendationsData) : [];
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
};

export const getRecommendationsByClient = async (
  clientId: string
): Promise<StylingRecommendation[]> => {
  const recommendations = await getRecommendations();
  return recommendations.filter(r => r.clientId === clientId);
};

export const createRecommendation = async (
  recommendationData: Omit<StylingRecommendation, 'id' | 'createdAt' | 'status'>
): Promise<StylingRecommendation> => {
  try {
    const recommendations = await getRecommendations();
    const newRecommendation: StylingRecommendation = {
      ...recommendationData,
      id: `rec_${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'draft',
    };

    recommendations.push(newRecommendation);
    await AsyncStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recommendations));
    return newRecommendation;
  } catch (error) {
    console.error('Error creating recommendation:', error);
    throw error;
  }
};

export const updateRecommendation = async (
  recommendationId: string,
  updates: Partial<StylingRecommendation>
): Promise<StylingRecommendation | null> => {
  try {
    const recommendations = await getRecommendations();
    const index = recommendations.findIndex(r => r.id === recommendationId);
    
    if (index === -1) return null;

    recommendations[index] = { ...recommendations[index], ...updates };
    await AsyncStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recommendations));
    return recommendations[index];
  } catch (error) {
    console.error('Error updating recommendation:', error);
    throw error;
  }
};

export const sendRecommendation = async (recommendationId: string): Promise<void> => {
  await updateRecommendation(recommendationId, {
    status: 'sent',
    sentAt: new Date().toISOString(),
  });
};

// ============================================
// Stylist Notes
// ============================================

export const getNotes = async (): Promise<StylistNote[]> => {
  try {
    const notesData = await AsyncStorage.getItem(NOTES_KEY);
    return notesData ? JSON.parse(notesData) : [];
  } catch (error) {
    console.error('Error getting notes:', error);
    return [];
  }
};

export const getNotesByClient = async (clientId: string): Promise<StylistNote[]> => {
  const notes = await getNotes();
  return notes.filter(n => n.clientId === clientId);
};

export const createNote = async (
  noteData: Omit<StylistNote, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StylistNote> => {
  try {
    const notes = await getNotes();
    const newNote: StylistNote = {
      ...noteData,
      id: `note_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    notes.push(newNote);
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    return newNote;
  } catch (error) {
    console.error('Error creating note:', error);
    throw error;
  }
};

export const updateNote = async (
  noteId: string,
  updates: Partial<StylistNote>
): Promise<StylistNote | null> => {
  try {
    const notes = await getNotes();
    const index = notes.findIndex(n => n.id === noteId);
    
    if (index === -1) return null;

    notes[index] = {
      ...notes[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    return notes[index];
  } catch (error) {
    console.error('Error updating note:', error);
    throw error;
  }
};

export const deleteNote = async (noteId: string): Promise<void> => {
  try {
    const notes = await getNotes();
    const filtered = notes.filter(n => n.id !== noteId);
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting note:', error);
    throw error;
  }
};

// ============================================
// Statistics
// ============================================

export const getStylistStats = async (): Promise<StylistStats> => {
  try {
    const clients = await getClients();
    const appointments = await getAppointments();
    const recommendations = await getRecommendations();

    const activeClients = clients.filter(c => c.status === 'active').length;
    const upcomingAppointments = await getUpcomingAppointments();
    const completedSessions = appointments.filter(a => a.status === 'completed').length;
    const totalRevenue = appointments
      .filter(a => a.paid && a.fee)
      .reduce((sum, a) => sum + (a.fee || 0), 0);
    
    const recommendationsSent = recommendations.filter(
      r => r.status === 'sent' || r.status === 'viewed' || r.status === 'implemented'
    ).length;
    
    const recommendationsImplemented = recommendations.filter(
      r => r.status === 'implemented'
    ).length;

    return {
      totalClients: clients.length,
      activeClients,
      upcomingAppointments: upcomingAppointments.length,
      completedSessions,
      totalRevenue,
      recommendationsSent,
      recommendationsImplemented,
    };
  } catch (error) {
    console.error('Error getting stylist stats:', error);
    return {
      totalClients: 0,
      activeClients: 0,
      upcomingAppointments: 0,
      completedSessions: 0,
      totalRevenue: 0,
      recommendationsSent: 0,
      recommendationsImplemented: 0,
    };
  }
};

// ============================================
// Sample Data for Testing
// ============================================

export const loadSampleStylistData = async (): Promise<void> => {
  try {
    // Create sample stylist profile
    const sampleProfile: StylistProfile = {
      id: 'stylist_sample_001',
      accountType: 'stylist',
      name: 'Emma Rodriguez',
      email: 'emma@stylishyou.com',
      phone: '+1 (555) 123-4567',
      bio: 'Professional personal stylist with 8+ years of experience helping clients discover their unique style and build confidence through fashion.',
      specialties: ['Personal Shopping', 'Wardrobe Consultation', 'Event Styling', 'Color Analysis'],
      certifications: ['Certified Image Consultant', 'Personal Stylist Certification'],
      yearsExperience: 8,
      businessName: 'Stylish You Consulting',
      instagram: '@stylishyou_emma',
      pricing: {
        consultationFee: 150,
        hourlyRate: 200,
        packageRates: [
          { name: 'Wardrobe Refresh', price: 800, description: '3-hour wardrobe audit + shopping session' },
          { name: 'Complete Makeover', price: 1500, description: '6 sessions over 3 months' },
          { name: 'VIP Package', price: 3000, description: 'Unlimited styling for 6 months' },
        ],
      },
      availability: {
        daysAvailable: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        hoursAvailable: { start: '09:00', end: '18:00' },
      },
      rating: 4.9,
      totalClients: 3,
      joinedDate: new Date('2024-01-15').toISOString(),
      isActive: true,
    };

    await AsyncStorage.setItem(STYLIST_PROFILE_KEY, JSON.stringify(sampleProfile));
    await setAccountType('stylist');

    // Create sample clients
    const sampleClients: Client[] = [
      {
        id: 'client_001',
        stylistId: 'stylist_sample_001',
        name: 'Sarah Johnson',
        email: 'sarah.j@email.com',
        phone: '+1 (555) 234-5678',
        dateAdded: new Date('2024-02-01').toISOString(),
        lastSession: new Date('2024-02-05').toISOString(),
        totalSessions: 3,
        notes: 'Prefers classic, timeless pieces. Working professional transitioning to executive role.',
        preferences: {
          style: ['Classic', 'Business Professional', 'Minimalist'],
          colors: ['Navy', 'Black', 'White', 'Burgundy'],
          budget: { min: 100, max: 500 },
          sizes: { tops: 'M', bottoms: '8', shoes: '8', dresses: 'M' },
          bodyType: 'Hourglass',
          lifestyle: 'Corporate professional, occasional formal events',
        },
        goals: ['Build executive wardrobe', 'Develop signature style', 'Streamline closet'],
        wardrobeAccess: true,
        status: 'active',
      },
      {
        id: 'client_002',
        stylistId: 'stylist_sample_001',
        name: 'Michael Chen',
        email: 'mchen@email.com',
        phone: '+1 (555) 345-6789',
        dateAdded: new Date('2024-01-20').toISOString(),
        lastSession: new Date('2024-02-08').toISOString(),
        totalSessions: 5,
        notes: 'Tech entrepreneur. Wants to elevate casual style while staying comfortable.',
        preferences: {
          style: ['Smart Casual', 'Contemporary', 'Athleisure'],
          colors: ['Gray', 'Black', 'Olive', 'Denim'],
          budget: { min: 80, max: 400 },
          sizes: { tops: 'L', bottoms: '32', shoes: '10.5' },
          bodyType: 'Athletic',
          lifestyle: 'Startup founder, frequent travel, casual meetings',
        },
        goals: ['Upgrade casual wardrobe', 'Find versatile travel pieces', 'Develop personal brand'],
        wardrobeAccess: true,
        status: 'active',
      },
      {
        id: 'client_003',
        stylistId: 'stylist_sample_001',
        name: 'Jessica Martinez',
        email: 'jmartinez@email.com',
        phone: '+1 (555) 456-7890',
        dateAdded: new Date('2024-02-10').toISOString(),
        totalSessions: 1,
        notes: 'Recent college grad starting first professional job. Budget-conscious.',
        preferences: {
          style: ['Modern', 'Feminine', 'Business Casual'],
          colors: ['Blush', 'Navy', 'White', 'Camel'],
          budget: { min: 30, max: 150 },
          sizes: { tops: 'S', bottoms: '4', shoes: '7', dresses: 'S' },
          bodyType: 'Petite',
          lifestyle: 'Young professional, social events, active lifestyle',
        },
        goals: ['Build professional wardrobe on budget', 'Learn styling basics', 'Maximize existing pieces'],
        wardrobeAccess: true,
        status: 'active',
      },
    ];

    await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(sampleClients));

    // Create sample appointments
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const sampleAppointments: Appointment[] = [
      {
        id: 'appt_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        clientName: 'Sarah Johnson',
        type: 'wardrobe-audit',
        date: tomorrow.toISOString(),
        startTime: '10:00',
        endTime: '12:00',
        duration: 120,
        location: 'Client\'s home',
        isVirtual: false,
        status: 'confirmed',
        notes: 'Focus on work wardrobe organization',
        fee: 300,
        paid: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'appt_002',
        stylistId: 'stylist_sample_001',
        clientId: 'client_002',
        clientName: 'Michael Chen',
        type: 'shopping',
        date: nextWeek.toISOString(),
        startTime: '14:00',
        endTime: '17:00',
        duration: 180,
        location: 'Nordstrom - Downtown',
        isVirtual: false,
        status: 'scheduled',
        prepNotes: 'Focus on smart casual pieces for travel',
        fee: 400,
        paid: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(sampleAppointments));

    console.log('Sample stylist data loaded successfully');
  } catch (error) {
    console.error('Error loading sample stylist data:', error);
    throw error;
  }
};
