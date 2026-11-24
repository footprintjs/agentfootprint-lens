import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { T } from '../theme/index.js';
import type { HonestyStep, HonestyTurn } from '../../core/honesty/projectHonestyTurn.js';
import type { HonestyReasonEvidence } from '../../core/honesty/readReasonRows.js';
import type { HonestyEventAddress } from '../../core/honesty/readTurnEvents.js';

export interface HonestyLensPanelProps {
  readonly turn: HonestyTurn;
  readonly onInspect?: (evidence: HonestyReasonEvidence | { readonly address: HonestyEventAddress }) => void;
}

const panelStyle: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  padding: '0.75rem 1rem',
  background: T.bgElevated,
  color: T.textPrimary,
  fontFamily: T.fontSans,
  lineHeight: 1.5,
};
const controls: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' };
const sentenceStyle: CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'inherit',
  padding: 0,
  textAlign: 'left',
  font: 'inherit',
  textDecoration: 'underline dotted',
  textUnderlineOffset: '0.2em',
  cursor: 'pointer',
};

export function HonestyLensPanel({ turn, onInspect }: HonestyLensPanelProps) {
  const id = useId();
  const [open, setOpen] = useState(turn.trust.state === 'not-sure' || turn.trust.state === 'ask');
  const [selected, setSelected] = useState<HonestyStep['id']>('N');
  const [sentence, setSentence] = useState<number>();
  const [preview, setPreview] = useState<number>();
  const [copyStatus, setCopyStatus] = useState('');
  const [showAllReasons, setShowAllReasons] = useState(false);
  const reasons = showAllReasons ? turn.reasons : turn.reasons.slice(0, 5);
  const step = turn.steps.find(item => item.id === selected);
  const sentenceNote = sentence === undefined ? undefined : turn.sentences[sentence]?.evidenceNote;

  async function copyCheck() {
    const text = [
      `${turn.trust.title}. ${turn.trust.sentence}`,
      ...turn.reasons.flatMap(reason => [reason.text, ...(reason.tools ?? []), ...(reason.details ?? [])]),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied.');
    } catch {
      setCopyStatus('Copy unavailable.');
    }
  }

  function selectWithArrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + direction + turn.steps.length) % turn.steps.length;
    const item = turn.steps[next];
    if (item === undefined) return;
    setSelected(item.id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
    buttons?.[next]?.focus();
  }

  return (
    <section aria-label="Honesty Lens" style={panelStyle} onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        event.currentTarget.querySelector('button')?.focus();
      }
    }}>
      <p><strong>{turn.trust.title}</strong> {turn.trust.sentence}</p>
      <button type="button" aria-controls={id} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        Check this answer
      </button>
      <div id={id} hidden={!open}>
        {turn.sentences.length > 0 && (
          <p>{turn.sentences.map((item, index) => (
            <button type="button" key={index} style={sentenceStyle}
              aria-label={`${item.text.trim()} ${item.evidenceNote}`}
              onMouseEnter={() => setPreview(index)} onMouseLeave={() => setPreview(undefined)}
              onFocus={() => setPreview(index)} onBlur={() => setPreview(undefined)}
              onClick={() => { setSentence(index); setSelected('A'); }}>
              {item.text}
            </button>
          ))}</p>
        )}
        {preview !== undefined && <p>{turn.sentences[preview]?.evidenceNote}</p>}
        <nav aria-label="Review steps" style={controls}>
          {turn.steps.map((item, index) => (
            <button type="button" key={item.id} aria-pressed={selected === item.id}
              aria-label={item.headline} onClick={() => setSelected(item.id)}
              onKeyDown={event => selectWithArrow(event, index)}>
              {item.id}
            </button>
          ))}
        </nav>
        {step !== undefined && (
          <div>
            <h3>{step.headline}</h3>
            {selected === 'A' && sentenceNote !== undefined && <p>{sentenceNote}</p>}
            {selected === 'N' && turn.reasons.length > 0 ? (
              <ul>{reasons.map(reason => (
                <li key={reason.evidence.reasonIndex}>
                  {reason.text}
                  {reason.tools !== undefined && <p>{reason.tools.join(', ')}</p>}
                  {reason.details !== undefined && <ul>{reason.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
                  {onInspect !== undefined && (
                    <button type="button" aria-label={`Inspect this step: ${reason.text}`}
                      onClick={() => onInspect(reason.evidence)}>Inspect this step</button>
                  )}
                </li>
              ))}</ul>
            ) : (
              <ul>{step.rows.map((row, index) => (
                <li key={index}>
                  {row.text}
                  {onInspect !== undefined && row.address !== undefined && (
                    <button type="button"
                      onClick={() => row.address !== undefined && onInspect({ address: row.address })}>
                      Inspect this step
                    </button>
                  )}
                </li>
              ))}</ul>
            )}
            {selected === 'N' && turn.reasons.length > 5 && (
              <button type="button" aria-expanded={showAllReasons}
                onClick={() => setShowAllReasons(value => !value)}>
                {showAllReasons ? 'Show fewer reasons' : `Show all ${turn.reasons.length} reasons`}
              </button>
            )}
            {step.remaining > 0 && <p>{step.remaining} more in the record.</p>}
          </div>
        )}
        <div style={controls}>
          <button type="button" onClick={() => { void copyCheck(); }}>Copy how this was checked</button>
          <span role="status">{copyStatus}</span>
        </div>
      </div>
    </section>
  );
}
