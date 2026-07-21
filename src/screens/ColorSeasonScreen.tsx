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
    palette: ['#F4A460', '#FFD700', '#FF7F50', '#98FB98', '#00CED1', '#FFDAB9'],
    avoid: ['#000000', '#8B008B', '#A9A9A9', '#4B0082'],
    description: 'Warm, bright, and clear. You glow in golden yellows, coral, peach, and warm greens.',
  },
  'Light Spring': {
    palette: ['#FFFACD', '#FFE4B5', '#98FB98', '#87CEEB', '#FFC0CB', '#FFDAB9'],
    avoid: ['#000000', '#4B0082', '#800000'],
    description: 'Delicate and warm. Soft peaches, light aquas, and creamy yellows are your best.',
  },
  'Warm Spring': {
    palette: ['#FF8C00', '#DAA520', '#CD853F', '#6B8E23', '#FF6347', '#D2691E'],
    avoid: ['#C0C0C0', '#000080', '#4B0082'],
    description: 'Rich, golden warmth. Deep camel, warm terracotta, and earthy olive suit you perfectly.',
  },
  'True Summer': {
    palette: ['#9370DB', '#6495ED', '#D8BFD8', '#B0C4DE', '#E6E6FA', '#87CEEB'],
    avoid: ['#FF8C00', '#8B4513', '#FFD700'],
    description: 'Cool and muted. Dusty rose, lavender, powder blue, and soft mauve make you shine.',
  },
  'Light Summer': {
    palette: ['#E6E6FA', '#FFB6C1', '#B0E0E6', '#FFFAFA', '#D8BFD8', '#87CEEB'],
    avoid: ['#8B4513', '#FF8C00', '#006400'],
    description: 'Soft, light, and cool. Your best colors are barely-there — powder pink, icy blue, silver.',
  },
  'Soft Summer': {
    palette: ['#B0C4DE', '#DCDCDC', '#9370DB', '#8FBC8F', '#D2B48C', '#A0A0A0'],
    avoid: ['#FFD700', '#FF4500', '#FF1493'],
    description: 'Muted and cool. Soft blues, mauve, dusty rose, and greyed-out neutrals are your calling card.',
  },
  'True Autumn': {
    palette: ['#B8860B', '#8B4513', '#6B8E23', '#CD853F', '#D2691E', '#A0522D'],
    avoid: ['#000080', '#FF69B4', '#C0C0C0', '#E6E6FA'],
    description: 'Warm, rich, and muted. Think forest green, rust, mustard, and burnt sienna.',
  },
  'Warm Autumn': {
    palette: ['#FF8C00', '#B8860B', '#8B4513', '#A52A2A', '#CD853F', '#6B8E23'],
    avoid: ['#87CEEB', '#E6E6FA', '#C0C0C0'],
    description: 'Golden and earthy. Deep amber, pumpkin spice, warm brown, and olive green are you.',
  },
  'Deep Autumn': {
    palette: ['#8B0000', '#4B0082', '#006400', '#8B4513', '#2F4F4F', '#800000'],
    avoid: ['#FFFACD', '#FFB6C1', '#E6E6FA', '#C0C0C0'],
    description: 'Deep and warm. Oxblood, hunter green, deep plum, and chocolate brown are your richest hues.',
  },
  'True Winter': {
    palette: ['#000000', '#FFFFFF', '#FF0000', '#0000CD', '#8B008B', '#006400'],
    avoid: ['#D2B48C', '#DAA520', '#CD853F'],
    description: 'High contrast, cool clarity. Pure black, white, true red, and royal blue are striking on you.',
  },
  'Deep Winter': {
    palette: ['#000080', '#8B0000', '#006400', '#4B0082', '#2F4F4F', '#000000'],
    avoid: ['#FFFACD', '#D2B48C', '#FFB6C1'],
    description: 'Deep and cool with high contrast. Charcoal, navy, deep burgundy, and forest green suit you.',
  },
  'Bright Winter': {
    palette: ['#FF0000', '#0000FF', '#FF00FF', '#00FF00', '#FFFFFF', '#000000'],
    avoid: ['#D2B48C', '#CD853F', '#A0A0A0'],
    description: 'Cool and vibrant. Pure, saturated, high-contrast hues like icy white, magenta, and true blue pop on you.',
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
