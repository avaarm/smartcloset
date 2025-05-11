import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import type { ClothingItem as ClothingItemType } from '../data/sampleClothes';

interface Props {
  item: ClothingItemType;
}

const ClothingItem: React.FC<Props> = ({ item }) => {
  return (
    <View style={styles.container}>
      <Image source={{ uri: item.imageUrl }} style={styles.image} />
      <View style={styles.details}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.category}>{item.category}</Text>
        {item.brand && <Text style={styles.brand}>{item.brand}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 10,
    margin: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: Dimensions.get('window').width / 2 - 24,
    height: 200,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  details: {
    padding: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  category: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  brand: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
});

export default ClothingItem;
