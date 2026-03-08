import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Image, Alert } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, ParamListBase } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { getClothingItems } from '../services/storage';
import OutfitCard from '../components/OutfitCard';
import { generateOutfitSuggestions, Outfit, saveOutfit, getSavedOutfits, deleteSavedOutfit } from '../services/outfitService';
import { WearTrackingService } from '../services/wearTrackingService';
import { WeatherOutfitService } from '../services/weatherOutfitService';
import { WeatherData } from '../types/weather';
import theme from '../styles/theme';

const Tab = createMaterialTopTabNavigator();

const SuggestionsTab = () => {
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
          const weatherRec = await WeatherOutfitService.getWeatherBasedRecommendations(clothingItems, 5);
          setOutfits(weatherRec.recommendedOutfits);
          setWeather(weatherRec.weather);
          setWeatherTips(weatherRec.tips);
        } catch (weatherError) {
          console.error('Weather service failed, falling back to regular suggestions:', weatherError);
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
      // Show success feedback
    } catch (error) {
      console.error('Error saving outfit:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8B7FD9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {outfits.length > 0 ? (
        <FlatList
          data={outfits}
          renderItem={({ item }) => (
            <OutfitCard
              outfit={item}
              onSave={() => handleSaveOutfit(item)}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            weather && useWeatherMode ? (
              <View style={styles.weatherSection}>
                <View style={styles.weatherHeader}>
                  <Icon 
                    name={WeatherOutfitService.getWeatherIcon(weather.condition)} 
                    size={32} 
                    color={theme.colors.accent} 
                  />
                  <View style={styles.weatherInfo}>
                    <Text style={styles.weatherTemp}>{weather.temperature}°F</Text>
                    <Text style={styles.weatherCondition}>{weather.condition}</Text>
                    <Text style={styles.weatherLocation}>{weather.location}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.weatherToggle}
                    onPress={() => setUseWeatherMode(false)}
                  >
                    <Text style={styles.weatherToggleText}>Show All</Text>
                  </TouchableOpacity>
                </View>
                {weatherTips.length > 0 && (
                  <View style={styles.tipsContainer}>
                    {weatherTips.map((tip, index) => (
                      <Text key={index} style={styles.tipText}>{tip}</Text>
                    ))}
                  </View>
                )}
              </View>
            ) : !useWeatherMode ? (
              <View style={styles.weatherSection}>
                <TouchableOpacity 
                  style={styles.weatherModeButton}
                  onPress={() => setUseWeatherMode(true)}
                >
                  <Icon name="partly-sunny-outline" size={20} color={theme.colors.accent} />
                  <Text style={styles.weatherModeText}>Show Weather-Based Suggestions</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#8B7FD9']}
              tintColor="#8B7FD9"
            />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Outfit Suggestions</Text>
          <Text style={styles.emptyStateText}>
            Add at least 2 clothing items to your wardrobe to get outfit suggestions.
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
          >
            <Text style={styles.refreshButtonText}>Create Outfits</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const SavedOutfitsTab = () => {
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
      setSavedOutfits(savedOutfits.filter(outfit => outfit.id !== outfitId));
    } catch (error) {
      console.error('Error deleting outfit:', error);
    }
  };

  const handleMarkAsWorn = async (outfit: Outfit) => {
    try {
      await WearTrackingService.markOutfitWorn(outfit);
      Alert.alert(
        'Success!',
        'Outfit marked as worn. All items have been updated.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error marking outfit as worn:', error);
      Alert.alert('Error', 'Failed to mark outfit as worn. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8B7FD9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#8B7FD9']}
              tintColor="#8B7FD9"
            />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Saved Outfits</Text>
          <Text style={styles.emptyStateText}>
            Save outfit suggestions to view them here.
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => navigation.navigate('Suggestions')}
          >
            <Text style={styles.refreshButtonText}>Browse Suggestions</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const OutfitScreen = () => {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Outfit Ideas</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => navigation.navigate('OutfitAnalytics')}
          >
            <Icon name="stats-chart-outline" size={20} color={theme.colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => navigation.navigate('ManualOutfitBuilder')}
          >
            <Icon name="add-circle-outline" size={20} color={theme.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: theme.colors.accent,
          tabBarInactiveTintColor: theme.colors.mediumGray,
          tabBarIndicatorStyle: {
            backgroundColor: theme.colors.accent,
            height: 3,
            borderRadius: 3,
          },
          tabBarLabelStyle: {
            fontSize: 16,
            fontWeight: '600',
            textTransform: 'none',
          },
          tabBarStyle: {
            elevation: 0,
            shadowOpacity: 0,
            backgroundColor: theme.colors.cardBackground,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.lightGray,
          },
        }}
      >
        <Tab.Screen
          name="Suggestions"
          component={SuggestionsTab}
          options={{
            tabBarLabel: 'Suggestions',
          }}
        />
        <Tab.Screen
          name="SavedOutfits"
          component={SavedOutfitsTab}
          options={{
            tabBarLabel: 'Saved',
          }}
        />
      </Tab.Navigator>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '300',
    color: theme.colors.text,
    letterSpacing: -0.5,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.mutedBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: theme.spacing.medium,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xlarge,
  },

  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '300',
    marginTop: 12,
    marginBottom: 8,
    color: theme.colors.text,
    letterSpacing: 0,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
    lineHeight: 22,
  },
  refreshButton: {
    backgroundColor: theme.colors.text,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  weatherSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherInfo: {
    flex: 1,
    marginLeft: 12,
  },
  weatherTemp: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  weatherCondition: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    textTransform: 'capitalize',
  },
  weatherLocation: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  weatherToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.mutedBackground,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  weatherToggleText: {
    fontSize: 12,
    color: theme.colors.text,
    fontWeight: '500',
  },
  tipsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  tipText: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 6,
    lineHeight: 18,
  },
  weatherModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  weatherModeText: {
    fontSize: 14,
    color: theme.colors.accent,
    fontWeight: '500',
  },
});

export default OutfitScreen;
