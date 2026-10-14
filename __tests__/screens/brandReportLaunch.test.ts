/**
 * The launch smoke tests import every screen with supabase mocked to `auth` only. The brand report screen, the
 * brand rating sheet and the brand strip sit on that path once the item screens use them, so importing them must
 * touch no network, storage, session or console.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));

describe('brand report modules at import time', () => {
  it('touch no network, storage, session or console', () => {
    const fetchSpy = jest.spyOn(globalThis as any, 'fetch').mockImplementation(() => {
      throw new Error('no network at import');
    });
    const storage = [
      jest.spyOn(AsyncStorage, 'getItem'),
      jest.spyOn(AsyncStorage, 'setItem'),
      jest.spyOn(AsyncStorage, 'multiGet'),
    ];
    const logs = (['log', 'info', 'warn', 'error'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}));

    jest.isolateModules(() => {
      require('../../src/components/BrandInsightStrip');
      require('../../src/components/RateBrandSheet');
      require('../../src/screens/BrandReportScreen');
    });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const spy of storage) {
      expect(spy).not.toHaveBeenCalled();
    }
    for (const spy of logs) {
      expect(spy).not.toHaveBeenCalled();
    }
    jest.restoreAllMocks();
  });

  it('can be imported again after a reset (no state kept at module level that breaks a second load)', () => {
    jest.isolateModules(() => {
      const strip = require('../../src/components/BrandInsightStrip');
      const sheet = require('../../src/components/RateBrandSheet');
      const screen = require('../../src/screens/BrandReportScreen');
      expect(typeof strip.default).toBe('function');
      expect(typeof sheet.default).toBe('function');
      expect(typeof screen.default).toBe('function');
    });
  });
});
