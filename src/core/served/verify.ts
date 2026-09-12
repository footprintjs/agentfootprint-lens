/**
 * verify — the law, checked field by field with the library's own rule.
 *
 *     hash(servedAt(k)) === receiptAt(k).hash
 *
 * Every hash here is computed by agentfootprint's exported `receiptHash`
 * (run-salted SHA-256, 16 hex chars) over the exported `messageDigestInput`
 * for a message, the exported `toolDigestInput` for a tool schema, and the raw
 * text for a system piece or the joined system prompt. Nothing in this file
 * re-implements a digest. A field is
 * `'verified'` when — and only when — the receipt's hash for it equals the
 * hash of what the rebuild produced.
 *
 * THE RECEIPT IS THE WITNESS, IN BOTH DIRECTIONS. A receipt lists what went
 * out, row by row. A rebuilt row the receipt has no row for is a contradiction
 * — no gap in the library's catalogue says a rebuild may be LONG, only that it
 * may be SHORT — so it is `'damaged'`, and `rebuiltOnly` counts it. A receipt
 * row the rebuild did not produce is the declared hole when an excusing gap
 * covers the field (`onReceiptOnly` counts it) and a contradiction when none
 * does.
 *
 * HOW ROWS ARE PAIRED. With no excusing gap on a field, rebuilt row `i` is
 * checked against receipt row `i`. Under `no-fold-base` the rebuild is a
 * SUFFIX of what went out (a log-only fold recovers what the log itself
 * appended), so pairing by position would check the tail against the head and
 * call a row that really matches "reconstructed". Messages are therefore
 * paired by the receipt's own join key (`ReceiptMessage.key`, a tool result's
 * `toolCallId`) and otherwise by suffix offset with the role required to
 * match; system pieces by `(slot, source)`, which both sides carry. A row with
 * a counterpart is decided by the hash; a row with none is `'damaged'`.
 *
 * TOOL SCHEMAS. A schema's receipt hash is taken over the exported
 * `toolDigestInput(tool)` (agentfootprint 9.89.0, beside `messageDigestInput`)
 * — the ONE spelling of the schema rule; `buildReceipt` calls the same
 * function. Rows are paired by NAME, the key both sides carry, so an excusing
 * gap changes no pairing here: it only makes a receipt-only hash (the forced
 * tool's, under `forced-tool-schema`) the declared hole rather than damage. A
 * rebuilt schema the receipt never hashed is `'damaged'`, as any unwitnessed
 * row is. Under a 9.88 peer the export is absent, and the rows stay
 * `'reconstructed'` with the receipt's hash riding along as data — detected at
 * call time (`toolDigestOf`), never by copying the serializer here, which would
 * be a second owner of the rule.
 *
 * Tool NAMES carry no hash on either side (they are plain strings on the
 * receipt), so they are never `'verified'`; but two name lists CAN contradict
 * each other, and when they do the row is `'damaged'`. `namesOnReceipt` hands
 * the receipt's list back as data so a renderer can print the diff.
 */

import * as agentfootprint from 'agentfootprint';
import {
  messageDigestInput,
  receiptHash,
  type Receipt,
  type ReceiptMessage,
  type ReceiptPiece,
  type ServedGapCause,
  type ServedGapKind,
  type ServedPiece,
  type ServedView,
} from 'agentfootprint';

import { attentionOmissionStatus, type AttentionOmissionStatus } from './evictedTurns.js';
import { isReceiptShaped } from './receiptShape.js';
import type { FieldCheck, ServedFieldStatus } from './types.js';

/** One message as the view carries it (the library's `LLMMessage`, reached
 *  through the view because the root barrel does not export the type). */
type ServedMessage = ServedView['messages']['asSent'][number];
/** One tool schema as the view carries it (the library's `LLMToolSchema`,
 *  likewise reached through the view). */
type ServedSchema = ServedView['tools']['schemas'][number];

/** The library's schema digest, when this peer exports it. */
type ToolDigest = (tool: ServedSchema) => string;

/**
 * `toolDigestInput` arrived in agentfootprint 9.89.0. It is read off the
 * module namespace AT CALL TIME rather than named in the import list, because
 * under ESM a named import of a symbol the peer does not export fails the
 * whole module at link time — on a 9.88 peer this resolves to `undefined` and
 * the schema rows are `'reconstructed'`, as they were in 0.47.0.
 */
function toolDigestOf(): ToolDigest | undefined {
  const digest: ToolDigest | undefined = agentfootprint.toolDigestInput;
  return typeof digest === 'function' ? digest : undefined;
}

/**
 * The gaps that EXCUSE a receipt row the rebuild did not produce — the
 * library's own distinction (`ServedGap.fields`: "most gaps mean the rebuild
 * cannot produce this field"). This is the LENS'S policy over the library's
 * catalogue: the library names which fields a gap covers; the lens decides that
 * under these four kinds a SHORT rebuild is the declared hole rather than
 * damage. `cache-transform` and `provider-defaults` are CAVEATS, not excuses —
 * under them alone a disagreement is a defect in the record.
 *
 * What an excuse changes, per field:
 *   · `system.hash` — a disagreement is `'reconstructed'` (the joined string
 *     CAN be short: 0 chars recovered against 28 that went out);
 *   · `messages.requestOnly` — a disagreement is `'reconstructed'` (the line is
 *     COMPOSED from the conversation, so a short conversation composes a
 *     different line, not a missing one);
 *   · `messages.entries`, `system.pieces` — the PAIRING changes (see the file
 *     header); a paired row is decided by its hash either way;
 *   · `tools.names` — receipt-only names are counted, not damage.
 */
export const EXCUSING_GAPS: readonly ServedGapKind[] = Object.freeze([
  'no-fold-base',
  'no-run-log',
  'no-conversation-on-record',
  'forced-tool-schema',
]);

/** Presence of a field only a receipt carries: there is nothing to check it
 *  against, so the only honest statuses are "here" and "not here". */
export type ReceiptPresence = 'on-receipt' | 'not-on-record';

/** Rows on one side that the other side has no row for — counts, by field. */
export interface RowCounts {
  readonly pieces: number;
  readonly messages: number;
  readonly requestOnly: number;
  readonly toolNames: readonly string[];
  /** Schema NAMES hashed on one side only — the receipt's (`onReceiptOnly`)
   *  or the rebuild's (`rebuiltOnly`). */
  readonly schemas: readonly string[];
}

export interface ServedVerification {
  /** The joined system prompt (`Receipt.system.hash`). */
  readonly system: FieldCheck;
  /** One per `view.system.pieces[i]`, against its paired receipt piece. */
  readonly pieces: readonly FieldCheck[];
  /** One per `view.messages.asSent[i]`, against its paired receipt entry. */
  readonly messages: readonly FieldCheck[];
  /** One per `view.messages.requestOnly[i]`. */
  readonly requestOnly: readonly FieldCheck[];
  /** Tool names: never `'verified'` (no hash exists); `'damaged'` when the two
   *  lists contradict each other un-excused — see the header. */
  readonly toolNames: FieldCheck;
  /** The receipt's own name list, for a renderer to diff against the view's. */
  readonly namesOnReceipt?: readonly string[];
  /** One per `view.tools.schemas[i].name`, paired by name: decided by the hash
   *  over the library's `toolDigestInput`; `'damaged'` when the receipt has no
   *  hash for the name; `'reconstructed'` under a peer without the export
   *  (9.88) — see the header. */
  readonly toolSchemas: Readonly<Record<string, FieldCheck>>;
  /** `basis`, `params`, `cache` — receipt-only fields. */
  readonly basis: ReceiptPresence;
  readonly params: ReceiptPresence;
  readonly cache: ReceiptPresence;
  /** The attention drops: on the receipt, none by the receipt's own claim, or
   *  not on record — `evictedTurns.ts` · `attentionOmissionStatus` decides. */
  readonly omittedForAttention: AttentionOmissionStatus;
  /**
   * Rows the receipt hashed that the rebuild did not produce — the count the
   * `no-fold-base` / `no-run-log` gaps say "may be SHORT" about. Data, so a
   * renderer prints the number rather than a sentence.
   */
  readonly onReceiptOnly: RowCounts;
  /**
   * Rows the rebuild produced that the receipt never hashed. No gap excuses
   * these — the receipt is the witness of what went out — so each such row is
   * also `'damaged'` on its own check.
   */
  readonly rebuiltOnly: RowCounts;
  /** `true` when any row is `'damaged'`, or when a receipt-only row has no
   *  excusing gap to explain it. */
  readonly damaged: boolean;
}

const check = (status: ServedFieldStatus, rebuilt?: string, onReceipt?: string): FieldCheck =>
  Object.freeze({
    status,
    ...(rebuilt !== undefined ? { rebuilt } : {}),
    ...(onReceipt !== undefined ? { onReceipt } : {}),
  });

/** Does an EXCUSING gap on the view name this receipt field? */
function excusedOn(view: ServedView, field: string): boolean {
  return view.gaps.some((g) => EXCUSING_GAPS.includes(g.gap) && g.fields.includes(field));
}

/**
 * One rebuilt row against the receipt row it was paired with.
 *
 * @param rebuilt      the rebuild's hash.
 * @param onReceipt    the paired receipt hash; `undefined` when no receipt row
 *                     was paired with this rebuilt row.
 * @param disagreement what a hash disagreement is on this field.
 * @param unpaired     what an unpaired rebuilt row is on this field.
 */
function against(
  rebuilt: string,
  onReceipt: string | undefined,
  disagreement: ServedFieldStatus,
  unpaired: ServedFieldStatus,
): FieldCheck {
  if (onReceipt === undefined) return check(unpaired, rebuilt);
  if (rebuilt === onReceipt) return check('verified', rebuilt, onReceipt);
  return check(disagreement, rebuilt, onReceipt);
}

/** For each rebuilt row, the index of its receipt counterpart, or `-1`. */
type Pairing = readonly number[];

/** Row `i` pairs with row `i` while the receipt has one. */
function byPosition(rebuiltCount: number, receiptCount: number): Pairing {
  return Array.from({ length: rebuiltCount }, (_, i) => (i < receiptCount ? i : -1));
}

/**
 * Pair rebuilt messages with receipt entries under an excusing gap: by the
 * receipt's own join key first, then by suffix offset with a matching role.
 */
function pairMessages(rebuilt: readonly ServedMessage[], entries: readonly ReceiptMessage[]): Pairing {
  const out: number[] = rebuilt.map(() => -1);
  const used = new Set<number>();
  rebuilt.forEach((m, i) => {
    if (m.toolCallId === undefined) return;
    const j = entries.findIndex((e, k) => !used.has(k) && e.key === m.toolCallId);
    if (j >= 0) {
      out[i] = j;
      used.add(j);
    }
  });
  const offset = entries.length - rebuilt.length;
  rebuilt.forEach((m, i) => {
    if (out[i]! >= 0) return;
    const j = i + offset;
    if (j < 0 || j >= entries.length || used.has(j) || entries[j]!.role !== m.role) return;
    out[i] = j;
    used.add(j);
  });
  return out;
}

/** Pair rebuilt pieces with receipt pieces under an excusing gap: by
 *  `(slot, source)`, first unused match. */
function pairPieces(rebuilt: readonly ServedPiece[], pieces: readonly ReceiptPiece[]): Pairing {
  const used = new Set<number>();
  return rebuilt.map((p) => {
    const j = pieces.findIndex((r, k) => !used.has(k) && r.slot === p.slot && r.source === p.source);
    if (j >= 0) used.add(j);
    return j;
  });
}

/** How many receipt rows no rebuilt row was paired with. */
function unpairedOnReceipt(pairing: Pairing, receiptCount: number): number {
  return receiptCount - pairing.filter((j) => j >= 0).length;
}

/** How many rebuilt rows no receipt row was paired with. */
function unpairedRebuilt(pairing: Pairing): number {
  return pairing.filter((j) => j < 0).length;
}

function withoutReceipt(view: ServedView, absent: ServedFieldStatus): ServedVerification {
  const schemas: Record<string, FieldCheck> = {};
  for (const schema of view.tools.schemas) schemas[schema.name] = check(absent);
  const none: RowCounts = Object.freeze({
    pieces: 0,
    messages: 0,
    requestOnly: 0,
    toolNames: Object.freeze([]),
    schemas: Object.freeze([]),
  });
  return Object.freeze({
    system: check(absent),
    pieces: Object.freeze(view.system.pieces.map(() => check(absent))),
    messages: Object.freeze(view.messages.asSent.map(() => check(absent))),
    requestOnly: Object.freeze(view.messages.requestOnly.map(() => check(absent))),
    toolNames: check(absent),
    toolSchemas: Object.freeze(schemas),
    basis: 'not-on-record',
    params: 'not-on-record',
    cache: 'not-on-record',
    omittedForAttention: 'not-on-record',
    onReceiptOnly: none,
    rebuiltOnly: none,
    damaged: absent === 'damaged',
  });
}

/**
 * Check a rebuilt view against the receipt its epoch committed.
 *
 * @param view    `servedAt(k)`.
 * @param receipt `receiptAt(k)`, or `undefined` when none was read.
 * @param runId   the salt every hash on the receipt was taken with —
 *                `receipt.basis.runId`. Ignored when there is no receipt.
 * @param cause   why the caller hands no receipt, when the caller established
 *                it (`ServedRow.receiptCause`). Overrides the cause on the
 *                view's `no-receipt-on-chart` gap.
 *
 * With no receipt, every rebuilt row is `'reconstructed'` — unless the cause is
 * `'receipt-shape-rejected'`, which means something WAS committed under the
 * receipt key and refused: the record is damaged, and every row says so. A
 * `receipt` that is not receipt-shaped (see `receiptShape.ts`) is the same
 * refusal, made here, and is never dereferenced.
 */
export function verify(
  view: ServedView,
  receipt: Receipt | undefined,
  runId: string,
  cause?: ServedGapCause,
): ServedVerification {
  if (receipt !== undefined && !isReceiptShaped(receipt)) return withoutReceipt(view, 'damaged');
  if (receipt === undefined) {
    const why = cause ?? view.gaps.find((g) => g.gap === 'no-receipt-on-chart')?.cause;
    return withoutReceipt(view, why === 'receipt-shape-rejected' ? 'damaged' : 'reconstructed');
  }

  const hash = (content: string): string => receiptHash(runId, content);

  // The joined system string: one hash, always on the receipt. An excuse turns
  // a disagreement into the declared hole (the string can be short).
  const systemExcused = excusedOn(view, 'system.hash');
  const system = against(
    hash(view.system.text),
    receipt.system.hash,
    systemExcused ? 'reconstructed' : 'damaged',
    'damaged',
  );

  // Pieces: paired by position, or by (slot, source) under an excuse. A paired
  // piece is decided by its hash; an unpaired rebuilt piece is a contradiction.
  const piecesExcused = excusedOn(view, 'system.pieces');
  const piecePairs = piecesExcused
    ? pairPieces(view.system.pieces, receipt.system.pieces)
    : byPosition(view.system.pieces.length, receipt.system.pieces.length);
  const pieces = view.system.pieces.map((piece, i) =>
    against(hash(piece.text), receipt.system.pieces[piecePairs[i]!]?.hash, 'damaged', 'damaged'),
  );

  // Messages: paired by position, or by key / suffix + role under an excuse.
  const entriesExcused = excusedOn(view, 'messages.entries');
  const messagePairs = entriesExcused
    ? pairMessages(view.messages.asSent, receipt.messages.entries)
    : byPosition(view.messages.asSent.length, receipt.messages.entries.length);
  const messages = view.messages.asSent.map((message, i) =>
    against(
      hash(messageDigestInput(message)),
      receipt.messages.entries[messagePairs[i]!]?.hash,
      'damaged',
      'damaged',
    ),
  );

  // Request-only lines are COMPOSED, so under an excuse both a disagreement
  // and an unpaired line are the declared hole rather than damage.
  const requestOnlyExcused = excusedOn(view, 'messages.requestOnly');
  const requestOnlyPairs = byPosition(
    view.messages.requestOnly.length,
    receipt.messages.requestOnly.length,
  );
  const requestOnlyStatus: ServedFieldStatus = requestOnlyExcused ? 'reconstructed' : 'damaged';
  const requestOnly = view.messages.requestOnly.map((line, i) =>
    against(
      hash(messageDigestInput({ role: line.role, content: line.text })),
      receipt.messages.requestOnly[requestOnlyPairs[i]!]?.hash,
      requestOnlyStatus,
      requestOnlyStatus,
    ),
  );

  // Names: plain strings on both sides, no hash — never 'verified'. Two lists
  // that contradict each other are damage; a receipt-only name under an
  // excuse is the declared short list.
  const namesExcused = excusedOn(view, 'tools.names');
  const rebuiltNames = new Set(view.tools.names);
  const receiptNames = new Set(receipt.tools.names);
  const namesRebuiltOnly = view.tools.names.filter((n) => !receiptNames.has(n));
  const namesOnReceiptOnly = receipt.tools.names.filter((n) => !rebuiltNames.has(n));
  const namesContradict =
    namesRebuiltOnly.length > 0 || (namesOnReceiptOnly.length > 0 && !namesExcused);
  const toolNames = check(namesContradict ? 'damaged' : 'reconstructed');

  // Schemas: paired by NAME on both sides, decided by the hash over the
  // library's own `toolDigestInput`. Without the export (a 9.88 peer) the row
  // is reconstructed and the receipt's hash rides along as data. A receipt-only
  // name is the declared short list under an excuse (`forced-tool-schema`
  // names exactly this); a rebuilt schema with no hash is unwitnessed.
  const schemasExcused = excusedOn(view, 'tools.schemaHashes');
  const digest = toolDigestOf();
  const schemas: Record<string, FieldCheck> = {};
  for (const schema of view.tools.schemas) {
    const onReceipt: string | undefined = receipt.tools.schemaHashes[schema.name];
    schemas[schema.name] =
      digest === undefined
        ? check('reconstructed', undefined, onReceipt)
        : against(hash(digest(schema)), onReceipt, 'damaged', 'damaged');
  }
  const rebuiltSchemaNames = new Set(view.tools.schemas.map((s) => s.name));
  const schemasRebuiltOnly = [...rebuiltSchemaNames].filter(
    (n) => receipt.tools.schemaHashes[n] === undefined,
  );
  const schemasOnReceiptOnly = Object.keys(receipt.tools.schemaHashes).filter(
    (n) => !rebuiltSchemaNames.has(n),
  );

  const onReceiptOnly: RowCounts = Object.freeze({
    pieces: unpairedOnReceipt(piecePairs, receipt.system.pieces.length),
    messages: unpairedOnReceipt(messagePairs, receipt.messages.entries.length),
    requestOnly: unpairedOnReceipt(requestOnlyPairs, receipt.messages.requestOnly.length),
    toolNames: Object.freeze(namesOnReceiptOnly),
    schemas: Object.freeze(schemasOnReceiptOnly),
  });
  const rebuiltOnly: RowCounts = Object.freeze({
    pieces: unpairedRebuilt(piecePairs),
    messages: unpairedRebuilt(messagePairs),
    requestOnly: unpairedRebuilt(requestOnlyPairs),
    toolNames: Object.freeze(namesRebuiltOnly),
    schemas: Object.freeze(schemasRebuiltOnly),
  });
  // A receipt row nothing rebuilt, with no excuse for the field, is the record
  // contradicting itself even though no rebuilt row carries the status.
  const unexcusedShort =
    (onReceiptOnly.pieces > 0 && !piecesExcused) ||
    (onReceiptOnly.messages > 0 && !entriesExcused) ||
    (onReceiptOnly.requestOnly > 0 && !requestOnlyExcused) ||
    (onReceiptOnly.schemas.length > 0 && !schemasExcused);
  const all = [system, ...pieces, ...messages, ...requestOnly, toolNames, ...Object.values(schemas)];

  return Object.freeze({
    system,
    pieces: Object.freeze(pieces),
    messages: Object.freeze(messages),
    requestOnly: Object.freeze(requestOnly),
    toolNames,
    namesOnReceipt: Object.freeze([...receipt.tools.names]),
    toolSchemas: Object.freeze(schemas),
    basis: 'on-receipt',
    params: 'on-receipt',
    cache: 'on-receipt',
    omittedForAttention: attentionOmissionStatus(receipt),
    onReceiptOnly,
    rebuiltOnly,
    damaged: unexcusedShort || all.some((c) => c.status === 'damaged'),
  });
}
