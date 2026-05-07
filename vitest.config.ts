import { defineConfig } from "vitest/config";
import path from "path";

// Eigene Vitest-Config: nur Unit-Tests in src/, NICHT die Playwright-E2E-
// Tests im tests/-Verzeichnis (die werden separat ueber playwright test
// ausgefuehrt und werfen sonst beim Vitest-Run Errors).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/**", "node_modules/**", "dist/**"],
    environment: "node",
  },
});
