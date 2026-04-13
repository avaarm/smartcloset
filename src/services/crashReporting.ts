/**
 * Crash Reporting & Error Tracking
 *
 * Uses Sentry for production error tracking.
 *
 * Setup (run once):
 *   npx @sentry/wizard@latest -i reactNative
 *
 * Or manually:
 *   npm install @sentry/react-native
 *   npx pod-install
 *
 * Then set SENTRY_DSN in your .env file.
 */

let Sentry: any = null;

try {
  // Dynamic import so the app doesn't crash if Sentry isn't installed yet
  Sentry = require('@sentry/react-native');
} catch {
  // Sentry not installed — graceful no-op
}

/**
 * Initialize crash reporting. Call once in App.tsx before any rendering.
 */
export const initCrashReporting = (dsn?: string): void => {
  if (!Sentry || !dsn) {
    if (__DEV__) {
      console.log('[CrashReporting] Sentry not configured — skipping init');
    }
    return;
  }

  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    environment: __DEV__ ? 'development' : 'production',
  });
};

/**
 * Capture a non-fatal error for tracking.
 */
export const captureException = (error: unknown, context?: Record<string, any>): void => {
  if (Sentry) {
    if (context) {
      Sentry.withScope((scope: any) => {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  }
  // Always log in dev
  if (__DEV__) {
    console.error('[CrashReporting]', error, context);
  }
};

/**
 * Set the authenticated user for error context.
 */
export const setUser = (user: { id: string; email?: string } | null): void => {
  if (Sentry) {
    Sentry.setUser(user);
  }
};

/**
 * Add a breadcrumb for debugging crash context.
 */
export const addBreadcrumb = (message: string, category?: string): void => {
  if (Sentry) {
    Sentry.addBreadcrumb({ message, category: category || 'app', level: 'info' });
  }
};
