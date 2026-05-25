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
 *
 * Lens v1 has been removed — it lives at git history only. All
 * consumers migrate to the recorder/observe pattern.
 */
export * from './v2/core/index.js';
export * from './v2/react/index.js';
