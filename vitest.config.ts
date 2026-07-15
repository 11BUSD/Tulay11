import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

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
