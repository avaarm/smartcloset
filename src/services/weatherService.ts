import { WeatherCondition, WeatherData, WeatherForecast } from '../types/weather';
import { Season } from '../types';

/**
 * Get the user's current location
 * @returns Promise with the location coordinates
 */
export const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number }> => {
  // In a real app, we would use the Geolocation API
  // For demo purposes, returning a default location (San Francisco)
  return Promise.resolve({
    latitude: 37.7749,
    longitude: -122.4194,
  });
};

/**
 * Get current weather data based on coordinates
 * @param latitude Latitude coordinate
 * @param longitude Longitude coordinate
 * @returns Promise with weather data
 */
export const getCurrentWeather = async (
  latitude: number,
  longitude: number
): Promise<WeatherData> => {
  // In a real app, we would make an API call to a weather service
  // For demo purposes, returning mock data
  
  // Generate a somewhat random weather condition for demo purposes
  const conditions = Object.values(WeatherCondition);
  const randomIndex = Math.floor(Math.random() * conditions.length);
  const condition = conditions[randomIndex];
  
  // Generate a temperature appropriate for the condition
  let temperature = 70; // Default mild temperature
  switch (condition) {
    case WeatherCondition.HOT:
    case WeatherCondition.SUNNY:
      temperature = 80 + Math.floor(Math.random() * 15); // 80-95°F
      break;
    case WeatherCondition.COLD:
    case WeatherCondition.SNOWY:
      temperature = 20 + Math.floor(Math.random() * 20); // 20-40°F
      break;
    case WeatherCondition.RAINY:
    case WeatherCondition.CLOUDY:
    case WeatherCondition.STORMY:
      temperature = 50 + Math.floor(Math.random() * 20); // 50-70°F
      break;
    case WeatherCondition.MILD:
      temperature = 65 + Math.floor(Math.random() * 10); // 65-75°F
      break;
  }

  return {
    temperature,
    condition,
    conditionDescription: getConditionDescription(condition as WeatherCondition),
    icon: getWeatherIconName(condition as WeatherCondition),
    humidity: 40 + Math.floor(Math.random() * 40), // 40-80%
    windSpeed: 5 + Math.floor(Math.random() * 15), // 5-20 mph
    location: 'San Francisco, CA',
    timestamp: Date.now(),
  };
};

/**
 * Get a weather forecast for the next few days
 * @param latitude Latitude coordinate
 * @param longitude Longitude coordinate
 * @returns Promise with forecast data
 */
export const getWeatherForecast = async (
  latitude: number,
  longitude: number
): Promise<WeatherForecast> => {
  // Mock forecast data
  const hourlyData: WeatherData[] = [];
  const dailyData: WeatherData[] = [];
  
  // Generate hourly forecast for the next 24 hours
  for (let i = 0; i < 24; i++) {
    const baseWeather = await getCurrentWeather(latitude, longitude);
    hourlyData.push({
      ...baseWeather,
      timestamp: Date.now() + i * 60 * 60 * 1000, // Add hours
    });
  }
  
  // Generate daily forecast for the next 7 days
  for (let i = 0; i < 7; i++) {
    const baseWeather = await getCurrentWeather(latitude, longitude);
    dailyData.push({
      ...baseWeather,
      timestamp: Date.now() + i * 24 * 60 * 60 * 1000, // Add days
    });
  }
  
  return {
    hourly: hourlyData,
    daily: dailyData,
  };
};

/**
 * Get the URL for a weather icon based on the condition
 * @param condition Weather condition
 * @returns URL string for the icon
 */
export const getWeatherIconUrl = (condition: WeatherCondition): string => {
  // In a real app, we would use icons from a weather API
  // For demo purposes, returning placeholder URLs
  const iconName = getWeatherIconName(condition);
  return `https://openweathermap.org/img/wn/${iconName}@2x.png`;
};

/**
 * Get the icon name for a weather condition
 * @param condition Weather condition
 * @returns Icon name string
 */
const getWeatherIconName = (condition: WeatherCondition): string => {
  switch (condition) {
    case WeatherCondition.SUNNY:
      return '01d';
    case WeatherCondition.CLOUDY:
      return '03d';
    case WeatherCondition.RAINY:
      return '10d';
    case WeatherCondition.SNOWY:
      return '13d';
    case WeatherCondition.STORMY:
      return '11d';
    case WeatherCondition.HOT:
      return '01d';
    case WeatherCondition.COLD:
      return '13d';
    case WeatherCondition.MILD:
      return '02d';
    default:
      return '01d';
  }
};

/**
 * Get a description for a weather condition
 * @param condition Weather condition
 * @returns Description string
 */
const getConditionDescription = (condition: WeatherCondition): string => {
  switch (condition) {
    case WeatherCondition.SUNNY:
      return 'Clear sky';
    case WeatherCondition.CLOUDY:
      return 'Cloudy';
    case WeatherCondition.RAINY:
      return 'Rain';
    case WeatherCondition.SNOWY:
      return 'Snow';
    case WeatherCondition.STORMY:
      return 'Thunderstorm';
    case WeatherCondition.HOT:
      return 'Very hot';
    case WeatherCondition.COLD:
      return 'Very cold';
    case WeatherCondition.MILD:
      return 'Mild';
    default:
      return 'Unknown';
  }
};

/**
 * Get the current season based on the date
 * @returns Current season
 */
export const getCurrentSeason = (): Season => {
  const now = new Date();
  const month = now.getMonth();
  
  // Northern hemisphere seasons
  if (month >= 2 && month <= 4) return Season.SPRING;
  if (month >= 5 && month <= 7) return Season.SUMMER;
  if (month >= 8 && month <= 10) return Season.FALL;
  return Season.WINTER;
};

/**
 * Get the weather condition category for outfit recommendations
 * @param condition Weather condition string from API or WeatherCondition enum
 * @returns WeatherCondition enum value
 */
export const getWeatherConditionCategory = (condition: string | WeatherCondition | undefined | null): WeatherCondition => {
  // If condition is undefined or null, return a default value
  if (condition === undefined || condition === null) {
    return WeatherCondition.MILD; // Default to mild weather if no condition provided
  }

  // If condition is already a WeatherCondition enum value, return it directly
  if (Object.values(WeatherCondition).includes(condition as WeatherCondition)) {
    return condition as WeatherCondition;
  }
  
  // If condition is a string, process it
  if (typeof condition === 'string') {
    const lowerCondition = condition.toLowerCase();
    
    if (lowerCondition.includes('clear') || lowerCondition.includes('sun')) {
      return WeatherCondition.SUNNY;
    }
    
    if (lowerCondition.includes('cloud')) {
      return WeatherCondition.CLOUDY;
    }
    
    if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle')) {
      return WeatherCondition.RAINY;
    }
    
    if (lowerCondition.includes('snow') || lowerCondition.includes('sleet') || lowerCondition.includes('ice')) {
      return WeatherCondition.SNOWY;
    }
    
    if (lowerCondition.includes('thunder') || lowerCondition.includes('storm')) {
      return WeatherCondition.STORMY;
    }
  }
  
  // Default to mild if no specific condition matches or if condition is undefined
  return WeatherCondition.MILD;
};
