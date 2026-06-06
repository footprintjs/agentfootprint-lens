/**
 * Cursor → spec-node id mapping — pure-function regression tests.
 *
 * Lens v0.1 ONE-CURSOR architecture (locked):
 *   The slider cursor is a `runtimeStageId` in footprintjs's address
 *   space: `[subflowPath/]stageId#executionIndex`. The static SpecNode
 *   tree, however, keys nodes by the bare `stageId` (no `#N`). To map
 *   cursor → highlight node we strip the trailing `#N`.
 *
 * The transformation lives inline in <Lens> as a one-liner; these tests
 * pin the contract so future refactors (e.g., switching to a different
 * cursor convention) can't quietly break the chart highlight.
 *
 * See `memory/lens_v0_1_one_cursor_architecture.md` — section "Cursor →
 * highlight mapping".
 */

import { describe, it, expect } from 'vitest';

/** Mirror of the inline transform in `<Lens>` EngineerView. */
function stripExecutionIndex(cursor: string): string {
  return cursor ? (cursor.split('#')[0] ?? '') : '';
}

describe('cursor → static-spec node id', () => {
  it('strips a top-level execution index', () => {
    expect(stripExecutionIndex('seed#0')).toBe('seed');
  });

  it('strips a deep-execution index', () => {
    expect(stripExecutionIndex('call-llm#42')).toBe('call-llm');
  });

  it('preserves subflow path prefixes verbatim', () => {
    // SpecNode ids inside subflows are themselves prefixed by the
    // mount id (e.g., `legal/call-llm`). The strip keeps the prefix.
    expect(stripExecutionIndex('legal/call-llm#5')).toBe('legal/call-llm');
  });

  it('handles deeply-nested subflows', () => {
    expect(stripExecutionIndex('sf-outer/sf-inner/step#100')).toBe(
      'sf-outer/sf-inner/step',
    );
  });

  it('returns empty string for empty cursor', () => {
    expect(stripExecutionIndex('')).toBe('');
  });

  it('passes through ids that have no `#N` suffix (already-stripped)', () => {
    // Defensive: in degenerate cases the cursor might already be a
    // bare spec id. The strip should be idempotent.
    expect(stripExecutionIndex('seed')).toBe('seed');
    expect(stripExecutionIndex('legal/call-llm')).toBe('legal/call-llm');
  });

  it('all Loop iterations of the same stageId map to the SAME spec id', () => {
    // Locked rule: Loop iterations all highlight the SAME spec node.
    // The iteration index is overlaid by a separate badge; the highlight
    // identity is the bare stageId.
    expect(stripExecutionIndex('body#5')).toBe('body');
    expect(stripExecutionIndex('body#9')).toBe('body');
    expect(stripExecutionIndex('body#13')).toBe('body');
  });

  it('distinct branches in a Parallel get distinct spec ids', () => {
    expect(stripExecutionIndex('legal#3')).toBe('legal');
    expect(stripExecutionIndex('ethics#7')).toBe('ethics');
  });
});

// ── Tooltip label routing (cursorPositions[focusStep].label preferred) ──
//
// The Lens slider tooltip prefers `cursorPositions[focusStep].label`
// over the StepGraph-derived `${stepAgentName} · ${focusedNode.label}`.
// This avoids the legacy `'legal · legal'` stutter when an Agent and
// its inner LLMCall share a name. These tests pin the preference rule.

interface FakeCursorPosition {
  readonly label: string;
}
interface FakeFocusedNode {
  readonly label: string;
}

function pickStepLabel(
  cursorPosition: FakeCursorPosition | undefined,
  stepAgentName: string | undefined,
  focusedNode: FakeFocusedNode | undefined,
): string | undefined {
  return (
    cursorPosition?.label ??
    (focusedNode
      ? stepAgentName
        ? `${stepAgentName} · ${focusedNode.label}`
        : focusedNode.label
      : undefined)
  );
}

describe('tooltip label routing', () => {
  it('prefers the cursor-position label when present', () => {
    expect(
      pickStepLabel(
        { label: 'Committee · forks' },
        'legal',
        { label: 'legal' },
      ),
    ).toBe('Committee · forks');
  });

  it('avoids the `legal · legal` stutter via the cursor-position label', () => {
    // Without the cursor-position preference, both stepAgentName and
    // focusedNode.label resolve to "legal" (the LLMCall is named after
    // the agent it's wrapped in), yielding the duplicate. The cursor
    // position carries the canonical disambiguated label.
    expect(
      pickStepLabel({ label: 'legal · start' }, 'legal', { label: 'legal' }),
    ).toBe('legal · start');
  });

  it('falls back to `${agent} · ${step}` when no cursor position is available', () => {
    expect(
      pickStepLabel(undefined, 'classify', { label: 'user → llm' }),
    ).toBe('classify · user → llm');
  });

  it('falls back to bare focused-node label when agent name is unavailable', () => {
    expect(pickStepLabel(undefined, undefined, { label: 'merge' })).toBe('merge');
  });

  it('returns undefined when nothing is available', () => {
    expect(pickStepLabel(undefined, undefined, undefined)).toBeUndefined();
  });
});
