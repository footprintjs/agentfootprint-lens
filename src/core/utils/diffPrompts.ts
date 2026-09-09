/**
 * diffPrompts — word-level diff between two prompt strings.
 *
 * Returns a sequence of segments tagged `equal` / `added` / `removed`,
 * suitable for inline highlighting in the compare-branches panel and the
 * Served tab's since-previous block.
 *
 * Pure function. Layer 1 / Tier C / Lens v0.1.
 *
 * Algorithm: the common HEAD and TAIL of the two token sequences are stripped
 * in O(n + m) first, and only the middle that actually differs goes to an LCS
 * (longest common subsequence) at word granularity. LCS is O(n × m) in time
 * AND memory (one `Uint32Array` row per token of `a`), so it is bounded:
 * `diffPromptsBounded` refuses a middle larger than `maxCells` and returns
 * `undefined` — "not computed" is a fact a caller prints as data, never a
 * stall of hundreds of milliseconds and hundreds of megabytes inside a render.
 * `diffPrompts` is the unbounded form for the small strings it was written
 * for.
 *
 * MEASURED (this machine, one-word change in the middle): the head/tail strip
 * makes a one-word edit in a 10 000-word prompt cost the LCS of a handful of
 * tokens; two prompts that differ throughout hit the cap at ~1 250 words each
 * (2 500 × 2 500 tokens = {@link DIFF_CELL_CAP} cells ≈ 25 MB, ~15 ms).
 * Whitespace runs are tokens of their own, so a prompt of N words is ≈ 2N
 * tokens.
 *
 * Why word-level (not char-level): debugging "why did legal say
 * approve but ethics say deny?" surfaces in WORD-level divergence
 * (`approve` vs `deny`, `Yes,` vs `No,`). Char-level produces
 * cluttered highlights for cosmetic changes (whitespace, punctuation).
 *
 * Edge cases:
 *   - Both empty → []
 *   - a empty / b non-empty → all added
 *   - b empty / a non-empty → all removed
 *   - a === b → single equal segment
 *   - Whitespace differences preserved as added/removed tokens
 */

export type DiffSegment =
  | { readonly kind: 'equal'; readonly text: string }
  | { readonly kind: 'added'; readonly text: string }
  | { readonly kind: 'removed'; readonly text: string };

/**
 * Tokenize a string preserving whitespace runs as their own tokens.
 * Each token is either a word (no whitespace) or a whitespace run.
 * Reconstructing the original = joining the tokens with no glue.
 */
function tokenize(s: string): string[] {
  if (s.length === 0) return [];
  // Split on word/non-word boundary preserving both sides.
  const matches = s.match(/\S+|\s+/g);
  return matches ?? [];
}

/**
 * Compute LCS-based diff opcodes between two token sequences.
 * Returns runs of 'equal' | 'added' | 'removed', merging adjacent
 * tokens of the same kind into single segments.
 */
function lcsDiff(a: readonly string[], b: readonly string[]): DiffSegment[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ kind: 'added', text: b.join('') }];
  if (m === 0) return [{ kind: 'removed', text: a.join('') }];

  // LCS table: dp[i][j] = LCS length of a[i:] vs b[j:].
  // Build bottom-up to keep traversal forward-only during reconstruction.
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  // Walk forward, emitting opcodes. Adjacent same-kind opcodes
  // accumulate into one segment.
  const segments: DiffSegment[] = [];
  let curKind: DiffSegment['kind'] | undefined;
  let curText = '';
  const push = (kind: DiffSegment['kind'], text: string): void => {
    if (kind === curKind) {
      curText += text;
    } else {
      if (curKind !== undefined && curText.length > 0) {
        segments.push({ kind: curKind, text: curText } as DiffSegment);
      }
      curKind = kind;
      curText = text;
    }
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('removed', a[i]!);
      i++;
    } else {
      push('added', b[j]!);
      j++;
    }
  }
  while (i < n) {
    push('removed', a[i]!);
    i++;
  }
  while (j < m) {
    push('added', b[j]!);
    j++;
  }
  if (curKind !== undefined && curText.length > 0) {
    segments.push({ kind: curKind, text: curText } as DiffSegment);
  }
  return segments;
}

/**
 * The largest LCS table `diffPromptsBounded` will build by default, in cells
 * (tokens of `a` × tokens of `b`, after the common head and tail are
 * stripped). 2 500 × 2 500 — about 25 MB of `Uint32Array` and ~15 ms.
 */
export const DIFF_CELL_CAP = 6_250_000;

/** Tokens shared at the head of both sequences. */
function commonHead(a: readonly string[], b: readonly string[]): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a[n] === b[n]) n++;
  return n;
}

/** Tokens shared at the tail of both sequences, past a head of `head`. */
function commonTail(a: readonly string[], b: readonly string[], head: number): number {
  const max = Math.min(a.length, b.length) - head;
  let n = 0;
  while (n < max && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** Concatenate segment runs, merging adjacent runs of one kind. */
function joinSegments(parts: readonly (readonly DiffSegment[])[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const part of parts) {
    for (const s of part) {
      if (s.text.length === 0) continue;
      const last = out[out.length - 1];
      if (last !== undefined && last.kind === s.kind) {
        out[out.length - 1] = { kind: last.kind, text: last.text + s.text } as DiffSegment;
      } else {
        out.push(s);
      }
    }
  }
  return out;
}

/**
 * The diff, or `undefined` when the part of the two strings that differs is
 * larger than `maxCells` (tokens × tokens) — the caller then prints "not
 * computed" rather than paying a quadratic table inside a render.
 *
 * @example
 * ```ts
 * diffPromptsBounded(before, after);            // segments, or undefined past the cap
 * diffPromptsBounded(before, after, Infinity);  // === diffPrompts(before, after)
 * ```
 */
export function diffPromptsBounded(
  a: string,
  b: string,
  maxCells: number = DIFF_CELL_CAP,
): readonly DiffSegment[] | undefined {
  if (a === b) {
    return a.length === 0 ? [] : [{ kind: 'equal', text: a }];
  }
  const ta = tokenize(a);
  const tb = tokenize(b);
  const head = commonHead(ta, tb);
  const tail = commonTail(ta, tb, head);
  const midA = ta.slice(head, ta.length - tail);
  const midB = tb.slice(head, tb.length - tail);
  if (midA.length * midB.length > maxCells) return undefined;
  return joinSegments([
    head > 0 ? [{ kind: 'equal', text: ta.slice(0, head).join('') }] : [],
    lcsDiff(midA, midB),
    tail > 0 ? [{ kind: 'equal', text: ta.slice(ta.length - tail).join('') }] : [],
  ]);
}

/** The unbounded diff — for the short strings the compare-branches panel
 *  hands it. Prefer {@link diffPromptsBounded} for anything a run composed. */
export function diffPrompts(a: string, b: string): readonly DiffSegment[] {
  return diffPromptsBounded(a, b, Number.POSITIVE_INFINITY)!;
}
