/**
 * HomeScreen — the redesigned landing view.
 *
 * Uses the 21st.dev-style primitives from `src/ui/*` and tokens from
 * `src/styles/tokens.ts`. Sections:
 *   1. Greeting hero + auth button
 *   2. Stats strip (items / outfits / wishlist)
 *   3. Quick actions grid (wardrobe / outfits / lens / add)
 *   4. Style profile CTA (if body profile missing)
 *   5. Recently added horizontal strip
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  Skeleton,
  Text,
} from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from '../components/LoadError';
import { summarizeWardrobe } from '../utils/wardrobeSummary';
import { ClothingItem } from '../types';
import { getClothingItems } from '../services/storage';
import { getSavedOutfits } from '../services/outfitService';
import { supabase } from '../config/supabase';
import { signOut } from '../services/authService';
import { getBodyProfile } from '../services/profileService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentWeather, getCurrentLocation } from '../services/weatherService';
import { WeatherData } from '../types/weather';
import { STYLE_PREFS_KEY, StylePreference } from './StyleQuizScreen';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  // null = not loaded yet (or never loaded successfully): shown as "–", not 0.
  const [wardrobe, setWardrobe] = useState<ClothingItem[] | null>(null);
  const [outfitCount, setOutfitCount] = useState<number | null>(null);
  const [failed, setFailed] = useState({ wardrobe: false, outfits: false });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasProfile, setHasProfile] = useState(true); // optimistic; avoid flash
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [stylePrefs, setStylePrefs] = useState<StylePreference[]>([]);
  const latestLoad = useRef(0);

  const summary = useMemo(() => (wardrobe ? summarizeWardrobe(wardrobe) : null), [wardrobe]);
  const recentItems = summary?.recent ?? [];
  const wardrobeValue = summary?.value ?? 0;
  const failedSections = [failed.wardrobe && 'wardrobe', failed.outfits && 'outfits'].filter(
    Boolean,
  ) as string[];
  // True when every section that failed is still showing its earlier data.
  const onlyStale = (!failed.wardrobe || wardrobe !== null) && (!failed.outfits || outfitCount !== null);

  // Each section loads independently, so one failing never zeroes another, and
  // a failed reload keeps whatever was already on screen. `loading` (the
  // skeleton) is only for the very first load, not every return to this tab.
  const loadData = useCallback(async () => {
    const id = ++latestLoad.current;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsAuthenticated(true);
        const meta = session.user.user_metadata;
        setUserName(meta?.name || meta?.full_name || session.user.email?.split('@')[0] || null);
      } else {
        setIsAuthenticated(false);
        setUserName(null);
      }

      const [wardrobeRes, outfitsRes, profileRes, prefsRes] = await Promise.allSettled([
        getClothingItems({ all: true }),
        getSavedOutfits(),
        getBodyProfile(),
        AsyncStorage.getItem(STYLE_PREFS_KEY),
      ]);
      if (id !== latestLoad.current) return; // a newer load owns the screen

      if (wardrobeRes.status === 'fulfilled') setWardrobe(wardrobeRes.value);
      if (outfitsRes.status === 'fulfilled') setOutfitCount(outfitsRes.value.length);
      setFailed({
        wardrobe: wardrobeRes.status === 'rejected',
        outfits: outfitsRes.status === 'rejected',
      });
      if (profileRes.status === 'fulfilled') setHasProfile(!!profileRes.value);
      if (prefsRes.status === 'fulfilled' && prefsRes.value) {
        try {
          setStylePrefs(JSON.parse(prefsRes.value));
        } catch {
          // Corrupt saved prefs: treat as not set.
        }
      }

      // Load weather in the background (non-blocking)
      getCurrentLocation()
        .then(loc => getCurrentWeather(loc.latitude, loc.longitude))
        .then(setWeather)
        .catch(() => {});
    } catch (error) {
      console.error('[HomeScreen] load error:', error);
      if (id === latestLoad.current) setFailed({ wardrobe: true, outfits: true });
    } finally {
      if (id === latestLoad.current) setLoading(false);
    }
  }, []);

  // Runs on mount and on every return to this tab.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const greeting = (() => {
    const hour = new Date().getHours();
    const prefix = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return userName ? `${prefix}, ${userName}` : prefix;
  })();

  const quickActions: Array<{
    label: string;
    sub: string;
    icon: string;
    onPress: () => void;
  }> = [
    {
      label: 'Wardrobe',
      sub: summary ? `${summary.owned} items` : 'Your closet',
      icon: 'shirt-outline',
      onPress: () => navigation.navigate('Wardrobe'),
    },
    {
      label: 'Outfits',
      sub: outfitCount !== null ? `${outfitCount} saved` : 'Saved looks',
      icon: 'albums-outline',
      onPress: () => navigation.navigate('Outfits'),
    },
    {
      label: 'Search a look',
      sub: 'Find it online',
      icon: 'search-outline',
      onPress: () => navigation.navigate('LensSearch'),
    },
    {
      label: 'Add item',
      sub: 'From photo',
      icon: 'add-circle-outline',
      onPress: () => navigation.navigate('Wardrobe', { screen: 'AddClothing' }),
    },
    {
      label: 'Insights',
      sub: 'Wardrobe analytics',
      icon: 'analytics-outline',
      onPress: () => navigation.navigate('WardrobeInsights'),
    },
    {
      label: 'Calendar',
      sub: 'What you wore',
      icon: 'calendar-outline',
      onPress: () => navigation.navigate('OutfitCalendar'),
    },
    ...(isAuthenticated
      ? [
          {
            label: 'Friends',
            sub: 'Share your closet',
            icon: 'people-outline',
            onPress: () => navigation.navigate('Friends'),
          },
        ]
      : []),
  ];

  const renderRecentItem = ({ item }: { item: ClothingItem }) => {
    const uri = item.retailerImage || item.userImage;
    return (
      <Pressable
        onPress={() => navigation.navigate('ItemDetails', { item })}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.name || item.category}${item.brand ? ` by ${item.brand}` : ''}`}
        style={({ pressed }) => [styles.recentItem, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View
          style={[
            styles.recentImageWrap,
            {
              backgroundColor: theme.colors.muted,
              borderRadius: theme.radius.lg,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.recentImage} resizeMode="cover" />
          ) : (
            <Icon name="shirt-outline" size={28} color={theme.colors.textSubtle} />
          )}
        </View>
        <Text variant="bodySmall" weight="500" numberOfLines={1} style={{ marginTop: 8 }}>
          {item.name || item.category}
        </Text>
        {item.brand ? (
          <Text variant="caption" color="subtle" numberOfLines={1}>
            {item.brand}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
      setUserName(null);
    } catch (e) {
      console.error('[HomeScreen] sign out error:', e);
    }
  };

  return (
    <Screen scrollable padded={false}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '500',
              color: theme.colors.accent,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Smart Closet
          </Text>
          <Text variant="h1" style={{ marginBottom: 4, fontWeight: '300' }}>
            {greeting}
          </Text>
          <Text variant="body" color="muted">
            What will you wear today?
          </Text>
        </View>
        <Button
          label={isAuthenticated ? 'Sign out' : 'Sign in'}
          variant={isAuthenticated ? 'ghost' : 'secondary'}
          size="sm"
          onPress={() => (isAuthenticated ? handleSignOut() : navigation.navigate('SignIn'))}
          accessibilityLabel={isAuthenticated ? 'Sign out of your account' : 'Sign in to your account'}
        />
      </View>
      <View style={{ marginHorizontal: 20, height: 1, backgroundColor: theme.colors.border, marginBottom: 8 }} />

      {failedSections.length > 0 ? (
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <LoadError
            variant="banner"
            what={failedSections.join(' and ')}
            title={`Couldn't ${onlyStale ? 'refresh' : 'load'} your ${failedSections.join(' and ')}`}
            onRetry={loadData}
          />
        </View>
      ) : null}

      {/* Stats */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Card padding={0}>
          <View style={styles.statsRow}>
            {[
              { label: 'Items', value: summary?.owned ?? null },
              { label: 'Outfits', value: outfitCount },
              { label: 'Wishlist', value: summary?.wishlist ?? null },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                <View style={styles.statCell}>
                  <Text variant="h1" align="center">
                    {s.value ?? '–'}
                  </Text>
                  <Text variant="overline" color="muted" align="center" style={{ marginTop: 4 }}>
                    {s.label}
                  </Text>
                </View>
                {i < 2 ? (
                  <View
                    style={{
                      width: 1,
                      alignSelf: 'stretch',
                      backgroundColor: theme.colors.border,
                    }}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </View>
        </Card>
      </View>

      {/* WardrobeWorth stat */}
      {wardrobeValue > 0 && (
        <Pressable
          onPress={() => navigation.navigate('WardrobeInsights')}
          style={{ paddingHorizontal: 20, marginBottom: 16 }}
          accessibilityRole="button"
          accessibilityLabel={`WardrobeWorth: $${wardrobeValue.toFixed(0)}, view insights`}
        >
          <Card
            style={[styles.worthCard, { backgroundColor: theme.colors.accent }]}
            padding={0}
          >
            <View style={styles.worthInner}>
              <View>
                <Text variant="overline" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  ★ WardrobeWorth
                </Text>
                <Text variant="h1" style={{ color: '#fff', marginTop: 2 }}>
                  ${wardrobeValue >= 1000
                    ? `${(wardrobeValue / 1000).toFixed(1)}k`
                    : wardrobeValue.toFixed(0)}
                </Text>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                  Across {summary?.owned ?? 0} item{summary?.owned !== 1 ? 's' : ''}
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
            </View>
          </Card>
        </Pressable>
      )}

      {/* Weather outfit card */}
      {weather && (
        <Pressable
          onPress={() => navigation.navigate('Outfits')}
          style={{ paddingHorizontal: 20, marginBottom: 16 }}
          accessibilityRole="button"
          accessibilityLabel={`Weather: ${weather.temperature}°, ${weather.condition}. Tap for outfit ideas.`}
        >
          <Card style={styles.weatherCard} padding={0}>
            <View style={styles.weatherInner}>
              <Icon
                name={
                  weather.condition === 'sunny' ? 'sunny-outline'
                  : weather.condition === 'rainy' || weather.condition === 'stormy' ? 'rainy-outline'
                  : weather.condition === 'snowy' ? 'snow-outline'
                  : weather.condition === 'foggy' ? 'partly-sunny-outline'
                  : 'cloudy-outline'
                }
                size={28}
                color={theme.colors.accent}
              />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text variant="h4">
                  {Math.round(weather.temperature)}° · {weather.location}
                </Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
                  {weather.condition === 'sunny' ? 'Light layers — a tee + light jacket works great'
                  : weather.condition === 'rainy' || weather.condition === 'stormy' ? 'Grab a waterproof outer layer today'
                  : weather.condition === 'snowy' ? 'Bundle up — coats, boots, and warm layers'
                  : weather.condition === 'cloudy' ? 'A mid-layer is a safe bet'
                  : 'Dress for comfort — see your outfit suggestions'}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
            </View>
          </Card>
        </Pressable>
      )}

      {/* Style quiz CTA — only if no style prefs set */}
      {stylePrefs.length === 0 && (summary?.owned ?? 0) > 0 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Card bordered>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.actionIcon, { backgroundColor: theme.colors.accentSubtle, borderRadius: theme.radius.full }]}>
                <Icon name="color-palette-outline" size={22} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="h4">Discover your style DNA</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
                  Take the 30-second style quiz for better outfit picks
                </Text>
              </View>
              <Button
                label="Start"
                variant="secondary"
                size="sm"
                onPress={() => navigation.navigate('StyleQuiz')}
              />
            </View>
          </Card>
        </View>
      )}

      {/* Quick actions */}
      <Text variant="overline" color="muted" style={styles.sectionLabel}>
        Quick actions
      </Text>
      <View style={styles.actionsGrid}>
        {quickActions.map(a => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${a.label}, ${a.sub}`}
            style={({ pressed }) => [
              styles.actionCell,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.xl,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.actionIcon,
                {
                  backgroundColor: theme.colors.accentSubtle,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <Icon name={a.icon} size={22} color={theme.colors.accent} />
            </View>
            <Text variant="h4" style={{ marginTop: 12 }}>
              {a.label}
            </Text>
            <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
              {a.sub}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Style profile CTA */}
      {!hasProfile ? (
        <View style={{ paddingHorizontal: 20, marginTop: 8, marginBottom: 24 }}>
          <Card elevated>
            <Badge label="New" tone="accent" />
            <Text variant="h3" style={{ marginTop: 10 }}>
              Build your style profile
            </Text>
            <Text variant="body" color="muted" style={{ marginTop: 4 }}>
              Answer a few questions and get personalized color palettes and fit recommendations.
            </Text>
            <Button
              label="Start"
              variant="primary"
              size="md"
              onPress={() => navigation.navigate('BodyProfileOnboarding')}
              style={{ marginTop: 14 }}
              accessibilityLabel="Start building your style profile"
            />
          </Card>
        </View>
      ) : null}

      {/* Recently added — hidden if the wardrobe failed to load (the banner says so) */}
      {loading || summary ? (
        <>
          <View style={styles.sectionHeader}>
            <Text variant="overline" color="muted">
              Recently added
            </Text>
            {recentItems.length > 0 ? (
              <Pressable
                onPress={() => navigation.navigate('Wardrobe')}
                accessibilityRole="button"
                accessibilityLabel="View all recently added items"
              >
                <Text variant="label" color="accent">
                  View all
                </Text>
              </Pressable>
            ) : null}
          </View>

          {!summary ? (
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 12 }}>
              {[0, 1, 2, 3].map(i => (
                <Skeleton key={i} width={120} height={160} borderRadius={theme.radius.lg} />
              ))}
            </View>
          ) : recentItems.length === 0 ? (
            <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
              <Card bordered>
                <EmptyState
                  icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
                  title="Your wardrobe is empty"
                  body="Add your first item to start building outfits."
                  actionLabel="Add item"
                  onAction={() => navigation.navigate('Wardrobe', { screen: 'AddClothing' })}
                />
              </Card>
            </View>
          ) : (
            <FlatList
              data={recentItems}
              renderItem={renderRecentItem}
              keyExtractor={(_, i) => `recent-${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  sectionLabel: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  actionCell: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    padding: 18,
  },
  actionIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 4,
  },
  worthCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  worthInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  weatherCard: {
    borderRadius: 16,
  },
  weatherInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  recentItem: {
    width: 120,
  },
  recentImageWrap: {
    width: 120,
    height: 160,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  recentImage: {
    width: '100%',
    height: '100%',
  },
});

export default HomeScreen;
