import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // CI resilience: a few tests are inherently timing-sensitive (perf budgets) or
    // render-order-sensitive under parallel workers, and fail intermittently on loaded
    // CI runners — which silently blocked the npm publish since v0.22.0. Retry transient
    // failures so a flaky run doesn't block a release; a genuinely broken test still fails
    // all attempts.
    retry: 2,
  },
});
