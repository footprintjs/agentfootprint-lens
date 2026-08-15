/**
 * humanizeEvidence — natural-language lines for the EVIDENCE GATE
 * (`agentfootprint.agent.evidence_checked`, agentfootprint 9.35.0).
 *
 * The gate checks the values in an answer against what the tools actually
 * returned, and records one verdict per judged answer. Four actions:
 *
 *   grounded        every value was found — the answer stands
 *   flagged         values were not found, and the answer shipped anyway
 *   revision-asked  values were not found, and the model got one more turn
 *   refused         values were not found, and the answer was withheld
 *
 * Pattern: pure sentence builder, composed by `defaultHumanizer` — same shape
 * as `humanizeRouting` / `humanizeArtifacts`.
 * Role:    plain-language commentary for a NON-developer reader. No jargon:
 *          "appears in no tool result", never "unsupported candidate".
 *
 * Era note: this event postdates the agentfootprint version this package
 * compiles against, so `defaultHumanizer` matches it by raw type STRING and
 * reads it through the structural mirror below (the `turn_routed` precedent).
 * House law throughout: render ONLY what the event carries — an absent field
 * means its clause is omitted, never guessed.
 */

/** Mirror of `AgentEvidenceCheckedPayload` (agentfootprint 9.35.0). */
export interface EvidenceCheckedLike {
  readonly iteration?: number;
  /** `'assist'` records only, `'guard'` may revise once, `'rails'` may withhold. */
  readonly posture?: string;
  /** How many distinct values the answer had to ground. */
  readonly candidates?: number;
  /** The values that appear in no tool result. Empty when `grounded`. */
  readonly unsupported?: readonly { readonly value?: string; readonly shape?: string }[];
  readonly action?: string;
  /** True when this judged an answer a revision already corrected. */
  readonly afterRevision?: boolean;
  /** The evidence index hit its ceiling — the verdict judged a partial corpus. */
  readonly evidenceTruncated?: boolean;
}

/** Up to three values, quoted, as a reader-sized list. */
function valueList(p: EvidenceCheckedLike): string {
  const values = (p.unsupported ?? [])
    .map((u) => u.value)
    .filter((v): v is string => typeof v === 'string' && v !== '');
  if (values.length === 0) return '';
  const shown = values.slice(0, 3).map((v) => `"${v}"`);
  const rest = values.length - shown.length;
  const list = shown.join(', ');
  return rest > 0 ? `${list} and ${rest} more` : list;
}

/**
 * The subject of the sentence, verb agreement included: "1 thing … appears" /
 * "3 things … appear". Written as one phrase because the count and the verb
 * cannot disagree if they are built together.
 */
function notFoundClause(p: EvidenceCheckedLike): string {
  const n = p.unsupported?.length ?? 0;
  const list = valueList(p);
  const named = list === '' ? '' : ` (${list})`;
  return n === 1
    ? `1 thing in the answer${named} appears in no tool result`
    : `${n} things in the answer${named} appear in no tool result`;
}

/** Decorations both arms share: the second look, and a partial check. */
function tail(p: EvidenceCheckedLike): string {
  let out = '';
  if (p.afterRevision === true) {
    out += ' This was the second look, after the model had already been asked to fix it.';
  }
  if (p.evidenceTruncated === true) {
    // The gate itself flags this: a partial corpus can call a real value made
    // up, so the verdict is reported WITH the caveat rather than as a fact.
    out +=
      ' Not every tool result fitted into the check, so this verdict was made on part of the evidence.';
  }
  return out;
}

export function humanizeEvidenceChecked(p: EvidenceCheckedLike): string {
  switch (p.action) {
    case 'grounded': {
      const n = p.candidates;
      // `candidates: 0` is its own fact — the answer asserted nothing the gate
      // treats as data — and saying "everything was found" about nothing would
      // read as a check that happened when none did.
      if (n === 0) return `The answer asserted nothing that needed checking — it stands.${tail(p)}`;
      const head =
        n === 1
          ? 'The one value in the answer was found in what the tools returned'
          : n !== undefined
            ? `All ${n} values in the answer were found in what the tools returned`
            : 'Everything the answer asserted was found in what the tools returned';
      return `${head} — the answer stands.${tail(p)}`;
    }

    case 'flagged':
      return `${notFoundClause(p)} — the answer was sent anyway, with that on the record.${tail(p)}`;

    case 'revision-asked':
      return `${notFoundClause(p)} — the model was asked to answer again.${tail(p)}`;

    case 'refused':
      return `${notFoundClause(p)} — the answer was withheld rather than sent.${tail(p)}`;

    default:
      // Unknown verdict vocabulary (a future era): render honestly, raw.
      return `The answer was checked against the tool results${
        p.action !== undefined ? ` — ${p.action}` : ''
      }.${tail(p)}`;
  }
}
