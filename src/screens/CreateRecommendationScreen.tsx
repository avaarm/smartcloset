/**
 * CreateRecommendationScreen — form to create a new styling recommendation.
 */

import React, { useState, useEffect } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../styles/ThemeProvider';
import { Text } from '../ui';
import {
  getClients,
  getStylistProfile,
  createRecommendation,
} from '../services/stylistService';

type Props = { navigation: any };

const CATEGORIES = [
  { label: 'Outfit', value: 'outfit' },
  { label: 'Purchase', value: 'purchase' },
  { label: 'Wardrobe Tip', value: 'wardrobe-tip' },
  { label: 'Color Palette', value: 'color-palette' },
  { label: 'Style Guide', value: 'style-guide' },
];

const CreateRecommendationScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('outfit');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await getClients();
      setClients(list);
      if (list.length > 0) setSelectedClientId(list[0].id);
    })();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if (!selectedClientId) {
      Alert.alert('Required', 'Please select a client.');
      return;
    }
    try {
      setSaving(true);
      const profile = await getStylistProfile();
      await createRecommendation({
        stylistId: profile?.id || 'stylist_sample_001',
        clientId: selectedClientId,
        title: title.trim(),
        description: description.trim(),
        category: category as any,
        notes: notes.trim() || undefined,
      });
      navigation.goBack();
    } catch (e) {
      console.error('Error creating recommendation:', e);
      Alert.alert('Error', 'Failed to create recommendation.');
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
        <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>New Recommendation</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[
            styles.saveBtn,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.lg,
              opacity: saving ? 0.5 : 1,
            },
          ]}
        >
          <Text variant="label" style={{ color: theme.colors.accentText }}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>
          Client
        </Text>
        <View style={[styles.pickerWrap, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
          <Picker
            selectedValue={selectedClientId}
            onValueChange={v => setSelectedClientId(v)}
            style={{ color: theme.colors.text }}
          >
            {clients.map(c => (
              <Picker.Item key={c.id} label={c.name} value={c.id} />
            ))}
          </Picker>
        </View>

        <Text variant="overline" color="muted" style={{ marginTop: 16, marginBottom: 8 }}>
          Category
        </Text>
        <View style={[styles.pickerWrap, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
          <Picker
            selectedValue={category}
            onValueChange={v => setCategory(v)}
            style={{ color: theme.colors.text }}
          >
            {CATEGORIES.map(c => (
              <Picker.Item key={c.value} label={c.label} value={c.value} />
            ))}
          </Picker>
        </View>

        <Text variant="overline" color="muted" style={{ marginTop: 16, marginBottom: 8 }}>
          Details
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Title *"
          placeholderTextColor={theme.colors.textSubtle}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[...inputStyle, { height: 100, textAlignVertical: 'top' }]}
          placeholder="Description"
          placeholderTextColor={theme.colors.textSubtle}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <TextInput
          style={[...inputStyle, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Notes (optional)"
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
  pickerWrap: {
    overflow: 'hidden',
    marginBottom: 4,
  },
});

export default CreateRecommendationScreen;
