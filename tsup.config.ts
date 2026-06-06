import { defineConfig } from "tsup";

export default defineConfig({
  // Two exports:
  //
  //   "agentfootprint-lens"         → ./dist/index.{js,cjs}    (React + core)
  //   "agentfootprint-lens/core"    → ./dist/core.{js,cjs}     (headless)
  //
  // Consumers using React get the component shell + all views.
  // Vue/Angular/CLI consumers drop to `/core` for just the
  // LensRecorder and types.
  entry: {
    index: "src/index.ts",
    core: "src/core/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  // Peer deps must NOT be bundled — consumers provide them. This also
  // ensures FootprintTheme context (if reintroduced) is the same module
  // instance in both packages so theme tokens propagate transparently.
  // `footprintjs` (+ subpaths /trace, /advanced) is a peerDependency too —
  // it MUST be external, else a stale copy of e.g. `walkSubflowSpec` gets
  // baked into the lens bundle and ignores the consumer's footprintjs version.
  external: [
    "react",
    "react-dom",
    "footprint-explainable-ui",
    "@xyflow/react",
    /^footprintjs(\/|$)/,
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
