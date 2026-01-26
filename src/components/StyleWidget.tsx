import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '../styles/theme';

interface StyleWidgetProps {
  onOutfitSuggestionPress?: () => void;
}

const StyleWidget: React.FC<StyleWidgetProps> = ({
  onOutfitSuggestionPress,
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.9}
      >
        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>STYLE INSPIRATION</Text>
            <Text style={styles.subtitle}>Curated looks for your wardrobe</Text>
          </View>
          <Icon
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={20}
            color="#333333"
            style={styles.expandIcon}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.contentContainer}>
          <View style={styles.imageContainer}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80' }} 
              style={styles.styleImage}
            />
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80' }} 
              style={styles.styleImage}
            />
          </View>
          
          <Text style={styles.inspirationText}>
            Explore curated outfits based on your wardrobe. Mix and match pieces to create your signature look.
          </Text>
          
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => {
              console.log('Create Outfit button pressed');
              if (onOutfitSuggestionPress) {
                onOutfitSuggestionPress();
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.createButtonText}>CREATE OUTFIT</Text>
            <Icon name="arrow-forward-outline" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const { width } = Dimensions.get('window');
const imageWidth = (width - 48) / 2 - 8;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 16,
    overflow: 'hidden',
    ...theme.shadows.subtle,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mediumGray,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.text,
    letterSpacing: 0,
  },
  expandIcon: {
    marginLeft: 8,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  imageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.medium,
  },
  styleImage: {
    width: '48%',
    height: 140,
    borderRadius: 12,
    backgroundColor: theme.colors.mutedBackground,
  },
  inspirationText: {
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.mediumGray,
    lineHeight: 22,
    marginBottom: 16,
    letterSpacing: 0,
  },
  createButton: {
    backgroundColor: theme.colors.text,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});

export default StyleWidget;
