import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { ClothingItem } from '../types';
import { itemImages } from '../utils/itemImages';
import PhotoCountBadge from './PhotoCountBadge';

interface ClothingCardProps {
  item: ClothingItem;
  onPress?: () => void;
}

const ClothingCard = ({ item, onPress }: ClothingCardProps) => {
  const [imageError, setImageError] = useState(false);
  // The card shows the cover (the same picture the wardrobe grid shows); more photos only add the count badge.
  const photos = itemImages(item);
  const cover = photos[0];
  useEffect(() => {
    setImageError(false);
  }, [cover]);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View>
        <Image
          source={imageError ? undefined : { uri: cover }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
        <PhotoCountBadge count={photos.length} />
      </View>
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
