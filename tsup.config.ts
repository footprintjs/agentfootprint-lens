import { defineConfig } from "tsup";

export default defineConfig({
  // Single entry point — Lens v2 is the only surface. Two exports:
  //
  //   "agentfootprint-lens"         → ./dist/index.{js,cjs}    (React + core)
  //   "agentfootprint-lens/core"    → ./dist/core.{js,cjs}     (headless)
  //
  // Consumers using React get the component shell + all views.
  // Vue/Angular/CLI consumers drop to `/core` for just the
  // LensRecorder and types.
  entry: {
    index: "src/index.ts",
    core: "src/v2/core/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  // Peer deps must NOT be bundled — consumers provide them. This also
  // ensures FootprintTheme context (if reintroduced) is the same module
  // instance in both packages so theme tokens propagate transparently.
  external: ["react", "react-dom", "footprint-explainable-ui", "@xyflow/react"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
