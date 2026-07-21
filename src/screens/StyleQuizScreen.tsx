/**
 * StyleQuizScreen — 6-tile visual style selector.
 *
 * Lets the user pick up to 3 styles from: Old Money / Streetwear /
 * High Fashion / Athleisure / Minimalist / Preppy.
 * Result is stored in AsyncStorage and feeds outfit suggestions + PAI.
 */

import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';

export const STYLE_PREFS_KEY = '@smartcloset_style_prefs';

export type StylePreference =
  | 'Old Money'
  | 'Streetwear'
  | 'High Fashion'
  | 'Athleisure'
  | 'Minimalist'
  | 'Preppy';

interface StyleTile {
  label: StylePreference;
  icon: string;
  description: string;
  keywords: string;
}

const STYLES: StyleTile[] = [
  {
    label: 'Old Money',
    icon: 'diamond-outline',
    description: 'Timeless classics, quiet luxury, heritage brands',
    keywords: 'Blazers · Loafers · Cashmere',
  },
  {
    label: 'Streetwear',
    icon: 'flame-outline',
    description: 'Bold graphics, sneakers, urban edge',
    keywords: 'Hoodies · Sneakers · Caps',
  },
  {
    label: 'High Fashion',
    icon: 'sparkles-outline',
    description: 'Avant-garde silhouettes, statement pieces',
    keywords: 'Tailoring · Sculptural · Editorial',
  },
  {
    label: 'Athleisure',
    icon: 'fitness-outline',
    description: 'Sporty comfort you can wear anywhere',
    keywords: 'Leggings · Tech fleece · Clean kicks',
  },
  {
    label: 'Minimalist',
    icon: 'remove-outline',
    description: 'Neutral palette, clean lines, nothing extra',
    keywords: 'Monochrome · Structured · Refined',
  },
  {
    label: 'Preppy',
    icon: 'school-outline',
    description: 'East Coast classics, pattern play, collegiate charm',
    keywords: 'Polos · Chinos · Stripes',
  },
];

const StyleQuizScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const [selected, setSelected] = useState<StylePreference[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STYLE_PREFS_KEY).then(raw => {
      if (raw) setSelected(JSON.parse(raw) as StylePreference[]);
    });
  }, []);

  const toggle = (style: StylePreference) => {
    setSelected(prev => {
      if (prev.includes(style)) return prev.filter(s => s !== style);
      if (prev.length >= 3) return prev;
      return [...prev, style];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await AsyncStorage.setItem(STYLE_PREFS_KEY, JSON.stringify(selected));
    setSaving(false);
    navigation.goBack();
  };

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">Your Style DNA</Text>
        <Text variant="label" color="muted">
          {selected.length}/3
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      >
        <Text variant="body" color="muted" style={{ marginBottom: 24 }}>
          Pick up to 3 styles that describe you. This shapes your outfit suggestions and PAI advice.
        </Text>

        {STYLES.map(tile => {
          const isActive = selected.includes(tile.label);
          return (
            <Pressable
              key={tile.label}
              onPress={() => toggle(tile.label)}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, marginBottom: 12 }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`${tile.label} style: ${tile.description}`}
            >
              <Card
                style={[
                  styles.tile,
                  {
                    borderColor: isActive ? theme.colors.accent : theme.colors.border,
                    backgroundColor: isActive ? theme.colors.accentSubtle : theme.colors.surface,
                    borderWidth: isActive ? 2 : 1,
                  },
                ]}
                padding={0}
              >
                <View style={styles.tileInner}>
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        backgroundColor: isActive
                          ? theme.colors.accent
                          : theme.colors.muted,
                      },
                    ]}
                  >
                    <Icon
                      name={tile.icon}
                      size={22}
                      color={isActive ? '#fff' : theme.colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="h4" style={{ marginBottom: 2 }}>
                      {tile.label}
                    </Text>
                    <Text variant="caption" color="muted">
                      {tile.description}
                    </Text>
                    <Text
                      variant="caption"
                      style={{
                        marginTop: 4,
                        color: isActive ? theme.colors.accent : theme.colors.textSubtle,
                      }}
                    >
                      {tile.keywords}
                    </Text>
                  </View>
                  {isActive && (
                    <Icon name="checkmark-circle" size={22} color={theme.colors.accent} />
                  )}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
        ]}
      >
        <Button
          label={selected.length === 0 ? 'Skip for now' : `Save ${selected.length} style${selected.length !== 1 ? 's' : ''}`}
          variant={selected.length === 0 ? 'ghost' : 'primary'}
          size="lg"
          onPress={handleSave}
          loading={saving}
          style={{ flex: 1 }}
        />
      </View>
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
  tile: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  tileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
  },
});

export default StyleQuizScreen;
