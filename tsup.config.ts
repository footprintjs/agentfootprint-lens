import { defineConfig } from "tsup";

export default defineConfig({
  // Four exports:
  //
  //   "agentfootprint-lens"            → ./dist/index.{js,cjs}      (React + core)
  //   "agentfootprint-lens/core"       → ./dist/core.{js,cjs}       (headless)
  //   "agentfootprint-lens/why"        → ./dist/why.{js,cjs}        (the Why Lens door)
  //   "agentfootprint-lens/skillgraph" → ./dist/skillgraph.{js,cjs} (the SkillGraph door)
  //
  // Consumers using React get the component shell + all views.
  // Vue/Angular/CLI consumers drop to `/core` for just the
  // LensRecorder and types. The two DOORS are additions, never moves:
  // everything behind them is also on the root barrel (src/doors/README.md).
  // The door count is exactly these two — add sparingly (the af 8.0.0 lesson).
  entry: {
    index: "src/index.ts",
    core: "src/core/index.ts",
    why: "src/why/index.ts",
    skillgraph: "src/skillgraph/index.ts",
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
    // agentfootprint (+ subpaths /observe, /trace) is a peerDependency — it MUST be
    // external. Bundling a copy would give a CONSUMER of the published lens two
    // distinct agentfootprint instances at runtime (cross-instance `instanceof` /
    // brand checks then silently fail). Matches the footprintjs rule above.
    /^agentfootprint(\/|$)/,
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
