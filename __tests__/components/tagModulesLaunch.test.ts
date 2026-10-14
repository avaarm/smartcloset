/**
 * The launch smoke tests import every screen with supabase mocked to `auth` only. The tag scan files are on that
 * path once the Add and Item Details screens use them, so importing them must touch no network, storage or channel.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));

describe('tag scan modules at import time', () => {
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
      require('../../src/platform/fileSystem');
      require('../../src/services/tagReader');
      require('../../src/services/tagModel');
      require('../../src/components/tagApply');
      require('../../src/components/TagReviewSheet');
      require('../../src/components/ScanTagButton');
      require('../../src/components/ScanTagSection');
      require('../../src/components/ItemLabelBlock');
    });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
