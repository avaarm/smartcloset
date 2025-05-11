import React, { useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useCallback } from 'react';
import * as ImagePicker from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { saveClothingItem } from '../services/storage';
import { ClothingCategory, Season } from '../types/clothing';

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
        setImageUri(response.assets[0].uri);
      }
    });
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
        season: season || undefined
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
        <TouchableOpacity style={styles.imageContainer} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.placeholder}>
              <Icon name="camera-outline" size={40} color="#007AFF" />
              <Text style={styles.placeholderText}>Add Photo</Text>
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
});

export default AddClothingScreen;
