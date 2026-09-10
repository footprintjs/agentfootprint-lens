/**
 * Shared loader for the Served tab's fixtures — real recordings produced by
 * `fixtures/generate.ts` (never hand-authored).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { observeRecording, type Recording } from '../../src/core/observeRecording.js';
import { scrubAxisFor } from '../../src/core/group/scrubAxisFor.js';
import type { CursorPosition } from '../../src/core/group/cursorPositionsAtDrill.js';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

export type FixtureName =
  | 'flat-dynamic-tools'
  | 'dynamic-grouped'
  | 'llmcall'
  | 'paused-resumed-no-base'
  | 'tool-forced'
  | 'tool-set-changes'
  | 'hidden-skills'
  | 'instructions-move'
  | 'tagged-chart';

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
