/**
 * Weather service using the Open-Meteo API (free, no API key required).
 *
 * Open-Meteo provides hourly + daily forecasts at any lat/lon.
 * Docs: https://open-meteo.com/en/docs
 */

import Geolocation from '@react-native-community/geolocation';
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

Geolocation.setRNConfiguration({ skipPermissionRequests: false, authorizationLevel: 'whenInUse' });

/** Rounded to ~1 km: weather doesn't need more, and less precise data leaves the phone. */
const roundCoord = (n: number): number => Math.round(n * 100) / 100;

/**
 * The user's approximate current location (asks for permission the first time).
 * Rejects if permission is denied or no fix is available - callers hide weather
 * rather than showing made-up data.
 */
export const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      pos =>
        resolve({
          latitude: roundCoord(pos.coords.latitude),
          longitude: roundCoord(pos.coords.longitude),
        }),
      err => reject(new Error(`location_unavailable: ${err?.message ?? 'unknown'}`)),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  });

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

    return {
      condition: wmoToCondition(c.weather_code),
      temperature: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: Math.round(c.relative_humidity_2m),
      windSpeed: Math.round(c.wind_speed_10m),
      location: 'Near you',
      timestamp: c.time || new Date().toISOString(),
    };
  } catch (error) {
    // No invented data: callers hide the weather card / fall back to season-only tips.
    console.warn('Weather API error:', error);
    throw error;
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
    console.warn('Forecast API error:', error);
    throw error;
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
