/**
 * Shared loader for the Served tab's fixtures — real recordings produced by
 * `fixtures/generate.ts` (never hand-authored).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  foldFactsAt,
  servedGraphAt,
  servedRowAt,
  servedRowForEpoch,
  sincePrevious,
  verify,
  type FoldFacts,
  type ServedCursor,
  type ServedGraph,
  type ServedRow,
  type ServedVerification,
  type SincePrevious,
} from '../../src/core/served/index.js';
import { observeRecording, type Recording } from '../../src/core/observeRecording.js';
import { scrubAxisFor } from '../../src/core/group/scrubAxisFor.js';
import type { CursorPosition } from '../../src/core/group/cursorPositionsAtDrill.js';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

export type FixtureName =
  | 'flat-dynamic-tools'
  | 'dynamic-grouped'
  | 'llmcall'
  | 'no-receipt'
  | 'paused-resumed-no-base'
  | 'tool-forced'
  | 'tool-set-changes'
  | 'hidden-skills'
  | 'instructions-move'
  | 'tagged-chart'
  | 'window-evicts'
  | 'wrap-up';

export interface LoadedFixture {
  readonly recording: Recording;
  readonly snapshot: unknown;
  readonly runner: unknown;
  readonly recorder: ReturnType<typeof observeRecording>['recorder'];
  /** The Why Lens's own axis (`granularity="group"`) over this recording. */
  readonly positions: readonly CursorPosition[];
}

export function load(name: FixtureName): LoadedFixture {
  return loadTampered(name, () => {});
}

/** A commit bundle as the fixtures carry it — only the fields tests edit. */
export interface FixtureBundle {
  runtimeStageId: string;
  overwrite?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A recording whose log a test may edit in place. */
export type TamperableRecording = Omit<Recording, 'snapshot'> & {
  snapshot: Omit<Recording['snapshot'], 'commitLog'> & { commitLog: FixtureBundle[] };
};

/**
 * A fixture with ONE deliberate edit applied before replay — the way a test
 * models a damaged, truncated or foreign-written recording. `mutate` gets the
 * parsed recording; the tampering is the test's, stated at its call site.
 */
export function loadTampered(name: FixtureName, mutate: (recording: TamperableRecording) => void): LoadedFixture {
  const recording = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as TamperableRecording;
  mutate(recording);
  const { recorder, runner } = observeRecording(recording as Recording);
  const snapshot =
    (runner as { getLastSnapshot?: () => unknown } | undefined)?.getLastSnapshot?.() ??
    recording.snapshot;
  return { recording, snapshot, runner, recorder, positions: scrubAxisFor(recorder, 'group') };
}

/** The positions of one milestone kind, in axis order. */
export function stopsOf(fixture: LoadedFixture, milestone: string): readonly CursorPosition[] {
  return fixture.positions.filter((p) => p.milestone === milestone);
}

/**
 * One tool schema's `inputSchema` changed where the seed commit wrote it
 * (`dynamicToolSchemas`) — the way a test models a schema that reached the
 * model in one shape and the log in another. The receipt hashed the schema as
 * it went out, so the rebuilt row must disagree with it.
 */
export function tamperToolSchema(name: string): (recording: TamperableRecording) => void {
  return (recording) => {
    const seed = recording.snapshot.commitLog[0];
    const schemas = seed?.overwrite?.dynamicToolSchemas as
      | { name: string; inputSchema: Record<string, unknown> }[]
      | undefined;
    const schema = schemas?.find((s) => s.name === name);
    if (schema === undefined) throw new Error(`tamperToolSchema: no schema '${name}' in the seed commit`);
    schema.inputSchema = { ...schema.inputSchema, required: ['q'] };
  };
}

/**
 * The Served row at one stop, resolved the way `<ServedTab>` resolves it, plus
 * the graph built from it. The graph is a SECOND VIEW of that row — never a
 * second read — so every test measures both off one resolution.
 */
export interface LoadedGraph {
  readonly cursor: ServedCursor;
  readonly row: ServedRow;
  readonly checks: ServedVerification;
  readonly fold: FoldFacts;
  readonly since?: SincePrevious;
  readonly graph: ServedGraph;
}

export function graphAt(fixture: LoadedFixture, stop: CursorPosition): LoadedGraph {
  const cursor: ServedCursor = { runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx };
  const row = servedRowAt(fixture.snapshot, cursor);
  if (row === undefined) throw new Error(`graphAt: no epoch at ${stop.runtimeStageId}`);
  const checks = verify(row.view, row.receipt, row.receipt?.basis.runId ?? '', row.receiptCause);
  const previous =
    row.previousEpoch !== undefined
      ? servedRowForEpoch(fixture.snapshot, row.previousEpoch)
      : undefined;
  const since = previous !== undefined ? sincePrevious(row, previous) : undefined;
  const fold = foldFactsAt(fixture.snapshot, cursor);
  return {
    cursor,
    row,
    checks,
    fold,
    ...(since !== undefined ? { since } : {}),
    graph: servedGraphAt({ row, fold, checks, ...(since !== undefined ? { since } : {}) }),
  };
}

/** The llm-turn stops of a fixture, or the iteration stops where a fixture has
 *  no llm-turn milestone of its own (the grouped turn and the LLMCall chart). */
export function turnStops(fixture: LoadedFixture, name: FixtureName): readonly CursorPosition[] {
  const turns = stopsOf(fixture, 'llm-turn');
  return turns.length > 0 ? turns : stopsOf(fixture, 'iteration');
}
