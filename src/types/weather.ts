/**
 * Weather types for the SmartCloset app
 */

export type WeatherCondition = 
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'snowy'
  | 'windy'
  | 'foggy'
  | 'stormy';

export interface WeatherData {
  condition: WeatherCondition;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  location: string;
  timestamp: string;
}

export interface WeatherForecast {
  date: string;
  condition: WeatherCondition;
  highTemp: number;
  lowTemp: number;
}

/**
 * Outfit suggestion structure
 */
export interface OutfitSuggestion {
  tops: string[];
  bottoms: string[];
  accessories: string[];
  description: string;
}
