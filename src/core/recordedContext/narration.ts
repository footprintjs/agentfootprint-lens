import type { EventLogEntry } from '../types.js';
import type { Humanizer } from '../humanizer.js';

/** Group consecutive equal sentences from the same native owner/type, preserving chronology. */
export function compactNarration(log: readonly EventLogEntry[], humanizer: Humanizer | undefined,
  appName: string): string[] {
  const groups: { line: string; owner: string; first: number; last: number; seqs: number[] }[] = [];
  for (const entry of log) {
    const rendered = humanizer ? humanizer(entry.event) : `Recorded event ${entry.event.type}.`;
    if (rendered === null) continue;
    const line = (/^\[[^\]]+\]$/.test(rendered) ? `Recorded event ${entry.event.type}.` : rendered)
      .replace(/\{\{appName\}\}/g, appName);
    const meta = entry.event.meta;
    const owner = JSON.stringify([entry.event.type, meta.runId, meta.compositionPath,
      meta.subflowPath, meta.runtimeStageId]);
    const group = groups[groups.length - 1];
    if (group?.line === line && group.owner === owner) {
      group.last = entry.runOffsetMs; group.seqs.push(entry.seq);
    } else groups.push({ line, owner, first: entry.runOffsetMs, last: entry.runOffsetMs, seqs: [entry.seq] });
  }
  return groups.map((group) =>
    `+${Math.round(group.first)}ms ${group.line}${group.seqs.length > 1
      ? ` [${group.seqs.length} occurrences; through +${Math.round(group.last)}ms; events ${group.seqs.join(', ')}]`
      : ` [event ${group.seqs[0]}]`}`);
}
