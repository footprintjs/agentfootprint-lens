import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  // Peer deps must NOT be bundled — consumers provide them. This also ensures
  // FootprintTheme context from footprint-explainable-ui is the same module
  // instance in both packages so theme tokens propagate transparently.
  external: ["react", "react-dom", "footprint-explainable-ui"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
