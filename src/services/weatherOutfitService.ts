import { ClothingItem, Season } from '../types';
import { WeatherCondition, WeatherData } from '../types/weather';
import { getCurrentWeather, getCurrentLocation, getCurrentSeason } from './weatherService';
import { generateOutfitSuggestions, Outfit } from './outfitService';

export interface WeatherOutfitRecommendation {
  weather: WeatherData;
  recommendedOutfits: Outfit[];
  tips: string[];
}

export class WeatherOutfitService {
  /**
   * Get outfit recommendations based on current weather
   */
  static async getWeatherBasedRecommendations(
    items: ClothingItem[],
    count: number = 3
  ): Promise<WeatherOutfitRecommendation> {
    try {
      // Get current location and weather
      const location = await getCurrentLocation();
      const weather = await getCurrentWeather(location.latitude, location.longitude);

      // Filter items suitable for current weather
      const suitableItems = this.filterItemsByWeather(items, weather);

      // Generate outfit suggestions from suitable items
      const outfits = generateOutfitSuggestions(suitableItems, count);

      // Generate weather-specific tips
      const tips = this.generateWeatherTips(weather);

      return {
        weather,
        recommendedOutfits: outfits,
        tips,
      };
    } catch (error) {
      console.error('Error getting weather-based recommendations:', error);
      throw error;
    }
  }

  /**
   * Filter clothing items based on weather conditions
   */
  private static filterItemsByWeather(
    items: ClothingItem[],
    weather: WeatherData
  ): ClothingItem[] {
    const { temperature, condition } = weather;
    const currentSeason = getCurrentSeason();

    return items.filter((item) => {
      // Check season compatibility
      const seasonMatch = !item.season || item.season.length === 0 || item.season.includes(currentSeason);

      // Temperature-based filtering
      const tempMatch = this.isItemSuitableForTemp(item, temperature);

      // Condition-based filtering
      const conditionMatch = this.isItemSuitableForCondition(item, condition);

      return seasonMatch && tempMatch && conditionMatch;
    });
  }

  /**
   * Check if item is suitable for temperature
   */
  private static isItemSuitableForTemp(item: ClothingItem, temp: number): boolean {
    const category = item.category;

    if (temp < 40) {
      // Very cold - need warm items
      return ['outerwear', 'accessories'].includes(category) || 
             (category === 'tops' && item.name.toLowerCase().includes('sweater'));
    } else if (temp < 60) {
      // Cool - layers recommended
      return true; // All items suitable
    } else if (temp < 75) {
      // Mild - most items suitable
      return category !== 'outerwear' || item.name.toLowerCase().includes('light');
    } else {
      // Hot - light items only
      return !['outerwear'].includes(category) &&
             !item.name.toLowerCase().includes('sweater') &&
             !item.name.toLowerCase().includes('heavy');
    }
  }

  /**
   * Check if item is suitable for weather condition
   */
  private static isItemSuitableForCondition(
    item: ClothingItem,
    condition: WeatherCondition
  ): boolean {
    const itemName = item.name.toLowerCase();
    const category = item.category;

    switch (condition) {
      case 'rainy':
      case 'stormy':
        // Prefer waterproof or covered shoes, avoid delicate items
        if (category === 'shoes') {
          return !itemName.includes('sandal') && !itemName.includes('open');
        }
        // Recommend jackets
        if (category === 'outerwear') {
          return true;
        }
        return !itemName.includes('suede') && !itemName.includes('silk');

      case 'snowy':
        // Winter items, boots, warm accessories
        if (category === 'shoes') {
          return itemName.includes('boot');
        }
        if (category === 'accessories') {
          return itemName.includes('scarf') || itemName.includes('glove') || itemName.includes('hat');
        }
        return category === 'outerwear' || itemName.includes('sweater');

      case 'windy':
        // Avoid loose items, prefer fitted clothing
        return category !== 'dresses' || !itemName.includes('maxi');

      case 'sunny':
        // Light, breathable items
        return true;

      case 'cloudy':
      case 'foggy':
        // Most items suitable
        return true;

      default:
        return true;
    }
  }

  /**
   * Generate weather-specific outfit tips
   */
  private static generateWeatherTips(weather: WeatherData): string[] {
    const tips: string[] = [];
    const { temperature, condition, windSpeed, humidity } = weather;

    // Temperature tips
    if (temperature < 40) {
      tips.push('🧥 Layer up! It\'s very cold outside.');
      tips.push('🧣 Don\'t forget a scarf and gloves.');
    } else if (temperature < 60) {
      tips.push('🧥 Consider bringing a jacket or cardigan.');
    } else if (temperature > 80) {
      tips.push('☀️ Stay cool with light, breathable fabrics.');
      tips.push('🧴 Don\'t forget sunscreen!');
    }

    // Condition tips
    switch (condition) {
      case 'rainy':
      case 'stormy':
        tips.push('☔ Bring an umbrella or raincoat.');
        tips.push('👢 Wear waterproof shoes.');
        break;
      case 'snowy':
        tips.push('❄️ Wear warm boots and winter accessories.');
        tips.push('🧤 Gloves and a hat are essential.');
        break;
      case 'sunny':
        tips.push('😎 Sunglasses recommended.');
        tips.push('🧢 Consider a hat for sun protection.');
        break;
      case 'windy':
        tips.push('🌬️ Avoid loose, flowing garments.');
        tips.push('💨 Secure accessories like hats.');
        break;
    }

    // Humidity tips
    if (humidity > 70) {
      tips.push('💧 High humidity - choose breathable fabrics.');
    }

    // Wind tips
    if (windSpeed > 15) {
      tips.push('🌪️ Strong winds - dress accordingly.');
    }

    return tips;
  }

  /**
   * Get weather icon name for display
   */
  static getWeatherIcon(condition: WeatherCondition): string {
    const iconMap: Record<WeatherCondition, string> = {
      sunny: 'sunny',
      cloudy: 'cloudy',
      rainy: 'rainy',
      snowy: 'snow',
      windy: 'cloudy-night',
      foggy: 'cloud',
      stormy: 'thunderstorm',
    };
    return iconMap[condition] || 'sunny';
  }

  /**
   * Get weather description
   */
  static getWeatherDescription(condition: WeatherCondition, temp: number): string {
    const conditionText = condition.charAt(0).toUpperCase() + condition.slice(1);
    return `${conditionText}, ${temp}°F`;
  }
}
