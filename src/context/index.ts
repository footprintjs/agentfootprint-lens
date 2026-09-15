/**
 * `agentfootprint-lens/context` — the Context view door.
 *
 * One import line that names the view you are mounting:
 *
 *   import { ContextView } from 'agentfootprint-lens/context';
 *
 *   <ContextView runner={recording} />                       // its own cursor
 *   <ContextView runner={recording} cursor={p.cursor} />     // the Lens's ONE cursor
 *
 * WHY A DOOR (0.53.1): a page that mounts only this view must carry only this
 * view. The docs walkthrough that mounted it from the root barrel shared that
 * barrel with the site's Lens demo, and the bundler hoisted the whole barrel
 * into a chunk both pages download — the deferred-demo budget rose by 26 KB
 * gzip for a component the demo never renders. A separate entry keeps the
 * bytes with the page that uses them; the shared cores (served, cursor,
 * tags) stay shared, as they should. Same reason `/why` and `/skillgraph`
 * exist. Everything here is ALSO on the root barrel — a door is an addition,
 * never a move.
 *
 * Beside the mount component: its HEADLESS core, `contextAt` — the join over
 * the three records (commit log ⟂ events by `runtimeStageId`, commit log ⟂
 * receipt by epoch), for hosts with their own UI — and the milestone-tag axis
 * the standalone view walks. See src/core/context/README.md.
 */
export {
  ContextView,
  LABELS as CONTEXT_LABELS,
  MILESTONE_AXIS as CONTEXT_MILESTONE_AXIS,
  type ContextViewProps,
} from '../react/components/ContextView.js';
export {
  contextAt,
  type ContextAt,
  type ContextAtOptions,
  type ContextKey,
  type ContextServed,
} from '../core/context/contextAt.js';
