/**
 * Weather data interfaces and types for the SmartCloset app
 */

/**
 * Weather data structure returned from the weather service
 */
export interface WeatherData {
  temperature: number;
  condition: string;
  conditionDescription: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  location: string;
  timestamp: number;
}

/**
 * Weather forecast data structure
 */
export interface WeatherForecast {
  daily: WeatherData[];
  hourly: WeatherData[];
}

/**
 * Weather condition categories for outfit recommendations
 */
export enum WeatherCondition {
  SUNNY = 'sunny',
  CLOUDY = 'cloudy',
  RAINY = 'rainy',
  SNOWY = 'snowy',
  STORMY = 'stormy',
  HOT = 'hot',
  COLD = 'cold',
  MILD = 'mild',
}

/**
 * Temperature ranges in Celsius
 */
export const TemperatureRanges = {
  COLD: { min: -50, max: 10 },
  MILD: { min: 10, max: 25 },
  HOT: { min: 25, max: 50 },
};

/**
 * Outfit suggestion based on weather conditions
 */
export interface OutfitSuggestion {
  tops: string[];
  bottoms: string[];
  accessories: string[];
  description: string;
}
