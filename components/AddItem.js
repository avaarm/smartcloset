import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';

const AddItem = () => {
  // State to hold the new item
  const [item, setItem] = useState('');

  // Function to handle adding item
  const handleAddItem = () => {
    if (item.trim()) {
      console.log('Item added:', item);
      // Reset input field after adding the item
      setItem('');
    } else {
      console.log('Item cannot be empty');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add New Item</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter item name"
        value={item}
        onChangeText={setItem} // Updates the state when text changes
      />
      <Button title="Add Item" onPress={handleAddItem} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    padding: 10,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 20,
    borderRadius: 5,
  },
});

export default AddItem;
