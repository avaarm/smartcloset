/**
 * OutfitScreen — suggestions + saved outfits with material top tabs.
 *
 * Uses the new 21st.dev-style design system. Theming via useTheme().
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Pressable,
  ScrollView,
} from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import {
  useFocusEffect,
  useNavigation,
  NavigationProp,
  ParamListBase,
} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Card, EmptyState, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { getOwnedClothingItems } from '../services/storage';
import OutfitCard from '../components/OutfitCard';
import LoadError from '../components/LoadError';
import { useLoadable } from '../hooks/useLoadable';
import { outfitSuggestionKey } from '../utils/outfitSuggestionKey';
import {
  generateOutfitSuggestions,
  Outfit,
  saveOutfit,
  getSavedOutfits,
  deleteSavedOutfit,
} from '../services/outfitService';
import { WearTrackingService } from '../services/wearTrackingService';
import { WeatherOutfitService } from '../services/weatherOutfitService';
import { WeatherData } from '../types/weather';

const Tab = createMaterialTopTabNavigator();

type Suggestions = {
  outfits: Outfit[];
  weather: WeatherData | null;
  tips: string[];
  /** outfitSuggestionKey of the wardrobe these were built from. */
  key: string | null;
};

const NO_SUGGESTIONS: Suggestions = { outfits: [], weather: null, tips: [], key: null };
const NO_OUTFITS: Outfit[] = [];

type Request = {
  /** Build new suggestions even if the wardrobe is unchanged (pull-to-refresh). */
  force: boolean;
  weatherMode: boolean;
};

/** Empty-state container that still supports pull-to-refresh. */
const EmptyScroll: React.FC<{
  refreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}> = ({ refreshing, onRefresh, children }) => {
  const { theme } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={styles.emptyScroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.accent}
        />
      }
    >
      {children}
    </ScrollView>
  );
};

export const SuggestionsTab = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [useWeatherMode, setUseWeatherMode] = useState(true);
  // Mirrors what is on screen so a focus reload can tell the wardrobe is unchanged.
  const shown = useRef<Suggestions>(NO_SUGGESTIONS);

  // A plain reload keeps the suggestions the user is looking at unless the
  // wardrobe or the weather mode changed; `force` always builds new ones.
  const generate = useCallback(async ({ force, weatherMode }: Request): Promise<Suggestions> => {
    const clothingItems = await getOwnedClothingItems();
    const key = outfitSuggestionKey(clothingItems, weatherMode);
    if (!force && shown.current.key === key) return shown.current;

    if (clothingItems.length < 2) {
      return { outfits: [], weather: null, tips: [], key };
    }

    if (weatherMode) {
      try {
        const weatherRec =
          await WeatherOutfitService.getWeatherBasedRecommendations(clothingItems, 5);
        return {
          outfits: weatherRec.recommendedOutfits,
          weather: weatherRec.weather,
          tips: weatherRec.tips,
          key,
        };
      } catch {
        // No location/weather: fall through to plain suggestions.
      }
    }
    return { outfits: generateOutfitSuggestions(clothingItems, 5), weather: null, tips: [], key };
  }, []);

  const {
    data: suggestions,
    failed,
    loading,
    blocked,
    refreshing,
    reload,
    refresh,
  } = useLoadable(generate, NO_SUGGESTIONS);
  shown.current = suggestions;
  const { outfits, weather, tips: weatherTips } = suggestions;
  const request = (force: boolean): Request => ({ force, weatherMode: useWeatherMode });

  // Re-runs when the weather toggle flips, which changes the key and rebuilds.
  useFocusEffect(
    useCallback(() => {
      reload({ force: false, weatherMode: useWeatherMode });
    }, [reload, useWeatherMode]),
  );

  if (loading) {
    return (
      <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <Text variant="body" color="muted">Generating outfits...</Text>
        </View>
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <LoadError what="outfit suggestions" onRetry={() => reload(request(false))} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
      {failed ? (
        <View style={styles.banner}>
          <LoadError
            variant="banner"
            what="outfit suggestions"
            title="Couldn't refresh your outfit suggestions"
            onRetry={() => reload(request(false))}
          />
        </View>
      ) : null}
      {outfits.length > 0 ? (
        <FlatList
          data={outfits}
          renderItem={({ item }) => (
            <OutfitCard outfit={item} onSave={() => saveOutfit(item)} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            weather && useWeatherMode ? (
              <Card style={{ marginBottom: 16 }}>
                <View style={styles.weatherHeader}>
                  <Icon
                    name={WeatherOutfitService.getWeatherIcon(weather.condition)}
                    size={28}
                    color={theme.colors.accent}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text variant="h3">{weather.temperature}°F</Text>
                    <Text variant="caption" color="muted" style={{ textTransform: 'capitalize' }}>
                      {weather.condition} · {weather.location}
                    </Text>
                  </View>
                  <Button
                    label="Show All"
                    variant="ghost"
                    size="sm"
                    onPress={() => setUseWeatherMode(false)}
                  />
                </View>
                {weatherTips.length > 0 && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    {weatherTips.map((tip, i) => (
                      <Text key={i} variant="bodySmall" color="muted" style={{ marginBottom: 4 }}>
                        {tip}
                      </Text>
                    ))}
                  </View>
                )}
              </Card>
            ) : !useWeatherMode ? (
              <Pressable
                onPress={() => setUseWeatherMode(true)}
                style={[styles.weatherToggle, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}
              >
                <Icon name="partly-sunny-outline" size={18} color={theme.colors.text} />
                <Text variant="bodySmall">Weather-Based Suggestions</Text>
              </Pressable>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh(request(true))}
              tintColor={theme.colors.accent}
            />
          }
        />
      ) : (
        <EmptyScroll refreshing={refreshing} onRefresh={() => refresh(request(true))}>
          <EmptyState
            icon={<Icon name="albums-outline" size={28} color={theme.colors.textSubtle} />}
            title="No Outfit Suggestions"
            body="Add a top and a bottom, or a dress, to your wardrobe to get outfit suggestions."
          />
          <Button
            label="Create Outfits"
            variant="primary"
            onPress={() => navigation.navigate('ManualOutfitBuilder')}
            style={{ marginTop: 16, alignSelf: 'center' }}
          />
        </EmptyScroll>
      )}
    </View>
  );
};

export const SavedOutfitsTab = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const {
    data: savedOutfits,
    failed,
    loading,
    blocked,
    refreshing,
    reload,
    refresh,
    update,
  } = useLoadable(getSavedOutfits, NO_OUTFITS);

  // Reload whenever the tab is shown so an outfit saved from Suggestions (or the
  // manual builder) appears; the loaded list stays visible while it refreshes.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleDeleteOutfit = async (outfitId: string) => {
    try {
      await deleteSavedOutfit(outfitId);
      update(list => list.filter(o => o.id !== outfitId));
    } catch (error) {
      console.error('Error deleting outfit:', error);
      Alert.alert('Could not delete outfit', 'Check your connection and try again.');
    }
  };

  const handleMarkAsWorn = async (outfit: Outfit) => {
    try {
      await WearTrackingService.markOutfitWorn(outfit);
      Alert.alert('Success!', 'Outfit marked as worn. All items have been updated.', [
        { text: 'OK' },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to mark outfit as worn. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <Text variant="body" color="muted">Loading saved outfits...</Text>
        </View>
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <LoadError what="saved outfits" onRetry={reload} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
      {failed ? (
        <View style={styles.banner}>
          <LoadError
            variant="banner"
            what="saved outfits"
            title="Couldn't refresh your saved outfits"
            onRetry={reload}
          />
        </View>
      ) : null}
      {savedOutfits.length > 0 ? (
        <FlatList
          data={savedOutfits}
          renderItem={({ item }) => (
            <OutfitCard
              outfit={item}
              saved={true}
              onDelete={() => handleDeleteOutfit(item.id)}
              onMarkAsWorn={() => handleMarkAsWorn(item)}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh()}
              tintColor={theme.colors.accent}
            />
          }
        />
      ) : (
        <EmptyScroll refreshing={refreshing} onRefresh={() => refresh()}>
          <EmptyState
            icon={<Icon name="bookmark-outline" size={28} color={theme.colors.textSubtle} />}
            title="No Saved Outfits"
            body="Save outfit suggestions to view them here."
          />
          <Button
            label="Browse Suggestions"
            variant="secondary"
            onPress={() => navigation.navigate('Suggestions')}
            style={{ marginTop: 16, alignSelf: 'center' }}
          />
        </EmptyScroll>
      )}
    </View>
  );
};

const OutfitScreen = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const headerEl = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Text variant="h2">Outfit Ideas</Text>
      <View style={styles.headerActions}>
        <Pressable
          onPress={() => navigation.navigate('OutfitAnalytics')}
          style={[styles.iconBtn, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.full }]}
          hitSlop={8}
        >
          <Icon name="stats-chart-outline" size={18} color={theme.colors.text} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('ManualOutfitBuilder')}
          style={[styles.iconBtn, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.full }]}
          hitSlop={8}
        >
          <Icon name="add-circle-outline" size={18} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen padded={false} header={headerEl}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: theme.colors.text,
          tabBarInactiveTintColor: theme.colors.textSubtle,
          tabBarIndicatorStyle: {
            backgroundColor: theme.colors.accent,
            height: 2,
            borderRadius: 1,
          },
          tabBarLabelStyle: {
            fontSize: 15,
            fontWeight: '600',
            textTransform: 'none',
          },
          tabBarStyle: {
            elevation: 0,
            shadowOpacity: 0,
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          },
        }}
      >
        <Tab.Screen name="Suggestions" component={SuggestionsTab} />
        <Tab.Screen
          name="SavedOutfits"
          component={SavedOutfitsTab}
          options={{ tabBarLabel: 'Saved' }}
        />
      </Tab.Navigator>
    </Screen>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    flex: 1,
  },
  banner: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
});

export default OutfitScreen;
