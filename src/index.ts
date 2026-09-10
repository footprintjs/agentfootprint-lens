/**
 * agentfootprint-lens — public entry (React).
 *
 * Two import surfaces:
 *
 *   - `'agentfootprint-lens'`        → React components + headless core
 *                                       Use this from React apps.
 *   - `'agentfootprint-lens/core'`   → Headless only — `LensRecorder`,
 *                                       `ChangeNotifier`, selectors,
 *                                       types. Zero React dep. Use this
 *                                       from Vue / Angular / Recoil /
 *                                       CLI / DOM consumers.
 *
 * React example:
 *
 *   import { Lens, LensRecorder } from 'agentfootprint-lens';
 *
 *   const recorder = new LensRecorder();
 *   recorder.observe(agent);
 *   await agent.run({ message: 'hi' });
 *   return <Lens recorder={recorder} view="engineer" />;
 *
 * Vue example (headless core only — no React in the bundle):
 *
 *   import { LensRecorder, ChangeNotifier } from 'agentfootprint-lens/core';
 *   // build your own Vue composable around the same primitives.
 *   // See ChangeNotifier JSDoc for an adapter snippet.
 */
export * from './core/index.js';
export * from './react/index.js';

// ONE NAME, TWO DOORWAYS. `ServedGraph` is the React component here and the
// SHAPE `servedGraphAt` returns on `agentfootprint-lens/core`. On this barrel
// the component wins — a React app importing the root wants the element — and
// the shape keeps its name behind `/core`, where it is built. An explicit
// re-export is what decides it; two `export *` alone would be ambiguous.
export { ServedGraph } from './react/index.js';
