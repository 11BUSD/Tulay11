import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Load `.env.local` / `.env` into process.env so integration suites can reach
// the local Postgres (DATABASE_URL / TEST_DATABASE_URL) and read hashing salts.
// Vite's loadEnv only reads `VITE_`-prefixed vars into import.meta.env; we copy
// everything into process.env here (config runs in Node before the suite).
const loadedEnv = loadEnv("", process.cwd(), "");
for (const [key, value] of Object.entries(loadedEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    // Integration tests under src/test/ hit a real Postgres — run them in the
    // node environment (jsdom is only needed for component tests).
    environmentMatchGlobs: [["src/test/**", "node"]],
    setupFiles: ["./vitest.setup.ts"],
    // Bootstrap the test database (migrations + seed) once before the suite.
    // No-op when neither TEST_DATABASE_URL nor DATABASE_URL is set.
    globalSetup: ["./src/test/global-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
