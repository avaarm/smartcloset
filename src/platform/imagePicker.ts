/**
 * Default entry point for the imagePicker platform shim.
 * Metro resolves to .native.ts; Vite resolves to .web.ts via platform extensions.
 * This `.ts` file re-exports the native variant for TypeScript.
 */

export { pickImageFromLibrary, type PickedImage } from './imagePicker.native';
