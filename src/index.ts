/**
 * agentfootprint-lens — public entry.
 *
 * Root is Lens v2 — the event-driven recorder architecture built on
 * agentfootprint's typed event stream. Consumers import the `Lens` React
 * component, create a `LensRecorder`, and attach it to any v2 `Runner`
 * via `recorder.observe(runner)` before `runner.run()`.
 *
 *   import { Lens, LensRecorder } from 'agentfootprint-lens';
 *
 *   const recorder = new LensRecorder();
 *   recorder.observe(agent);
 *   await agent.run({ message: 'hi' });
 *   return <Lens recorder={recorder} view="engineer" />;
 *
 * Lens v1 has been removed — it lives at git history only. All
 * consumers migrate to the recorder/observe pattern.
 */
export * from './v2/core/index.js';
export * from './v2/react/index.js';
