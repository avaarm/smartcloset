import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

/** Get the stylist_profiles.id for the current user (cached after first lookup). */
let _cachedStylistId: string | null = null;
const getStylistProfileId = async (): Promise<string | null> => {
  if (_cachedStylistId) return _cachedStylistId;
  const userId = await getAuthUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from('stylist_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (data) _cachedStylistId = data.id;
  return data?.id ?? null;
};

// ============================================
// Account Type Management (always local)
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
// DB ↔ App mappers
// ============================================

const mapDbToProfile = (row: any): StylistProfile => ({
  id: row.id,
  accountType: 'stylist',
  name: row.name,
  email: row.email,
  phone: row.phone,
  bio: row.bio,
  specialties: row.specialties || [],
  certifications: row.certifications || [],
  yearsExperience: row.years_experience,
  profileImage: row.profile_image,
  businessName: row.business_name,
  website: row.website,
  instagram: row.instagram,
  pricing: row.pricing || {},
  availability: row.availability || {},
  rating: row.rating ? Number(row.rating) : undefined,
  totalClients: row.total_clients || 0,
  joinedDate: row.joined_date || row.created_at,
  isActive: row.is_active ?? true,
});

const mapDbToClient = (row: any): Client => ({
  id: row.id,
  stylistId: row.stylist_id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  profileImage: row.profile_image,
  dateAdded: row.date_added || row.created_at,
  lastSession: row.last_session,
  totalSessions: row.total_sessions || 0,
  notes: row.notes,
  preferences: row.preferences || {},
  goals: row.goals || [],
  wardrobeAccess: row.wardrobe_access ?? false,
  status: row.status || 'active',
});

const mapDbToAppointment = (row: any): Appointment => ({
  id: row.id,
  stylistId: row.stylist_id,
  clientId: row.client_id,
  clientName: row.client_name,
  type: row.type,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  duration: row.duration,
  location: row.location,
  isVirtual: row.is_virtual ?? false,
  meetingLink: row.meeting_link,
  status: row.status || 'scheduled',
  notes: row.notes,
  prepNotes: row.prep_notes,
  fee: row.fee ? Number(row.fee) : undefined,
  paid: row.paid ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapDbToRecommendation = (row: any): StylingRecommendation => ({
  id: row.id,
  stylistId: row.stylist_id,
  clientId: row.client_id,
  title: row.title,
  description: row.description,
  category: row.category || 'style-guide',
  items: row.items || [],
  suggestedPurchases: row.suggested_purchases || [],
  images: row.images || [],
  occasion: row.occasion,
  season: row.season || [],
  notes: row.notes,
  status: row.status || 'draft',
  createdAt: row.created_at,
  sentAt: row.sent_at,
  viewedAt: row.viewed_at,
  clientFeedback: row.client_feedback,
});

// ============================================
// Stylist Profile Management
// ============================================

export const getStylistProfile = async (): Promise<StylistProfile | null> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const data = await AsyncStorage.getItem(STYLIST_PROFILE_KEY);
      return data ? JSON.parse(data) : null;
    }
    const { data, error } = await supabase
      .from('stylist_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return mapDbToProfile(data);
  } catch (error) {
    console.error('Error getting stylist profile:', error);
    return null;
  }
};

export const createStylistProfile = async (
  profile: Omit<StylistProfile, 'id' | 'joinedDate' | 'totalClients' | 'isActive'>
): Promise<StylistProfile> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
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
    }

    const { data, error } = await supabase
      .from('stylist_profiles')
      .insert({
        user_id: userId,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        bio: profile.bio,
        specialties: profile.specialties || [],
        certifications: profile.certifications || [],
        years_experience: profile.yearsExperience || 0,
        profile_image: profile.profileImage,
        business_name: profile.businessName,
        website: profile.website,
        instagram: profile.instagram,
        pricing: profile.pricing || {},
        availability: profile.availability || {},
      })
      .select()
      .single();
    if (error) throw error;
    _cachedStylistId = data.id;
    await setAccountType('stylist');
    return mapDbToProfile(data);
  } catch (error) {
    console.error('Error creating stylist profile:', error);
    throw error;
  }
};

export const updateStylistProfile = async (
  updates: Partial<StylistProfile>
): Promise<StylistProfile | null> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const current = await getStylistProfile();
      if (!current) return null;
      const updated = { ...current, ...updates };
      await AsyncStorage.setItem(STYLIST_PROFILE_KEY, JSON.stringify(updated));
      return updated;
    }

    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.specialties !== undefined) dbUpdates.specialties = updates.specialties;
    if (updates.certifications !== undefined) dbUpdates.certifications = updates.certifications;
    if (updates.yearsExperience !== undefined) dbUpdates.years_experience = updates.yearsExperience;
    if (updates.profileImage !== undefined) dbUpdates.profile_image = updates.profileImage;
    if (updates.businessName !== undefined) dbUpdates.business_name = updates.businessName;
    if (updates.pricing !== undefined) dbUpdates.pricing = updates.pricing;
    if (updates.availability !== undefined) dbUpdates.availability = updates.availability;
    if (updates.totalClients !== undefined) dbUpdates.total_clients = updates.totalClients;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('stylist_profiles')
      .update(dbUpdates)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data ? mapDbToProfile(data) : null;
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
    const userId = await getAuthUserId();
    if (!userId) {
      const data = await AsyncStorage.getItem(CLIENTS_KEY);
      return data ? JSON.parse(data) : [];
    }
    const stylistId = await getStylistProfileId();
    if (!stylistId) return [];
    const { data, error } = await supabase
      .from('stylist_clients')
      .select('*')
      .eq('stylist_id', stylistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDbToClient);
  } catch (error) {
    console.error('Error getting clients:', error);
    return [];
  }
};

export const getClientById = async (clientId: string): Promise<Client | null> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const clients = await getClients();
      return clients.find(c => c.id === clientId) || null;
    }
    const { data, error } = await supabase
      .from('stylist_clients')
      .select('*')
      .eq('id', clientId)
      .single();
    if (error || !data) return null;
    return mapDbToClient(data);
  } catch (error) {
    console.error('Error getting client:', error);
    return null;
  }
};

export const addClient = async (
  clientData: Omit<Client, 'id' | 'dateAdded' | 'totalSessions' | 'status'>
): Promise<Client> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
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
      const profile = await getStylistProfile();
      if (profile) {
        await updateStylistProfile({ totalClients: (profile.totalClients || 0) + 1 });
      }
      return newClient;
    }

    const stylistId = await getStylistProfileId();
    if (!stylistId) throw new Error('No stylist profile found');

    const { data, error } = await supabase
      .from('stylist_clients')
      .insert({
        stylist_id: stylistId,
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone,
        profile_image: clientData.profileImage,
        notes: clientData.notes,
        preferences: clientData.preferences || {},
        goals: clientData.goals || [],
        wardrobe_access: clientData.wardrobeAccess || false,
      })
      .select()
      .single();
    if (error) throw error;
    return mapDbToClient(data);
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
    const userId = await getAuthUserId();
    if (!userId) {
      const clients = await getClients();
      const index = clients.findIndex(c => c.id === clientId);
      if (index === -1) return null;
      clients[index] = { ...clients[index], ...updates };
      await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
      return clients[index];
    }

    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.preferences !== undefined) dbUpdates.preferences = updates.preferences;
    if (updates.goals !== undefined) dbUpdates.goals = updates.goals;
    if (updates.wardrobeAccess !== undefined) dbUpdates.wardrobe_access = updates.wardrobeAccess;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.lastSession !== undefined) dbUpdates.last_session = updates.lastSession;
    if (updates.totalSessions !== undefined) dbUpdates.total_sessions = updates.totalSessions;

    const { data, error } = await supabase
      .from('stylist_clients')
      .update(dbUpdates)
      .eq('id', clientId)
      .select()
      .single();
    if (error) throw error;
    return data ? mapDbToClient(data) : null;
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
};

export const deleteClient = async (clientId: string): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const clients = await getClients();
      const filtered = clients.filter(c => c.id !== clientId);
      await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(filtered));
      return;
    }
    const { error } = await supabase.from('stylist_clients').delete().eq('id', clientId);
    if (error) throw error;
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
    const userId = await getAuthUserId();
    if (!userId) {
      const data = await AsyncStorage.getItem(APPOINTMENTS_KEY);
      return data ? JSON.parse(data) : [];
    }
    const stylistId = await getStylistProfileId();
    if (!stylistId) return [];
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('stylist_id', stylistId)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapDbToAppointment);
  } catch (error) {
    console.error('Error getting appointments:', error);
    return [];
  }
};

export const getAppointmentsByClient = async (clientId: string): Promise<Appointment[]> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const appointments = await getAppointments();
      return appointments.filter(a => a.clientId === clientId);
    }
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapDbToAppointment);
  } catch (error) {
    console.error('Error getting appointments by client:', error);
    return [];
  }
};

export const getUpcomingAppointments = async (): Promise<Appointment[]> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const appointments = await getAppointments();
      const now = new Date();
      return appointments
        .filter(a => new Date(a.date) >= now && a.status === 'scheduled')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    const stylistId = await getStylistProfileId();
    if (!stylistId) return [];
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('stylist_id', stylistId)
      .gte('date', today)
      .in('status', ['scheduled', 'confirmed'])
      .order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapDbToAppointment);
  } catch (error) {
    console.error('Error getting upcoming appointments:', error);
    return [];
  }
};

export const createAppointment = async (
  appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Appointment> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
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
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        stylist_id: appointmentData.stylistId,
        client_id: appointmentData.clientId,
        client_name: appointmentData.clientName,
        type: appointmentData.type,
        date: appointmentData.date,
        start_time: appointmentData.startTime,
        end_time: appointmentData.endTime,
        duration: appointmentData.duration,
        location: appointmentData.location,
        is_virtual: appointmentData.isVirtual || false,
        meeting_link: appointmentData.meetingLink,
        status: appointmentData.status || 'scheduled',
        notes: appointmentData.notes,
        prep_notes: appointmentData.prepNotes,
        fee: appointmentData.fee,
        paid: appointmentData.paid || false,
      })
      .select()
      .single();
    if (error) throw error;
    return mapDbToAppointment(data);
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
    const userId = await getAuthUserId();
    if (!userId) {
      const appointments = await getAppointments();
      const index = appointments.findIndex(a => a.id === appointmentId);
      if (index === -1) return null;
      appointments[index] = { ...appointments[index], ...updates, updatedAt: new Date().toISOString() };
      await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments));
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
    }

    const dbUpdates: any = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.prepNotes !== undefined) dbUpdates.prep_notes = updates.prepNotes;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.paid !== undefined) dbUpdates.paid = updates.paid;
    if (updates.fee !== undefined) dbUpdates.fee = updates.fee;

    const { data, error } = await supabase
      .from('appointments')
      .update(dbUpdates)
      .eq('id', appointmentId)
      .select()
      .single();
    if (error) throw error;

    if (updates.status === 'completed' && data) {
      const client = await getClientById(data.client_id);
      if (client) {
        await updateClient(client.id, {
          lastSession: data.date,
          totalSessions: (client.totalSessions || 0) + 1,
        });
      }
    }

    return data ? mapDbToAppointment(data) : null;
  } catch (error) {
    console.error('Error updating appointment:', error);
    throw error;
  }
};

export const deleteAppointment = async (appointmentId: string): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const appointments = await getAppointments();
      await AsyncStorage.setItem(
        APPOINTMENTS_KEY,
        JSON.stringify(appointments.filter(a => a.id !== appointmentId)),
      );
      return;
    }
    const { error } = await supabase.from('appointments').delete().eq('id', appointmentId);
    if (error) throw error;
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
    const userId = await getAuthUserId();
    if (!userId) {
      const data = await AsyncStorage.getItem(RECOMMENDATIONS_KEY);
      return data ? JSON.parse(data) : [];
    }
    const stylistId = await getStylistProfileId();
    if (!stylistId) return [];
    const { data, error } = await supabase
      .from('recommendations')
      .select('*')
      .eq('stylist_id', stylistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDbToRecommendation);
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
};

export const getRecommendationsByClient = async (
  clientId: string
): Promise<StylingRecommendation[]> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const recs = await getRecommendations();
      return recs.filter(r => r.clientId === clientId);
    }
    const { data, error } = await supabase
      .from('recommendations')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDbToRecommendation);
  } catch (error) {
    console.error('Error getting recommendations by client:', error);
    return [];
  }
};

export const createRecommendation = async (
  recData: Omit<StylingRecommendation, 'id' | 'createdAt' | 'status'>
): Promise<StylingRecommendation> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      const recs = await getRecommendations();
      const newRec: StylingRecommendation = {
        ...recData,
        id: `rec_${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'draft',
      };
      recs.push(newRec);
      await AsyncStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recs));
      return newRec;
    }

    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        stylist_id: recData.stylistId,
        client_id: recData.clientId,
        title: recData.title,
        description: recData.description,
        category: recData.category || 'style-guide',
        items: recData.items || [],
        suggested_purchases: recData.suggestedPurchases || [],
        images: recData.images || [],
        occasion: recData.occasion,
        season: recData.season || [],
        notes: recData.notes,
      })
      .select()
      .single();
    if (error) throw error;
    return mapDbToRecommendation(data);
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
    const userId = await getAuthUserId();
    if (!userId) {
      const recs = await getRecommendations();
      const index = recs.findIndex(r => r.id === recommendationId);
      if (index === -1) return null;
      recs[index] = { ...recs[index], ...updates };
      await AsyncStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recs));
      return recs[index];
    }

    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.sentAt !== undefined) dbUpdates.sent_at = updates.sentAt;
    if (updates.viewedAt !== undefined) dbUpdates.viewed_at = updates.viewedAt;
    if (updates.clientFeedback !== undefined) dbUpdates.client_feedback = updates.clientFeedback;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

    const { data, error } = await supabase
      .from('recommendations')
      .update(dbUpdates)
      .eq('id', recommendationId)
      .select()
      .single();
    if (error) throw error;
    return data ? mapDbToRecommendation(data) : null;
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
// Stylist Notes (kept local — lightweight data)
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
    notes[index] = { ...notes[index], ...updates, updatedAt: new Date().toISOString() };
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
    await AsyncStorage.setItem(
      NOTES_KEY,
      JSON.stringify(notes.filter(n => n.id !== noteId)),
    );
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
// Sample Data for Testing (guest mode only)
// ============================================

export const loadSampleStylistData = async (): Promise<void> => {
  try {
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
        location: "Client's home",
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
