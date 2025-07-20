import React, { useState, useEffect } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useCallback } from 'react';
import * as ImagePicker from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { saveClothingItem } from '../services/storage';
import { ClothingCategory, Season, Occasion } from '../types/clothing';
import { analyzeClothingImage, isConfidentPrediction, RecognitionResult } from '../services/imageRecognition';

type AddClothingScreenProps = {
  navigation: NativeStackNavigationProp<any, 'AddClothing'>;
};

const AddClothingScreen = ({ navigation }: AddClothingScreenProps) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClothingCategory>('tops');
  const [brand, setBrand] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [color, setColor] = useState('');
  const [season, setSeason] = useState<Season | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  
  // AI recognition states
  const [analyzing, setAnalyzing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);

  const onCategoryChange = useCallback((value: ClothingCategory) => {
    setCategory(value);
  }, []);

  const onSeasonChange = useCallback((value: Season | null) => {
    setSeason(value);
  }, []);

  const pickImage = () => {
    ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    }, (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.assets && response.assets[0].uri) {
        const uri = response.assets[0].uri;
        setImageUri(uri);
        analyzeImage(uri);
      }
    });
  };
  
  const analyzeImage = async (uri: string) => {
    setAnalyzing(true);
    try {
      const result = await analyzeClothingImage(uri);
      setRecognitionResult(result);
      
      // Autofill fields based on confident predictions
      if (result.category && isConfidentPrediction(result, 'category')) {
        setCategory(result.category);
      }
      
      if (result.brand && isConfidentPrediction(result, 'brand')) {
        setBrand(result.brand);
      }
      
      if (result.occasion && isConfidentPrediction(result, 'occasion')) {
        setOccasion(result.occasion as Occasion);
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!name || !category) {
      // You might want to show an error message here
      return;
    }

    try {
      await saveClothingItem({
        id: '', // Will be set in storage service
        name,
        category,
        brand,
        imageUrl: imageUri,
        color,
        season: season || undefined,
        occasion: occasion || undefined
      });
      navigation.goBack();
    } catch (error) {
      console.error('Error saving item:', error);
      // You might want to show an error message to the user here
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeader}>Photo</Text>
        <TouchableOpacity style={styles.imageContainer} onPress={pickImage} disabled={analyzing}>
          {imageUri ? (
            <View style={{width: '100%', height: '100%'}}>
              <Image source={{ uri: imageUri }} style={styles.image} />
              {analyzing && (
                <View style={styles.analyzeOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.analyzeText}>Analyzing image...</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Icon name="camera-outline" size={40} color="#007AFF" />
              <Text style={styles.placeholderText}>Add Photo</Text>
              <Text style={styles.aiHintText}>AI will analyze your photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Details</Text>

        <TextInput
          style={styles.input}
          placeholder="Item Name"
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Category</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={category}
            onValueChange={onCategoryChange}
            style={styles.picker}
          >
            <Picker.Item label="Tops" value="tops" />
            <Picker.Item label="Bottoms" value="bottoms" />
            <Picker.Item label="Dresses" value="dresses" />
            <Picker.Item label="Outerwear" value="outerwear" />
            <Picker.Item label="Shoes" value="shoes" />
            <Picker.Item label="Accessories" value="accessories" />
          </Picker>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Brand"
          value={brand}
          onChangeText={setBrand}
        />

        <TextInput
          style={styles.input}
          placeholder="Color"
          value={color}
          onChangeText={setColor}
        />

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Season</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={season || undefined}
            onValueChange={onSeasonChange}
            style={styles.picker}
          >
            <Picker.Item label="Select Season" value={null} />
            <Picker.Item label="Spring" value="spring" />
            <Picker.Item label="Summer" value="summer" />
            <Picker.Item label="Fall" value="fall" />
            <Picker.Item label="Winter" value="winter" />
          </Picker>
        </View>
        
        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Occasion</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={occasion || undefined}
            onValueChange={(value) => setOccasion(value)}
            style={styles.picker}
          >
            <Picker.Item label="Select Occasion" value={null} />
            <Picker.Item label="Casual" value="casual" />
            <Picker.Item label="Formal" value="formal" />
            <Picker.Item label="Business" value="business" />
            <Picker.Item label="Sports" value="sports" />
            <Picker.Item label="Party" value="party" />
            <Picker.Item label="Everyday" value="everyday" />
          </Picker>
        </View>
        
        {recognitionResult && (
          <View style={styles.aiSuggestionContainer}>
            <Text style={styles.aiSuggestionTitle}>AI Suggestions</Text>
            {recognitionResult.category && (
              <Text style={styles.aiSuggestion}>
                Category: {recognitionResult.category} 
                ({Math.round((recognitionResult.confidence.category || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.brand && (
              <Text style={styles.aiSuggestion}>
                Brand: {recognitionResult.brand} 
                ({Math.round((recognitionResult.confidence.brand || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.occasion && (
              <Text style={styles.aiSuggestion}>
                Occasion: {recognitionResult.occasion} 
                ({Math.round((recognitionResult.confidence.occasion || 0) * 100)}% confidence)
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>Save Item</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
    marginLeft: 16,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    height: Platform.OS === 'ios' ? 44 : 50,
  },
  picker: {
    height: Platform.OS === 'ios' ? 44 : 50,
    width: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  imageContainer: {
    width: '100%',
    height: 250,
    marginBottom: 24,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f2f2f7',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f2f2f7',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '500',
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 17,
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  analyzeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzeText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  aiHintText: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
  },
  aiSuggestionContainer: {
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  aiSuggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  aiSuggestion: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
});

export default AddClothingScreen;
