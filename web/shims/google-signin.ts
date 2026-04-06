/**
 * Web shim for @react-native-google-signin/google-signin.
 * Google Sign-In on web would use the GIS JS SDK; stub for now.
 */

export const GoogleSignin = {
  configure: (_options?: any) => {},
  hasPlayServices: async () => true,
  signIn: async () => {
    throw new Error('Google Sign-In not available on web');
  },
  signInSilently: async () => {
    throw new Error('Google Sign-In not available on web');
  },
  signOut: async () => {},
  revokeAccess: async () => {},
  isSignedIn: async () => false,
  getCurrentUser: () => null,
  getTokens: async () => ({ idToken: '', accessToken: '' }),
};

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

export default GoogleSignin;
