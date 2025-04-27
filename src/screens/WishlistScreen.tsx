import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

const WishlistScreen = () => {
  return (
    <View style={styles.container}>
      <Text>Wishlist</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});

export default WishlistScreen;
