/**
 * Default entry point for the fileSystem platform shim.
 *
 * Metro (React Native) will pick `.native.ts` via the `react-native` resolver
 * regardless of this file.
 *
 * Vite (web) will pick `.web.ts` because we configure platform extensions in
 * `web/vite.config.ts`.
 *
 * This `.ts` file is the fallback that TypeScript type-checks against. It
 * re-exports the native shape so `tsc` is happy.
 */

export { readImageAsBase64 } from './fileSystem.native';
