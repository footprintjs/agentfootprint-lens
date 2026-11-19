/**
 * <FindingsBand> — the model's own findings ledger at the cursor, folded for
 * reading (agentfootprint 9.101.0, `AgentState.findingsLedger`).
 *
 * WHY. The ledger is append-only: a basis row before each tool call, a
 * standing row on each result the model later named, a conflict row where two
 * stood-on readings disagreed. Read raw, the current picture at a stop is
 * spread across every row that ever landed. This band takes the STANDINGS
 * the way the library's own reader does (`findings/ledger.ts · foldLedger`:
 * the LAST standing row per `toolCallId` is the current one) and groups them,
 * so a reader sees at once what the model stands on, what it keeps open, what
 * it ruled out, what it called noise — and which results it never named at
 * all. CONFLICTS are the one group that is NOT a current set: the library
 * writes a `ConflictRow` ONCE per key, at the write whose stood-on readings
 * first disagreed, and a later `ruled-out` retires a witness in ITS fold
 * (`foldLedger(...).conflicts` = `conflictsOf(asserted)`, recomputed) without
 * touching the row. That recomputation is contextfootprint's value algebra,
 * which this lens does not own and will not re-derive; so the band prints the
 * rows as what they are — the history of when each conflict was FIRST SEEN
 * (`LABELS.conflicts` says so) — and beside every witness the standing the
 * same fold holds for it NOW (`fact` · `ruled-out` · …, the record's own
 * word). A retired witness reads `ruled-out` on the conflict row and sits in
 * the ruled-out group; nothing here decides whether the conflict still holds.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. NEVER INFER. A result with no standing row is UNDECLARED: it is listed
 *      under that word by the state's own `toolResults`, never as `open` and
 *      never as "no findings". A standing outside the four the library names
 *      is neither shown nor guessed at.
 *   2. NO VERDICT. A conflict is printed from its `ConflictRow` — the shared
 *      key and every witness's identity, each with the standing the fold
 *      holds for that witness now — and nothing here says which reading
 *      holds, nor whether the conflict is still current.
 *   3. OMIT, NEVER DENY. An empty group is not rendered; the band itself
 *      renders only when the fold at the stop holds the key (`<ContextView>`
 *      · `FindingsLayer` decides that).
 *   4. NO SENTENCE OF ITS OWN. Every printed string is a value off the record
 *      — an id, a subject, a predicate, a value, a `settles`, a `line` — or a
 *      `LABELS` entry; `test/served/no-own-claims.test.ts` walks this file.
 *   5. A SHAPE THE LENS DOES NOT OWN. The rows came off a recording as JSON,
 *      so the Findings fold in `core/context/findings.ts` narrows each row
 *      by its shape before this band displays it.
 *
 * Pure over its props: `rows` is the ledger as the fold holds it at the stop,
 * `toolResults` the state's batch at the same stop. Handed both by
 * `<ContextView>` from `contextAt(...).keys`, so the band moves with the ONE
 * cursor and never folds a second time.
 */
import React, { useMemo } from 'react';
import { foldFindings, type AssertionShape, type StandingShape } from '../../core/context/findings.js';

export {
  foldFindings,
  type AssertionShape,
  type ConflictItem,
  type ConflictShape,
  type DeclaredOnShape,
  type FactItem,
  type FindingsFold,
  type StandingShape,
  type WitnessItem,
  type WitnessShape,
} from '../../core/context/findings.js';

/** Every string this band owns — names for groups and fields, never a sentence. */
export const LABELS = Object.freeze({
  band: 'findings',
  rows: 'rows',
  facts: 'facts',
  /** The conflict ROWS — the history of when each was first seen, not the current set (see the header). */
  conflicts: 'conflicts first seen',
  open: 'open',
  ruledOut: 'ruled out',
  noise: 'noise',
  undeclared: 'undeclared',
  settles: 'settles',
  line: 'line',
});

// ─── The band ─────────────────────────────────────────────────────────────

export interface FindingsBandProps {
  /** The ledger as the fold holds it at the stop (`findingsLedger`). */
  readonly rows: readonly unknown[];
  /** The state's `toolResults` at the same stop — the batch whose undeclared results are listed. */
  readonly toolResults?: readonly unknown[];
  /** How the ledger key moved since the previous stop, when the host measured it. */
  readonly since?: 'entered' | 'changed' | 'unchanged';
}

/** A value as the record spells it: a string bare, anything else as JSON. */
function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

export function FindingsBand(props: FindingsBandProps): React.ReactElement {
  const { rows, toolResults, since } = props;
  const fold = useMemo(() => foldFindings(rows, toolResults), [rows, toolResults]);
  return (
    <div style={band} data-testid="context-findings" data-rows={fold.rows} data-since={since ?? ''}>
      <span style={dim}>
        {LABELS.band} · {fold.rows} {LABELS.rows}
      </span>
      {fold.facts.length > 0 && (
        <Group id="facts" label={LABELS.facts} count={fold.facts.length}>
          {fold.facts.map((f, i) => (
            <li key={i} style={mono} data-testid="context-findings-fact" data-tool-call-id={f.toolCallId}>
              <AssertionLine assertion={f.assertion} />
              {' ← '}
              <code>{f.assertion.provenance ?? f.toolCallId}</code>
            </li>
          ))}
        </Group>
      )}
      {fold.conflicts.length > 0 && (
        <Group id="conflicts" label={LABELS.conflicts} count={fold.conflicts.length}>
          {fold.conflicts.map((c, i) => (
            <li key={i} style={mono} data-testid="context-findings-conflict" data-key={c.key}>
              {c.witnesses.map((w, j) => (
                <div
                  key={j}
                  data-testid="context-findings-witness"
                  data-tool-call-id={w.toolCallId}
                  data-standing={w.standing ?? ''}
                >
                  <code>
                    {w.subject.kind}/{w.subject.id}
                  </code>
                  {' · '}
                  <code>{w.predicate}</code>
                  {' ← '}
                  <code>{w.toolCallId}</code>
                  {w.standing !== undefined && (
                    <>
                      {' · '}
                      <code>{w.standing}</code>
                    </>
                  )}
                </div>
              ))}
            </li>
          ))}
        </Group>
      )}
      {fold.open.length > 0 && (
        <Group id="open" label={LABELS.open} count={fold.open.length}>
          {fold.open.map((s) => (
            <li key={s.toolCallId} style={mono} data-testid="context-findings-open-row" data-tool-call-id={s.toolCallId}>
              <StandingHead standing={s} />
              {s.assertions.map((a, i) => (
                <div key={i}>
                  <AssertionLine assertion={a} />
                </div>
              ))}
              {s.settles !== undefined && (
                <div>
                  <span style={dim}>{LABELS.settles}</span>
                  {' · '}
                  {s.settles}
                </div>
              )}
            </li>
          ))}
        </Group>
      )}
      {fold.ruledOut.length > 0 && (
        <Group id="ruled-out" label={LABELS.ruledOut} count={fold.ruledOut.length}>
          {fold.ruledOut.map((s) => (
            <li key={s.toolCallId} style={mono} data-testid="context-findings-ruled-out-row" data-tool-call-id={s.toolCallId}>
              <StandingHead standing={s} />
              {s.line !== undefined && (
                <div>
                  <span style={dim}>{LABELS.line}</span>
                  {' · '}
                  {s.line}
                </div>
              )}
            </li>
          ))}
        </Group>
      )}
      {fold.noise.length > 0 && (
        <Group id="noise" label={LABELS.noise} count={fold.noise.length}>
          <li style={mono}>
            <IdList ids={fold.noise} testId="context-findings-noise-id" />
          </li>
        </Group>
      )}
      {fold.undeclared.length > 0 && (
        <Group id="undeclared" label={LABELS.undeclared} count={fold.undeclared.length}>
          <li style={mono}>
            <IdList ids={fold.undeclared} testId="context-findings-undeclared-id" />
          </li>
        </Group>
      )}
    </div>
  );
}

/** One group: its label and count, then the items. Rendered only with items. */
function Group({
  id,
  label,
  count,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div data-testid={`context-findings-${id}`} data-count={count}>
      <span style={dim}>
        {label} · {count}
      </span>
      <ul style={list}>{children}</ul>
    </div>
  );
}

/** `kind/id · predicate = value` — the assertion's own parts. */
function AssertionLine({ assertion }: { readonly assertion: AssertionShape }): React.ReactElement {
  return (
    <span data-testid="context-findings-assertion">
      <code>
        {assertion.subject.kind}/{assertion.subject.id}
      </code>
      {' · '}
      <code>{assertion.predicate}</code>
      {' = '}
      <code>{valueText(assertion.value)}</code>
    </span>
  );
}

/** The result a standing is about: its id, and the tool name when the row carries it. */
function StandingHead({ standing }: { readonly standing: StandingShape }): React.ReactElement {
  return (
    <div>
      <code>{standing.toolCallId}</code>
      {standing.toolName !== undefined && (
        <>
          {' · '}
          <code>{standing.toolName}</code>
        </>
      )}
    </div>
  );
}

function IdList({ ids, testId }: { readonly ids: readonly string[]; readonly testId: string }): React.ReactElement {
  return (
    <>
      {ids.map((id, i) => (
        <React.Fragment key={id}>
          {i > 0 && ' · '}
          <code data-testid={testId}>{id}</code>
        </React.Fragment>
      ))}
    </>
  );
}

// One-word CSS literals only: the own-claims walker reads every string.
const band: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingTop: 6,
  borderTop: '1px solid',
  borderTopColor: 'currentColor',
};
const dim: React.CSSProperties = { opacity: 0.7 };
const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  wordBreak: 'break-word',
};
const list: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18 };
