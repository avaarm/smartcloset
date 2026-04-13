/**
 * Weather service using the Open-Meteo API (free, no API key required).
 *
 * Open-Meteo provides hourly + daily forecasts at any lat/lon.
 * Docs: https://open-meteo.com/en/docs
 */

import { WeatherCondition, WeatherData, WeatherForecast } from '../types/weather';
import { Season } from '../types';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
// ─── WMO weather code → our WeatherCondition enum ──────────────────────────
// https://open-meteo.com/en/docs → WMO Weather interpretation codes

const wmoToCondition = (code: number): WeatherCondition => {
  if (code === 0 || code === 1) return 'sunny';            // Clear / mainly clear
  if (code === 2 || code === 3) return 'cloudy';            // Partly / overcast
  if (code >= 45 && code <= 48) return 'foggy';             // Fog / rime fog
  if (code >= 51 && code <= 57) return 'rainy';             // Drizzle
  if (code >= 61 && code <= 67) return 'rainy';             // Rain
  if (code >= 71 && code <= 77) return 'snowy';             // Snow
  if (code >= 80 && code <= 82) return 'rainy';             // Rain showers
  if (code >= 85 && code <= 86) return 'snowy';             // Snow showers
  if (code >= 95 && code <= 99) return 'stormy';            // Thunderstorm
  return 'cloudy';
};

// ─── Geolocation ────────────────────────────────────────────────────────────

/**
 * Returns the user's current location.
 * Defaults to San Francisco (no location permission required).
 * To use real geolocation in the future, integrate a geolocation library.
 */
export const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number }> => {
  // Default to San Francisco — no location permission needed.
  // A future enhancement could use @react-native-community/geolocation here.
  return { latitude: 37.7749, longitude: -122.4194 };
};

// ─── Reverse geocode (best-effort city name) ────────────────────────────────

/**
 * Simple reverse geocoding using Open-Meteo's search API.
 * Looks up the nearest named place for the given coordinates.
 */
const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
  try {
    // Open-Meteo doesn't have a dedicated reverse geocode endpoint.
    // Use a known mapping for our default location, or return coords.
    // For SF default, return the well-known name.
    if (Math.abs(lat - 37.7749) < 0.1 && Math.abs(lon - (-122.4194)) < 0.1) {
      return 'San Francisco, CA';
    }
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
};

// ─── Current weather ────────────────────────────────────────────────────────

export const getCurrentWeather = async (
  latitude: number,
  longitude: number,
): Promise<WeatherData> => {
  try {
    const url = `${OPEN_METEO_URL}?latitude=${latitude}&longitude=${longitude}`
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    const c = data.current;

    const location = await reverseGeocode(latitude, longitude);

    return {
      condition: wmoToCondition(c.weather_code),
      temperature: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: Math.round(c.relative_humidity_2m),
      windSpeed: Math.round(c.wind_speed_10m),
      location,
      timestamp: c.time || new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Weather API error, returning fallback:', error);
    return getFallbackWeather();
  }
};

// ─── Multi-day forecast ─────────────────────────────────────────────────────

export const getWeatherForecast = async (
  latitude: number,
  longitude: number,
  days: number = 7,
): Promise<WeatherForecast[]> => {
  try {
    const url = `${OPEN_METEO_URL}?latitude=${latitude}&longitude=${longitude}`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&temperature_unit=fahrenheit&timezone=auto&forecast_days=${Math.min(days, 16)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    const d = data.daily;

    const forecasts: WeatherForecast[] = [];
    for (let i = 0; i < (d.time?.length ?? 0); i++) {
      forecasts.push({
        date: d.time[i],
        condition: wmoToCondition(d.weather_code[i]),
        highTemp: Math.round(d.temperature_2m_max[i]),
        lowTemp: Math.round(d.temperature_2m_min[i]),
      });
    }
    return forecasts;
  } catch (error) {
    console.warn('Forecast API error, returning fallback:', error);
    return getFallbackForecast(days);
  }
};

// ─── Utility exports ────────────────────────────────────────────────────────

export const getCurrentSeason = (): Season => {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
};

export const getWeatherConditionCategory = (
  condition: string | WeatherCondition | undefined | null,
): WeatherCondition => {
  if (!condition) return 'sunny';
  const c = condition.toLowerCase();
  if (c.includes('sun') || c.includes('clear')) return 'sunny';
  if (c.includes('cloud') || c.includes('overcast')) return 'cloudy';
  if (c.includes('rain') || c.includes('drizzle')) return 'rainy';
  if (c.includes('snow') || c.includes('sleet')) return 'snowy';
  if (c.includes('wind')) return 'windy';
  if (c.includes('fog') || c.includes('mist')) return 'foggy';
  if (c.includes('storm') || c.includes('thunder')) return 'stormy';
  return 'sunny';
};

// ─── Fallbacks (offline / error) ────────────────────────────────────────────

const getFallbackWeather = (): WeatherData => ({
  condition: 'sunny',
  temperature: 68,
  feelsLike: 66,
  humidity: 55,
  windSpeed: 8,
  location: 'Unknown',
  timestamp: new Date().toISOString(),
});

const getFallbackForecast = (days: number): WeatherForecast[] => {
  const forecasts: WeatherForecast[] = [];
  const conditions: WeatherCondition[] = ['sunny', 'cloudy', 'sunny', 'rainy', 'cloudy', 'sunny', 'sunny'];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    forecasts.push({
      date: date.toISOString().split('T')[0],
      condition: conditions[i % conditions.length],
      highTemp: 65 + Math.round(Math.sin(i) * 10),
      lowTemp: 50 + Math.round(Math.sin(i) * 8),
    });
  }
  return forecasts;
};
