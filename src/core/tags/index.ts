/**
 * Declared tags, read side — the legend (what the chart can produce, what the
 * run hit) and the tag axis (the Lens's positions over footprintjs 9.21's
 * `tagStops`). See `tagLegend.ts` / `tagAxis.ts` for the WHY.
 */

export { tagLegend, declaredTagsOf, hitTagsOf, type TagLegend, type TagLegendEntry } from './tagLegend.js';
export { tagAxisPositions, tagStopsFor, tagStopsStrategy } from './tagAxis.js';
