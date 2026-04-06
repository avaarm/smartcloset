/**
 * Web shim for @react-native-async-storage/async-storage.
 * Uses localStorage as the backing store.
 */

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },

  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    return keys.map(key => [key, localStorage.getItem(key)]);
  },

  multiSet: async (pairs: [string, string][]): Promise<void> => {
    pairs.forEach(([key, value]) => localStorage.setItem(key, value));
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    keys.forEach(key => localStorage.removeItem(key));
  },

  getAllKeys: async (): Promise<string[]> => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  },

  clear: async (): Promise<void> => {
    localStorage.clear();
  },
};

export default AsyncStorage;
