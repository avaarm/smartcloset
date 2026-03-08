import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { createAppointment, getClients } from '../services/stylistService';
import { Client } from '../types/stylist';
import theme from '../styles/theme';

type CreateAppointmentScreenProps = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ params: { clientId?: string; clientName?: string } }, 'params'>;
};

const APPOINTMENT_TYPES = [
  { value: 'consultation', label: 'Consultation', icon: 'chatbubbles-outline', duration: 60 },
  { value: 'shopping', label: 'Personal Shopping', icon: 'cart-outline', duration: 180 },
  { value: 'wardrobe-audit', label: 'Wardrobe Audit', icon: 'file-tray-full-outline', duration: 120 },
  { value: 'styling-session', label: 'Styling Session', icon: 'color-palette-outline', duration: 90 },
  { value: 'virtual', label: 'Virtual Session', icon: 'videocam-outline', duration: 60 },
  { value: 'follow-up', label: 'Follow-up', icon: 'refresh-outline', duration: 30 },
];

const CreateAppointmentScreen = ({ navigation, route }: CreateAppointmentScreenProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [appointmentType, setAppointmentType] = useState<string>('consultation');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [isVirtual, setIsVirtual] = useState(false);
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [fee, setFee] = useState('');
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [prepNotes, setPrepNotes] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);

  useEffect(() => {
    loadClients();
    
    // Pre-select client if provided
    if (route.params?.clientId) {
      const preSelectedClient = {
        id: route.params.clientId,
        name: route.params.clientName || '',
      } as Client;
      setSelectedClient(preSelectedClient);
    }
  }, []);

  const loadClients = async () => {
    const allClients = await getClients();
    setClients(allClients.filter(c => c.status === 'active'));
  };

  const handleTypeSelect = (type: string) => {
    setAppointmentType(type);
    const selectedType = APPOINTMENT_TYPES.find(t => t.value === type);
    if (selectedType) {
      setDuration(selectedType.duration);
    }
  };

  const calculateEndTime = (start: string, durationMinutes: number) => {
    const [hours, minutes] = start.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  };

  const handleCreate = async () => {
    if (!selectedClient) {
      Alert.alert('Error', 'Please select a client');
      return;
    }

    if (!date || !startTime) {
      Alert.alert('Error', 'Please select date and time');
      return;
    }

    if (!isVirtual && !location) {
      Alert.alert('Error', 'Please enter a location or mark as virtual');
      return;
    }

    if (isVirtual && !meetingLink) {
      Alert.alert('Error', 'Please enter a meeting link for virtual appointments');
      return;
    }

    try {
      const endTime = calculateEndTime(startTime, duration);
      const stylistId = 'stylist_sample_001'; // In production, get from auth context

      await createAppointment({
        stylistId,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        type: appointmentType as any,
        date: new Date(date).toISOString(),
        startTime,
        endTime,
        duration,
        location: isVirtual ? undefined : location,
        isVirtual,
        meetingLink: isVirtual ? meetingLink : undefined,
        status: 'scheduled',
        notes,
        prepNotes,
        fee: fee ? parseFloat(fee) : undefined,
        paid,
      });

      Alert.alert('Success', 'Appointment created successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to create appointment');
      console.error('Error creating appointment:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Appointment</Text>
        <TouchableOpacity onPress={handleCreate}>
          <Text style={styles.saveButton}>Create</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Client Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Client *</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowClientPicker(!showClientPicker)}
          >
            <Text style={selectedClient ? styles.selectButtonText : styles.selectButtonPlaceholder}>
              {selectedClient ? selectedClient.name : 'Select a client'}
            </Text>
            <Icon name="chevron-down" size={20} color={theme.colors.mediumGray} />
          </TouchableOpacity>

          {showClientPicker && (
            <View style={styles.pickerContainer}>
              {clients.map(client => (
                <TouchableOpacity
                  key={client.id}
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedClient(client);
                    setShowClientPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{client.name}</Text>
                  {selectedClient?.id === client.id && (
                    <Icon name="checkmark" size={20} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Appointment Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Appointment Type *</Text>
          <View style={styles.typeGrid}>
            {APPOINTMENT_TYPES.map(type => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typeCard,
                  appointmentType === type.value && styles.typeCardActive,
                ]}
                onPress={() => handleTypeSelect(type.value)}
              >
                <Icon
                  name={type.icon}
                  size={24}
                  color={appointmentType === type.value ? theme.colors.primary : theme.colors.mediumGray}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    appointmentType === type.value && styles.typeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date and Time */}
        <View style={styles.section}>
          <Text style={styles.label}>Date & Time *</Text>
          <View style={styles.row}>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Date</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Start Time</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="HH:MM"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <Text style={styles.label}>Duration (minutes)</Text>
          <View style={styles.durationButtons}>
            {[30, 60, 90, 120, 180].map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.durationButton,
                  duration === mins && styles.durationButtonActive,
                ]}
                onPress={() => setDuration(mins)}
              >
                <Text
                  style={[
                    styles.durationButtonText,
                    duration === mins && styles.durationButtonTextActive,
                  ]}
                >
                  {mins}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helperText}>
            End time: {calculateEndTime(startTime, duration)}
          </Text>
        </View>

        {/* Virtual Toggle */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Icon name="videocam-outline" size={20} color={theme.colors.text} />
              <Text style={styles.label}>Virtual Appointment</Text>
            </View>
            <Switch
              value={isVirtual}
              onValueChange={setIsVirtual}
              trackColor={{ false: '#D1D5DB', true: '#C4B5FD' }}
              thumbColor={isVirtual ? theme.colors.primary : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Location or Meeting Link */}
        {isVirtual ? (
          <View style={styles.section}>
            <Text style={styles.label}>Meeting Link *</Text>
            <TextInput
              style={styles.input}
              value={meetingLink}
              onChangeText={setMeetingLink}
              placeholder="https://zoom.us/j/..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.label}>Location *</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Enter location"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        )}

        {/* Fee */}
        <View style={styles.section}>
          <Text style={styles.label}>Fee</Text>
          <View style={styles.row}>
            <View style={styles.inputHalf}>
              <TextInput
                style={styles.input}
                value={fee}
                onChangeText={setFee}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.switchRowInline}>
              <Text style={styles.switchLabelText}>Paid</Text>
              <Switch
                value={paid}
                onValueChange={setPaid}
                trackColor={{ false: '#D1D5DB', true: '#C4B5FD' }}
                thumbColor={paid ? theme.colors.primary : '#f4f3f4'}
              />
            </View>
          </View>
        </View>

        {/* Prep Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Prep Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={prepNotes}
            onChangeText={setPrepNotes}
            placeholder="Notes to prepare for this appointment..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.mediumGray,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectButtonText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  selectButtonPlaceholder: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 200,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  typeCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F3F0FF',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  typeLabelActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  durationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  durationButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  durationButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  durationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.mediumGray,
  },
  durationButtonTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    marginTop: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchRowInline: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  switchLabelText: {
    fontSize: 16,
    color: theme.colors.text,
  },
});

export default CreateAppointmentScreen;
