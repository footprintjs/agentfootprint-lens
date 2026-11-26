import type { PayloadMarks } from './types.js';

/** The boundary recorder's snapshot entry, by the name it writes. */
const BOUNDARY_ENTRY_NAME = 'BoundaryEvents';
/** The one mark value a base part writes on a moved event (`payloadWith`). */
const WITH_INVOCATION = 'invocation';

/**
 * Which `subflow.entry` / `subflow.exit` payloads a recording moved out of its
 * base row. A saved base part removes such an event's `payload` and appends
 * `payloadWith: 'invocation'`; the event's `runtimeStageId` is the invocation
 * to load. Read from every `BoundaryEvents` row of the snapshot, by the event
 * mark alone: a live stream and every older recording carry none, so this is
 * an empty map for them and nothing changes. An event that still has its own
 * `payload` is read as recorded, mark or not.
 */
export function readPayloadMarks(snapshot: unknown): PayloadMarks {
  const marks = new Map<string, { entry: boolean; exit: boolean }>();
  const recorders = (snapshot as { readonly recorders?: unknown } | null | undefined)?.recorders;
  if (!Array.isArray(recorders)) return marks;
  for (const row of recorders as readonly unknown[]) {
    const entry = row as { readonly name?: unknown; readonly data?: unknown } | null | undefined;
    if (entry?.name !== BOUNDARY_ENTRY_NAME || !Array.isArray(entry.data)) continue;
    for (const item of entry.data as readonly unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const event = item as { readonly type?: unknown; readonly runtimeStageId?: unknown; readonly payloadWith?: unknown };
      const side = event.type === 'subflow.entry' ? 'entry' : event.type === 'subflow.exit' ? 'exit' : undefined;
      if (side === undefined || event.payloadWith !== WITH_INVOCATION || typeof event.runtimeStageId !== 'string') continue;
      if (Object.prototype.hasOwnProperty.call(event, 'payload')) continue;
      const known = marks.get(event.runtimeStageId) ?? { entry: false, exit: false };
      known[side] = true;
      marks.set(event.runtimeStageId, known);
    }
  }
  return marks;
}
