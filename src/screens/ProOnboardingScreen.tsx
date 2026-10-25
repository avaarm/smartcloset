/**
 * ProOnboardingScreen — the first-run question: how will this person use the app?
 *
 * Three plain choices. Roles are additive and can be added later from Settings > Professional, so there is no "a bit of
 * both". The screen only reports the choice; the launch gate marks the prompt done and keeps the intent in memory
 * (proEntry.ts) for Home to pick up. Nothing is created here and nothing is stored: a stylist profile or a connection
 * needs terms and is made from the sheets Home and Settings open.
 *
 * It is rendered outside the theme and navigation providers (like the screen it replaces), so it uses local styles
 * and no hooks from either.
 */

import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PRO_INDEPENDENT_LINE } from '../config/proRules';

export type ProOnboardingChoice = 'personal' | 'stylist' | 'client';

export type ProOnboardingScreenProps = {
  userName?: string;
  onComplete: (choice: ProOnboardingChoice) => void;
};

const GOLD = '#C4975A';
const BLACK = '#080604';
const SURFACE = '#0F0D0A';
const CREAM = '#F5EDE0';
const MUTED = 'rgba(245,237,224,0.45)';
const BORDER = 'rgba(196,151,90,0.25)';

type Choice = {
  choice: ProOnboardingChoice;
  title: string;
  description: string;
  icon: string;
};

const CHOICES: Choice[] = [
  {
    choice: 'personal',
    title: 'Just for me',
    description: 'Your closet, outfits and wishlist.',
    icon: 'shirt-outline',
  },
  {
    choice: 'stylist',
    title: "I'm a stylist",
    description: "Work with clients. You'll set up a short profile.",
    icon: 'briefcase-outline',
  },
  {
    choice: 'client',
    title: 'I work with a stylist',
    description: "You'll need a code from your stylist.",
    icon: 'people-outline',
  },
];

export const PRO_ONBOARDING_FOOTER = `You can change this any time in Settings > Professional. ${PRO_INDEPENDENT_LINE}`;

const firstName = (name?: string): string => (typeof name === 'string' ? name.trim().split(/\s+/)[0] : '');

export const ProOnboardingScreen: React.FC<ProOnboardingScreenProps> = ({ userName, onComplete }) => {
  const first = firstName(userName);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Welcome to SmartCloset</Text>
          <Text style={styles.title}>How will you{'\n'}use the app?</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>
            {`${first ? `Hi ${first}. ` : ''}Pick what fits today. You can add the rest later.`}
          </Text>
        </View>

        <View style={styles.choices}>
          {CHOICES.map(c => (
            <TouchableOpacity
              key={c.choice}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => onComplete(c.choice)}
              accessibilityRole="button"
              accessibilityLabel={c.title}
              accessibilityHint={c.description}
            >
              <View style={styles.cardIcon}>
                <Icon name={c.icon} size={22} color={GOLD} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{c.title}</Text>
                <Text style={styles.cardDescription}>{c.description}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.footer}>{PRO_ONBOARDING_FOOTER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK,
  },
  content: {
    paddingBottom: 32,
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
  footer: {
    marginTop: 28,
    paddingHorizontal: 24,
    fontSize: 12,
    color: MUTED,
    lineHeight: 17,
  },
});

export default ProOnboardingScreen;
