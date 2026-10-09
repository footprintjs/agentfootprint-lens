/**
 * The lens's peer floor is footprintjs ^9.26.0. A STATIC named import of a
 * symbol that floor does not export makes the whole lens unbundleable for a
 * consumer on it (0.53.1–0.53.3: `pathSegments`, exported since 9.22.0, took
 * an on-prem app's dev server down at pre-bundle). A symbol newer than the
 * floor waits for a floor raise; it is never read off a namespace instead
 * (`named-imports.test.ts`), so every name the lens reads is checked here.
 *
 * This walks every `import { … } from 'footprintjs' | 'footprintjs/…'` under
 * src/ and requires each VALUE name to be on the 9.26.0 surface, pinned here
 * from that package's own d.ts — re-pin it when the floor moves. Type-only
 * names are free.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

/** footprintjs 9.26.0 — every value export of `footprintjs/trace` (its dist/esm/trace.d.ts, in its order). */
const TRACE_FLOOR = new Set([
  'buildRuntimeStageId', 'createExecutionCounter', 'parseRuntimeStageId', 'splitStageId',
  'BRANCH_SEGMENT_MARKER', 'buildBranchSegment', 'hasBranchSegmentMarker', 'isBranchSegment', 'parseBranchSegment',
  'walkSubflowSpec',
  'pathSegments',
  'buildCommitIndex', 'commitIndexOf', 'commitValueAt', 'findCommit', 'findCommits', 'findLastWriter',
  'commitStops', 'commitStopsStrategy', 'filterStops', 'isCommitBundle', 'splitAxis', 'stateAt', 'tagStops', 'timeTravel',
  'causalChain', 'flattenCausalDAG', 'formatCausalChain',
  'arrayProvenance', 'elementProvenance', 'formatForwardSlice', 'formatSlice', 'formatTimeline', 'forwardSliceForKey',
  'forwardSliceToJSON', 'keysReadFromExecutionTree', 'keysReadFromMap', 'keyTimeline', 'normaliseStateKey',
  'resolveKeysReadSource', 'sliceForKey', 'sliceToJSON',
  'BoundaryStateStore', 'KeyedStore', 'SequenceStore', 'CommitRangeIndex',
  'TopologyRecorder', 'topologyRecorder',
  'InOutRecorder', 'inOutRecorder', 'ROOT_RUNTIME_STAGE_ID', 'ROOT_SUBFLOW_ID',
  'ControlDepRecorder', 'controlDepRecorder',
  'QualityRecorder', 'formatQualityTrace', 'qualityTrace',
]);
/** The root barrel names the lens reads (all older than 9.17). */
const ROOT_FLOOR = new Set(['enableDevMode', 'disableDevMode', 'isDevMode']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function namedImports(source: string): { readonly from: string; readonly names: string[] }[] {
  const out: { from: string; names: string[] }[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](footprintjs(?:\/[a-z]+)?)['"]/g;
  for (const m of source.matchAll(re)) {
    if (m[0].startsWith('import type')) continue;
    const names = m[1]!
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !n.startsWith('type '))
      .map((n) => n.split(/\s+as\s+/)[0]!.trim());
    out.push({ from: m[2]!, names });
  }
  return out;
}

describe('every static value import from footprintjs is on the 9.26.0 floor', () => {
  it('no name newer than the floor is imported', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      for (const { from, names } of namedImports(readFileSync(file, 'utf8'))) {
        const floor =
          from === 'footprintjs' ? ROOT_FLOOR : from === 'footprintjs/trace' ? TRACE_FLOOR : undefined;
        if (floor === undefined) {
          offenders.push(`${file}: imports from '${from}', which has no pinned floor here`);
          continue;
        }
        for (const name of names)
          if (!floor.has(name))
            offenders.push(`${file}: '${name}' from '${from}' is not on the 9.26.0 surface`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
