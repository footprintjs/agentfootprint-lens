/**
 * The SkillGraph debugger, over a REAL recording (`demo/skill-run.json`,
 * produced by `npm run demo:record` — generated, never hand-authored).
 *
 * The demo's job is to be the HOST that owns the one cursor, because that is
 * the seam the view is built around. It holds a step over the same axis
 * `<Lens>` holds one over (`useCursorPositions`), shows the address that step
 * resolves to, and hands the view `cursorRuntimeStageId` / `onJumpTo`. Move
 * the cursor from the host bar and the graph, the card, the strip and the
 * story all follow; click anything inside the view and the HOST's cursor is
 * what moves. There is no second position anywhere on this page.
 *
 *   npm run demo   → http://localhost:5174
 */

import React, { useMemo, useState } from 'react';

import {
  observeRecording,
  selectSkillBeats,
  selectSkillRoute,
  stepForRuntimeStageId,
  type Recording,
} from '../src/core/index.js';
import { useCursorPositions } from '../src/react/hooks/useCursorPositions.js';
import { SkillGraphDebugger, type SkillLens } from '../src/react/skillgraph/index.js';
import { T } from '../src/react/theme/index.js';

import recordingJson from './skill-run.json';
import graphJson from './skill-graph.json';

/** The author's declared edges, from the BUILT graph (entry edge dropped —
 *  `from: null` is a start rule, not an edge between two skills). */
const DECLARED_EDGES = (graphJson as { edges: { from: string | null; to: string }[] }).edges
  .filter((e): e is { from: string; to: string } => e.from !== null)
  .map((e) => ({ from: e.from, to: e.to }));

export function Demo(): React.ReactElement {
  const { recorder } = useMemo(
    () => observeRecording(recordingJson as unknown as Recording),
    [],
  );
  const positions = useCursorPositions(recorder, []);

  // THE cursor — one number, owned here, exactly as `<Lens step>` owns it.
  const [step, setStep] = useState(1);
  const [lens, setLens] = useState<SkillLens>('developer');
  const [useBuiltGraph, setUseBuiltGraph] = useState(false);

  const at = positions[Math.min(step, positions.length - 1)];
  const cursorRuntimeStageId = at?.runtimeStageId ?? '';

  // The debugger reports an ADDRESS; the host maps it back onto its own axis.
  const jumpTo = (runtimeStageId: string): void => {
    const next = stepForRuntimeStageId(positions, runtimeStageId);
    if (next >= 0) setStep(next);
  };

  // Handy for eyeballing the projection: which routing stops exist at all.
  const beats = useMemo(
    () => selectSkillBeats({ route: selectSkillRoute({ log: recorder.selectEventLog() }) }),
    [recorder],
  );

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: T.bgPrimary,
        color: T.textPrimary,
        fontFamily: T.fontSans,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: `1px solid ${T.border}`,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 13 }}>host cursor</strong>
        <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textSecondary }}>
          step {step}/{Math.max(0, positions.length - 1)} · {at?.label ?? '—'} ·{' '}
          {cursorRuntimeStageId || '—'}
        </span>
        <span style={{ fontSize: 11, color: T.textMuted }}>
          the host owns this number; the transport under the graph is the lens&apos;s own
          &lt;TimeTravel&gt;, bound to it
        </span>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 11, color: T.textSecondary, display: 'flex', gap: 6 }}>
          <input
            type="checkbox"
            checked={useBuiltGraph}
            onChange={(e) => setUseBuiltGraph(e.target.checked)}
          />
          declared edges from the built graph
        </label>
        <span style={{ fontSize: 11, color: T.textMuted }}>{beats.length} routing stops</span>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <SkillGraphDebugger
          recorder={recorder}
          cursorRuntimeStageId={cursorRuntimeStageId}
          {...(at?.kind !== undefined ? { cursorKind: at.kind } : {})}
          onJumpTo={jumpTo}
          step={step}
          totalSteps={positions.length}
          onStepChange={setStep}
          {...(useBuiltGraph ? { declaredEdges: DECLARED_EDGES } : {})}
          lens={lens}
          onLensChange={setLens}
        />
      </div>
    </div>
  );
}
