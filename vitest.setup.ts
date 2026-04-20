import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// JSDOM doesn't ship a ResizeObserver implementation. The Explainable
// Trace tab (via `<ExplainableShell>`) uses ResizeObserver under the
// hood to drive its responsive layout. A minimal no-op polyfill is
// enough for render-path tests — the actual resize behaviour isn't
// asserted here.
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;

// Teardown React trees after each test so hanging nodes don't leak
// into later tests and cause spurious "multiple elements" errors.
afterEach(() => {
  cleanup();
});
