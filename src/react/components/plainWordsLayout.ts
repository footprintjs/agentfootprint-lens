/**
 * plainWordsLayout — the pure half of the In plain words pane and its print report.
 *
 * The pane draws agentfootprint's `AnswerAccount` (the answer's account, built
 * by the library on the server — `accountForAnswer` + the `answer-account`
 * hosting op) and computes NOTHING about the run. What lives here is layout
 * arithmetic over the account the pane was handed, and nothing else:
 *
 *   - `LABELS` — every string the pane and the print own. Names, never a
 *     sentence (`test/served/no-own-claims.test.ts` walks these files). Every
 *     sentence a reader sees is the library's: a row heading, a line, a chip,
 *     the one-liner — `Sentence.text` / `Chip.text`, printed as data.
 *   - `linesOf(row)` — the row's lines as the library orders them, each item
 *     (`item: true`) folded under the nearest line above it that is not one.
 *   - `saidByOf(row)` — the "said by" chip for each line. The library puts one
 *     `said-by` chip per distinct source on the ROW (af
 *     `answer-account/account.ts · saidByChips`: the sources of the row's
 *     RECORDED lines, first-seen order); the pane shows it on the LINE, so it
 *     pairs them by that rule. A row whose chips do not pair by it (a later
 *     library) gets no per-line chip and keeps its row chips — omit, never
 *     guess.
 *   - `leafOf(shown, pointer)` — "show me": the op's leaf for one pointer,
 *     looked up by the library's own key (`answerAccountPointerKey`).
 *   - `viewHintOf(account, sentence)` — the one hint the lens adds in "show
 *     me" (design §2.7 / R2-S5, "the softened show-me hint"): a line that
 *     points into a call whose emptiness was read from what the MODEL read,
 *     not the tool's own result, says so — and says it softly when the only
 *     difference is the report-only fields (`short`, `kind`).
 *
 * The account's type is the library's (`AnswerAccount` from
 * `agentfootprint/observe`); its family is reached by indexed access, as the
 * library publishes it — one exported name, no parallel lens types.
 */
import { answerAccountPointerKey, type AnswerAccount, type AnswerAccountShownLeaf } from 'agentfootprint/observe';

import type { EventLogEntry } from '../../core/types.js';

/** One sentence of the account (a line, an item, a heading, the one-liner). */
export type AccountSentence = AnswerAccount['summary']['sentence'];
/** One typed part of a sentence — text, a code, a quote or a declared label. Never HTML. */
export type AccountSentencePart = AccountSentence['parts'][number];
/** Where "show me" lands — always one leaf of the record (or an app declaration). */
export type AccountRecordPointer = AccountSentence['pointers'][number];
/** One of the seven rows. */
export type AccountRow = AnswerAccount['rows'][number];
/** A chip on a row or a line. */
export type AccountChip = AccountRow['chips'][number];
/** The `shown` map of the `answer-account` op: pointer key → leaf. */
export type AccountShownMap = Readonly<Record<string, AnswerAccountShownLeaf>>;

/**
 * Every string the In plain words pane and its print report own — names for
 * the pane's parts, its buttons and the fields of "show me". Never a sentence:
 * each is short and carries no claim verb (pinned by the own-claims walker).
 */
export const LABELS = Object.freeze({
  pane: 'In plain words',
  inOneLine: 'In one line',
  question: 'Question',
  answer: 'Answer',
  notRecorded: 'not recorded',
  cut: '(cut for length)',
  showMe: 'show me',
  hide: 'hide',
  saveAsPdf: 'Save as PDF',
  templateIds: 'template ids',
  openInLens: 'Open in the Flow Lens',
  notShownHere: 'not shown here',
  tooLarge: 'too large to show here',
  notFound: 'not found in the record',
  foreign: 'another run’s event',
  rows: 'rows',
  at: 'at',
  template: 'template',
  voucher: 'voucher',
  missing: 'missing',
  where: 'where',
  value: 'value',
  state: 'state',
  history: 'history',
  declaredByApp: 'declared by the app, not recorded',
  /** The softened hint (R2-S5): only the report-only fields differ. */
  viewRecordOnly: 'the model’s view, minus report-only fields',
  /** The hint: the model read something other than the tool's own result. */
  viewModelResult: 'the model’s view; the tool’s answer differs',
  more: 'more',
  /** `<Lens view="analyst">`: the fold the summary, transport and commentary sit under. */
  moreDetail: 'More detail',
  // the tone of the one-liner, always also a word (design §5.4)
  toneOk: 'tone: ok',
  toneWarn: 'tone: warning',
  toneBad: 'tone: problem',
  toneUnknown: 'tone: unknown',
  // the print report
  reportTitle: 'Answer report',
  run: 'run',
  recorded: 'recorded',
  printed: 'printed',
  model: 'model',
  templates: 'templates',
  answerCut: 'answer cut at 1,200 characters',
  method: 'written from the record by fixed templates',
});

/** The tone word for the one-liner's tone. */
export function toneLabel(tone: AnswerAccount['summary']['tone']): string {
  switch (tone) {
    case 'ok':
      return LABELS.toneOk;
    case 'warn':
      return LABELS.toneWarn;
    case 'bad':
      return LABELS.toneBad;
    default:
      return LABELS.toneUnknown;
  }
}

/** A line and the items folded under it. */
export interface LineGroup {
  readonly line: AccountSentence;
  /** Index of `line` in `row.lines` (the key the said-by pairing uses). */
  readonly index: number;
  readonly items: readonly { readonly item: AccountSentence; readonly index: number }[];
}

/**
 * The row's lines as the library orders them, each `item: true` line under
 * the nearest line above it that is not an item. An item with no line above
 * it (the library never writes one) stands as its own group — never dropped.
 */
export function linesOf(row: AccountRow): readonly LineGroup[] {
  const groups: { line: AccountSentence; index: number; items: { item: AccountSentence; index: number }[] }[] = [];
  row.lines.forEach((line, index) => {
    const last = groups[groups.length - 1];
    if (line.item === true && last !== undefined) last.items.push({ item: line, index });
    else groups.push({ line, index, items: [] });
  });
  return groups;
}

/** The said-by chips of a row, paired to its lines. */
export interface SaidBy {
  /** Line index → its said-by chip. Only recorded lines have one. */
  readonly byLine: ReadonlyMap<number, AccountChip>;
  /** The row's chips that stay on the ROW (the non-said-by ones; all of them when the pairing failed). */
  readonly rowChips: readonly AccountChip[];
}

/**
 * Pair the row's `said-by` chips to its lines by the library's own rule: one
 * chip per distinct source among the RECORDED lines, in first-seen order. When
 * the counts do not agree, nothing is paired and every chip stays on the row.
 */
export function saidByOf(row: AccountRow): SaidBy {
  const saidBy = row.chips.filter((c) => c.mark === 'said-by');
  const others = row.chips.filter((c) => c.mark !== 'said-by');
  const sources: string[] = [];
  for (const line of row.lines) {
    if (line.status === 'recorded' && !sources.includes(line.source)) sources.push(line.source);
  }
  if (sources.length !== saidBy.length) return { byLine: new Map(), rowChips: row.chips };
  const byLine = new Map<number, AccountChip>();
  row.lines.forEach((line, index) => {
    if (line.status !== 'recorded') return;
    const chip = saidBy[sources.indexOf(line.source)];
    if (chip !== undefined) byLine.set(index, chip);
  });
  return { byLine, rowChips: others };
}

/** The op's leaf for one pointer, by the library's key — `undefined` when no map was handed. */
export function leafOf(
  shown: AccountShownMap | undefined,
  pointer: AccountRecordPointer,
): AnswerAccountShownLeaf | undefined {
  if (shown === undefined) return undefined;
  return shown[answerAccountPointerKey(pointer)] ?? { withheld: 'not-shown-here' };
}

/** The words for one leaf: its value, its derived row count, or why it is withheld. */
export function leafText(leaf: AnswerAccountShownLeaf): string {
  if ('value' in leaf) return leaf.value === null ? 'null' : String(leaf.value);
  if ('rows' in leaf) return `${leaf.rows} ${LABELS.rows} ${LABELS.at} ${leaf.at}`;
  switch (leaf.withheld) {
    case 'too-large':
      return LABELS.tooLarge;
    case 'not-found':
      return LABELS.notFound;
    case 'foreign':
      return LABELS.foreign;
    default:
      return LABELS.notShownHere;
  }
}

/** Is this leaf a value the op withheld? */
export function isWithheld(leaf: AnswerAccountShownLeaf): boolean {
  return 'withheld' in leaf;
}

/** Where one pointer lands, as data: the event type and stage, the state key, the history entry, the declaration. */
export function pointerPlace(pointer: AccountRecordPointer): string {
  switch (pointer.kind) {
    case 'event':
      return [
        pointer.type,
        ...(pointer.runtimeStageId !== undefined ? [pointer.runtimeStageId] : []),
        pointer.path,
      ].join(' · ');
    case 'state':
      return [LABELS.state, pointer.key, ...(pointer.path !== '' ? [pointer.path] : [])].join(' · ');
    case 'history':
      return [LABELS.history, `#${pointer.index}`, ...(pointer.toolCallId !== undefined ? [pointer.toolCallId] : []), pointer.path].join(' · ');
    case 'declaration':
      return [LABELS.declaredByApp, pointer.field, ...(pointer.id !== undefined ? [pointer.id] : []), ...(pointer.version !== undefined ? [pointer.version] : [])].join(' · ');
  }
}

/**
 * The softened show-me hint (R2-S5) for a sentence: when one of its pointers
 * is one of a CALL's pointers and that call's emptiness was read from the
 * model's view rather than the tool's own result. Joined by the library's
 * pointer key — never by a tool name.
 */
export function viewHintOf(account: AnswerAccount, sentence: AccountSentence): string | undefined {
  if (sentence.pointers.length === 0) return undefined;
  const keys = new Set(sentence.pointers.map(answerAccountPointerKey));
  for (const call of account.facts.calls) {
    if (call.view === undefined || call.view === 'result') continue;
    if (!call.pointers.some((p) => keys.has(answerAccountPointerKey(p)))) continue;
    return call.view === 'model-result-record-only' ? LABELS.viewRecordOnly : LABELS.viewModelResult;
  }
  return undefined;
}

/** `id@version` — how a template is named in "show me", the toggle and the print. */
export function templateName(sentence: { readonly template: { readonly id: string; readonly version: number } }): string {
  return `${sentence.template.id}@${sentence.template.version}`;
}

const TURN_START = 'agentfootprint.agent.turn_start';

/**
 * When the answer was recorded — for the print's meta line — read off a
 * recording the host ALSO holds (the account does not carry it). The join is
 * the account's own pointer: the `turn_start` event its question points at,
 * matched in the lens's log by type and `runtimeStageId` (and by run id when
 * both carry one); the value is that event's `meta.wallClockMs`. No match →
 * `undefined`, and the print says `not recorded`.
 */
export function recordedAtOf(account: AnswerAccount, log: readonly EventLogEntry[]): number | undefined {
  const pointer = account.question.pointers.find(
    (p): p is Extract<AccountRecordPointer, { kind: 'event' }> => p.kind === 'event' && p.type === TURN_START,
  );
  if (pointer?.runtimeStageId === undefined) return undefined;
  const runId = account.run.value?.runId;
  for (const entry of log) {
    if (entry.event.type !== TURN_START || entry.runtimeStageId !== pointer.runtimeStageId) continue;
    const meta = (entry.event as { readonly meta?: { readonly runId?: unknown; readonly wallClockMs?: unknown } }).meta;
    if (runId !== undefined && typeof meta?.runId === 'string' && meta.runId !== runId) continue;
    if (typeof meta?.wallClockMs === 'number') return meta.wallClockMs;
  }
  return undefined;
}
