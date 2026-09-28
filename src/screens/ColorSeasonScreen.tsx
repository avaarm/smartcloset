/**
 * ColorSeasonScreen — 12-season color analysis questionnaire.
 *
 * Walks the user through skin tone → undertone → hair → eye color
 * and returns a season (e.g. "Soft Summer") with a curated palette
 * of colors to wear + to avoid. Result stored in AsyncStorage.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';

export const COLOR_SEASON_KEY = '@smartcloset_color_season';

export type ColorSeason =
  | 'True Spring' | 'Light Spring' | 'Warm Spring'
  | 'True Summer' | 'Light Summer' | 'Soft Summer'
  | 'True Autumn' | 'Warm Autumn' | 'Deep Autumn'
  | 'True Winter' | 'Deep Winter' | 'Bright Winter';

export interface ColorSeasonResult {
  season: ColorSeason;
  palette: string[];   // hex colors to wear
  avoid: string[];     // hex colors to avoid
  description: string;
  savedAt: string;
}

// ─── Quiz questions ──────────────────────────────────────────────────────────

interface Question {
  id: string;
  prompt: string;
  options: { label: string; value: string; swatch?: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: 'tone',
    prompt: 'What is your natural skin tone?',
    options: [
      { label: 'Fair', value: 'fair', swatch: '#FDEBD0' },
      { label: 'Light', value: 'light', swatch: '#F5CBA7' },
      { label: 'Medium', value: 'medium', swatch: '#E59866' },
      { label: 'Tan / Olive', value: 'tan', swatch: '#CA8A04' },
      { label: 'Deep', value: 'deep', swatch: '#7B341E' },
    ],
  },
  {
    id: 'undertone',
    prompt: 'What is your skin undertone?',
    options: [
      { label: 'Cool (pink / rosy / blue)', value: 'cool', swatch: '#C084FC' },
      { label: 'Warm (yellow / peachy / golden)', value: 'warm', swatch: '#FBBF24' },
      { label: 'Neutral (a mix of both)', value: 'neutral', swatch: '#A8A29E' },
    ],
  },
  {
    id: 'hair',
    prompt: 'What is your natural hair color?',
    options: [
      { label: 'Platinum / Ash blonde', value: 'ash_blonde', swatch: '#E8E0D0' },
      { label: 'Golden / Honey blonde', value: 'golden_blonde', swatch: '#D4A017' },
      { label: 'Light to medium brown', value: 'light_brown', swatch: '#92400E' },
      { label: 'Dark / Deep brown', value: 'dark_brown', swatch: '#44231E' },
      { label: 'Black', value: 'black', swatch: '#1C1C1C' },
      { label: 'Red / Auburn', value: 'red', swatch: '#B45309' },
      { label: 'White / Silver', value: 'silver', swatch: '#D1D5DB' },
    ],
  },
  {
    id: 'eyes',
    prompt: 'What is your natural eye color?',
    options: [
      { label: 'Blue', value: 'blue', swatch: '#3B82F6' },
      { label: 'Green', value: 'green', swatch: '#22C55E' },
      { label: 'Hazel', value: 'hazel', swatch: '#78716C' },
      { label: 'Light brown', value: 'light_brown', swatch: '#B45309' },
      { label: 'Dark brown / Black', value: 'dark_brown', swatch: '#3B1F0E' },
      { label: 'Gray / Blue-gray', value: 'gray', swatch: '#6B7280' },
    ],
  },
];

// ─── Season determination ────────────────────────────────────────────────────

type Answers = Record<string, string>;

const SEASON_DATA: Record<ColorSeason, { palette: string[]; avoid: string[]; description: string }> = {
  'True Spring': {
    palette: ['#F6A21E', '#FF8552', '#4CAF7D', '#2EC4B6', '#FFCB47', '#E8752C', '#8BC34A', '#F3D7A8'],
    avoid: ['#111111', '#5C1F5C', '#9A9A9A', '#3A2E6E'],
    description: 'Warm, bright, and clear. You glow in marigold, coral, clear green, and turquoise.',
  },
  'Light Spring': {
    palette: ['#FFD7BA', '#A8DADC', '#FDF1DC', '#FF9F80', '#FCE38A', '#B5E5B8', '#F4A896', '#FFEAA7'],
    avoid: ['#111111', '#3A2E6E', '#6E2A2A'],
    description: 'Delicate and warm. Peach, light aqua, buttery yellow, and soft coral are your best.',
  },
  'Warm Spring': {
    palette: ['#C97C3D', '#D9662B', '#7C8B3F', '#B5651D', '#E4572E', '#D6A419', '#8A9A5B', '#F2A65A'],
    avoid: ['#A9A9A9', '#1E2A5C', '#3A2E6E'],
    description: 'Rich, golden warmth. Camel, terracotta, mustard, and earthy olive suit you perfectly.',
  },
  'True Summer': {
    palette: ['#C98CA7', '#A9C4D6', '#9B7E9E', '#C3B4D6', '#6E7F9E', '#9CAF88', '#D9B8C4', '#7C93A8'],
    avoid: ['#D9662B', '#7A4A2E', '#D6A419'],
    description: 'Cool and muted. Dusty rose, powder blue, mauve, and sage make you shine.',
  },
  'Light Summer': {
    palette: ['#F6C6D0', '#BFD9E8', '#D6D6D6', '#B9C4E0', '#E8C4CE', '#CBB8D8', '#EDEDED', '#A8C0CC'],
    avoid: ['#7A4A2E', '#D9662B', '#2E4A2E'],
    description: 'Soft, light, and cool. Powder pink, icy blue, periwinkle, and misty lilac are barely-there and beautiful.',
  },
  'Soft Summer': {
    palette: ['#8CA3B5', '#B9AFA3', '#B98CA0', '#8FA894', '#8E7387', '#B7B0A8', '#A9BBC4', '#C4A9B0'],
    avoid: ['#D6A419', '#C1401E', '#C21E6E'],
    description: 'Muted and cool. Dusty blue, mushroom, mauve rose, and sage are your calling card.',
  },
  'True Autumn': {
    palette: ['#A9432B', '#6B7A3A', '#C08A1E', '#C1652F', '#B0794A', '#5C3D2E', '#7A6A3A', '#8B5E34'],
    avoid: ['#1E2A5C', '#C2508A', '#A9A9A9', '#C3B4D6'],
    description: 'Warm, rich, and muted. Rust, moss green, mustard, and burnt sienna are your palette.',
  },
  'Warm Autumn': {
    palette: ['#D2691E', '#C68A2E', '#707A3D', '#9C4A2E', '#7A5230', '#D8A93B', '#5E7237', '#A65B2E'],
    avoid: ['#A8C0CC', '#C3B4D6', '#A9A9A9'],
    description: 'Golden and earthy. Pumpkin, amber, olive, and warm brown are you.',
  },
  'Deep Autumn': {
    palette: ['#6E1E24', '#2F4A34', '#5A2E4D', '#3E2A22', '#B4501D', '#8A6B1E', '#4A3B2A', '#7A3B2E'],
    avoid: ['#FDF1DC', '#F6C6D0', '#C3B4D6', '#A9A9A9'],
    description: 'Deep and warm. Oxblood, hunter green, deep plum, and chocolate are your richest hues.',
  },
  'True Winter': {
    palette: ['#111111', '#FAFAFA', '#C8102E', '#1E3A8A', '#8B1874', '#0F6B3C', '#2C2C54', '#6C1F3D'],
    avoid: ['#C9A876', '#C68A2E', '#B0794A'],
    description: 'High contrast, cool clarity. True red, royal blue, and emerald are striking on you.',
  },
  'Deep Winter': {
    palette: ['#0B1F3A', '#5C0A1E', '#1B3B2E', '#2B2B2B', '#3B1A4D', '#111111', '#4A0E1E', '#1F2A3A'],
    avoid: ['#FDF1DC', '#C9A876', '#F6C6D0'],
    description: 'Deep and cool with high contrast. Navy, burgundy, forest green, and charcoal suit you.',
  },
  'Bright Winter': {
    palette: ['#E6E9F0', '#1F4FCC', '#C81C7A', '#0E8A5F', '#111111', '#D6203C', '#5B1F8A', '#0FB5C4'],
    avoid: ['#C9A876', '#C68A2E', '#A9A9A9'],
    description: 'Cool and vibrant. Icy white, true blue, fuchsia, and emerald pop on you without tipping into neon.',
  },
};

function determineSeason(answers: Answers): ColorSeason {
  const { tone, undertone, hair, eyes } = answers;

  // Cool undertone → Summer or Winter
  if (undertone === 'cool') {
    const isDeep = tone === 'deep' || hair === 'black' || eyes === 'dark_brown';
    const isBright = eyes === 'blue' || eyes === 'green';
    if (isDeep) return 'Deep Winter';
    if (isBright) return 'Bright Winter';
    const isLight = tone === 'fair' || tone === 'light';
    if (isLight) return 'Light Summer';
    return 'True Summer';
  }

  // Warm undertone → Spring or Autumn
  if (undertone === 'warm') {
    const isDeep = tone === 'deep' || hair === 'dark_brown' || hair === 'black';
    const isLight = tone === 'fair' || tone === 'light';
    if (isDeep) return hair === 'red' || hair === 'dark_brown' ? 'Warm Autumn' : 'Deep Autumn';
    if (isLight) return eyes === 'blue' || eyes === 'green' ? 'Light Spring' : 'Warm Spring';
    return 'True Autumn';
  }

  // Neutral → context-dependent
  const isWarmLeaning = hair === 'golden_blonde' || hair === 'red' || eyes === 'hazel' || eyes === 'light_brown';
  const isDeep = tone === 'deep' || hair === 'black' || hair === 'dark_brown';
  const isLight = tone === 'fair' || tone === 'light';
  if (isWarmLeaning && isDeep) return 'True Autumn';
  if (isWarmLeaning && isLight) return 'True Spring';
  if (isDeep) return 'True Winter';
  if (isLight) return hair === 'ash_blonde' || hair === 'silver' ? 'Soft Summer' : 'Light Summer';
  return 'Soft Summer';
}

// ─── Component ───────────────────────────────────────────────────────────────

const ColorSeasonScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<ColorSeasonResult | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(COLOR_SEASON_KEY).then(raw => {
      if (raw) setResult(JSON.parse(raw));
    });
  }, []);

  const currentQ = QUESTIONS[step];
  const isComplete = step >= QUESTIONS.length;

  const handleAnswer = async (value: string) => {
    const updated = { ...answers, [currentQ.id]: value };
    setAnswers(updated);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      const season = determineSeason(updated);
      const data = SEASON_DATA[season];
      const r: ColorSeasonResult = {
        season,
        ...data,
        savedAt: new Date().toISOString(),
      };
      setResult(r);
      setStep(QUESTIONS.length);
      await AsyncStorage.setItem(COLOR_SEASON_KEY, JSON.stringify(r));
      setSaved(true);
    }
  };

  const handleRetake = () => {
    setStep(0);
    setAnswers({});
    setResult(null);
    setSaved(false);
  };

  // ── Result view ─────────────────────────────────────────────────────────────
  if (result && isComplete) {
    const mainSeason = result.season.split(' ').pop() as string;
    const seasonColors: Record<string, string> = {
      Spring: '#FB923C',
      Summer: '#60A5FA',
      Autumn: '#D97706',
      Winter: '#818CF8',
    };
    const accentColor = seasonColors[mainSeason] || theme.colors.accent;

    return (
      <Screen padded={false}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3">Color Season</Text>
          <Pressable onPress={handleRetake} hitSlop={16}>
            <Text variant="label" color="accent">Retake</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        >
          {/* Season hero */}
          <Card style={[styles.heroCard, { backgroundColor: accentColor }]} padding={0}>
            <View style={styles.heroInner}>
              <Text variant="overline" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Your color season
              </Text>
              <Text variant="h1" style={{ color: '#fff', marginTop: 4 }}>
                {result.season}
              </Text>
              <Text variant="body" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 22 }}>
                {result.description}
              </Text>
            </View>
          </Card>

          {/* Palette */}
          <Text variant="h3" style={styles.sectionTitle}>Your best colors</Text>
          <Card style={{ marginBottom: 20 }}>
            <View style={styles.swatchRow}>
              {result.palette.map(hex => (
                <View key={hex} style={[styles.swatch, { backgroundColor: hex }]} />
              ))}
            </View>
          </Card>

          {/* Avoid */}
          <Text variant="h3" style={styles.sectionTitle}>Colors to avoid</Text>
          <Card style={{ marginBottom: 20 }}>
            <View style={styles.swatchRow}>
              {result.avoid.map(hex => (
                <View key={hex} style={styles.avoidWrap}>
                  <View style={[styles.swatch, { backgroundColor: hex, opacity: 0.5 }]} />
                  <View style={styles.xLine} />
                </View>
              ))}
            </View>
          </Card>

          {/* Tips */}
          <Text variant="h3" style={styles.sectionTitle}>Styling tips</Text>
          <Card>
            {[
              `Stick to ${result.season.includes('Warm') || result.season.includes('Spring') || result.season.includes('Autumn') ? 'warm' : 'cool'} undertone neutrals (not pure black or white).`,
              'Use your palette as a starting point — trust your eye over the label.',
              'Metals: ' + (result.season.includes('Warm') || result.season.includes('Spring') || result.season.includes('Autumn') ? 'gold, bronze, copper' : 'silver, platinum, white gold') + ' suit your season.',
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Icon name="checkmark-circle-outline" size={18} color={accentColor} style={{ marginTop: 2 }} />
                <Text variant="body" style={{ flex: 1, marginLeft: 10 }}>{tip}</Text>
              </View>
            ))}
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  // ── Question view ────────────────────────────────────────────────────────────
  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => (step === 0 ? navigation.goBack() : setStep(step - 1))}
          hitSlop={16}
        >
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">Color Season</Text>
        <Text variant="label" color="muted">{step + 1}/{QUESTIONS.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.colors.muted }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.colors.accent,
              width: `${((step + 1) / QUESTIONS.length) * 100}%`,
            },
          ]}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
      >
        <Text variant="h2" style={{ marginBottom: 24 }}>
          {currentQ.prompt}
        </Text>

        {currentQ.options.map(opt => (
          <Pressable
            key={opt.value}
            onPress={() => handleAnswer(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, marginBottom: 10 }]}
          >
            <Card
              style={[styles.optionCard, { borderColor: theme.colors.border }]}
              padding={0}
            >
              <View style={styles.optionInner}>
                {opt.swatch ? (
                  <View style={[styles.optionSwatch, { backgroundColor: opt.swatch }]} />
                ) : null}
                <Text variant="body" weight="500">{opt.label}</Text>
                <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} style={{ marginLeft: 'auto' }} />
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  progressTrack: {
    height: 3,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  heroInner: {
    padding: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  avoidWrap: {
    position: 'relative',
  },
  xLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,50,50,0.7)',
    transform: [{ rotate: '-45deg' }],
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  optionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  optionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  optionSwatch: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
});

export default ColorSeasonScreen;
