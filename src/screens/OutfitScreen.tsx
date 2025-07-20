import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Image } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, ParamListBase } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { getClothingItems } from '../services/storage';
import OutfitCard from '../components/OutfitCard';
import { generateOutfitSuggestions, Outfit, saveOutfit, getSavedOutfits, deleteSavedOutfit } from '../services/outfitService';

const Tab = createMaterialTopTabNavigator();

const SuggestionsTab = () => {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const generateOutfits = useCallback(async () => {
    try {
      setLoading(true);
      const clothingItems = await getClothingItems();
      
      if (clothingItems.length < 2) {
        setOutfits([]);
        return;
      }
      
      const suggestions = generateOutfitSuggestions(clothingItems, 5);
      setOutfits(suggestions);
    } catch (error) {
      console.error('Error generating outfits:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
        <ActivityIndicator size="large" color="#007AFF" />
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
            />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Image 
            source={{uri: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?q=80&w=1974'}} 
            style={styles.emptyStateImage} 
            resizeMode="contain"
          />
          <Text style={styles.emptyStateTitle}>No Outfit Suggestions</Text>
          <Text style={styles.emptyStateText}>
            Add at least 2 clothing items to your wardrobe to get outfit suggestions.
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
          >
            <LinearGradient
              colors={['#FF385C', '#FF5A5F']}
              style={styles.refreshButtonGradient}
            >
              <Text style={styles.refreshButtonText}>Create Outfits</Text>
            </LinearGradient>
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#007AFF" />
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
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#007AFF']}
              tintColor="#007AFF"
            />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Image 
            source={{uri: 'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?q=80&w=2011'}} 
            style={styles.emptyStateImage} 
            resizeMode="contain"
          />
          <Text style={styles.emptyStateTitle}>No Saved Outfits</Text>
          <Text style={styles.emptyStateText}>
            Save outfit suggestions to view them here.
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => navigation.navigate('Suggestions')}
          >
            <LinearGradient
              colors={['#FF385C', '#FF5A5F']}
              style={styles.refreshButtonGradient}
            >
              <Text style={styles.refreshButtonText}>Browse Suggestions</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const OutfitScreen = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Outfit Ideas</Text>
        <TouchableOpacity style={styles.refreshAllButton}>
          <Icon name="refresh-outline" size={18} color="#FF385C" />
          <Text style={styles.refreshAllText}>Refresh All</Text>
        </TouchableOpacity>
      </View>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#FF385C',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarIndicatorStyle: {
            backgroundColor: '#FF385C',
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
            backgroundColor: '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  refreshAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshAllText: {
    color: '#FF385C',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
    color: '#111827',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  refreshButton: {
    width: '80%',
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  refreshButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OutfitScreen;
