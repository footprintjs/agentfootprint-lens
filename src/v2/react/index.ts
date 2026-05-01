/**
 * Lens v2 React implementation.
 *
 * Consumer entry:
 *
 *   import { Lens, lensRecorder } from 'agentfootprint-lens/v2';
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
export { RunTreeView } from './RunTreeView.js';
export { RunTreeFlow, type RunTreeFlowProps } from './RunTreeFlow.js';
export { EventStream } from './EventStream.js';
export { SummaryCard } from './SummaryCard.js';
export { TimeTravel, type TimeTravelProps } from './TimeTravel.js';

// Hooks — composable building blocks for consumer-built Lens layouts.
export * from './hooks/index.js';
// Node components — dumb rendering primitives for the triangle.
export * from './nodes/index.js';
