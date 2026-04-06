/**
 * AddClientScreen — form to add a new client (stylist mode).
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';
import { Text } from '../ui';
import { addClient, getStylistProfile } from '../services/stylistService';

type Props = {
  navigation: any;
};

const AddClientScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [styles_, setStyles] = useState('');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a client name.');
      return;
    }
    try {
      setSaving(true);
      const profile = await getStylistProfile();
      await addClient({
        stylistId: profile?.id || 'stylist_sample_001',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        preferences: {
          style: styles_.trim() ? styles_.split(',').map(s => s.trim()) : [],
          budget: budget.trim()
            ? { min: 0, max: Number(budget) || 500 }
            : undefined,
        },
        goals: [],
        wardrobeAccess: false,
      });
      navigation.goBack();
    } catch (e) {
      console.error('Error adding client:', e);
      Alert.alert('Error', 'Failed to add client.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.colors.muted,
      color: theme.colors.text,
      borderRadius: theme.radius.lg,
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Add Client</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[
            styles.saveBtn,
            { backgroundColor: theme.colors.accent, borderRadius: theme.radius.lg, opacity: saving ? 0.5 : 1 },
          ]}
        >
          <Text variant="label" style={{ color: theme.colors.accentText }}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>
          Basic Info
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Full name *"
          placeholderTextColor={theme.colors.textSubtle}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={theme.colors.textSubtle}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={inputStyle}
          placeholder="Phone"
          placeholderTextColor={theme.colors.textSubtle}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 8 }}>
          Preferences
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Style preferences (comma separated)"
          placeholderTextColor={theme.colors.textSubtle}
          value={styles_}
          onChangeText={setStyles}
        />
        <TextInput
          style={inputStyle}
          placeholder="Budget range (max $)"
          placeholderTextColor={theme.colors.textSubtle}
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
        />

        <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 8 }}>
          Notes
        </Text>
        <TextInput
          style={[...inputStyle, { height: 100, textAlignVertical: 'top' }]}
          placeholder="Initial notes about this client..."
          placeholderTextColor={theme.colors.textSubtle}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
});

export default AddClientScreen;
