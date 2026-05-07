/**
 * Lens v2 core — the framework-agnostic surface.
 *
 * Consumers using React get this automatically re-exported from
 * `agentfootprint-lens`. Vue / Angular / CLI consumers import here
 * directly and write their own views against the same types.
 */

export * from './types.js';
export { LensRecorder, lensRecorder } from './LensRecorder.js';
export {
  defaultHumanizer,
  humanizeWith,
  teachingHumanizer,
  type Humanizer,
} from './humanizer.js';
export * from './selectors/index.js';
export { buildLLMText, type BuildLLMTextArgs } from './copyForLLM.js';
