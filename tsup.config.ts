import { defineConfig } from "tsup";

export default defineConfig({
  // Three entry points, so consumers can import by subpath without
  // dragging the full UI layer in when they only need the headless
  // core (types + adapters):
  //
  //   "agentfootprint-lens"       → ./dist/index.{js,cjs}       (= react + core)
  //   "agentfootprint-lens/react" → ./dist/react.{js,cjs}       (react-only)
  //   "agentfootprint-lens/core"  → ./dist/core.{js,cjs}        (headless)
  //
  // Root still forwards everything so existing imports don't break.
  entry: {
    index: "src/index.ts",
    react: "src/react/index.ts",
    core: "src/core/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  // Peer deps must NOT be bundled — consumers provide them. This also ensures
  // FootprintTheme context from footprint-explainable-ui is the same module
  // instance in both packages so theme tokens propagate transparently.
  external: ["react", "react-dom", "footprint-explainable-ui", "@xyflow/react"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
