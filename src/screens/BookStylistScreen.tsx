import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../styles/theme';
import { createBookingRequest } from '../services/marketplaceService';
import { getCurrentClientAccount, createClientAccount } from '../services/marketplaceService';

const BookStylistScreen = ({ route, navigation }: any) => {
  const { stylistId, stylistName, consultationFee } = route.params;

  const [selectedService, setSelectedService] = useState('Wardrobe Consultation');
  const [preferredDate, setPreferredDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [message, setMessage] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const services = [
    'Wardrobe Consultation',
    'Personal Shopping',
    'Event Styling',
    'Color Analysis',
    'Closet Organization',
    'Virtual Styling Session',
  ];

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setPreferredDate(selectedDate);
    }
  };

  const validateForm = () => {
    if (!clientName.trim()) {
      Alert.alert('Required', 'Please enter your name');
      return false;
    }
    if (!clientEmail.trim()) {
      Alert.alert('Required', 'Please enter your email');
      return false;
    }
    if (!clientEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);

    try {
      // Check if client account exists, create if not
      let clientAccount = await getCurrentClientAccount();
      
      if (!clientAccount) {
        clientAccount = await createClientAccount({
          accountType: 'client',
          userId: 'user_sample_001', // This should come from auth
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
          preferences: {},
          goals: [],
          stylistHistory: [],
        });
      }

      // Create booking request
      await createBookingRequest({
        stylistId,
        clientId: clientAccount.id,
        clientName,
        clientEmail,
        clientPhone,
        requestedService: selectedService,
        preferredDate: preferredDate.toISOString(),
        message,
      });

      Alert.alert(
        'Request Sent!',
        `Your booking request has been sent to ${stylistName}. They will respond within 24-48 hours.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting booking:', error);
      Alert.alert('Error', 'Failed to submit booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Book Consultation</Text>
        <Text style={styles.subtitle}>with {stylistName}</Text>
      </View>

      {/* Service Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Select Service *</Text>
        <View style={styles.servicesContainer}>
          {services.map((service) => (
            <TouchableOpacity
              key={service}
              style={[
                styles.serviceChip,
                selectedService === service && styles.serviceChipActive,
              ]}
              onPress={() => setSelectedService(service)}
            >
              <Text
                style={[
                  styles.serviceChipText,
                  selectedService === service && styles.serviceChipTextActive,
                ]}
              >
                {service}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Preferred Date */}
      <View style={styles.section}>
        <Text style={styles.label}>Preferred Date *</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Icon name="calendar-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.dateButtonText}>
            {preferredDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={preferredDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
      </View>

      {/* Contact Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            value={clientName}
            onChangeText={setClientName}
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="your.email@example.com"
            value={clientEmail}
            onChangeText={setClientEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 123-4567"
            value={clientPhone}
            onChangeText={setClientPhone}
            keyboardType="phone-pad"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>
      </View>

      {/* Message */}
      <View style={styles.section}>
        <Text style={styles.label}>Message to Stylist (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Tell your stylist about your style goals, upcoming events, or any specific needs..."
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          placeholderTextColor={theme.colors.textSecondary}
        />
      </View>

      {/* Pricing Info */}
      <View style={styles.pricingCard}>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>Consultation Fee</Text>
          <Text style={styles.pricingValue}>${consultationFee}</Text>
        </View>
        <Text style={styles.pricingNote}>
          Payment will be processed after the stylist confirms your booking
        </Text>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Submitting...' : 'Send Booking Request'}
        </Text>
      </TouchableOpacity>

      {/* Terms */}
      <Text style={styles.terms}>
        By submitting this request, you agree to our Terms of Service and Privacy Policy.
        Your information will be shared with the stylist.
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  servicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  serviceChipActive: {
    backgroundColor: theme.colors.primary + '20',
    borderColor: theme.colors.primary,
  },
  serviceChipText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  serviceChipTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
  },
  dateButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 12,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  pricingCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pricingLabel: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  pricingValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  pricingNote: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  terms: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 32,
    lineHeight: 18,
  },
});

export default BookStylistScreen;
