/**
 * BodyProfileOnboardingScreen — 4-step onboarding that builds a BodyProfile.
 *
 * Steps:
 *   0. Welcome / why
 *   1. Skin tone: optional face photo → AI analysis, or manual skin swatch pick
 *   2. Body type: 5-option self-select
 *   3. Size self-report (optional)
 *   Review & save
 *
 * Uses the photo library only (no camera permission). If the Vision API is
 * configured, the face photo is analyzed to suggest skin tone + undertone;
 * the user can override. If not configured, they manually pick from swatches.
 */

import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  Badge,
  Button,
  Card,
  ColorSwatch,
  Screen,
  Text,
} from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { pickImageFromLibrary } from '../platform/imagePicker';
import { analyzeSkinFromPhoto } from '../services/bodyAnalysisService';
import { buildBodyProfile, type SelfReportedSize } from '../services/styleRulesEngine';
import { saveBodyProfile } from '../services/profileService';
import type { BodyType, SkinTone, Undertone } from '../services/profileService';
import { hasGoogleVision } from '../config/env';

type Step = 0 | 1 | 2 | 3 | 4;

// Skin tone swatches — rough RGB representatives for each category
const SKIN_TONES: Array<{ value: SkinTone; color: string; label: string }> = [
  { value: 'fair',   color: '#F4D9C6', label: 'Fair' },
  { value: 'light',  color: '#E8BFA0', label: 'Light' },
  { value: 'medium', color: '#C99675', label: 'Medium' },
  { value: 'tan',    color: '#A66E47', label: 'Tan' },
  { value: 'deep',   color: '#784A2C', label: 'Deep' },
  { value: 'rich',   color: '#3E2517', label: 'Rich' },
];

const UNDERTONES: Array<{ value: Undertone; label: string; hint: string }> = [
  { value: 'cool',    label: 'Cool',    hint: 'Veins look blue/purple, silver jewelry flatters' },
  { value: 'neutral', label: 'Neutral', hint: 'Mix of blue and green veins, both metals work' },
  { value: 'warm',    label: 'Warm',    hint: 'Veins look green, gold jewelry flatters' },
];

const BODY_TYPES: Array<{
  value: BodyType;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: 'hourglass',          label: 'Hourglass',          description: 'Balanced shoulders & hips, defined waist', icon: 'hourglass-outline' },
  { value: 'pear',               label: 'Pear',               description: 'Hips wider than shoulders',              icon: 'triangle-outline' },
  { value: 'apple',              label: 'Apple',              description: 'Fuller midsection, slimmer legs',        icon: 'ellipse-outline' },
  { value: 'rectangle',          label: 'Rectangle',          description: 'Shoulders, waist & hips in line',        icon: 'square-outline' },
  { value: 'inverted-triangle',  label: 'Inverted triangle',  description: 'Broader shoulders, narrower hips',       icon: 'triangle-outline' },
];

const SIZES: SelfReportedSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const BodyProfileOnboardingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [step, setStep] = useState<Step>(0);
  const [facePhotoUri, setFacePhotoUri] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [skinTone, setSkinTone] = useState<SkinTone | null>(null);
  const [undertone, setUndertone] = useState<Undertone | null>(null);
  const [bodyType, setBodyType] = useState<BodyType | null>(null);
  const [size, setSize] = useState<SelfReportedSize | undefined>();
  const [saving, setSaving] = useState(false);
  const [aiResultMsg, setAiResultMsg] = useState<string | null>(null);

  const handlePickPhoto = async () => {
    const picked = await pickImageFromLibrary();
    if (!picked) return;

    setFacePhotoUri(picked.uri);
    setAnalyzing(true);
    setAiResultMsg(null);

    try {
      const result = await analyzeSkinFromPhoto(picked.uri);
      if (result) {
        setSkinTone(result.skinTone);
        setUndertone(result.undertone);
        setAiResultMsg(
          result.faceDetected
            ? `Detected ${result.skinTone} skin with ${result.undertone} undertone (${Math.round(result.confidence * 100)}% confident)`
            : `No face detected — used overall color: ${result.skinTone} / ${result.undertone}`,
        );
      } else {
        setAiResultMsg(
          hasGoogleVision()
            ? 'Couldn’t analyze that photo. Pick manually below.'
            : 'AI analysis is not configured. Pick manually below.',
        );
      }
    } catch (err) {
      console.error('[BodyProfileOnboarding] analysis error:', err);
      setAiResultMsg('Analysis failed — please pick manually.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!skinTone || !undertone || !bodyType) return;
    setSaving(true);
    try {
      const profile = buildBodyProfile({
        skinTone,
        undertone,
        bodyType,
        size,
        facePhotoUri,
      });
      await saveBodyProfile(profile);
      navigation.navigate('BodyProfile', { profile });
    } catch (err) {
      console.error('[BodyProfileOnboarding] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const canAdvance = (() => {
    switch (step) {
      case 0: return true;
      case 1: return !!skinTone && !!undertone;
      case 2: return !!bodyType;
      case 3: return true;
      case 4: return true;
      default: return false;
    }
  })();

  return (
    <Screen padded={false}>
      <View style={[styles.topBar, { borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => (step === 0 ? navigation.goBack() : setStep((s => (s - 1) as Step)))}
          hitSlop={16}
        >
          <Icon name={step === 0 ? 'close' : 'arrow-back'} size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="overline" color="muted">
          Step {step + 1} of 5
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={{
            height: 3,
            width: `${((step + 1) / 5) * 100}%`,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View>
            <Badge label="New" tone="accent" />
            <Text variant="display" style={{ marginTop: 16 }}>
              Find your style
            </Text>
            <Text variant="body" color="muted" style={{ marginTop: 8, lineHeight: 22 }}>
              Answer a few questions about your skin tone and body shape. We’ll
              use proven color theory and fit rules to recommend outfits that
              genuinely flatter you.
            </Text>
            <View style={{ marginTop: 28, gap: 14 }}>
              {[
                { icon: 'color-palette-outline', title: 'Personal color palette', body: 'Colors that make you glow' },
                { icon: 'body-outline',           title: 'Flattering fits',        body: 'Cuts matched to your shape' },
                { icon: 'sparkles-outline',      title: 'Smart suggestions',      body: 'Outfits from your wardrobe, filtered for you' },
              ].map(item => (
                <Card key={item.title} bordered padding={16}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={[
                        styles.iconBubble,
                        {
                          backgroundColor: theme.colors.muted,
                          borderRadius: theme.radius.full,
                        },
                      ]}
                    >
                      <Icon name={item.icon} size={20} color={theme.colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="h4">{item.title}</Text>
                      <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
                        {item.body}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text variant="h2">Your skin tone</Text>
            <Text variant="body" color="muted" style={{ marginTop: 6 }}>
              Upload a well-lit face photo for an AI-assisted suggestion, or
              pick manually.
            </Text>

            <Pressable
              onPress={handlePickPhoto}
              style={[
                styles.photoPicker,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.muted,
                  borderRadius: theme.radius.xl,
                },
              ]}
            >
              {facePhotoUri ? (
                <Image source={{ uri: facePhotoUri }} style={styles.photoImage} />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Icon name="image-outline" size={28} color={theme.colors.textSubtle} />
                  <Text variant="bodySmall" color="muted" style={{ marginTop: 6 }}>
                    {analyzing ? 'Analyzing…' : 'Tap to upload a photo'}
                  </Text>
                </View>
              )}
            </Pressable>

            {aiResultMsg ? (
              <Text variant="caption" color="muted" align="center" style={{ marginTop: 8 }}>
                {aiResultMsg}
              </Text>
            ) : null}

            <Text variant="label" color="muted" style={{ marginTop: 24, marginBottom: 10 }}>
              SKIN TONE
            </Text>
            <View style={styles.swatchRow}>
              {SKIN_TONES.map(s => (
                <Pressable
                  key={s.value}
                  onPress={() => setSkinTone(s.value)}
                  style={{ alignItems: 'center' }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: s.color,
                      borderWidth: skinTone === s.value ? 3 : 1,
                      borderColor: skinTone === s.value ? theme.colors.accent : theme.colors.border,
                    }}
                  />
                  <Text variant="caption" style={{ marginTop: 6 }}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text variant="label" color="muted" style={{ marginTop: 20, marginBottom: 10 }}>
              UNDERTONE
            </Text>
            {UNDERTONES.map(u => (
              <Pressable
                key={u.value}
                onPress={() => setUndertone(u.value)}
                style={[
                  styles.optionRow,
                  {
                    borderColor: undertone === u.value ? theme.colors.accent : theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="h4">{u.label}</Text>
                  <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
                    {u.hint}
                  </Text>
                </View>
                {undertone === u.value ? (
                  <Icon name="checkmark-circle" size={22} color={theme.colors.accent} />
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text variant="h2">Your body shape</Text>
            <Text variant="body" color="muted" style={{ marginTop: 6 }}>
              Pick the shape that most closely matches yours. You can always
              change this later.
            </Text>

            <View style={{ marginTop: 20, gap: 10 }}>
              {BODY_TYPES.map(b => (
                <Pressable
                  key={b.value}
                  onPress={() => setBodyType(b.value)}
                  style={[
                    styles.optionRow,
                    {
                      borderColor: bodyType === b.value ? theme.colors.accent : theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.bodyIcon,
                      {
                        backgroundColor: theme.colors.muted,
                        borderRadius: theme.radius.full,
                      },
                    ]}
                  >
                    <Icon name={b.icon} size={22} color={theme.colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="h4">{b.label}</Text>
                    <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
                      {b.description}
                    </Text>
                  </View>
                  {bodyType === b.value ? (
                    <Icon name="checkmark-circle" size={22} color={theme.colors.accent} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text variant="h2">Your usual size</Text>
            <Text variant="body" color="muted" style={{ marginTop: 6 }}>
              Optional — helps us size recommendations for new items you find.
            </Text>

            <View style={styles.sizeGrid}>
              {SIZES.map(s => (
                <Pressable
                  key={s}
                  onPress={() => setSize(size === s ? undefined : s)}
                  style={[
                    styles.sizeChip,
                    {
                      borderColor: size === s ? theme.colors.accent : theme.colors.border,
                      backgroundColor: size === s ? theme.colors.accent : theme.colors.surface,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: size === s ? theme.colors.accentText : theme.colors.text,
                      fontWeight: '600',
                      fontSize: 15,
                    }}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text variant="caption" color="subtle" style={{ marginTop: 20 }}>
              We never share this with anyone. It stays on your device unless
              you sign in to sync.
            </Text>
          </View>
        )}

        {step === 4 && (
          <View>
            <Text variant="h2">Review</Text>
            <Text variant="body" color="muted" style={{ marginTop: 6 }}>
              Confirm your selections and we’ll build your profile.
            </Text>

            <Card padding={20} style={{ marginTop: 20 }}>
              <ReviewRow label="Skin tone" value={skinTone ?? '—'} />
              <ReviewRow label="Undertone" value={undertone ?? '—'} />
              <ReviewRow label="Body shape" value={bodyType?.replace('-', ' ') ?? '—'} />
              <ReviewRow label="Size" value={size ?? 'Skipped'} isLast />
            </Card>

            {facePhotoUri ? (
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                <Image
                  source={{ uri: facePhotoUri }}
                  style={{ width: 72, height: 72, borderRadius: 36 }}
                />
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Footer action */}
      <View
        style={[
          styles.footer,
          { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
        ]}
      >
        {step < 4 ? (
          <Button
            label="Continue"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canAdvance}
            onPress={() => setStep(((step + 1) as Step))}
          />
        ) : (
          <Button
            label={saving ? 'Saving…' : 'Build my profile'}
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!skinTone || !undertone || !bodyType}
            onPress={handleSave}
          />
        )}
      </View>
    </Screen>
  );
};

const ReviewRow: React.FC<{ label: string; value: string; isLast?: boolean }> = ({
  label,
  value,
  isLast,
}) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.reviewRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
      ]}
    >
      <Text variant="body" color="muted">
        {label}
      </Text>
      <Text variant="body" weight="600" style={{ textTransform: 'capitalize' }}>
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'transparent',
  },
  iconBubble: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPicker: {
    marginTop: 20,
    width: 160,
    height: 160,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionRow: {
    padding: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  bodyIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  sizeChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    minWidth: 64,
    alignItems: 'center',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  footer: {
    padding: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
});

export default BodyProfileOnboardingScreen;
