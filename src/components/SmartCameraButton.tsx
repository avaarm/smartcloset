import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import CameraService, { CameraResult } from '../services/cameraService';
import GoogleVisionService from '../services/googleVisionService';
import { ClothingItem } from '../types';

interface SmartCameraButtonProps {
  onAnalysisComplete: (result: CameraResult) => void;
  onClothingItemGenerated: (item: Partial<ClothingItem>) => void;
}

const SmartCameraButton: React.FC<SmartCameraButtonProps> = ({
  onAnalysisComplete,
  onClothingItemGenerated,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CameraResult | null>(null);
  const [cameraService] = useState(() => new CameraService());
  const [googleVisionService] = useState(() => new GoogleVisionService());

  const handleCameraPress = async () => {
    try {
      setAnalyzing(true);
      
      // Show photo options (camera or gallery)
      const result = await cameraService.showPhotoOptions();
      
      if (result) {
        setAnalysisResult(result);
        setShowResults(true);
        onAnalysisComplete(result);
        
        if (result.clothingItem) {
          onClothingItemGenerated(result.clothingItem);
        }
      }
    } catch (error) {
      console.error('Camera/Analysis error:', error);
      Alert.alert(
        'Analysis Error',
        'Failed to analyze the image. Please try again or check your internet connection.',
        [{ text: 'OK' }]
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const testGoogleVisionConnection = async () => {
    try {
      const result = await googleVisionService.testConnection();
      Alert.alert(
        'Google Vision API Test',
        result.message,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Connection Test Failed',
        'Please check your API key configuration.',
        [{ text: 'OK' }]
      );
    }
  };

  const renderAnalysisResults = () => {
    if (!analysisResult?.analysis) return null;

    const { analysis } = analysisResult;

    return (
      <Modal
        visible={showResults}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>AI Analysis Results</Text>
            <TouchableOpacity
              onPress={() => setShowResults(false)}
              style={styles.closeButton}
            >
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Image Preview */}
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: analysisResult.imageUri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>

            {/* Analysis Results */}
            <View style={styles.resultSection}>
              <Text style={styles.sectionTitle}>🔍 Detection Results</Text>
              
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Item Name:</Text>
                <Text style={styles.resultValue}>{analysis.suggestedName}</Text>
              </View>

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Category:</Text>
                <Text style={styles.resultValue}>{analysis.category}</Text>
              </View>

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Subcategory:</Text>
                <Text style={styles.resultValue}>{analysis.subcategory}</Text>
              </View>

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Dominant Color:</Text>
                <View style={styles.colorRow}>
                  <View 
                    style={[
                      styles.colorSwatch, 
                      { backgroundColor: analysis.dominantColor }
                    ]} 
                  />
                  <Text style={styles.resultValue}>{analysis.dominantColor}</Text>
                </View>
              </View>

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>All Colors:</Text>
                <View style={styles.colorsContainer}>
                  {analysis.colors.map((color, index) => (
                    <View key={index} style={styles.colorTag}>
                      <View 
                        style={[styles.colorSwatch, { backgroundColor: color }]} 
                      />
                      <Text style={styles.colorText}>{color}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {analysis.brand && (
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Brand:</Text>
                  <Text style={styles.resultValue}>{analysis.brand}</Text>
                </View>
              )}

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Season:</Text>
                <Text style={styles.resultValue}>{analysis.season.join(', ')}</Text>
              </View>

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Style:</Text>
                <Text style={styles.resultValue}>{analysis.style.join(', ')}</Text>
              </View>

              {analysis.material && (
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Material:</Text>
                  <Text style={styles.resultValue}>{analysis.material}</Text>
                </View>
              )}

              {analysis.pattern && (
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Pattern:</Text>
                  <Text style={styles.resultValue}>{analysis.pattern}</Text>
                </View>
              )}

              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Confidence:</Text>
                <Text style={styles.resultValue}>
                  {Math.round(analysis.confidence * 100)}%
                </Text>
              </View>
            </View>

            {/* Text Detection Results */}
            {analysis.textDetected.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>📝 Text Detected</Text>
                {analysis.textDetected.slice(0, 5).map((text, index) => (
                  <Text key={index} style={styles.detectedText}>
                    • {text}
                  </Text>
                ))}
              </View>
            )}

            {/* Similar Products */}
            {analysis.similarProducts.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>🛍️ Similar Products</Text>
                {analysis.similarProducts.slice(0, 3).map((product, index) => (
                  <View key={index} style={styles.productItem}>
                    <Image
                      source={{ uri: product.imageUrl }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{product.name}</Text>
                      {product.brand && (
                        <Text style={styles.productBrand}>{product.brand}</Text>
                      )}
                      {product.price && (
                        <Text style={styles.productPrice}>{product.price}</Text>
                      )}
                      <Text style={styles.productSimilarity}>
                        {Math.round(product.similarity * 100)}% similar
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.useResultsButton}
              onPress={() => {
                setShowResults(false);
                // Results are already passed to parent via onAnalysisComplete
              }}
            >
              <Text style={styles.useResultsButtonText}>Use These Results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.smartCameraButton, analyzing && styles.analyzing]}
        onPress={handleCameraPress}
        disabled={analyzing}
      >
        {analyzing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Icon name="camera" size={24} color="#fff" />
        )}
        <Text style={styles.buttonText}>
          {analyzing ? 'Analyzing...' : 'Smart Scan'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.testButton}
        onPress={testGoogleVisionConnection}
      >
        <Icon name="checkmark-circle-outline" size={16} color="#666" />
        <Text style={styles.testButtonText}>Test API</Text>
      </TouchableOpacity>

      {renderAnalysisResults()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
  },
  smartCameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    justifyContent: 'center',
  },
  analyzing: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  testButtonText: {
    color: '#666',
    fontSize: 12,
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewImage: {
    width: 200,
    height: 240,
    borderRadius: 8,
  },
  resultSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  resultValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 2,
    justifyContent: 'flex-end',
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  colorsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 2,
    justifyContent: 'flex-end',
  },
  colorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    margin: 2,
  },
  colorText: {
    fontSize: 12,
    color: '#666',
  },
  detectedText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  productItem: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 4,
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  productBrand: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  productPrice: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
  },
  productSimilarity: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  useResultsButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  useResultsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SmartCameraButton;
