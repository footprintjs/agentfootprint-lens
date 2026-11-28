/**
 * The same recording two ways: payloads in the base row (today's and every
 * older recording) and payloads with their invocation (a base part written
 * with sub-flow payloads moved), cut the way the recording format's writer
 * cuts it: a `subflow.entry` / `subflow.exit` event whose `runtimeStageId` is
 * an invocation of the recording, with `payload` as its last key, loses
 * `payload` and gains `payloadWith: 'invocation'` as its last key; its row's
 * `meta` says `subflowPayloads: 'with-invocation'`. The moved payloads come
 * back on the child reply, `{ result, payloads: { entry?, exit? } }`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecordingSubflow, type RecordedInvocation } from '../../src/core/recordingSourceCodec/index.js';
import type { RecordedInvocationPayloads, RecordedPayloadSlot, RecordedSubflowReply } from '../../src/core/recordingSourceCodec/types.js';

type Json = Record<string, any>;

/** The recorded agent turn, payloads in the row. */
export function recordedTurn(): Json {
  return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/core/__fixtures__/recorded-turn.json'), 'utf8'));
}

/** The same turn with every sub-flow payload moved to its invocation; returns the moved values by invocation. */
export function withPayloadsMoved(full: Json): { readonly recording: Json; readonly moved: ReadonlyMap<string, { entry?: unknown; exit?: unknown }> } {
  const recording = JSON.parse(JSON.stringify(full)) as Json;
  const invocations = new Set(Object.keys(recording.snapshot.subflowResults).filter(key => key.includes('#')));
  const moved = new Map<string, { entry?: unknown; exit?: unknown }>();
  for (const row of recording.snapshot.recorders) {
    if (row.name !== 'BoundaryEvents') continue;
    let any = false;
    row.data = row.data.map((event: Json) => {
      const side = event.type === 'subflow.entry' ? 'entry' : event.type === 'subflow.exit' ? 'exit' : undefined;
      const keys = Object.keys(event);
      if (side === undefined || !invocations.has(event.runtimeStageId) || keys[keys.length - 1] !== 'payload') return event;
      const { payload, ...rest } = event;
      moved.set(event.runtimeStageId, { ...moved.get(event.runtimeStageId), [side]: payload });
      any = true;
      return { ...rest, payloadWith: 'invocation' };
    });
    if (any) row.meta = { ...(row.meta ?? {}), mode: 'full', subflowPayloads: 'with-invocation' };
  }
  return { recording, moved };
}

/** A child reply for either form: the native unit, plus the moved payloads when there are any. */
export function childReply(
  full: Json, request: RecordedInvocation, moved?: ReadonlyMap<string, { entry?: unknown; exit?: unknown }>,
  override?: (payloads: RecordedInvocationPayloads) => RecordedInvocationPayloads,
): RecordedSubflowReply {
  const read = readRecordingSubflow(full, request);
  if (read.status !== 'ready') throw new Error(`Child refused: ${read.reason}`);
  const values = moved?.get(request.mountRuntimeStageId);
  if (values === undefined) return { result: read.value.result };
  const slot = (value: unknown): RecordedPayloadSlot => ({ status: 'ready', value });
  const payloads: RecordedInvocationPayloads = {
    ...('entry' in values && { entry: slot(values.entry) }), ...('exit' in values && { exit: slot(values.exit) }),
  };
  return { result: read.value.result, payloads: override ? override(payloads) : payloads };
}
