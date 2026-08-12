/**
 * The consent arithmetic — defaults, the meter, and the trim hint.
 *
 * Two arms: hand-built manifests that pin the exact numbers, and ONE real
 * manifest measured by agentfootprint's own `describeBugReport` over the
 * repo's recorded turn. The second is what catches a manifest whose shape
 * moved out from under the structural types in `types.ts`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import * as afObserve from 'agentfootprint/observe';

import {
  DEFAULT_MAX_BYTES,
  conversationUnits,
  defaultSelection,
  fileUnits,
  formatBytes,
  measureSelection,
  trimHintFor,
} from './selection.js';
import type { BugReportManifestView, BugReportUnitView } from './types.js';

const MB = 1024 * 1024;

const conv = (id: string, mb: number, extra: Partial<BugReportUnitView> = {}): BugReportUnitView => ({
  id,
  kind: 'conversation',
  label: `${id} — session ${id}: 1 run, 4 turns, 40 events`,
  bytes: mb * MB,
  eventCount: 40,
  turnCount: 4,
  files: [`${id}.json`],
  ...extra,
});

const file = (id: string, kb: number): BugReportUnitView => ({
  id,
  kind: 'file',
  label: `${id} — a derived file`,
  bytes: kb * 1024,
  files: [`${id}.json`],
});

const manifestOf = (units: readonly BugReportUnitView[]): BugReportManifestView => ({
  units,
  redactedKeys: [],
  warnings: [],
  notes: [],
});

describe('formatBytes', () => {
  it('reads the way agentfootprint reads — bytes, KB, MB', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(11 * MB)).toBe('11.0 MB');
    expect(formatBytes(DEFAULT_MAX_BYTES)).toBe('24.0 MB');
  });
});

describe('defaultSelection', () => {
  const manifest = manifestOf([
    conv('conv-1', 1),
    conv('conv-2', 1),
    conv('conv-3', 1),
    conv('conv-4', 1),
    conv('conv-5', 1),
    file('file-narrative', 20),
    file('file-environment', 1),
  ]);

  it('ticks the most recent 3 conversations and every derived file', () => {
    expect([...defaultSelection(manifest, 3)]).toEqual([
      'conv-3',
      'conv-4',
      'conv-5',
      'file-narrative',
      'file-environment',
    ]);
  });

  it('older conversations start unticked', () => {
    const selected = new Set(defaultSelection(manifest, 3));
    expect(selected.has('conv-1')).toBe(false);
    expect(selected.has('conv-2')).toBe(false);
  });

  it('asking for more than there are keeps all of them', () => {
    expect(defaultSelection(manifest, 99)).toHaveLength(7);
  });

  it('asking for none still keeps the derived files (they are rebuilt, not dropped)', () => {
    expect([...defaultSelection(manifest, 0)]).toEqual(['file-narrative', 'file-environment']);
  });

  it('splits units by kind', () => {
    expect(conversationUnits(manifest)).toHaveLength(5);
    expect(fileUnits(manifest)).toHaveLength(2);
  });
});

describe('measureSelection', () => {
  const manifest = manifestOf([conv('conv-1', 11), conv('conv-2', 20), file('file-env', 4)]);

  it('sums only what is ticked, and labels it against the ceiling', () => {
    const size = measureSelection(manifest, ['conv-1', 'file-env'], DEFAULT_MAX_BYTES);
    expect(size.bytes).toBe(11 * MB + 4 * 1024);
    expect(size.label).toBe('11.0 MB of 24.0 MB');
    expect(size.over).toBe(false);
    expect(size.conversations).toBe(1);
  });

  it('flips to over, then back to ready when the big one is unticked', () => {
    const over = measureSelection(manifest, ['conv-1', 'conv-2', 'file-env']);
    expect(over.over).toBe(true);
    expect(over.hint).toBeDefined();

    const ready = measureSelection(manifest, ['conv-1', 'file-env']);
    expect(ready.over).toBe(false);
    expect(ready.hint).toBeUndefined();
  });

  it('names the biggest ticked conversation in the hint, with its size', () => {
    const size = measureSelection(manifest, ['conv-1', 'conv-2', 'file-env']);
    expect(size.hint).toBe('Untick conv-2 (20.0 MB) to fit.');
  });

  it('ignores ids the manifest never offered', () => {
    expect(measureSelection(manifest, ['conv-1', 'ghost-9']).bytes).toBe(11 * MB);
  });

  it('counts zero conversations when only files are ticked', () => {
    expect(measureSelection(manifest, ['file-env']).conversations).toBe(0);
  });
});

describe('trimHintFor', () => {
  it('names several when one is not enough, biggest first', () => {
    const manifest = manifestOf([conv('a', 9), conv('b', 12), conv('c', 10), conv('d', 8)]);
    expect(trimHintFor(manifest, ['a', 'b', 'c', 'd'])).toBe(
      'Untick b (12.0 MB) and c (10.0 MB) to fit.',
    );
  });

  it('never suggests unticking the last conversation — it says the honest thing instead', () => {
    const manifest = manifestOf([conv('a', 30), conv('b', 30)]);
    const hint = trimHintFor(manifest, ['a', 'b']);
    expect(hint).toContain('Even with one conversation left');
    expect(hint).toContain('attach the zip by hand');
  });

  it('is silent when the selection already fits', () => {
    const manifest = manifestOf([conv('a', 1)]);
    expect(trimHintFor(manifest, ['a'])).toBeUndefined();
  });
});

// ─── Over a REAL manifest ────────────────────────────────────────────

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const recording = JSON.parse(
  readFileSync(join(FIXTURES, 'recorded-turn.json'), 'utf8'),
) as Record<string, unknown>;

const describeBugReport = (afObserve as unknown as Record<string, unknown>).describeBugReport as
  | ((input: unknown, options?: unknown) => BugReportManifestView)
  | undefined;

describe.runIf(typeof describeBugReport === 'function')(
  'over the recorded turn, measured by agentfootprint itself',
  () => {
    const manifest = describeBugReport!(recording, { warnOverBytes: DEFAULT_MAX_BYTES });

    it('the shipped manifest fits the shapes Lens reads it through', () => {
      expect(manifest.units.length).toBeGreaterThan(0);
      for (const unit of manifest.units) {
        expect(typeof unit.id).toBe('string');
        expect(typeof unit.label).toBe('string');
        expect(typeof unit.bytes).toBe('number');
        expect(['conversation', 'file']).toContain(unit.kind);
      }
      expect(Array.isArray(manifest.redactedKeys)).toBe(true);
    });

    it('one recorded turn is one conversation, and it is ticked by default', () => {
      const conversations = conversationUnits(manifest);
      expect(conversations).toHaveLength(1);
      expect(defaultSelection(manifest, 3)).toContain(conversations[0]!.id);
    });

    it('the whole turn is well under the ceiling, and the meter says so', () => {
      const size = measureSelection(manifest, defaultSelection(manifest, 3));
      expect(size.over).toBe(false);
      expect(size.label.endsWith('of 24.0 MB')).toBe(true);
      expect(size.conversations).toBe(1);
    });

    it('a ceiling below the run flips the meter and produces the honest refusal', () => {
      const size = measureSelection(manifest, defaultSelection(manifest, 3), 1024);
      expect(size.over).toBe(true);
      // One conversation: there is nothing to untick, and the hint says that
      // rather than naming the only piece of evidence there is.
      expect(size.hint).toContain('Even with one conversation left');
    });
  },
);
