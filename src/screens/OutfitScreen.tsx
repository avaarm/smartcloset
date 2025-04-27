import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

const OutfitScreen = () => {
  return (
    <View style={styles.container}>
      <Text>Outfit Suggestions</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});

export default OutfitScreen;
