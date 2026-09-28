import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { AccountType } from '../types/stylist';
import { setCurrentMode, addAvailableMode } from '../services/accountService';
import { createStylistProfile } from '../services/stylistService';
import { supabase } from '../config/supabase';

const GOLD = '#C4975A';
const BLACK = '#080604';
const SURFACE = '#0F0D0A';
const CREAM = '#F5EDE0';
const MUTED = 'rgba(245,237,224,0.45)';
const BORDER = 'rgba(196,151,90,0.25)';
const BORDER_ACTIVE = '#C4975A';

type Choice = {
  mode: AccountType | 'multi';
  title: string;
  description: string;
  icon: string;
};

const CHOICES: Choice[] = [
  {
    mode: 'user',
    title: 'Just for Me',
    description: 'Organize and style your own wardrobe',
    icon: 'shirt-outline',
  },
  {
    mode: 'stylist',
    title: "I'm a Stylist",
    description: 'Manage clients and grow your styling business',
    icon: 'briefcase-outline',
  },
  {
    mode: 'client',
    title: "I'm a Client",
    description: 'Work with a professional stylist',
    icon: 'people-outline',
  },
  {
    mode: 'multi',
    title: 'A Bit of Both',
    description: 'Switch between personal and professional anytime',
    icon: 'layers-outline',
  },
];

type Props = {
  userName?: string;
  userEmail: string;
  onComplete: () => void;
};

const AccountTypeOnboardingScreen: React.FC<Props> = ({ userName, userEmail, onComplete }) => {
  const [busyMode, setBusyMode] = useState<string | null>(null);

  const handleChoose = async (choice: Choice) => {
    if (busyMode) return;
    setBusyMode(choice.mode);
    try {
      if (choice.mode === 'multi') {
        await setCurrentMode('user');
        await addAvailableMode('stylist');
        await addAvailableMode('client');
      } else if (choice.mode === 'stylist') {
        await addAvailableMode('stylist');
        await setCurrentMode('stylist');
        // Seed a minimal stylist profile so the dashboard has real data to
        // query instead of silently showing zeros forever; the user can
        // fill in business details later from their profile.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await createStylistProfile({
            accountType: 'stylist',
            name: userName || userEmail.split('@')[0],
            email: userEmail,
            specialties: [],
          } as any);
          void session;
        } catch (profileError) {
          // Non-fatal: the dashboard still renders with an empty state if
          // profile creation fails (e.g. offline); mode switch already stuck.
          console.error('Error seeding stylist profile:', profileError);
        }
      } else {
        await addAvailableMode(choice.mode as AccountType);
        await setCurrentMode(choice.mode as AccountType);
      }
      onComplete();
    } catch (error: any) {
      Alert.alert('Something went wrong', error?.message || 'Please try again.');
      setBusyMode(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>WELCOME TO SMART CLOSET</Text>
        <Text style={styles.title}>How will you{'\n'}use the app?</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>
          You can always switch modes later in Settings.
        </Text>
      </View>

      <View style={styles.choices}>
        {CHOICES.map(choice => {
          const isBusy = busyMode === choice.mode;
          return (
            <TouchableOpacity
              key={choice.mode}
              style={[styles.card, isBusy && styles.cardActive]}
              activeOpacity={0.85}
              disabled={!!busyMode}
              onPress={() => handleChoose(choice)}
              accessibilityRole="button"
              accessibilityLabel={choice.title}
            >
              <View style={styles.cardIcon}>
                {isBusy ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <Icon name={choice.icon} size={22} color={GOLD} />
                )}
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{choice.title}</Text>
                <Text style={styles.cardDescription}>{choice.description}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={MUTED} />
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  title: {
    fontSize: 34,
    fontWeight: '300',
    color: CREAM,
    lineHeight: 40,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: GOLD,
    marginTop: 20,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
  },
  choices: {
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  cardActive: {
    borderColor: BORDER_ACTIVE,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(196,151,90,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: CREAM,
    marginBottom: 3,
  },
  cardDescription: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
});

export default AccountTypeOnboardingScreen;
