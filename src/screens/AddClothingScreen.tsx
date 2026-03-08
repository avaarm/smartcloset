import React, { useState, useEffect } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ScrollView, ActivityIndicator, Alert, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useCallback } from 'react';
import * as ImagePicker from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { saveClothingItem, updateClothingItem } from '../services/storage';
import { ClothingCategory, Season, Occasion } from '../types/clothing';
import { analyzeClothingImage, isConfidentPrediction, RecognitionResult } from '../services/imageRecognition';
import { copyImageToPermanentStorage } from '../services/imageStorage';
import DateTimePicker from '@react-native-community/datetimepicker';

type AddClothingScreenProps = {
  navigation: NativeStackNavigationProp<any, 'AddClothing'>;
  route: {
    params?: {
      editItem?: any;
      item?: any;
      isWishlist?: boolean;
    };
  };
};

const AddClothingScreen = ({ navigation, route }: AddClothingScreenProps) => {
  const editItem = route.params?.editItem || route.params?.item;
  const isWishlist = route.params?.isWishlist || editItem?.isWishlist || false;
  const isEditing = !!editItem;
  const [name, setName] = useState(editItem?.name || '');
  const [category, setCategory] = useState<ClothingCategory>(editItem?.category || 'tops');
  const [brand, setBrand] = useState(editItem?.brand || '');
  const [imageUri, setImageUri] = useState(editItem?.userImage || editItem?.imageUrl || editItem?.retailerImage || '');
  const [color, setColor] = useState(editItem?.color || '');
  const [season, setSeason] = useState<Season | null>(editItem?.season?.[0] || null);
  const [occasion, setOccasion] = useState<Occasion | null>(editItem?.occasion || null);
  const [cost, setCost] = useState(editItem?.cost?.toString() || '');
  const [purchaseDate, setPurchaseDate] = useState<Date>(editItem?.purchaseDate ? new Date(editItem.purchaseDate) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tags, setTags] = useState(editItem?.tags?.join(', ') || '');
  const [notes, setNotes] = useState(editItem?.notes || '');
  const [favorite, setFavorite] = useState(editItem?.favorite || false);
  const [retailer, setRetailer] = useState(editItem?.retailer || '');
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // AI recognition states
  const [analyzing, setAnalyzing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);

  const onCategoryChange = useCallback((value: ClothingCategory) => {
    setCategory(value);
  }, []);

  const onSeasonChange = useCallback((value: Season | null) => {
    setSeason(value);
  }, []);

  const showImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: () => takePhoto(),
        },
        {
          text: 'Choose from Library',
          onPress: () => pickImage(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const takePhoto = async () => {
    ImagePicker.launchCamera({
      mediaType: 'photo',
      quality: 0.8,
      saveToPhotos: true,
    }, async (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.assets && response.assets[0].uri) {
        const tempUri = response.assets[0].uri;
        try {
          const permanentUri = await copyImageToPermanentStorage(tempUri);
          setImageUri(permanentUri);
          analyzeImage(permanentUri);
        } catch (error) {
          console.error('Error saving image:', error);
          setImageUri(tempUri);
          analyzeImage(tempUri);
        }
      }
    });
  };

  const pickImage = async () => {
    ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    }, async (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.assets && response.assets[0].uri) {
        const tempUri = response.assets[0].uri;
        try {
          const permanentUri = await copyImageToPermanentStorage(tempUri);
          setImageUri(permanentUri);
          analyzeImage(permanentUri);
        } catch (error) {
          console.error('Error saving image:', error);
          setImageUri(tempUri);
          analyzeImage(tempUri);
        }
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

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!name.trim()) {
      newErrors.name = 'Item name is required';
    }
    
    if (!category) {
      newErrors.category = 'Category is required';
    }
    
    if (cost && isNaN(parseFloat(cost))) {
      newErrors.cost = 'Cost must be a valid number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    try {
      const itemData: any = {
        id: isEditing ? editItem.id : '',
        name: name.trim(),
        category,
        brand: brand.trim(),
        userImage: imageUri,
        retailerImage: imageUri,
        color: color.trim(),
        occasion: occasion || undefined,
        isWishlist: isWishlist,
        dateAdded: isEditing ? editItem.dateAdded : new Date().toISOString(),
        cost: cost ? parseFloat(cost) : undefined,
        purchaseDate: purchaseDate.toISOString(),
        tags: tags ? tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag) : [],
        notes: notes.trim(),
        favorite,
        retailer: retailer.trim(),
        wearCount: editItem?.wearCount || 0,
        lastWorn: editItem?.lastWorn,
      };
      
      if (season) {
        itemData.season = [season];
      }
      
      if (isEditing) {
        await updateClothingItem(itemData);
      } else {
        await saveClothingItem(itemData);
      }
      navigation.goBack();
    } catch (error) {
      console.error('Error saving item:', error);
      Alert.alert('Error', 'Failed to save item. Please try again.');
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Item' : 'Add Item'}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeader}>Photo</Text>
        <TouchableOpacity style={styles.imageContainer} onPress={showImageOptions} disabled={analyzing}>
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
              <Icon name="camera-outline" size={40} color="#8B7FD9" />
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
            itemStyle={{ color: '#1A1A1A', fontSize: 16 }}
          >
            <Picker.Item label="Tops" value="tops" color="#1A1A1A" />
            <Picker.Item label="Bottoms" value="bottoms" color="#1A1A1A" />
            <Picker.Item label="Dresses" value="dresses" color="#1A1A1A" />
            <Picker.Item label="Outerwear" value="outerwear" color="#1A1A1A" />
            <Picker.Item label="Shoes" value="shoes" color="#1A1A1A" />
            <Picker.Item label="Accessories" value="accessories" color="#1A1A1A" />
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
          placeholder="Retailer/Store"
          value={retailer}
          onChangeText={setRetailer}
        />

        <TextInput
          style={styles.input}
          placeholder="Color"
          value={color}
          onChangeText={setColor}
        />

        <TextInput
          style={styles.input}
          placeholder="Cost (optional)"
          value={cost}
          onChangeText={setCost}
          keyboardType="decimal-pad"
        />
        {errors.cost && <Text style={styles.errorText}>{errors.cost}</Text>}

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Purchase Date</Text>
        <TouchableOpacity 
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Icon name="calendar-outline" size={20} color="#666" />
          <Text style={styles.dateButtonText}>
            {purchaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={purchaseDate}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Season</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={season || undefined}
            onValueChange={onSeasonChange}
            style={styles.picker}
            itemStyle={{ color: '#1A1A1A', fontSize: 16 }}
          >
            <Picker.Item label="Select Season" value={null} color="#8B8B8B" />
            <Picker.Item label="Spring" value="spring" color="#1A1A1A" />
            <Picker.Item label="Summer" value="summer" color="#1A1A1A" />
            <Picker.Item label="Fall" value="fall" color="#1A1A1A" />
            <Picker.Item label="Winter" value="winter" color="#1A1A1A" />
          </Picker>
        </View>
        
        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Occasion</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={occasion || undefined}
            onValueChange={(value) => setOccasion(value)}
            style={styles.picker}
            itemStyle={{ color: '#1A1A1A', fontSize: 16 }}
          >
            <Picker.Item label="Select Occasion" value={null} color="#8B8B8B" />
            <Picker.Item label="Casual" value="casual" color="#1A1A1A" />
            <Picker.Item label="Formal" value="formal" color="#1A1A1A" />
            <Picker.Item label="Business" value="business" color="#1A1A1A" />
            <Picker.Item label="Sports" value="sports" color="#1A1A1A" />
            <Picker.Item label="Party" value="party" color="#1A1A1A" />
            <Picker.Item label="Everyday" value="everyday" color="#1A1A1A" />
          </Picker>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Tags (comma separated, e.g., summer, casual, favorite)"
          value={tags}
          onChangeText={setTags}
        />

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add notes about this item..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <View style={styles.favoriteContainer}>
          <View>
            <Text style={styles.favoriteLabel}>Mark as Favorite</Text>
            <Text style={styles.favoriteSubtext}>Add to your favorites collection</Text>
          </View>
          <Switch
            value={favorite}
            onValueChange={setFavorite}
            trackColor={{ false: '#D1D5DB', true: '#FFC0CB' }}
            thumbColor={favorite ? '#8B7FD9' : '#f4f3f4'}
          />
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
          <Text style={styles.saveButtonText}>{isEditing ? 'Update Item' : 'Save Item'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F3F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#000',
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 40,
  },
  sectionHeader: {
    fontSize: 13,
    color: '#8B8B8B',
    marginBottom: 12,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    borderColor: '#E8E6E3',
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: Platform.OS === 'ios' ? 50 : 50,
    justifyContent: 'center',
  },
  picker: {
    height: Platform.OS === 'ios' ? 50 : 50,
    width: '100%',
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '500',
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
    borderColor: '#8B7FD9',
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 15,
    color: '#8B7FD9',
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
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    marginBottom: 16,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 17,
    color: '#1A1A1A',
  },
  favoriteContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
  },
  favoriteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  favoriteSubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: -12,
    marginBottom: 12,
    marginLeft: 4,
  },
  saveButton: {
    backgroundColor: '#8B7FD9',
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
    color: '#8B7FD9',
    marginTop: 4,
  },
  aiSuggestionContainer: {
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#8B7FD9',
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
