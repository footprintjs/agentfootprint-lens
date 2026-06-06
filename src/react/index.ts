/**
 * Lens React implementation.
 *
 *   import { Lens, lensRecorder } from 'agentfootprint-lens';
 *
 *   const lens = lensRecorder();
 *   lens.observe(agent);
 *   await agent.run({ message: '...' });
 *
 *   <Lens recorder={lens} view="engineer" />
 *
 * Or compose individual view components directly.
 */

export { Lens, type LensProps, type LensView } from './Lens.js';
// Lens v0.1 — single-pipeline xyflow renderer driven by the L2
// translator. The canonical chart for v0.1.
export { LensFlow, type LensFlowProps } from './LensFlow.js';
export { RunTreeView } from './RunTreeView.js';
export { EventStream } from './EventStream.js';
export { SummaryCard } from './SummaryCard.js';
export { TimeTravel, type TimeTravelProps } from './TimeTravel.js';

// Hooks — composable building blocks for consumer-built Lens layouts.
export * from './hooks/index.js';
