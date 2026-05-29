import { defineConfig } from "vitest/config";

// Standalone config so unit tests of pure functions don't load the React/PWA
// build plugins from vite.config.js.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
  },
});
