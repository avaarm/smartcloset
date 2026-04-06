/**
 * Web shim for react-native-screens.
 * Navigation works without native screens on web.
 */

export const enableScreens = () => {};
export const enableFreeze = () => {};
export default { enableScreens, enableFreeze };
