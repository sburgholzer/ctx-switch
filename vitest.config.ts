import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    globals: true,
    environmentMatchGlobs: [
      ["packages/web/**/*.test.{ts,tsx}", "jsdom"],
    ],
    setupFiles: ["packages/web/src/test-setup.ts"],
  },
});
