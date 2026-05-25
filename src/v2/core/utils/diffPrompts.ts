/**
 * diffPrompts — word-level diff between two prompt strings.
 *
 * Returns a sequence of segments tagged `equal` / `added` / `removed`,
 * suitable for inline highlighting in the compare-branches panel.
 *
 * Pure function. Layer 1 / Tier C / Lens v0.1.
 *
 * Algorithm: LCS (longest common subsequence) at word granularity.
 * Tokenizes both inputs by whitespace boundary (preserving the
 * delimiter glue so reconstructing the original is trivial). LCS
 * complexity is O(n × m); for prompts under ~10k tokens this is
 * well under 10ms in V8. For longer prompts the caller should chunk
 * or use a streaming alternative.
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

export function diffPrompts(a: string, b: string): readonly DiffSegment[] {
  if (a === b) {
    return a.length === 0 ? [] : [{ kind: 'equal', text: a }];
  }
  return lcsDiff(tokenize(a), tokenize(b));
}
