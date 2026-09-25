/**
 * <PlainWords> — the In plain words pane: one answer's account, drawn for a
 * reader who is not an engineer (design "Explain this answer" §5.1).
 *
 * WHY. agentfootprint's `accountForAnswer` (a pure Fold over one answer's
 * recording, computed on the SERVER by the `answer-account` hosting op) turns
 * the record into seven rows of fixed-template sentences, each naming who
 * vouches for it and pointing at the leaf of the record it came from. This
 * pane draws that account — and only that account.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. PROPS ONLY. It receives the account and the op's `shown` leaf map; it
 *      fetches nothing, receives no recording, and computes nothing about the
 *      run. The pairing, grouping and lookups it does are layout over the
 *      account (`plainWordsLayout.ts`).
 *   2. NO SENTENCE OF ITS OWN. Every printed sentence is the library's —
 *      a row heading, a line, a chip, the one-liner (`Sentence.text`,
 *      `Chip.text`). The pane's own strings are `LABELS`: names, never a claim.
 *      `test/served/no-own-claims.test.ts` walks this file.
 *   3. NO HTML FROM DATA. A sentence renders from its typed `parts` as text
 *      nodes: `code` → `<code>`, `quote` → `<q>`, `label` → `<strong>` with its
 *      own voucher in a `title` and in "show me". No raw-HTML prop anywhere.
 *   4. SHOW ME = LEAVES ONLY. Each pointer resolves through `shown` (by the
 *      library's key, `answerAccountPointerKey`) to a value, a derived row
 *      count, or why it is withheld ("not shown here"). Without `shown` the
 *      pointers are listed as text. The template id@version and the voucher
 *      are always listed. "Open in the Flow Lens" appears only when the host
 *      passes `onOpenInLens` (the app passes it only with debug on).
 *   5. OMIT, NEVER DENY. A `not-recorded` line renders with its chip; the
 *      library never writes an empty row, and the pane never drops a line.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AnswerAccount } from 'agentfootprint/observe';
import { coolDark, coolLight, tokensToCSSVars } from 'footprint-explainable-ui';

import { ensureLensStyles } from '../lensStyles.js';
import { MODE_PALETTES } from '../theme/index.js';
import {
  LABELS,
  isWithheld,
  leafOf,
  leafText,
  linesOf,
  pointerPlace,
  saidByOf,
  templateName,
  toneLabel,
  viewHintOf,
  type AccountChip,
  type AccountRecordPointer,
  type AccountRow,
  type AccountSentence,
  type AccountSentencePart,
  type AccountShownMap,
} from './plainWordsLayout.js';

export { LABELS };

export interface PlainWordsProps {
  /** The answer's account — the `account` of the `answer-account` op's reply. */
  readonly account: AnswerAccount;
  /**
   * The op's leaf map: pointer key → a shown value or why it is withheld (the
   * `shown` of the same reply). Omitted → "show me" lists the pointers as text.
   */
  readonly shown?: AccountShownMap;
  /**
   * Opens an engineer lens at a record entry. Pass it ONLY when those lenses
   * exist for the reader (the app: debug on); without it no link is drawn.
   */
  readonly onOpenInLens?: (pointer: AccountRecordPointer) => void;
  /** Draw the question and the answer above the one-liner. Default `true`. */
  readonly showQuestionAndAnswer?: boolean;
  /** Draws a "Save as PDF" button that calls this (`() => printAnswerAccount(account)`). */
  readonly onSaveAsPdf?: () => void;
  /** Draw the "template ids" toggle. Default `true`. */
  readonly templateIdsToggle?: boolean;
  /** Standalone use: stamps the lens palette for this mode. Inside `<Lens>` the lens stamps it. */
  readonly theme?: { readonly mode: 'light' | 'dark' };
  /**
   * The id of the TAB that shows this pane, when the host draws a tablist —
   * the pane then carries `role="tabpanel"` labelled by it. Without it the
   * pane is a labelled region.
   */
  readonly labelledBy?: string;
  /** Move focus to the pane's heading when it mounts (the app: when Explain opened it). */
  readonly focusOnMount?: boolean;
}

/** One sentence's typed parts, as text nodes. Never HTML. */
const Parts: React.FC<{ parts: readonly AccountSentencePart[] }> = ({ parts }) => (
  <>
    {parts.map((part, i) => {
      if ('code' in part) return <code key={i}>{part.code}</code>;
      if ('quote' in part) return <q key={i}>{part.quote}</q>;
      if ('label' in part)
        return (
          <strong key={i} className="lens-plain-label" title={`${LABELS.voucher}: ${part.source}`}>
            {part.label}
          </strong>
        );
      return <React.Fragment key={i}>{part.text}</React.Fragment>;
    })}
  </>
);

/** A chip, its tone as ink and as the library's own word. */
const ChipView: React.FC<{ chip: AccountChip }> = ({ chip }) => (
  <span
    className={`lens-plain-chip${chip.tone === 'plain' ? '' : ` lens-plain-chip--${chip.tone}`}`}
    data-mark={chip.mark}
    data-tone={chip.tone}
    data-testid="plain-chip"
  >
    {chip.text}
  </span>
);

/** "show me" for one sentence: where it lives, the leaf, the template and the voucher. */
const Evidence: React.FC<{
  id: string;
  open: boolean;
  sentence: AccountSentence;
  shown: AccountShownMap | undefined;
  hint: string | undefined;
  onOpenInLens: ((pointer: AccountRecordPointer) => void) | undefined;
}> = ({ id, open, sentence, shown, hint, onOpenInLens }) => (
  <dl id={id} className="lens-plain-evidence" hidden={!open} data-testid="plain-evidence">
    {sentence.pointers.map((pointer, i) => {
      const leaf = leafOf(shown, pointer);
      return (
        <React.Fragment key={i}>
          <dt>{LABELS.where}</dt>
          <dd>
            {pointerPlace(pointer)}
            {onOpenInLens !== undefined && pointer.kind !== 'declaration' && (
              <>
                {' '}
                <button type="button" className="lens-plain-show" onClick={() => onOpenInLens(pointer)}>
                  {LABELS.openInLens}
                </button>
              </>
            )}
          </dd>
          {leaf !== undefined && (
            <>
              <dt>{LABELS.value}</dt>
              <dd className={isWithheld(leaf) ? 'lens-plain-withheld' : undefined} data-testid="plain-leaf">
                {leafText(leaf)}
              </dd>
            </>
          )}
        </React.Fragment>
      );
    })}
    {hint !== undefined && (
      <>
        <dt>{LABELS.value}</dt>
        <dd data-testid="plain-view-hint">{hint}</dd>
      </>
    )}
    <dt>{LABELS.template}</dt>
    <dd>{templateName(sentence)}</dd>
    <dt>{LABELS.voucher}</dt>
    <dd>{sentence.source}</dd>
    {sentence.missing !== undefined && (
      <>
        <dt>{LABELS.missing}</dt>
        <dd>{sentence.missing}</dd>
      </>
    )}
  </dl>
);

/** One line (or item): its parts, its chips, its said-by chip, and "show me". */
const Line: React.FC<{
  account: AnswerAccount;
  sentence: AccountSentence;
  saidBy: AccountChip | undefined;
  shown: AccountShownMap | undefined;
  showIds: boolean;
  onOpenInLens: ((pointer: AccountRecordPointer) => void) | undefined;
}> = ({ account, sentence, saidBy, shown, showIds, onOpenInLens }) => {
  const [open, setOpen] = useState(false);
  const evidenceId = useId();
  const chips = [...(sentence.chips ?? []), ...(saidBy !== undefined ? [saidBy] : [])];
  return (
    <>
      <span className="lens-plain-text" data-testid="plain-line-text">
        <Parts parts={sentence.parts} />
      </span>
      {chips.length > 0 && (
        <span className="lens-plain-chips">
          {chips.map((chip, i) => (
            <ChipView key={i} chip={chip} />
          ))}
        </span>
      )}{' '}
      <button
        type="button"
        className="lens-plain-show"
        aria-expanded={open}
        aria-controls={evidenceId}
        onClick={() => setOpen((v) => !v)}
        data-testid="plain-show-me"
      >
        {open ? LABELS.hide : LABELS.showMe}
      </button>
      {showIds && (
        <span className="lens-plain-tid" data-testid="plain-template-id">
          {templateName(sentence)}
        </span>
      )}
      <Evidence
        id={evidenceId}
        open={open}
        sentence={sentence}
        shown={shown}
        hint={viewHintOf(account, sentence)}
        onOpenInLens={onOpenInLens}
      />
    </>
  );
};

/** One of the seven rows: its heading, its lines with their items, "…and n more", its row chips. */
const RowView: React.FC<{
  account: AnswerAccount;
  row: AccountRow;
  shown: AccountShownMap | undefined;
  showIds: boolean;
  onOpenInLens: ((pointer: AccountRecordPointer) => void) | undefined;
}> = ({ account, row, shown, showIds, onOpenInLens }) => {
  const headingId = useId();
  const groups = useMemo(() => linesOf(row), [row]);
  const saidBy = useMemo(() => saidByOf(row), [row]);
  const lineProps = { account, shown, showIds, onOpenInLens };
  return (
    <section
      className="lens-plain-row"
      aria-labelledby={headingId}
      data-testid="plain-row"
      data-row={row.id}
      data-status={row.status}
    >
      <h3 id={headingId} className="lens-plain-heading">
        {row.heading.text}
      </h3>
      <div>
        <ul className="lens-plain-lines">
          {groups.map((group) => (
            <li key={group.index} className="lens-plain-line" data-testid="plain-line" data-status={group.line.status}>
              <Line sentence={group.line} saidBy={saidBy.byLine.get(group.index)} {...lineProps} />
              {group.items.length > 0 && (
                <ul className="lens-plain-items">
                  {group.items.map(({ item, index }) => {
                    // An item names its voucher only where its line does not already name the same one.
                    const chip = saidBy.byLine.get(index);
                    const own = chip !== saidBy.byLine.get(group.index) ? chip : undefined;
                    return (
                      <li key={index} className="lens-plain-line" data-testid="plain-item" data-status={item.status}>
                        <Line sentence={item} saidBy={own} {...lineProps} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
          {row.more !== undefined && (
            <li className="lens-plain-line" data-testid="plain-more">
              <Line sentence={row.more} saidBy={undefined} {...lineProps} />
            </li>
          )}
        </ul>
        {saidBy.rowChips.length > 0 && (
          <div className="lens-plain-chips lens-plain-chips--row" data-testid="plain-row-chips">
            {saidBy.rowChips.map((chip, i) => (
              <ChipView key={i} chip={chip} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * The In plain words pane: the question and the answer, **In one line** (its
 * tone as a border AND a word), then the seven rows — each line with its
 * chips, who says so, and "show me".
 */
export const PlainWords: React.FC<PlainWordsProps> = ({
  account,
  shown,
  onOpenInLens,
  showQuestionAndAnswer = true,
  onSaveAsPdf,
  templateIdsToggle = true,
  theme,
  labelledBy,
  focusOnMount = false,
}) => {
  ensureLensStyles();
  const [showIds, setShowIds] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const oneLinerId = useId();
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  const themeVars = useMemo<React.CSSProperties | undefined>(
    () =>
      theme === undefined
        ? undefined
        : ({
            ...(tokensToCSSVars(theme.mode === 'light' ? coolLight : coolDark) as React.CSSProperties),
            ...MODE_PALETTES[theme.mode],
          } as React.CSSProperties),
    [theme],
  );

  const { summary } = account;
  const lineProps = { account, shown, showIds, onOpenInLens };
  const region = labelledBy !== undefined ? { role: 'tabpanel', 'aria-labelledby': labelledBy } : { role: 'region', 'aria-label': LABELS.pane };
  return (
    <div className="lens-plain" style={themeVars} data-testid="plain-words" {...region}>
      {(templateIdsToggle || onSaveAsPdf !== undefined) && (
        <div className="lens-plain-head">
          {templateIdsToggle && (
            <label className="lens-plain-toggle">
              <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} />
              {LABELS.templateIds}
            </label>
          )}
          {onSaveAsPdf !== undefined && (
            <button type="button" className="lens-plain-button" onClick={onSaveAsPdf}>
              {LABELS.saveAsPdf}
            </button>
          )}
        </div>
      )}
      {showQuestionAndAnswer && (
        <dl className="lens-plain-qa" data-testid="plain-qa">
          <dt>{LABELS.question}</dt>
          <dd>{account.question.value ?? LABELS.notRecorded}</dd>
          <dt>{LABELS.answer}</dt>
          <dd>
            {account.answer.value ?? LABELS.notRecorded}
            {account.answer.clipped === true && ` ${LABELS.cut}`}
          </dd>
        </dl>
      )}
      <section
        className={`lens-plain-one lens-plain-one--${summary.tone}`}
        aria-labelledby={oneLinerId}
        data-testid="plain-one-liner"
        data-tone={summary.tone}
      >
        <h2 id={oneLinerId} ref={headingRef} tabIndex={-1} className="lens-plain-one-heading">
          <span>{LABELS.inOneLine}</span>
          <span className={`lens-plain-tone lens-plain-tone--${summary.tone}`} data-testid="plain-tone">
            {toneLabel(summary.tone)}
          </span>
        </h2>
        <div className="lens-plain-one-text">
          <Line sentence={summary.sentence} saidBy={undefined} {...lineProps} />
        </div>
      </section>
      <div className="lens-plain-rows">
        {account.rows.map((row) => (
          <RowView key={row.id} row={row} {...lineProps} />
        ))}
      </div>
    </div>
  );
};
