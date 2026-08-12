/**
 * The consent arithmetic: what is ticked by default, how big that is, and
 * which unit to untick when it does not fit.
 *
 * Pure functions over a manifest — no React, no agentfootprint import. The
 * modal renders them; a CLI reporter could use the same three.
 *
 * THE ONE HONESTY RULE HERE
 * ─────────────────────────
 * A selection's size is an ESTIMATE, and it is stated as one. The manifest
 * measures every unit with EVERY unit selected; the library rebuilds the
 * derived files (`conversation.json`, `narrative.txt`) over whatever
 * conversations survive, so unticking a conversation shrinks its own unit AND
 * silently shrinks the derived ones. Summing the ticked units therefore
 * over-states, never under-states — the safe direction for a size gate, and the
 * meter says which direction it errs in instead of implying a measurement.
 */

import type { BugReportManifestView, BugReportUnitView } from './types.js';

/**
 * The default ceiling: 24 MB.
 *
 * The same number `githubBugReporter` refuses above, and it is chosen for the
 * same reason — GitHub's web UI accepts a 25 MB drag-and-dropped file, and a
 * bundle bigger than that is not a bug report anybody opens.
 */
export const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

/**
 * A size a human reads — the same rule agentfootprint's own refusals use, so
 * the meter and the library's trim hints never disagree about what "11.0 MB"
 * means.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 bytes';
  if (bytes < 1024) return `${Math.round(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The conversation units, in manifest order (oldest first — see below). */
export function conversationUnits(
  manifest: BugReportManifestView,
): readonly BugReportUnitView[] {
  return manifest.units.filter((unit) => unit.kind === 'conversation');
}

/** The derived-file units (transcript, narrative, environment). */
export function fileUnits(manifest: BugReportManifestView): readonly BugReportUnitView[] {
  return manifest.units.filter((unit) => unit.kind !== 'conversation');
}

/**
 * What the dialog opens with: the most recent `recent` conversations, plus
 * every derived file.
 *
 * "Most recent" = the LAST `recent` conversation units. A manifest carries no
 * timestamps — the library numbers conversations `conv-1…conv-n` in the order
 * the recordings were handed to it, which for an app that appends as it records
 * is oldest-first. That is the only ordering there is, and it is the one this
 * follows; nothing here guesses a date.
 *
 * The derived files ride the selection rather than being ticked separately:
 * they are REBUILT over the surviving conversations, so they never carry a
 * conversation the reporter unticked. Their own units stay listed and
 * untickable so a reporter can drop the narrative or the transcript on purpose.
 */
export function defaultSelection(
  manifest: BugReportManifestView,
  recent = 3,
): readonly string[] {
  const conversations = conversationUnits(manifest);
  const keep = recent <= 0 ? [] : conversations.slice(Math.max(0, conversations.length - recent));
  return [...keep.map((unit) => unit.id), ...fileUnits(manifest).map((unit) => unit.id)];
}

/** The live meter's answer for one selection. */
export interface SelectionSize {
  /** Estimated uncompressed bytes of the ticked units. */
  readonly bytes: number;
  /** The ceiling this is measured against. */
  readonly limitBytes: number;
  /** Over the ceiling — submit is refused while true. */
  readonly over: boolean;
  /** `"12.4 MB of 24.0 MB"` — the meter's label. */
  readonly label: string;
  /** How many conversations are ticked (a bundle with none carries no evidence). */
  readonly conversations: number;
  /** Naming the unit(s) to untick, when over. Absent when it fits. */
  readonly hint?: string;
}

/**
 * Measure one selection against the ceiling.
 *
 * @param selected the ticked unit ids. Ids the manifest does not know are
 *                 ignored rather than counted — a stale id costs nothing.
 */
export function measureSelection(
  manifest: BugReportManifestView,
  selected: Iterable<string>,
  limitBytes: number = DEFAULT_MAX_BYTES,
): SelectionSize {
  const ticked = new Set(selected);
  const units = manifest.units.filter((unit) => ticked.has(unit.id));
  const bytes = units.reduce((sum, unit) => sum + (unit.bytes || 0), 0);
  const over = bytes > limitBytes;
  const hint = over ? trimHintFor(manifest, ticked, limitBytes) : undefined;
  return {
    bytes,
    limitBytes,
    over,
    label: `${formatBytes(bytes)} of ${formatBytes(limitBytes)}`,
    conversations: units.filter((unit) => unit.kind === 'conversation').length,
    ...(hint !== undefined && { hint }),
  };
}

/**
 * Name the ticked conversations worth unticking, biggest first, until it fits.
 *
 * Same rule the library's own `trimHints` use — biggest first, never the last
 * remaining conversation, because a bundle with no evidence is refused at
 * export and a hint that leads there is a dead end. A hint that says "make it
 * smaller" is not a hint.
 */
export function trimHintFor(
  manifest: BugReportManifestView,
  selected: Iterable<string>,
  limitBytes: number = DEFAULT_MAX_BYTES,
): string | undefined {
  const ticked = new Set(selected);
  const droppable = manifest.units
    .filter((unit) => ticked.has(unit.id) && unit.kind === 'conversation')
    .sort((left, right) => right.bytes - left.bytes);

  let remaining = manifest.units
    .filter((unit) => ticked.has(unit.id))
    .reduce((sum, unit) => sum + (unit.bytes || 0), 0);
  if (remaining <= limitBytes) return undefined;

  const named: string[] = [];
  for (const unit of droppable) {
    // Never suggest unticking the last conversation.
    if (named.length >= droppable.length - 1) break;
    remaining -= unit.bytes || 0;
    named.push(`${unit.id} (${formatBytes(unit.bytes || 0)})`);
    if (remaining <= limitBytes) break;
  }

  if (remaining > limitBytes) {
    return (
      `Even with one conversation left this is over ${formatBytes(limitBytes)}. ` +
      'Untick a derived file, record a shorter reproduction, or file the issue and ' +
      'attach the zip by hand.'
    );
  }
  return `Untick ${joinWithAnd(named)} to fit.`;
}

function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
