import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { ClothingCategory, Season } from '../types';

// Define WeatherCondition enum locally to avoid dependency on weatherService
enum WeatherCondition {
  SUNNY = 'sunny',
  CLOUDY = 'cloudy',
  RAINY = 'rainy',
  SNOWY = 'snowy',
  STORMY = 'stormy',
  HOT = 'hot',
  COLD = 'cold',
  MILD = 'mild',
}

// Define WeatherData interface locally
interface WeatherData {
  temperature: number;
  condition: string;
  conditionDescription: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  location: string;
  timestamp: number;
}

interface WeatherWidgetProps {
  onOutfitSuggestionPress?: () => void;
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  onOutfitSuggestionPress,
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchWeatherData();
  }, []);

  const fetchWeatherData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use hardcoded weather data instead of API calls
      const weatherData: WeatherData = {
        temperature: 72,
        condition: 'sunny',
        conditionDescription: 'Clear sky',
        icon: '01d',
        humidity: 60,
        windSpeed: 5,
        location: 'San Francisco, CA',
        timestamp: Date.now()
      };
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setWeather(weatherData);
    } catch (err) {
      console.error('Error setting weather data:', err);
      setError('Unable to display weather data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  // Local function to replace the imported getWeatherConditionCategory
  const getWeatherConditionCategory = (condition: string | undefined | null): WeatherCondition => {
    if (condition === undefined || condition === null) {
      return WeatherCondition.MILD;
    }
    
    const lowerCondition = condition.toLowerCase();
    
    if (lowerCondition.includes('sun') || lowerCondition.includes('clear')) {
      return WeatherCondition.SUNNY;
    } else if (lowerCondition.includes('cloud')) {
      return WeatherCondition.CLOUDY;
    } else if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle')) {
      return WeatherCondition.RAINY;
    } else if (lowerCondition.includes('snow')) {
      return WeatherCondition.SNOWY;
    } else if (lowerCondition.includes('storm') || lowerCondition.includes('thunder')) {
      return WeatherCondition.STORMY;
    } else if (lowerCondition.includes('hot')) {
      return WeatherCondition.HOT;
    } else if (lowerCondition.includes('cold')) {
      return WeatherCondition.COLD;
    } else {
      return WeatherCondition.MILD;
    }
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const getWeatherGradient = (condition: WeatherCondition): string[] => {
    switch (condition) {
      case WeatherCondition.SUNNY:
        return ['#FFD700', '#FFA500']; // Gold to Orange
      case WeatherCondition.CLOUDY:
        return ['#B0C4DE', '#778899']; // Light Steel Blue to Slate Gray
      case WeatherCondition.RAINY:
        return ['#4682B4', '#000080']; // Steel Blue to Navy
      case WeatherCondition.SNOWY:
        return ['#E0FFFF', '#B0E0E6']; // Light Cyan to Powder Blue
      case WeatherCondition.STORMY:
        return ['#483D8B', '#191970']; // Dark Slate Blue to Midnight Blue
      case WeatherCondition.HOT:
        return ['#FF8C00', '#FF4500']; // Dark Orange to Orange Red
      case WeatherCondition.COLD:
        return ['#87CEEB', '#4169E1']; // Sky Blue to Royal Blue
      case WeatherCondition.MILD:
        return ['#98FB98', '#3CB371']; // Pale Green to Medium Sea Green
      default:
        return ['#F5F5F5', '#E0E0E0']; // White Smoke to Gainsboro
    }
  };

  const getOutfitSuggestion = (condition: WeatherCondition): {
    tops: string[];
    bottoms: string[];
    accessories: string[];
    description: string;
  } => {
    switch (condition) {
      case WeatherCondition.SUNNY:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Sunglasses', 'Hat', 'Sunscreen'],
          description: 'Light, breathable clothing to stay cool in the sun.',
        };
      case WeatherCondition.CLOUDY:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Light jacket'],
          description: 'Comfortable layers that can adapt to changing conditions.',
        };
      case WeatherCondition.RAINY:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Umbrella', 'Waterproof jacket', 'Waterproof shoes'],
          description: 'Water-resistant items to stay dry in the rain.',
        };
      case WeatherCondition.SNOWY:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Winter coat', 'Gloves', 'Scarf', 'Boots', 'Hat'],
          description: 'Warm, insulated layers to protect against the cold and snow.',
        };
      case WeatherCondition.STORMY:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Waterproof jacket', 'Umbrella', 'Waterproof shoes'],
          description: 'Sturdy, waterproof items for protection against strong winds and rain.',
        };
      case WeatherCondition.HOT:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Sunglasses', 'Hat', 'Sunscreen'],
          description: 'Minimal, light-colored clothing to stay cool in hot weather.',
        };
      case WeatherCondition.COLD:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Coat', 'Gloves', 'Scarf', 'Hat'],
          description: 'Warm layers to insulate against the cold.',
        };
      case WeatherCondition.MILD:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: ['Light jacket'],
          description: 'Comfortable, medium-weight clothing for mild temperatures.',
        };
      default:
        return {
          tops: ['tops'],
          bottoms: ['bottoms'],
          accessories: [],
          description: 'Versatile, everyday clothing suitable for most conditions.',
        };
    }
  };

  const getWeatherIcon = (condition: WeatherCondition): string => {
    switch (condition) {
      case WeatherCondition.SUNNY:
        return 'https://openweathermap.org/img/wn/01d@2x.png';
      case WeatherCondition.CLOUDY:
        return 'https://openweathermap.org/img/wn/03d@2x.png';
      case WeatherCondition.RAINY:
        return 'https://openweathermap.org/img/wn/10d@2x.png';
      case WeatherCondition.SNOWY:
        return 'https://openweathermap.org/img/wn/13d@2x.png';
      case WeatherCondition.STORMY:
        return 'https://openweathermap.org/img/wn/11d@2x.png';
      case WeatherCondition.HOT:
        return 'https://openweathermap.org/img/wn/01d@2x.png';
      case WeatherCondition.COLD:
        return 'https://openweathermap.org/img/wn/13d@2x.png';
      case WeatherCondition.MILD:
      default:
        return 'https://openweathermap.org/img/wn/02d@2x.png';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading weather data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="cloud-offline-outline" size={40} color="#FF385C" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchWeatherData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!weather) {
    return null;
  }

  const weatherCondition = getWeatherConditionCategory(weather.condition);
  const gradientColors = getWeatherGradient(weatherCondition);
  const outfitSuggestion = getOutfitSuggestion(weatherCondition);
  const weatherIcon = getWeatherIcon(weatherCondition);

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={toggleExpanded}
      activeOpacity={0.9}
    >
      <LinearGradient
        colors={gradientColors}
        style={styles.gradientContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.headerRow}>
          <View style={styles.weatherInfo}>
            <Text style={styles.location}>{weather.location}</Text>
            <View style={styles.temperatureContainer}>
              <Text style={styles.temperature}>{weather.temperature}°C</Text>
              <Image source={{ uri: weatherIcon }} style={styles.weatherIcon} />
            </View>
            <Text style={styles.condition}>{weather.condition}</Text>
          </View>
          <View style={styles.weatherDetails}>
            <View style={styles.detailItem}>
              <Icon name="water-outline" size={14} color="#FFFFFF" />
              <Text style={styles.detailText}>{weather.humidity}%</Text>
            </View>
            <View style={styles.detailItem}>
              <Icon name="speedometer-outline" size={14} color="#FFFFFF" />
              <Text style={styles.detailText}>{weather.windSpeed} mph</Text>
            </View>
          </View>
        </View>

        {expanded && (
          <View style={styles.outfitSuggestionContainer}>
            <Text style={styles.outfitHeader}>Outfit Suggestion</Text>
            <Text style={styles.outfitDescription}>
              {outfitSuggestion.description}
            </Text>
            
            <View style={styles.outfitCategories}>
              <View style={styles.categoryColumn}>
                <Text style={styles.categoryTitle}>Tops</Text>
                {outfitSuggestion.tops.map((top, index) => (
                  <Text key={`top-${index}`} style={styles.categoryItem}>
                    • {top}
                  </Text>
                ))}
              </View>
              
              <View style={styles.categoryColumn}>
                <Text style={styles.categoryTitle}>Bottoms</Text>
                {outfitSuggestion.bottoms.map((bottom, index) => (
                  <Text key={`bottom-${index}`} style={styles.categoryItem}>
                    • {bottom}
                  </Text>
                ))}
              </View>
              
              <View style={styles.categoryColumn}>
                <Text style={styles.categoryTitle}>Accessories</Text>
                {outfitSuggestion.accessories.map((accessory, index) => (
                  <Text key={`accessory-${index}`} style={styles.categoryItem}>
                    • {accessory}
                  </Text>
                ))}
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.createOutfitButton}
              onPress={onOutfitSuggestionPress}
              activeOpacity={0.7}
            >
              <Text style={styles.createOutfitButtonText}>Create Outfit</Text>
              <Icon name="arrow-forward-outline" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.expandIconContainer}>
          <Icon
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={20}
            color="#FFFFFF"
          />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gradientContainer: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  weatherInfo: {
    flex: 1,
  },
  location: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  temperatureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  temperature: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  weatherIcon: {
    marginLeft: 8,
  },
  condition: {
    fontSize: 16,
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  weatherDetails: {
    alignItems: 'flex-end',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 4,
  },
  outfitSuggestionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  outfitHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  outfitDescription: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  outfitCategories: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  categoryColumn: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  categoryItem: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  createOutfitButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  createOutfitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },
  expandIconContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  loadingContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FFF1F0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#FF385C',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#FF385C',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default WeatherWidget;
