jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { buildSupabaseClient } from '../../src/config/supabase';

describe('buildSupabaseClient', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('does not throw when the settings are missing (the TestFlight launch crash) and logs the problem', () => {
    expect(() => buildSupabaseClient(undefined, undefined)).not.toThrow();
    expect(() => buildSupabaseClient('', '')).not.toThrow();
    expect(() => buildSupabaseClient('https://abc.supabase.co', undefined)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(3);
  });

  it('returns a usable client in both cases', () => {
    expect(typeof buildSupabaseClient(undefined, undefined).auth.getSession).toBe('function');
    const ok = buildSupabaseClient('https://abc.supabase.co', 'anon-key');
    expect(typeof ok.from).toBe('function');
    expect(errorSpy).toHaveBeenCalledTimes(1); // only the misconfigured call logged
  });

  it('a misconfigured client fails requests instead of crashing the app', async () => {
    const client = buildSupabaseClient(undefined, undefined);
    const { error } = await client.from('clothing_items').select('*').limit(1);
    expect(error).toBeTruthy();
  });
});
