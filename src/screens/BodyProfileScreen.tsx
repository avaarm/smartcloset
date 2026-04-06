/**
 * BodyProfileScreen — read-only view of the user's saved body profile.
 *
 * Shows: recommended color palette, colors to avoid, fit recommendations per
 * category, and size hints. Provides "Retake" (re-run onboarding) and "Clear".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, Button, Card, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import {
  BodyProfile,
  clearBodyProfile,
  getBodyProfile,
} from '../services/profileService';
import { BODY_TYPE_FITS } from '../services/styleRulesEngine';

const BodyProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const p = await getBodyProfile();
    setProfile(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetake = () => {
    navigation.navigate('BodyProfileOnboarding');
  };

  const handleClear = async () => {
    await clearBodyProfile();
    setProfile(null);
    navigation.goBack();
  };

  if (loading || !profile) {
    return (
      <Screen>
        <Text variant="body" color="muted" align="center">
          {loading ? 'Loading…' : 'No profile yet.'}
        </Text>
        {!loading && (
          <Button
            label="Build profile"
            variant="primary"
            onPress={handleRetake}
            style={{ alignSelf: 'center', marginTop: 12 }}
          />
        )}
      </Screen>
    );
  }

  const fit = BODY_TYPE_FITS[profile.bodyType];

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">Style profile</Text>
        <Pressable onPress={handleRetake} hitSlop={16}>
          <Text variant="label" color="accent">
            Retake
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Overview */}
        <Card padding={20}>
          <Text variant="overline" color="muted">
            Your archetype
          </Text>
          <Text variant="h1" style={{ marginTop: 6, textTransform: 'capitalize' }}>
            {fit.label}
          </Text>
          <Text variant="body" color="muted" style={{ marginTop: 4 }}>
            {fit.description}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Badge label={`${profile.skinTone} skin`} tone="neutral" />
            <Badge label={`${profile.undertone} undertone`} tone="neutral" />
          </View>
        </Card>

        {/* Recommended palette */}
        <Text variant="overline" color="muted" style={styles.sectionLabel}>
          Your colors
        </Text>
        <Card>
          <Text variant="h4" style={{ marginBottom: 12 }}>
            Wear these
          </Text>
          <View style={styles.paletteRow}>
            {profile.recommendedPalette.map(c => (
              <View
                key={c}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: c,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.full,
                  },
                ]}
              />
            ))}
          </View>

          {profile.avoidColors.length > 0 ? (
            <>
              <Text variant="h4" style={{ marginTop: 20, marginBottom: 12 }}>
                Skip these
              </Text>
              <View style={styles.paletteRow}>
                {profile.avoidColors.map(c => (
                  <View
                    key={c}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: c,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.full,
                        opacity: 0.6,
                      },
                    ]}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Card>

        {/* Fits */}
        <Text variant="overline" color="muted" style={styles.sectionLabel}>
          Flattering fits
        </Text>
        <Card>
          <FitSection title="Tops" items={profile.recommendedFits.tops} />
          <FitSection title="Bottoms" items={profile.recommendedFits.bottoms} />
          <FitSection title="Dresses" items={profile.recommendedFits.dresses} isLast />
        </Card>

        {/* Tips */}
        <Text variant="overline" color="muted" style={styles.sectionLabel}>
          Styling tips
        </Text>
        <Card>
          {fit.tips.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: i < fit.tips.length - 1 ? 10 : 0 }}>
              <Text variant="body" color="accent" style={{ marginRight: 8 }}>
                •
              </Text>
              <Text variant="body" style={{ flex: 1 }}>
                {t}
              </Text>
            </View>
          ))}
        </Card>

        {/* Size hints */}
        {(profile.sizeHints.tops || profile.sizeHints.bottoms || profile.sizeHints.shoes) && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>
              Size guide
            </Text>
            <Card padding={0}>
              <View style={styles.sizeRow}>
                {(['tops', 'bottoms', 'shoes'] as const).map((k, i) => (
                  <React.Fragment key={k}>
                    <View style={styles.sizeCell}>
                      <Text variant="caption" color="muted">{k.toUpperCase()}</Text>
                      <Text variant="h2" style={{ marginTop: 4 }}>
                        {profile.sizeHints[k] ?? '—'}
                      </Text>
                    </View>
                    {i < 2 ? (
                      <View
                        style={{ width: 1, alignSelf: 'stretch', backgroundColor: theme.colors.border }}
                      />
                    ) : null}
                  </React.Fragment>
                ))}
              </View>
            </Card>
          </>
        )}

        {/* Destructive */}
        <Button
          label="Clear profile"
          variant="ghost"
          size="md"
          onPress={handleClear}
          style={{ alignSelf: 'center', marginTop: 28 }}
          textStyle={{ color: theme.colors.danger }}
        />
      </ScrollView>
    </Screen>
  );
};

const FitSection: React.FC<{ title: string; items: string[]; isLast?: boolean }> = ({
  title,
  items,
  isLast,
}) => {
  const { theme } = useTheme();
  return (
    <View style={{ paddingBottom: isLast ? 0 : 14, marginBottom: isLast ? 0 : 14, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: theme.colors.border }}>
      <Text variant="label" color="muted" style={{ marginBottom: 6 }}>
        {title.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map(i => (
          <Badge key={i} label={i} tone="neutral" />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 40,
    height: 40,
    borderWidth: 1,
  },
  sizeRow: {
    flexDirection: 'row',
    paddingVertical: 18,
  },
  sizeCell: {
    flex: 1,
    alignItems: 'center',
  },
});

export default BodyProfileScreen;
