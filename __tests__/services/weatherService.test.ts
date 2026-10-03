import Geolocation from '@react-native-community/geolocation';
import { getCurrentLocation, getCurrentWeather, getWeatherForecast } from '../../src/services/weatherService';

const mockGetPosition = Geolocation.getCurrentPosition as unknown as jest.Mock;

beforeEach(() => {
  mockGetPosition.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('getCurrentLocation', () => {
  it('returns the device location rounded to about 1 km', async () => {
    mockGetPosition.mockImplementation((ok: any) => ok({ coords: { latitude: 40.712776, longitude: -74.005974 } }));
    expect(await getCurrentLocation()).toEqual({ latitude: 40.71, longitude: -74.01 });
  });

  it('rejects when permission is denied or there is no fix (no hard-coded city)', async () => {
    mockGetPosition.mockImplementation((_ok: any, err: any) => err({ message: 'User denied Geolocation' }));
    await expect(getCurrentLocation()).rejects.toThrow('location_unavailable');
  });
});

describe('getCurrentWeather', () => {
  const ok = (current: any) => ({ ok: true, status: 200, json: async () => ({ current }) });

  it('maps the forecast API response for the given coordinates', async () => {
    const fetchMock = jest.fn(async () => ok({ time: '2026-10-03T10:00', temperature_2m: 61.4, apparent_temperature: 59.6, relative_humidity_2m: 70, weather_code: 3, wind_speed_10m: 8.2 }));
    (global as any).fetch = fetchMock;
    const w = await getCurrentWeather(40.71, -74.01);
    expect(fetchMock.mock.calls[0][0]).toContain('latitude=40.71&longitude=-74.01');
    expect(w).toMatchObject({ temperature: 61, feelsLike: 60, humidity: 70, windSpeed: 8, condition: 'cloudy' });
  });

  it('throws instead of inventing 68F sunny when the request fails', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(getCurrentWeather(1, 2)).rejects.toThrow('Open-Meteo 503');
  });

  it('throws when offline', async () => {
    (global as any).fetch = jest.fn(async () => { throw new Error('Network request failed'); });
    await expect(getCurrentWeather(1, 2)).rejects.toThrow('Network request failed');
  });

  it('maps rain, snow and storms from the WMO codes', async () => {
    for (const [code, expected] of [[61, 'rainy'], [73, 'snowy'], [95, 'stormy'], [45, 'foggy'], [0, 'sunny']] as const) {
      (global as any).fetch = jest.fn(async () => ok({ time: 't', temperature_2m: 50, apparent_temperature: 50, relative_humidity_2m: 50, weather_code: code, wind_speed_10m: 1 }));
      expect((await getCurrentWeather(1, 2)).condition).toBe(expected);
    }
  });
});

describe('getWeatherForecast', () => {
  it('throws rather than returning an invented forecast on failure', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(getWeatherForecast(1, 2)).rejects.toThrow('Open-Meteo 500');
  });
});
