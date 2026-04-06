/**
 * Vite config for the react-native-web build of smartcloset.
 *
 * Key points:
 * - `react-native` → `react-native-web` via resolve alias
 * - Platform extensions: .web.tsx > .web.ts > .tsx > .ts
 * - react-native-vector-icons Ionicons font copied to public
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const extensions = [
  '.web.tsx',
  '.web.ts',
  '.web.js',
  '.tsx',
  '.ts',
  '.js',
  '.jsx',
  '.json',
];

export default defineConfig({
  root: __dirname,
  plugins: [
    react({
      babel: {
        plugins: ['@babel/plugin-transform-export-namespace-from'],
      },
    }),
  ],
  resolve: {
    extensions,
    alias: {
      'react-native': 'react-native-web',
      // Redirect native-only modules to stubs/web shims
      'react-native-linear-gradient': path.resolve(
        __dirname,
        '../src/platform/linearGradient.web.tsx',
      ),
      'react-native-safe-area-context': path.resolve(
        __dirname,
        'shims/safe-area-context.tsx',
      ),
      'react-native-screens': path.resolve(__dirname, 'shims/screens.ts'),
      'react-native-fs': path.resolve(__dirname, 'shims/fs.ts'),
      'react-native-image-picker': path.resolve(
        __dirname,
        'shims/image-picker.ts',
      ),
      'react-native-reanimated': path.resolve(
        __dirname,
        'shims/reanimated.ts',
      ),
      'react-native-pager-view': path.resolve(
        __dirname,
        'shims/pager-view.tsx',
      ),
      'react-native-permissions': path.resolve(
        __dirname,
        'shims/permissions.ts',
      ),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'shims/async-storage.ts',
      ),
      '@react-native-community/datetimepicker': path.resolve(
        __dirname,
        'shims/datetimepicker.tsx',
      ),
      '@react-native-picker/picker': path.resolve(
        __dirname,
        'shims/picker.tsx',
      ),
      '@invertase/react-native-apple-authentication': path.resolve(
        __dirname,
        'shims/apple-auth.ts',
      ),
      '@react-native-google-signin/google-signin': path.resolve(
        __dirname,
        'shims/google-signin.ts',
      ),
      'react-native-vector-icons/Ionicons': path.resolve(
        __dirname,
        'shims/ionicons.tsx',
      ),
      '@env': path.resolve(__dirname, 'shims/env.ts'),
      'react-native-url-polyfill/auto': path.resolve(
        __dirname,
        'shims/url-polyfill.ts',
      ),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
    'process.env': '{}',
    global: 'globalThis',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      resolveExtensions: extensions,
      loader: {
        '.js': 'jsx',
      },
    },
  },
});
