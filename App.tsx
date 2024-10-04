import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import AddItem from './components/AddItem'; // Ensure the path is correct

const App = (): React.JSX.Element => {
  return (
    <SafeAreaView style={styles.container}>
      {/* Rendering AddItem component */}
      <AddItem />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;

