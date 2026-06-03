import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // binds to 0.0.0.0 inside the container
    port: 5173,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      "#features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "#hooks": fileURLToPath(new URL("./src/hooks", import.meta.url)),
    },
  },
});
