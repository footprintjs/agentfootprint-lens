/**
 * THE LENS'S OWN PROSE RULE, as a test.
 *
 * Eight review rounds of the library's receipt work found a new false sentence
 * in every round of hand-written prose about a run. So the Served tab writes
 * NONE: every explanatory sentence it prints is `SERVED_GAPS[k].why`,
 * `UNGAPPED_FIELDS[k]` or `RECEIPT_BOUNDARY` verbatim, or is computed data.
 * This test walks every string literal in `src/core/served/` and
 * `src/react/components/ServedTab*.tsx` and requires each to be one of:
 *
 *   · a LABEL — a value of the tab's exported `LABELS` (each of which is itself
 *     checked here: short, and carrying no claim verb);
 *   · a LIBRARY sentence — byte-equal to one of the constants above;
 *   · the ONE mandated note — `LABELS.betweenCalls`, "this stop is between
 *     calls", decided verbatim by the design page and rendered only when the
 *     computed `ServedRow.betweenCalls` flag is true (the render test pins
 *     that it appears at a decision stop and not on the call);
 *   · a ONE-word token (an identifier, a data-testid, a key, a separator) —
 *     unless that single word is itself a claim verb — or a CSS value
 *     (`"8px 10px"`, `"1px solid"`), which is printed to no one.
 *
 * The rule is an ALLOWLIST, not a verb blacklist: EVERY literal of two or more
 * words must be one of the first three, and fails NAMING the literal and the
 * file otherwise. (An earlier form of this test only failed literals carrying
 * a claim verb; a walker replicated over planted sentences found 7 of 9 —
 * "Hashes agree — this request went out unchanged.", "Every tool the model saw
 * matches the receipt." — passed it. A sentence with any other verb is still a
 * sentence.) The verb check remains as the guard on the LABELS themselves.
 *
 * WHAT THIS CANNOT CATCH — stated so nobody reads a green run as proof:
 *   · a sentence ASSEMBLED at runtime from fragments that each pass (template
 *     literals are walked piece by piece, so a claim split across `${}` seams
 *     is invisible here — every seam fragment is at most one word);
 *   · a misleading one-word LABEL ("Complete", "Exact") — the allowlist is the
 *     guard, and a reviewer reads it;
 *   · prose in comments and JSDoc — they are not printed, and are not walked;
 *   · a claim carried by LAYOUT (a badge next to the wrong field) or by a
 *     `title` attribute built from data;
 *   · a library sentence that is itself false — that is the library's
 *     `gap-sentences.test.ts` job, not this file's.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { RECEIPT_BOUNDARY, SERVED_GAPS, UNGAPPED_FIELDS } from 'agentfootprint';

import { LABELS } from '../../src/react/components/ServedTab.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'src');

const FILES: string[] = [
  ...readdirSync(join(SRC, 'core', 'served'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(SRC, 'core', 'served', f)),
  ...readdirSync(join(SRC, 'react', 'components'))
    .filter((f) => /^ServedTab.*\.tsx$/.test(f) && !f.includes('.test.'))
    .map((f) => join(SRC, 'react', 'components', f)),
];

const LIBRARY_SENTENCES = new Set<string>([
  RECEIPT_BOUNDARY,
  ...Object.values(SERVED_GAPS).map((g) => g.why),
  ...Object.values(UNGAPPED_FIELDS),
]);

const LABEL_VALUES = new Set<string>(Object.values(LABELS));

/** The single sentence-shaped label, with its provenance. */
const MANDATED_NOTES = new Set<string>([LABELS.betweenCalls]);

const CLAIM_VERB =
  /\b(is|are|was|were|means|never|always|has|have|will|must|cannot|does|did|matches|match|agree|agrees|saw|received|reached|went|exactly|complete)\b/i;

/** A CSS value: every word a length, a number, or a border style. Style
 *  literals are printed to no one. */
const CSS_VALUE = /^(\d+(\.\d+)?(px|em|rem|%)?|solid|dashed)( (\d+(\.\d+)?(px|em|rem|%)?|solid|dashed))+$/;

interface Literal {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Every string a file could print: string literals, template pieces, JSX text. */
function literalsOf(file: string): Literal[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: Literal[] = [];
  const push = (node: ts.Node, text: string): void => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed === '') return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    out.push({ file, line: line + 1, text: trimmed });
  };
  const walk = (node: ts.Node): void => {
    // Import/export specifiers are module paths, not prose.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      push(node, node.text);
    } else if (ts.isJsxText(node)) push(node, node.text);
    ts.forEachChild(node, walk);
  };
  walk(source);
  return out;
}

const wordCount = (s: string): number => s.split(/\s+/).filter((w) => w.length > 0).length;

describe('the Served tab writes no claim sentences of its own', () => {
  it('walks at least the four core files and the tab', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(5);
  });

  it('every LABEL is a label: short, and no claim verb (one mandated note excepted)', () => {
    const offenders = Object.entries(LABELS).filter(
      ([, value]) => !MANDATED_NOTES.has(value) && (wordCount(value) > 7 || CLAIM_VERB.test(value)),
    );
    expect(offenders).toEqual([]);
  });

  it('every printable literal of two or more words is a label, a library sentence, or the mandated note', () => {
    const offenders: Literal[] = [];
    for (const file of FILES) {
      for (const lit of literalsOf(file)) {
        if (LIBRARY_SENTENCES.has(lit.text)) continue;
        if (LABEL_VALUES.has(lit.text)) continue;
        if (MANDATED_NOTES.has(lit.text)) continue;
        // A one-word token (an identifier, a CSS value, a key, a separator)
        // carries no claim — unless the single word is itself a claim verb.
        if (wordCount(lit.text) < 2 && !CLAIM_VERB.test(lit.text)) continue;
        if (CSS_VALUE.test(lit.text)) continue;
        offenders.push(lit);
      }
    }
    const report = offenders.map((o) => `${o.file}:${o.line}  "${o.text}"`).join('\n');
    expect(offenders, `literals the tab prints that are not labels or library sentences:\n${report}`).toEqual([]);
  });

  it('the rule is an allowlist: a planted sentence with no blacklisted verb is still caught', () => {
    // The walker's own decision, applied to the sentences that slipped the
    // earlier verb-blacklist form of this test.
    const planted = [
      'Every tool the model saw matches the receipt.',
      'The model received exactly this system prompt.',
      'Nothing hidden from the model',
      'Hashes agree — this request went out unchanged.',
      'verified against the receipt',
    ];
    for (const text of planted) {
      const allowed =
        LIBRARY_SENTENCES.has(text) || LABEL_VALUES.has(text) || MANDATED_NOTES.has(text) || wordCount(text) < 2;
      expect(allowed, `"${text}" would pass`).toBe(false);
    }
  });

  it('the library sentences the tab prints are byte-equal to the constants', () => {
    // A copy of a sentence drifts; the tab must reference the constant. Every
    // gap `why` and UNGAPPED sentence is 6+ words, so a literal in these files
    // that EQUALS one would be a pasted copy.
    for (const file of FILES) {
      for (const lit of literalsOf(file)) {
        expect(LIBRARY_SENTENCES.has(lit.text), `${file}:${lit.line} pastes a library sentence`).toBe(false);
      }
    }
  });
});
