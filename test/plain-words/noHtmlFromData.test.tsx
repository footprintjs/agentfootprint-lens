/**
 * No HTML from data (design §5.1, law 2). Every string in the account and in
 * `shown` came off a recording the reader does not control — a person's
 * question, a tool author's words, a model's answer. The pane and the print
 * render them as TEXT NODES: a `<script>` in a sentence is shown as the
 * characters `<script>`, never parsed.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { answerAccountPointerKey } from 'agentfootprint/observe';

import { AnswerReportPrint, PlainWords } from '../../src/react/index.js';
import { tamperedReply } from './helpers.js';

const SCRIPT = '<script>window.__pwned = 1</script>';
const IMG = '<img src=x onerror="window.__pwned = 2">';
const BOLD = '<b>bold</b>';

const hostile = tamperedReply((r) => {
  const line = r.account.rows[0]!.lines[0]!;
  line.text = `${SCRIPT} ${IMG}`;
  line.parts = [{ text: SCRIPT }, { code: IMG }, { quote: BOLD, source: 'person' }, { label: BOLD, source: 'app' }];
  r.account.summary.sentence.parts = [{ text: SCRIPT }];
  r.account.summary.sentence.text = SCRIPT;
  r.account.rows[1]!.chips = [{ mark: 'signals', text: IMG, tone: 'warn', template: { id: 'chip.signals', version: 1 } }];
  r.account.question.value = SCRIPT;
  r.account.answer.value = `${IMG}\n${SCRIPT}`;
  r.shown[answerAccountPointerKey(line.pointers[0]!)] = { value: SCRIPT };
});

describe('no HTML injection from account text', () => {
  it('the pane: every hostile string is text, no element is created from it', () => {
    const { container } = render(<PlainWords account={hostile.account} shown={hostile.shown} />);
    for (const b of screen.getAllByTestId('plain-show-me')) fireEvent.click(b);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain(SCRIPT);
    expect(container.textContent).toContain(IMG);
    expect(container.textContent).toContain(BOLD);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('the print report: the same', () => {
    const { container } = render(<AnswerReportPrint account={hostile.account} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain(SCRIPT);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('no raw-HTML prop and no innerHTML write in the pane’s or the print’s source', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'react', 'components');
    for (const file of ['PlainWords.tsx', 'plainWordsLayout.ts', 'AnswerReportPrint.tsx', 'answerReportFrame.ts']) {
      const code = readFileSync(join(dir, file), 'utf8');
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML\s*=/);
      expect(code, file).not.toMatch(/\.(inner|outer)HTML\s*=/);
      expect(code, file).not.toMatch(/insertAdjacentHTML/);
    }
  });
});
