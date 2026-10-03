let mockResult: any = { data: { session: null }, error: null };
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => mockResult } },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// @ts-ignore — resolved by react-native-dotenv babel plugin
import { SUPABASE_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthUserId } from '../../src/services/authUser';

const STORED_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const retryable = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError' });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockResult = { data: { session: null }, error: null };
});

describe('getAuthUserId', () => {
  it('returns the id of a normal signed-in session', async () => {
    mockResult = { data: { session: { user: { id: 'live-user' } } }, error: null };
    expect(await getAuthUserId()).toBe('live-user');
  });

  it('returns null for a real guest (no session, nothing saved)', async () => {
    expect(await getAuthUserId()).toBeNull();
  });

  it('still knows who is signed in when the login expired and the network is down', async () => {
    await AsyncStorage.setItem(STORED_KEY, JSON.stringify({ access_token: 'old', refresh_token: 'r', user: { id: 'offline-user' } }));
    mockResult = { data: { session: null }, error: retryable };
    expect(await getAuthUserId()).toBe('offline-user');
  });

  it('is a guest if the network is down but nothing was ever saved', async () => {
    mockResult = { data: { session: null }, error: retryable };
    expect(await getAuthUserId()).toBeNull();
  });

  it('does not resurrect a saved session after a real sign-out / invalid-token error', async () => {
    await AsyncStorage.setItem(STORED_KEY, JSON.stringify({ user: { id: 'stale' } }));
    mockResult = { data: { session: null }, error: Object.assign(new Error('Invalid Refresh Token'), { name: 'AuthApiError' }) };
    expect(await getAuthUserId()).toBeNull();
  });

  it('ignores a corrupted saved session', async () => {
    await AsyncStorage.setItem(STORED_KEY, '{not json');
    mockResult = { data: { session: null }, error: retryable };
    expect(await getAuthUserId()).toBeNull();
  });
});
