/**
 * Web shim for react-native-permissions.
 * On web, permissions are handled by browser APIs.
 */

export const PERMISSIONS = { IOS: {}, ANDROID: {} };
export const RESULTS = {
  UNAVAILABLE: 'unavailable',
  DENIED: 'denied',
  LIMITED: 'limited',
  GRANTED: 'granted',
  BLOCKED: 'blocked',
};

export const check = async () => RESULTS.GRANTED;
export const request = async () => RESULTS.GRANTED;
export const checkMultiple = async () => ({});
export const requestMultiple = async () => ({});
export const openSettings = async () => {};

export default { PERMISSIONS, RESULTS, check, request, checkMultiple, requestMultiple, openSettings };
