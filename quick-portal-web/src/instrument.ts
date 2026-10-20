import * as Sentry from "@sentry/react";
import { router } from "./router";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

// Sentry stays disabled when VITE_SENTRY_DSN is unset.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
  // The release is injected by the Sentry Vite plugin from SENTRY_RELEASE.

  integrations: [
    Sentry.tanstackRouterBrowserTracingIntegration(router),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  tracesSampleRate: 1.0,
  // Send tracing headers to the Django API so frontend and backend spans join
  // the same trace.
  tracePropagationTargets: apiBaseUrl ? [/^\//, apiBaseUrl] : [/^\//],

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
