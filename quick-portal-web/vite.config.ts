import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // binds to 0.0.0.0 inside the container
    port: 5173,
  },
  build: {
    // Source maps are uploaded to Sentry, then deleted so they are not served.
    sourcemap: "hidden",
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    // Must stay last. Uploads only when SENTRY_AUTH_TOKEN is set at build time.
    sentryVitePlugin({
      org: "gna-desenvolvimento-av",
      project: "quick-portal-web",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.SENTRY_RELEASE || undefined },
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    }),
  ],
  resolve: {
    alias: {
      "#features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "#hooks": fileURLToPath(new URL("./src/hooks", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
