import React, { useEffect, useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, StyleSheet, FlatList, TouchableOpacity, Text } from 'react-native';
import ClothingItem from '../components/ClothingItem';
import { ClothingItem as ClothingItemType } from '../data/sampleClothes';
import { getClothingItems } from '../services/storage';

type WardrobeScreenProps = {
  navigation: NativeStackNavigationProp<any, 'WardrobeMain'>;
};

const WardrobeScreen = ({ navigation }: WardrobeScreenProps) => {
  const [clothes, setClothes] = useState<ClothingItemType[]>([]);

  useEffect(() => {
    const loadClothes = async () => {
      const items = await getClothingItems();
      setClothes(items);
    };
    loadClothes();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      const items = await getClothingItems();
      setClothes(items);
    });

    return unsubscribe;
  }, [navigation]);
  const renderItem = ({ item }: { item: ClothingItemType }) => (
    <ClothingItem item={item} />
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={clothes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity 
        style={styles.addButton}
        onPress={() => navigation.navigate('AddClothing')}
      >
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 8,
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6200ee',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addButtonText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '300',
  },
});

export default WardrobeScreen;
