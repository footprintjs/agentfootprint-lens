/**
 * Lens v0.1 translator pipeline — public surface.
 *
 * Consumers wire `lensGroupTranslator` into any agentfootprint
 * composition's `groupTranslator` constructor option (or pass it
 * to `runner.getUIGroupWith(...)` for a per-call override) to
 * obtain a `LensGroupOutput` — a flat, xyflow-ready graph of
 * `LensNode` + `LensEdge`.
 *
 * Layer hierarchy (bottom-up, all pure):
 *
 *   L2.0 — types        : LensNode, LensEdge, LensGroupOutput
 *   L2.1 — helpers      : makeNodeId, makeEdge, mergeOutputs,
 *                         pinUnderParent
 *   L2.3 — per-kind     : translateParallel/Sequence/Loop/
 *                         Conditional/Agent/LLMCall +
 *                         MemberResolver callback type
 *   L2.4 — dispatcher   : lensGroupTranslator (this module's
 *                         primary export)
 *
 * Per-kind translators are exported for advanced consumers that
 * want to plug a different dispatcher (different recursion
 * strategy, partial translation, etc.) — the standard case is
 * `lensGroupTranslator` alone.
 */

export type {
  LensEdge,
  LensGroupOutput,
  LensNode,
} from './types.js';

export { lensGroupTranslator } from './lensGroupTranslator.js';

export { makeRootNodeId, makeChildNodeId } from './helpers/makeNodeId.js';
export { makeEdge } from './helpers/makeEdge.js';
export { mergeOutputs } from './helpers/mergeOutputs.js';
export { pinUnderParent } from './helpers/pinUnderParent.js';

export { translateAgent } from './perKind/translateAgent.js';
export { translateConditional } from './perKind/translateConditional.js';
export { translateLLMCall } from './perKind/translateLLMCall.js';
export { translateLoop } from './perKind/translateLoop.js';
export { translateParallel } from './perKind/translateParallel.js';
export { translateSequence } from './perKind/translateSequence.js';
export type { MemberResolver } from './perKind/MemberResolver.js';
