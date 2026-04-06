/**
 * Web shim for @invertase/react-native-apple-authentication.
 * Apple Sign-In on web would use the JS SDK; stub for now.
 */

export const appleAuth = {
  isSupported: false,
  performRequest: async () => {
    throw new Error('Apple Sign-In not available on web');
  },
  getCredentialStateForUser: async () => 0,
  Operation: { LOGIN: 1, REFRESH: 2, LOGOUT: 3, IMPLICIT: 4 },
  Scope: { EMAIL: 0, FULL_NAME: 1 },
};

export const AppleButton = () => null;
export default appleAuth;
