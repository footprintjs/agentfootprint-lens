/**
 * servedGraphAt — the Served row as a PICTURE: held, served, withheld.
 *
 * Role: a pure projection. It reads nothing and folds nothing. Everything it
 * returns was already decided by `servedRowAt` (which epoch), `verify` (what
 * the hashes established), `foldFactsAt` (what the record holds at the stop)
 * and `sincePrevious` (what moved between two epochs). This file only arranges
 * those answers into nodes and edges. It is a SECOND VIEW of the same row —
 * never a second data path, and never a second cursor.
 *
 * ── THE THREE BANDS, left to right ─────────────────────────────────────────
 *   1. HELD     — what the record holds at this stop: the fold's own keys plus
 *                 its honesty flags (`basis`, `redacted`, `skipped`,
 *                 `foldError`). A key the fold holds no value for is a node
 *                 marked `'not-on-record'`, never an empty one.
 *   2. SERVED   — what crossed into the call: one SLOT node per
 *                 {@link SERVED_SLOTS} entry, and one EDGE per piece, message,
 *                 request-only line and tool. Each edge carries the badge
 *                 `verify` gave that row and, when a previous epoch is in this
 *                 recording, its `entered` / `left` / `unchanged` state.
 *   3. WITHHELD — held and not sent: the withheld tool list, the attention
 *                 drops (one node per evicted turn, each an edge into the
 *                 messages slot, paired by `servedRowAt` with the epoch that
 *                 last served it), the skills the caller's role could not see
 *                 (from the FOLD — a receipt carries no authority names), a
 *                 redacted fold, and every gap the view declares. Each carries
 *                 the library's OWN string; this file composes none.
 *
 * ── WHAT AN EDGE LEAVES FROM ───────────────────────────────────────────────
 * A piece names its `source`; a message and a request-only line name their
 * `role`. Both are the library's own vocabularies, and this file draws the
 * node the RECORD names — it never maps one onto the other, and it never
 * invents a source for a row that carries none. A tool row carries neither, so
 * its `origin` is absent and it is drawn from its slot.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 * An edge from a served piece back to the STAGE that wrote it. It needs a
 * commit-log walk keyed by piece text or slot, which is the part most likely to
 * rot, and the question this view answers ("what was this one call made of, and
 * what did we hold back?") is answered without it. See the folder README.
 */

import {
  SERVED_GAPS,
  type ServedGap,
  type ServedGapCause,
  type ServedGapKind,
  type ServedPiece,
  type ServedRequestOnly,
} from 'agentfootprint';

import { FOLD_FACT_KEYS, type FoldFactKey, type FoldFacts } from './foldFactsAt.js';
import { carriesCacheStrategy } from './receiptShape.js';
import type { SincePrevious } from './sincePrevious.js';
import type { FieldCheck, ServedFieldStatus, ServedRow } from './types.js';
import type { ServedVerification } from './verify.js';

/** The library's `ContextSlot`, reached through an exported shape — the root
 *  barrel exports the shapes, not the vocabularies, and a re-declaration here
 *  would be a second owner that can drift. */
export type ServedSlotName = ServedPiece['slot'];
/** The library's `ContextSource`, reached the same way. */
export type ServedSourceName = ServedPiece['source'];
/** The library's `ContextRole`, reached the same way. */
export type ServedRoleName = ServedRequestOnly['role'];

/**
 * Request-assembly order for the slots. Keyed by the library's own union, so a
 * slot added upstream stops this file compiling rather than being dropped from
 * the picture in silence.
 */
const SLOT_ORDER: Readonly<Record<ServedSlotName, number>> = Object.freeze({
  'system-prompt': 0,
  messages: 1,
  tools: 2,
});

/** The slot nodes: exactly the library's three, in request-assembly order. */
export const SERVED_SLOTS: readonly ServedSlotName[] = Object.freeze(
  (Object.keys(SLOT_ORDER) as ServedSlotName[]).sort((a, b) => SLOT_ORDER[a] - SLOT_ORDER[b]),
);

/** The fold's honesty flags, beside the keys it holds. */
export const HELD_HONESTY_KEYS = Object.freeze([
  'basis',
  'redacted',
  'skipped',
  'foldError',
] as const);

export type HeldKey = FoldFactKey | (typeof HELD_HONESTY_KEYS)[number];

/** Every key the HELD band can carry, in render order. */
export const HELD_KEYS: readonly HeldKey[] = Object.freeze([
  ...FOLD_FACT_KEYS,
  ...HELD_HONESTY_KEYS,
]);

/** One key of the HELD band. */
export interface HeldNode {
  readonly key: HeldKey;
  /** What the fold holds for it. Absent exactly when `status` is
   *  `'not-on-record'` — the node is drawn either way. */
  readonly value?: unknown;
  /**
   * `'reconstructed'` — the fold read it, and no receipt witnesses a fold;
   * `'damaged'`       — the fold could not run, or skipped rows of the log;
   * `'not-on-record'` — the record committed no value for it at this stop.
   */
  readonly status: ServedFieldStatus;
}

/** One of the three slot nodes, with what crossed into it. */
export interface SlotNode {
  readonly slot: ServedSlotName;
  /** The aggregate check for the slot, where the receipt hashes one: the
   *  joined system prompt, the tool NAME list. Absent for `messages`, which
   *  the receipt hashes row by row and never as a whole. */
  readonly check?: FieldCheck;
  /** How many edges the rebuild produced for this slot. */
  readonly rebuilt: number;
  /** How many rows the receipt carries for it, when it carries a count. */
  readonly onReceipt?: number;
  /** Rows the receipt hashed that the rebuild did not produce. */
  readonly onReceiptOnly: number;
  /** Rows the rebuild produced that the receipt never hashed. */
  readonly rebuiltOnly: number;
  /** The gaps whose fields name this slot — the slot's empty state. */
  readonly gaps: readonly ServedGap[];
}

export type ServedEdgeKind = 'piece' | 'message' | 'request-only' | 'tool';

/** What `sincePrevious` established about an edge. */
export type ServedEdgeState = 'entered' | 'left' | 'unchanged';

/** One thing that crossed into a slot — or, with `state: 'left'`, one that
 *  crossed on the previous epoch and does not on this one. */
export interface ServedEdge {
  /** Stable within one graph; a React key, not an address. */
  readonly id: string;
  readonly kind: ServedEdgeKind;
  readonly slot: ServedSlotName;
  /** The piece's own `source`, when the row carries one. */
  readonly source?: ServedSourceName;
  /** The message's or request-only line's own `role`, when the row carries one. */
  readonly role?: ServedRoleName;
  /** The node this edge leaves: the record's own word — a source or a role.
   *  Absent for a tool, which carries neither. */
  readonly origin?: string;
  /** What the record labels the row with: a tool name, a tool call id, a
   *  request-only line's library `reason`. Never composed here. */
  readonly label?: string;
  /** The text that crossed, where the row carries text. */
  readonly text?: string;
  /** The badge `verify` decided for this row. A tool NAME carries no hash on
   *  either side, so a name with no rebuilt schema is `'reconstructed'`. */
  readonly check: FieldCheck;
  /** ABSENT when the epoch before this one is not in this recording — there is
   *  then nothing to have entered or left, and no state is claimed. */
  readonly state?: ServedEdgeState;
  /** `true` for the tool the model was forced to answer through. */
  readonly forced?: boolean;
  /** `true` when the receipt hashed a schema for this tool that the rebuild
   *  did not produce (the forced tool, under `forced-tool-schema`). */
  readonly schemaOnReceiptOnly?: boolean;
  /** `true` when both epochs had a receipt and their schema hashes differ. */
  readonly schemaChanged?: boolean;
}

export type WithheldKind =
  | 'tool-withheld'
  | 'attention-drop'
  | 'hidden-skill'
  | 'redacted'
  | 'gap';

/** Where a withheld fact was read. `'fold'` is the law: authority omissions
 *  come from the fold, never from a receipt. */
export type WithheldFrom = 'fold' | 'receipt' | 'view';

/** One thing held and not sent, or one field the record cannot prove. */
export interface WithheldNode {
  readonly kind: WithheldKind;
  /** The record's own name for it: a withheld-list reason, a skill id, a gap
   *  kind, a fold key. */
  readonly name: string;
  readonly from: WithheldFrom;
  /** The slot it would have crossed into, where the record names one. Absent
   *  where it does not — a slot is never inferred. */
  readonly slot?: ServedSlotName;
  /** The library's own sentence for it, printed verbatim: a gap's `why`. */
  readonly why?: string;
  /** The receipt field paths a gap covers. */
  readonly fields?: readonly string[];
  /** What the read established, where the library computed it. */
  readonly cause?: ServedGapCause;
  /** An evicted turn's own hash, as the receipt's `omittedForAttention` row
   *  carries it (`kind: 'attention-drop'`). */
  readonly hash?: string;
  /** The latest earlier epoch in this recording that served the turn with
   *  `hash` (`evictedTurns.ts` · `pairEvictedTurns`). Absent on a drop no
   *  earlier receipt here served — drawn as Not on record, never a number. */
  readonly lastServedOn?: number;
  /** `'not-on-record'` when the field is absent on the record and no receipt
   *  claims it empty — drawn with the badge, never as an empty node. */
  readonly status?: ServedFieldStatus;
}

/** The call the three bands are about. */
export interface CallNode {
  readonly epoch: number;
  readonly callRuntimeStageId: string;
  readonly commitIdx: number;
  /** `true` when the cursor is not on this call's own stop. */
  readonly betweenCalls: boolean;
  /** The epoch this one was compared against, when that epoch is in this
   *  recording. Absent means "not in this recording", never "the first call". */
  readonly previousEpoch?: number;
  /** Model, provider and the salt every hash was taken with — off the receipt,
   *  the only place the run records them. */
  readonly basis?: { readonly model: string; readonly provider: string; readonly runId: string };
  /** `'not-on-record'` when this epoch's call left no receipt to read a basis
   *  from; `'reconstructed'` is never claimed for it — nothing rebuilds it. */
  readonly basisStatus: ServedFieldStatus;
  /**
   * `Receipt.cache.strategy` (agentfootprint 9.93.0), printed as DATA: the
   * strategy's own `providerName` (`'*'` is the built-in pass-through), or
   * `null` — the receipt's fact that nothing stood between assembly and the
   * port. ABSENT when there is no receipt, or the receipt was minted before the
   * field existed: "cannot say", which a renderer draws as Not on record.
   */
  readonly cacheStrategy?: string | null;
  /** Why there is no receipt, when the library or the lens established it. */
  readonly receiptCause?: ServedGapCause;
  /** `true` when any row this call is made of is damaged. */
  readonly damaged: boolean;
}

/** The three bands, the call, and every edge between them. */
export interface ServedGraph {
  readonly held: readonly HeldNode[];
  /** Band 2's nodes: exactly the library's three slots, in assembly order. */
  readonly served: readonly SlotNode[];
  readonly withheld: readonly WithheldNode[];
  readonly call: CallNode;
  /** Every edge into a slot node, in wire order per slot. A withheld node is
   *  drawn greyed into its slot by the renderer and is NOT an edge here. */
  readonly edges: readonly ServedEdge[];
}

export interface ServedGraphInput {
  /** The epoch the ONE cursor resolved to (`servedRowAt`). */
  readonly row: ServedRow;
  /** What the record holds at the stop (`foldFactsAt`). */
  readonly fold: FoldFacts;
  /** What the hashes established (`verify`). */
  readonly checks: ServedVerification;
  /** What moved since the previous epoch (`sincePrevious`), when that epoch is
   *  in this recording. Absent leaves every edge without a state. */
  readonly since?: SincePrevious;
}

const RECONSTRUCTED: FieldCheck = Object.freeze({ status: 'reconstructed' as const });
const NOT_ON_RECORD: FieldCheck = Object.freeze({ status: 'not-on-record' as const });

/** The slots a gap's receipt field paths name. `params`, `cache.*` and `epoch`
 *  name none — the field prefix IS the library's own naming, not a guess. */
function slotsOfFields(fields: readonly string[]): readonly ServedSlotName[] {
  const out: ServedSlotName[] = [];
  for (const field of fields) {
    const slot: ServedSlotName | undefined = field.startsWith('system.')
      ? 'system-prompt'
      : field.startsWith('messages.')
        ? 'messages'
        : field.startsWith('tools.')
          ? 'tools'
          : undefined;
    if (slot !== undefined && !out.includes(slot)) out.push(slot);
  }
  return out;
}

function heldNodes(fold: FoldFacts): readonly HeldNode[] {
  const node = (key: HeldKey, value: unknown, status: ServedFieldStatus): HeldNode =>
    Object.freeze(value === undefined ? { key, status } : { key, value, status });
  const out: HeldNode[] = [];
  for (const key of FOLD_FACT_KEYS) {
    const value = fold[key];
    // A key the fold holds no value for is DRAWN, marked 'not-on-record': the
    // run may have computed it and never committed it, and an empty node would
    // read as "nothing was there".
    out.push(value === undefined ? node(key, undefined, 'not-on-record') : node(key, value, 'reconstructed'));
  }
  out.push(
    fold.basis === undefined
      ? node('basis', undefined, 'not-on-record')
      : node('basis', fold.basis, 'reconstructed'),
  );
  out.push(node('redacted', fold.redacted, 'reconstructed'));
  if (fold.skipped !== undefined) out.push(node('skipped', fold.skipped, 'damaged'));
  if (fold.foldError !== undefined) out.push(node('foldError', fold.foldError, 'damaged'));
  return Object.freeze(out);
}

function servedEdges(input: ServedGraphInput): readonly ServedEdge[] {
  const { row, checks, since } = input;
  const view = row.view;
  const edge = (e: ServedEdge): ServedEdge => Object.freeze(e);
  const out: ServedEdge[] = [];

  // A state is claimed only where a previous epoch was compared.
  const compared = since !== undefined;
  const enteredPieces = new Set(since?.system.enteredIndexes ?? []);
  const enteredMessages = new Set(since?.messages.enteredIndexes ?? []);
  const stateOf = (entered: boolean): ServedEdgeState | undefined =>
    compared ? (entered ? 'entered' : 'unchanged') : undefined;
  const withState = (state: ServedEdgeState | undefined) => (state !== undefined ? { state } : {});

  view.system.pieces.forEach((piece, i) => {
    out.push(
      edge({
        id: `piece:${i}`,
        kind: 'piece',
        slot: piece.slot,
        source: piece.source,
        origin: piece.source,
        text: piece.text,
        check: checks.pieces[i] ?? RECONSTRUCTED,
        ...withState(stateOf(enteredPieces.has(i))),
      }),
    );
  });
  (since?.system.leftPieces ?? []).forEach((piece, i) => {
    out.push(
      edge({
        id: `piece-left:${i}`,
        kind: 'piece',
        slot: piece.slot,
        source: piece.source,
        origin: piece.source,
        text: piece.text,
        // Not on this request at all: there is no row here for a hash to check.
        check: NOT_ON_RECORD,
        state: 'left',
      }),
    );
  });

  view.messages.asSent.forEach((message, i) => {
    const label = message.toolName ?? message.toolCallId;
    out.push(
      edge({
        id: `message:${i}`,
        kind: 'message',
        slot: 'messages',
        role: message.role,
        origin: message.role,
        ...(label !== undefined ? { label } : {}),
        text: message.content,
        check: checks.messages[i] ?? RECONSTRUCTED,
        ...withState(stateOf(enteredMessages.has(i))),
      }),
    );
  });
  (since?.messages.leftEntries ?? []).forEach((message, i) => {
    out.push(
      edge({
        id: `message-left:${i}`,
        kind: 'message',
        slot: 'messages',
        role: message.role,
        origin: message.role,
        text: message.content,
        check: NOT_ON_RECORD,
        state: 'left',
      }),
    );
  });
  // A request-only line is composed for THIS request, so no comparison with a
  // previous epoch names one: no state is claimed for it.
  view.messages.requestOnly.forEach((line, i) => {
    out.push(
      edge({
        id: `request-only:${i}`,
        kind: 'request-only',
        slot: 'messages',
        role: line.role,
        origin: line.role,
        label: line.reason,
        text: line.text,
        check: checks.requestOnly[i] ?? RECONSTRUCTED,
      }),
    );
  });

  view.tools.names.forEach((name) => {
    const schema = view.tools.schemas.find((s) => s.name === name);
    const state = compared
      ? since !== undefined && since.tools.added.includes(name)
        ? 'entered'
        : 'unchanged'
      : undefined;
    out.push(
      edge({
        id: `tool:${name}`,
        kind: 'tool',
        slot: 'tools',
        label: name,
        // No rebuilt schema means no hash on this side; a NAME is never
        // verified — the receipt carries names as plain strings.
        check: schema !== undefined ? (checks.toolSchemas[name] ?? RECONSTRUCTED) : RECONSTRUCTED,
        ...(view.tools.forced === name ? { forced: true } : {}),
        ...(checks.onReceiptOnly.schemas.includes(name) ? { schemaOnReceiptOnly: true } : {}),
        ...(since !== undefined && since.tools.schemaChanged.includes(name)
          ? { schemaChanged: true }
          : {}),
        ...withState(state),
      }),
    );
  });
  (since?.tools.removed ?? []).forEach((name) => {
    out.push(
      edge({
        id: `tool-left:${name}`,
        kind: 'tool',
        slot: 'tools',
        label: name,
        check: NOT_ON_RECORD,
        state: 'left',
      }),
    );
  });

  return Object.freeze(out);
}

function slotNodes(input: ServedGraphInput, edges: readonly ServedEdge[]): readonly SlotNode[] {
  const { row, checks } = input;
  const view = row.view;
  const receipt = row.receipt;
  const gapsFor = (slot: ServedSlotName): readonly ServedGap[] =>
    Object.freeze(view.gaps.filter((g) => slotsOfFields(g.fields).includes(slot)));
  const rebuiltIn = (slot: ServedSlotName): number =>
    edges.filter((e) => e.slot === slot && e.state !== 'left').length;

  const onReceipt: Readonly<Record<ServedSlotName, number | undefined>> = {
    'system-prompt': receipt?.system.pieces.length,
    messages:
      receipt !== undefined
        ? receipt.messages.entries.length + receipt.messages.requestOnly.length
        : undefined,
    tools: checks.namesOnReceipt?.length,
  };
  const check: Readonly<Record<ServedSlotName, FieldCheck | undefined>> = {
    'system-prompt': checks.system,
    messages: undefined,
    tools: checks.toolNames,
  };
  const onReceiptOnly: Readonly<Record<ServedSlotName, number>> = {
    'system-prompt': checks.onReceiptOnly.pieces,
    messages: checks.onReceiptOnly.messages + checks.onReceiptOnly.requestOnly,
    tools: checks.onReceiptOnly.toolNames.length,
  };
  const rebuiltOnly: Readonly<Record<ServedSlotName, number>> = {
    'system-prompt': checks.rebuiltOnly.pieces,
    messages: checks.rebuiltOnly.messages + checks.rebuiltOnly.requestOnly,
    tools: checks.rebuiltOnly.toolNames.length,
  };

  return Object.freeze(
    SERVED_SLOTS.map((slot) => {
      const aggregate = check[slot];
      const count = onReceipt[slot];
      return Object.freeze({
        slot,
        ...(aggregate !== undefined ? { check: aggregate } : {}),
        rebuilt: rebuiltIn(slot),
        ...(count !== undefined ? { onReceipt: count } : {}),
        onReceiptOnly: onReceiptOnly[slot],
        rebuiltOnly: rebuiltOnly[slot],
        gaps: gapsFor(slot),
      });
    }),
  );
}

function withheldNodes(input: ServedGraphInput): readonly WithheldNode[] {
  const { row, fold } = input;
  const view = row.view;
  const out: WithheldNode[] = [];

  // The library's own value for why the tool list is empty.
  if (view.tools.withheld !== undefined) {
    out.push(
      Object.freeze({
        kind: 'tool-withheld' as const,
        name: view.tools.withheld,
        from: 'view' as const,
        slot: 'tools' as const,
      }),
    );
  }

  // Authority omissions: read at the stop from the FOLD. A receipt never names
  // what a caller's role could not see, so this list can only come from here.
  for (const id of fold.hiddenSkillIds ?? []) {
    out.push(Object.freeze({ kind: 'hidden-skill' as const, name: id, from: 'fold' as const }));
  }

  // Attention omissions: read from the RECEIPT. One node per evicted turn,
  // drawn into the messages slot (the record names it: the hash is a
  // `messages.entries[].hash`), with the epoch `servedRowAt` paired it to.
  // The receipt's field name is the reason, verbatim.
  for (const turn of row.evictedTurns ?? []) {
    out.push(
      Object.freeze({
        kind: 'attention-drop' as const,
        name: 'omittedForAttention',
        from: 'receipt' as const,
        slot: 'messages' as const,
        hash: turn.hash,
        ...(turn.lastServedOn !== undefined ? { lastServedOn: turn.lastServedOn } : {}),
      }),
    );
  }
  // Absent is not none — unless the receipt itself says none. A receipt that
  // carries no drops and was minted by a library whose window files every drop
  // (`'none-on-receipt'`) withheld nothing here, and nothing is drawn; a
  // record that cannot say draws the Not-on-record badge.
  if (input.checks.omittedForAttention === 'not-on-record') {
    out.push(
      Object.freeze({
        kind: 'attention-drop' as const,
        name: 'omittedForAttention',
        from: 'receipt' as const,
        status: 'not-on-record' as const,
      }),
    );
  }

  if (fold.redacted) {
    out.push(Object.freeze({ kind: 'redacted' as const, name: 'redacted', from: 'fold' as const }));
  }

  for (const gap of view.gaps) {
    const slots = slotsOfFields(gap.fields);
    out.push(
      Object.freeze({
        kind: 'gap' as const,
        name: gap.gap,
        from: 'view' as const,
        // One slot named: draw it there. Several, or none: the band itself.
        ...(slots.length === 1 ? { slot: slots[0] as ServedSlotName } : {}),
        why: SERVED_GAPS[gap.gap as ServedGapKind].why,
        fields: gap.fields,
        ...(gap.cause !== undefined ? { cause: gap.cause } : {}),
      }),
    );
  }

  return Object.freeze(out);
}

function callNode(input: ServedGraphInput, edges: readonly ServedEdge[]): CallNode {
  const { row, checks } = input;
  const basis = row.view.basis;
  return Object.freeze({
    epoch: row.epoch,
    callRuntimeStageId: row.callRuntimeStageId,
    commitIdx: row.commitIdx,
    betweenCalls: row.betweenCalls,
    ...(row.previousEpoch !== undefined ? { previousEpoch: row.previousEpoch } : {}),
    ...(basis !== undefined ? { basis } : {}),
    basisStatus: (basis !== undefined ? 'reconstructed' : 'not-on-record') as ServedFieldStatus,
    // Present only where the receipt SAYS — a string or null. A receipt
    // without the key (pre-9.93.0) leaves it absent: "cannot say".
    ...(row.receipt !== undefined && carriesCacheStrategy(row.receipt)
      ? { cacheStrategy: row.receipt.cache.strategy }
      : {}),
    ...(row.receiptCause !== undefined ? { receiptCause: row.receiptCause } : {}),
    damaged: checks.damaged || edges.some((e) => e.check.status === 'damaged'),
  });
}

/**
 * The three bands of one epoch. Pure; every return frozen.
 *
 * @example
 * ```ts
 * const row = servedRowAt(snapshot, cursor)!;
 * const graph = servedGraphAt({
 *   row,
 *   fold: foldFactsAt(snapshot, cursor),
 *   checks: verify(row.view, row.receipt, row.receipt?.basis.runId ?? '', row.receiptCause),
 * });
 * graph.served.map((s) => s.slot);            // ['system-prompt', 'messages', 'tools']
 * graph.edges.filter((e) => e.slot === 'tools').map((e) => e.label);
 * graph.withheld.filter((w) => w.from === 'fold');   // the authority omissions
 * ```
 */
export function servedGraphAt(input: ServedGraphInput): ServedGraph {
  const edges = servedEdges(input);
  return Object.freeze({
    held: heldNodes(input.fold),
    served: slotNodes(input, edges),
    withheld: withheldNodes(input),
    call: callNode(input, edges),
    edges,
  });
}
