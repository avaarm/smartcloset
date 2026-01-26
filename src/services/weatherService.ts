import { WeatherCondition, WeatherData, WeatherForecast } from '../types/weather';
import { Season } from '../types';

/**
 * Simplified weather service with mock data
 * This is a temporary version to avoid type errors
 */

export const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number }> => {
  return Promise.resolve({
    latitude: 37.7749,
    longitude: -122.4194,
  });
};

export const getCurrentWeather = async (
  latitude: number,
  longitude: number
): Promise<WeatherData> => {
  const conditions: WeatherCondition[] = ['sunny', 'cloudy', 'rainy'];
  const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
  
  return {
    condition: randomCondition,
    temperature: Math.floor(Math.random() * 30) + 50,
    feelsLike: Math.floor(Math.random() * 30) + 50,
    humidity: Math.floor(Math.random() * 50) + 30,
    windSpeed: Math.floor(Math.random() * 20) + 5,
    location: 'San Francisco, CA',
    timestamp: new Date().toISOString(),
  };
};

export const getWeatherForecast = async (
  latitude: number,
  longitude: number,
  days: number = 7
): Promise<WeatherForecast[]> => {
  const forecasts: WeatherForecast[] = [];
  const conditions: WeatherCondition[] = ['sunny', 'cloudy', 'rainy'];
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    
    forecasts.push({
      date: date.toISOString(),
      condition: conditions[Math.floor(Math.random() * conditions.length)],
      highTemp: Math.floor(Math.random() * 20) + 60,
      lowTemp: Math.floor(Math.random() * 20) + 40,
    });
  }
  
  return forecasts;
};

export const getCurrentSeason = (): Season => {
  const now = new Date();
  const month = now.getMonth();
  
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
};

export const getWeatherConditionCategory = (condition: string | WeatherCondition | undefined | null): WeatherCondition => {
  if (!condition) return 'sunny';
  
  const conditionLower = condition.toLowerCase();
  
  if (conditionLower.includes('sun') || conditionLower.includes('clear')) return 'sunny';
  if (conditionLower.includes('cloud') || conditionLower.includes('overcast')) return 'cloudy';
  if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) return 'rainy';
  if (conditionLower.includes('snow') || conditionLower.includes('sleet')) return 'snowy';
  if (conditionLower.includes('wind')) return 'windy';
  if (conditionLower.includes('fog') || conditionLower.includes('mist')) return 'foggy';
  if (conditionLower.includes('storm') || conditionLower.includes('thunder')) return 'stormy';
  
  return 'sunny';
};
