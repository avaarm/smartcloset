import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { ClothingItem } from '../types';

interface ClothingCardProps {
  item: ClothingItem;
  onPress?: () => void;
}

const ClothingCard = ({ item, onPress }: ClothingCardProps) => {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Image
        source={{ uri: item.retailerImage || item.userImage }}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.details}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.brand}>{item.brand}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    margin: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 150,
  },
  details: {
    padding: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  brand: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});

export default ClothingCard;
