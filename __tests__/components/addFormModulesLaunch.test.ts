/**
 * The launch smoke tests import every screen with supabase mocked to `auth` only. The pickers and the rating pieces
 * of Add/Edit item are on that path, so importing them (and what they import) must touch no network, storage,
 * session or console.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));

describe('Add/Edit item form modules at import time', () => {
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
      require('../../src/components/ChoiceChip');
      require('../../src/components/SizePicker');
      require('../../src/components/StylePicker');
      require('../../src/components/AddRatingSection');
      require('../../src/components/ScanTagSection');
      require('../../src/utils/sizeOptions');
      require('../../src/utils/styleOptions');
    });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
