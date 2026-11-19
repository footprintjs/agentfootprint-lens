import type { CombinedNarrativeEntry, RuntimeSnapshot } from 'footprintjs';
import { toVisualizationSnapshots } from 'footprint-explainable-ui';

const narrative: CombinedNarrativeEntry[] = [
  { type: 'stage', text: 'Read source', depth: 0 },
  { type: 'attempt', text: 'Attempt 1 completed', depth: 1 },
];

export function renderNarrative(snapshot: RuntimeSnapshot) {
  return toVisualizationSnapshots(snapshot, narrative);
}
