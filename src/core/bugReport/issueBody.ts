/**
 * The issue body — the prose the reporter typed, plus the manifest as a table.
 *
 * One builder, three submit modes. Whether the report is pasted into GitHub's
 * new-issue form by hand, filed by the reporter's own token, or relayed through
 * the app's server, the maintainer reads the SAME text: what was tried, what
 * was expected, what happened, and then — in a table nobody has to take on
 * trust — exactly which units of evidence came along, which were left out, and
 * which state keys were already scrubbed before any of it was recorded.
 *
 * What is never in here: a token, a zip byte, a redacted VALUE. The manifest
 * carries redacted key NAMES only (footprintjs scrubbed the values upstream at
 * commit time), and this builder copies names, never values.
 */

import { formatBytes } from './selection.js';
import type { BugReportFieldsView, BugReportManifestView } from './types.js';

/** Where the evidence zip ended up — stated in the issue, never implied. */
export interface EvidenceNote {
  readonly filename: string;
  readonly bytes: number;
  /**
   * `'by-hand'`  the reporter has the file and must attach it.
   * `'relayed'`  the app's server received it and files it with the issue.
   */
  readonly delivery: 'by-hand' | 'relayed';
}

export interface IssueBodyArgs {
  readonly fields: BugReportFieldsView;
  /** The manifest of what is actually being sent (the export's, when there is one). */
  readonly manifest: BugReportManifestView;
  /** The ticked unit ids, when the manifest's own `selected` is not the truth yet. */
  readonly selected?: readonly string[];
  readonly evidence?: EvidenceNote;
}

/** Build the markdown body. Deterministic — same inputs, same bytes. */
export function buildIssueBody(args: IssueBodyArgs): string {
  const { fields, manifest, evidence } = args;
  const selected = new Set(args.selected ?? manifest.selected ?? manifest.units.map((u) => u.id));
  const lines: string[] = [];

  lines.push('### Steps to reproduce', '', textOr(fields.stepsToReproduce), '');
  lines.push('### Expected', '', textOr(fields.expected), '');
  lines.push('### Actual', '', textOr(fields.actual), '');

  lines.push('### Evidence in this report', '');
  lines.push('| unit | kind | size | events | turns |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const unit of manifest.units) {
    if (!selected.has(unit.id)) continue;
    lines.push(
      `| \`${unit.id}\` | ${unit.kind} | ${formatBytes(unit.bytes || 0)} | ` +
        `${unit.eventCount ?? '—'} | ${unit.turnCount ?? '—'} |`,
    );
  }
  lines.push('');

  const left = manifest.units.filter((unit) => !selected.has(unit.id));
  if (left.length > 0) {
    lines.push(
      `The reporter left out ${left.length} unit${left.length === 1 ? '' : 's'}: ` +
        `${left.map((unit) => `\`${unit.id}\``).join(', ')}. ` +
        'A turn that refers to something not here is referring to one of those.',
      '',
    );
  }

  const redacted = manifest.redactedKeys ?? [];
  if (redacted.length > 0) {
    lines.push(
      `**Redacted before recording** (names only — the values never left the reporter's ` +
        `machine): ${redacted.map((key) => `\`${key}\``).join(', ')}`,
      '',
    );
  }

  for (const warning of manifest.warnings ?? []) lines.push(`> ⚠ ${warning}`, '');
  for (const note of manifest.notes ?? []) lines.push(`> ${note}`, '');

  if (evidence) {
    lines.push(
      evidence.delivery === 'by-hand'
        ? `**Evidence bundle:** \`${evidence.filename}\` (${formatBytes(evidence.bytes)}) — ` +
            'downloaded to the reporter\'s machine and attached to this issue by hand. If it is ' +
            'not attached above, ask them for it: nothing was uploaded automatically.'
        : `**Evidence bundle:** \`${evidence.filename}\` (${formatBytes(evidence.bytes)}) — ` +
            'sent to the application\'s bug-report endpoint, which files it with this issue.',
      '',
    );
  }

  lines.push('### Environment', '');
  const env = manifest.environment ?? {};
  for (const [label, value] of [
    ['agentfootprint', env.agentfootprint],
    ['footprintjs', env.footprintjs],
    ['node', env.node],
    ['platform', joinPlatform(env.platform, env.arch)],
    ['app', env.appVersion ?? fields.appVersion],
  ] as const) {
    if (value) lines.push(`- ${label}: \`${value}\``);
  }
  lines.push('');
  lines.push('<sub>Filed from Why Lens — the manifest above is the library\'s own.</sub>');

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

const textOr = (value: string | undefined): string =>
  value && value.trim() !== '' ? value.trim() : '_(not given)_';

function joinPlatform(platform?: string, arch?: string): string | undefined {
  if (!platform && !arch) return undefined;
  return [platform, arch].filter(Boolean).join('/');
}
