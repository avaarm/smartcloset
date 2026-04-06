/**
 * OutfitScreen — suggestions + saved outfits with material top tabs.
 *
 * Uses the new 21st.dev-style design system. Theming via useTheme().
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation, NavigationProp, ParamListBase } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, Button, Card, EmptyState, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { getClothingItems } from '../services/storage';
import OutfitCard from '../components/OutfitCard';
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

const SuggestionsTab = () => {
  const { theme } = useTheme();
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherTips, setWeatherTips] = useState<string[]>([]);
  const [useWeatherMode, setUseWeatherMode] = useState(true);

  const generateOutfits = useCallback(async () => {
    try {
      setLoading(true);
      const clothingItems = await getClothingItems();

      if (clothingItems.length < 2) {
        setOutfits([]);
        setWeather(null);
        setWeatherTips([]);
        return;
      }

      if (useWeatherMode) {
        try {
          const weatherRec =
            await WeatherOutfitService.getWeatherBasedRecommendations(clothingItems, 5);
          setOutfits(weatherRec.recommendedOutfits);
          setWeather(weatherRec.weather);
          setWeatherTips(weatherRec.tips);
        } catch {
          const suggestions = generateOutfitSuggestions(clothingItems, 5);
          setOutfits(suggestions);
          setWeather(null);
          setWeatherTips([]);
        }
      } else {
        const suggestions = generateOutfitSuggestions(clothingItems, 5);
        setOutfits(suggestions);
      }
    } catch (error) {
      console.error('Error generating outfits:', error);
    } finally {
      setLoading(false);
    }
  }, [useWeatherMode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await generateOutfits();
    setRefreshing(false);
  }, [generateOutfits]);

  useEffect(() => {
    generateOutfits();
  }, [generateOutfits]);

  const handleSaveOutfit = async (outfit: Outfit) => {
    try {
      await saveOutfit(outfit);
    } catch (error) {
      console.error('Error saving outfit:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <Text variant="body" color="muted">Generating outfits...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
      {outfits.length > 0 ? (
        <FlatList
          data={outfits}
          renderItem={({ item }) => (
            <OutfitCard outfit={item} onSave={() => handleSaveOutfit(item)} />
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
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
        />
      ) : (
        <View style={styles.center}>
          <EmptyState
            icon={<Icon name="albums-outline" size={28} color={theme.colors.textSubtle} />}
            title="No Outfit Suggestions"
            body="Add at least 2 clothing items to your wardrobe to get outfit suggestions."
          />
          <Button
            label="Create Outfits"
            variant="primary"
            onPress={onRefresh}
            style={{ marginTop: 16 }}
          />
        </View>
      )}
    </View>
  );
};

const SavedOutfitsTab = () => {
  const { theme } = useTheme();
  const [savedOutfits, setSavedOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const loadSavedOutfits = useCallback(async () => {
    try {
      setLoading(true);
      const outfits = await getSavedOutfits();
      setSavedOutfits(outfits);
    } catch (error) {
      console.error('Error loading saved outfits:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSavedOutfits();
    setRefreshing(false);
  }, [loadSavedOutfits]);

  useEffect(() => {
    loadSavedOutfits();
  }, [loadSavedOutfits]);

  const handleDeleteOutfit = async (outfitId: string) => {
    try {
      await deleteSavedOutfit(outfitId);
      setSavedOutfits(savedOutfits.filter(o => o.id !== outfitId));
    } catch (error) {
      console.error('Error deleting outfit:', error);
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

  return (
    <View style={[styles.tab, { backgroundColor: theme.colors.background }]}>
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
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
        />
      ) : (
        <View style={styles.center}>
          <EmptyState
            icon={<Icon name="bookmark-outline" size={28} color={theme.colors.textSubtle} />}
            title="No Saved Outfits"
            body="Save outfit suggestions to view them here."
          />
          <Button
            label="Browse Suggestions"
            variant="secondary"
            onPress={() => navigation.navigate('Suggestions')}
            style={{ marginTop: 16 }}
          />
        </View>
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
