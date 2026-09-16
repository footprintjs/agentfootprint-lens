/**
 * The lens's peer floor is footprintjs ^9.17.0. A STATIC named import of a
 * symbol that floor does not export makes the whole lens unbundleable for a
 * consumer on it (0.53.1–0.53.3: `pathSegments`, exported since 9.22.0, took
 * an on-prem app's dev server down at pre-bundle). A symbol newer than the
 * floor is read at call time (`tagStops`, `milestoneFromTags`, `pathSegments`).
 *
 * This walks every `import { … } from 'footprintjs' | 'footprintjs/…'` under
 * src/ and requires each VALUE name to be on the 9.17.0 surface, pinned here
 * from that package's own d.ts. Type-only names are free.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

/** footprintjs 9.17.0 — every value export of `footprintjs/trace` (from its dist/esm/trace.d.ts). */
const TRACE_FLOOR = new Set([
  'BRANCH_SEGMENT_MARKER',
  'BoundaryStateStore',
  'KeyedStore',
  'SequenceStore',
  'CommitRangeIndex',
  'TopologyRecorder',
  'commitStop',
  'walkSubflowSpec',
  'buildCommitIndex',
  'ROOT_RUNTIME_STAGE_ID',
  'ROOT_SUBFLOW_ID',
  'ControlDepRecorder',
  'buildBranchSegment',
  'buildRuntimeStageId',
  'commitIndexOf',
  'commitStopsStrategy',
  'commitValueAt',
  'controlDepRecorder',
  'QualityRecorder',
  'formatQualityTrace',
  'createExecutionCounter',
  'elementProvenance',
  'findCommit',
  'findLastWriter',
  'flattenCausalDAG',
  'formatCausalChain',
  'arrayProvenance',
  'formatForwardSlice',
  'formatSlice',
  'formatTimeline',
  'forwardSliceForKey',
  'forwardSliceToJSON',
  'hasBranchSegmentMarker',
  'inOutRecorder',
  'isBranchSegment',
  'keyTimeline',
  'keysReadFromExecutionTree',
  'keysReadFromMap',
  'normaliseStateKey',
  'parseBranchSegment',
  'parseRuntimeStageId',
  'qualityTrace',
  'resolveKeysReadSource',
  'sliceForKey',
  'sliceToJSON',
  'splitStageId',
  'stateAt',
  'timeTravel',
  'causalChain',
  'topologyRecorder',
  'InOutRecorder',
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

describe('every static value import from footprintjs is on the 9.17.0 floor', () => {
  it('names newer than the floor are read at call time, never imported by name', () => {
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
            offenders.push(`${file}: '${name}' from '${from}' is not on the 9.17.0 surface`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
