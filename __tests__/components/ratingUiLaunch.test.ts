/**
 * The launch smoke tests import every screen with supabase mocked to `auth` only. The rating components are on that
 * path once Item Details uses them, so importing them (and what they import) must touch no network, storage,
 * session or console.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));

describe('rating UI modules at import time', () => {
  it('touch no network, storage, session or console', () => {
    const fetchSpy = jest.spyOn(globalThis as any, 'fetch').mockImplementation(() => {
      throw new Error('no network at import');
    });
    const storage = [
      jest.spyOn(AsyncStorage, 'getItem'),
      jest.spyOn(AsyncStorage, 'setItem'),
      jest.spyOn(AsyncStorage, 'multiGet'),
    ];
    const logs = (['log', 'info', 'warn', 'error'] as const).map(level =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    );

    jest.isolateModules(() => {
      require('../../src/components/RatingScale');
      require('../../src/components/RateItemSheet');
      require('../../src/components/ItemQualityCard');
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

  it('render nothing and ask for no session when the flags are off', () => {
    const React = require('react');
    const renderer = require('react-test-renderer');
    const { act } = renderer;
    let tree: any;
    jest.isolateModules(() => {
      // The shipped build has ratings on; this case is about the flag-off wrapper, so turn them off here.
      jest.doMock('../../src/config/ratingFlags', () => ({
        TAG_SCAN_ENABLED: false,
        RATINGS_ENABLED: false,
        BRAND_INSIGHTS_ENABLED: false,
        TAG_MODEL_FALLBACK_ENABLED: false,
        TAG_OCR_FEATURE: 'TEXT_DETECTION',
        ratingsActive: () => false,
        tagScanActive: () => false,
        brandInsightsActive: () => false,
      }));
      const ItemQualityCard = require('../../src/components/ItemQualityCard').default;
      act(() => {
        tree = renderer.create(
          React.createElement(ItemQualityCard, {
            item: { id: '5f0e8a52-1b2c-4d3e-8f90-123456789abc', name: 'Shirt', isWishlist: false },
            wearCount: 3,
            onOpenBrand: jest.fn(),
          }),
        );
      });
    });
    expect(tree.toJSON()).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
