/**
 * The Save as PDF report for one answer's account (design §5.2).
 *
 * `<AnswerReportPrint account />` is the one-page report as React — the
 * question, a meta line, the answer as plain text, **In one line**, the seven
 * rows as a table with who says so under each line, and the method. It prints
 * NO "show me": the report carries the account's sentences only.
 *
 * `printAnswerAccount(account, options?)` mounts it in a hidden same-origin
 * `<iframe>` (`aria-hidden` while mounted) whose document has a real
 * `<title>Answer report</title>` — so the browser's print header says that,
 * not `about:blank` or the app's URL — waits for the fonts, calls the frame's
 * `print()`, and removes the frame on `afterprint`. It makes no request: the
 * report is drawn from the account in memory.
 *
 * The same laws as `<PlainWords>`: every sentence is the library's, the lens's
 * own strings are `LABELS`, and data is text, never HTML. Always light — black
 * ink, borders not shades — whatever the app's theme. Times are ISO-8601 UTC
 * (a fixed format, so the bytes do not move with the reader's locale).
 */
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { AnswerAccount } from 'agentfootprint/observe';

import { ANSWER_REPORT_PRINT_CSS, ANSWER_REPORT_FRAME_HTML } from './answerReportFrame.js';
import { LABELS, linesOf, saidByOf, templateName, toneLabel, type AccountChip, type AccountSentence } from './plainWordsLayout.js';

/** A list row folds past this many items in print (`…and n more`). */
export const PRINT_ITEMS_FOLD = 6;
/** The answer folds past this many characters in print. */
export const PRINT_ANSWER_FOLD = 1200;

export interface AnswerReportPrintProps {
  readonly account: AnswerAccount;
  /**
   * When the answer was recorded, epoch ms — the `turn_start` event's
   * `meta.wallClockMs`. The account does not carry it; `<Lens>` reads it off
   * the recording it holds. Absent → the meta line says `not recorded`.
   */
  readonly recordedAt?: number;
  /** When the report was printed, epoch ms. Absent → no `printed` field. */
  readonly printedAt?: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** A sentence as plain text parts (code stays code). No HTML. */
const Text: React.FC<{ sentence: AccountSentence }> = ({ sentence }) => (
  <>
    {sentence.parts.map((part, i) => {
      if ('code' in part) return <code key={i}>{part.code}</code>;
      if ('quote' in part) return <q key={i}>{part.quote}</q>;
      if ('label' in part) return <strong key={i}>{part.label}</strong>;
      return <React.Fragment key={i}>{part.text}</React.Fragment>;
    })}
  </>
);

/** Who says so, and which template — small type under a line. */
const By: React.FC<{ sentence: AccountSentence; saidBy: AccountChip | undefined }> = ({ sentence, saidBy }) => {
  const chips = (sentence.chips ?? []).map((c) => c.text);
  return (
    <span className="by" data-testid="print-by">
      {[...(saidBy !== undefined ? [saidBy.text] : []), ...chips, `${LABELS.template} ${templateName(sentence)}`].join(' · ')}
    </span>
  );
};

/** The one-page report. */
export const AnswerReportPrint: React.FC<AnswerReportPrintProps> = ({ account, recordedAt, printedAt }) => {
  const run = account.run.value;
  const answer = account.answer.value;
  const answerCut = answer !== null && answer.length > PRINT_ANSWER_FOLD;
  const meta = [
    `${LABELS.run} ${run?.runId ?? LABELS.notRecorded}`,
    `${LABELS.recorded} ${recordedAt !== undefined ? iso(recordedAt) : LABELS.notRecorded}`,
    ...(run?.model !== undefined ? [`${LABELS.model} ${run.model}`] : []),
    `${LABELS.templates} ${account.templates.set} v${account.templates.version}`,
    ...(printedAt !== undefined ? [`${LABELS.printed} ${iso(printedAt)}`] : []),
  ];
  return (
    <article data-testid="answer-report">
      <h1>{LABELS.reportTitle}</h1>
      <p>{account.question.value !== null ? <q>{account.question.value}</q> : LABELS.notRecorded}</p>
      <p className="meta" data-testid="print-meta">
        {meta.join(' · ')}
      </p>
      <h2>{LABELS.answer}</h2>
      <div className="answer" data-testid="print-answer">
        {answer === null ? LABELS.notRecorded : answerCut ? `${answer.slice(0, PRINT_ANSWER_FOLD)} … ` : answer}
        {answerCut && `(${LABELS.answerCut})`}
      </div>
      <h2>{LABELS.inOneLine}</h2>
      <div className="one" data-testid="print-one-liner" data-tone={account.summary.tone}>
        <p>
          <strong>{toneLabel(account.summary.tone)}</strong>
        </p>
        <p>
          <Text sentence={account.summary.sentence} />
        </p>
      </div>
      <table>
        <tbody>
          {account.rows.map((row) => {
            const saidBy = saidByOf(row);
            return (
              <tr key={row.id} data-testid="print-row" data-row={row.id}>
                <th scope="row">{row.heading.text}</th>
                <td>
                  {linesOf(row).map((group) => {
                    const shownItems = group.items.slice(0, PRINT_ITEMS_FOLD);
                    const folded = group.items.length - shownItems.length;
                    return (
                      <div key={group.index}>
                        <p>
                          <Text sentence={group.line} />
                          <By sentence={group.line} saidBy={saidBy.byLine.get(group.index)} />
                        </p>
                        {group.items.length > 0 && (
                          <ul>
                            {shownItems.map(({ item, index }) => (
                              <li key={index}>
                                <Text sentence={item} />
                              </li>
                            ))}
                            {folded > 0 && <li data-testid="print-fold">{`… ${folded} ${LABELS.more}`}</li>}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {row.more !== undefined && (
                    <p>
                      <Text sentence={row.more} />
                    </p>
                  )}
                  {saidBy.rowChips.length > 0 && (
                    <span className="chips">{saidBy.rowChips.map((c) => c.text).join(' · ')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="foot">{`${LABELS.method} · ${account.templates.set} v${account.templates.version}`}</p>
    </article>
  );
};

export interface PrintAnswerAccountOptions {
  /** When the answer was recorded, epoch ms (see `AnswerReportPrintProps.recordedAt`). */
  readonly recordedAt?: number;
  /** The print time, epoch ms. Default: now. */
  readonly printedAt?: number;
}

/** The frame the report is printed from, while one is mounted (one at a time). */
let mounted: { readonly frame: HTMLIFrameElement; readonly unmount: () => void } | undefined;

/** Remove the print frame, if one is mounted. */
function removeFrame(): void {
  if (mounted === undefined) return;
  const { frame, unmount } = mounted;
  mounted = undefined;
  unmount();
  frame.remove();
}

/**
 * Save as PDF: print the account's one-page report through the browser's own
 * print dialog, from a hidden frame titled "Answer report". Resolves once the
 * print call has been made; the frame goes on `afterprint`.
 */
export async function printAnswerAccount(account: AnswerAccount, options: PrintAnswerAccountOptions = {}): Promise<void> {
  if (typeof document === 'undefined') return;
  removeFrame();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.setAttribute('data-testid', 'answer-report-frame');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.right = '0';
  frame.style.bottom = '0';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument ?? win?.document;
  if (win === null || doc === undefined) {
    frame.remove();
    return;
  }
  // The document's frame is constant text; the report goes in through React (text nodes only).
  doc.open();
  doc.write(ANSWER_REPORT_FRAME_HTML);
  doc.close();
  doc.title = LABELS.reportTitle;
  const style = doc.querySelector('style');
  if (style !== null) style.textContent = ANSWER_REPORT_PRINT_CSS;
  const host = doc.getElementById('answer-report') ?? doc.body;
  const root = createRoot(host);
  mounted = { frame, unmount: () => root.unmount() };
  flushSync(() => {
    root.render(
      <AnswerReportPrint
        account={account}
        {...(options.recordedAt !== undefined ? { recordedAt: options.recordedAt } : {})}
        printedAt={options.printedAt ?? Date.now()}
      />,
    );
  });
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready !== undefined) await fonts.ready;
  win.addEventListener('afterprint', () => {
    if (mounted?.frame === frame) removeFrame();
  });
  win.focus();
  win.print();
}
