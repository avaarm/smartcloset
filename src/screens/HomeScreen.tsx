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

import React, { useCallback, useEffect, useState } from 'react';
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
import { ClothingItem } from '../types';
import { getClothingItems } from '../services/storage';
import { getSavedOutfits } from '../services/outfitService';
import { supabase } from '../config/supabase';
import { signOut } from '../services/authService';
import { getBodyProfile } from '../services/profileService';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [recentItems, setRecentItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasProfile, setHasProfile] = useState(true); // optimistic; avoid flash
  const [stats, setStats] = useState({ totalItems: 0, outfits: 0, wishlist: 0 });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsAuthenticated(true);
        const meta = session.user.user_metadata;
        setUserName(meta?.name || meta?.full_name || session.user.email?.split('@')[0] || null);
      } else {
        setIsAuthenticated(false);
        setUserName(null);
      }

      const [wardrobe, outfits, profile] = await Promise.all([
        getClothingItems(),
        getSavedOutfits(),
        getBodyProfile().catch(() => null),
      ]);

      const wishlist = wardrobe.filter(item => item.isWishlist);
      setStats({ totalItems: wardrobe.length, outfits: outfits.length, wishlist: wishlist.length });
      setHasProfile(!!profile);

      const sorted = [...wardrobe].sort((a, b) => {
        const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        return dateB - dateA;
      });
      setRecentItems(sorted.slice(0, 10));
    } catch (error) {
      console.error('[HomeScreen] load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      sub: `${stats.totalItems} items`,
      icon: 'shirt-outline',
      onPress: () => navigation.navigate('Wardrobe'),
    },
    {
      label: 'Outfits',
      sub: `${stats.outfits} saved`,
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
          <Text variant="h1" style={{ marginBottom: 4 }}>
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

      {/* Stats */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Card padding={0}>
          <View style={styles.statsRow}>
            {[
              { label: 'Items', value: stats.totalItems },
              { label: 'Outfits', value: stats.outfits },
              { label: 'Wishlist', value: stats.wishlist },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                <View style={styles.statCell}>
                  <Text variant="h1" align="center">
                    {s.value}
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
                  backgroundColor: theme.colors.muted,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <Icon name={a.icon} size={22} color={theme.colors.text} />
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

      {/* Recently added */}
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

      {loading ? (
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
