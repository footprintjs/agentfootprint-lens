/**
 * A runner's last snapshot, and a cheap key for "did its log move".
 *
 * A live runner hands back a NEW snapshot object on every `getLastSnapshot()`,
 * so a memo keyed on the object would re-derive on every render. `logKey`
 * changes only when a commit lands (root log or a subflow mount) or the run
 * changes — the one owner of that rule, read by the Served tab, the tag
 * legend and the bookmark key alike.
 */

/** `runner.getLastSnapshot()` when the runner has one, else the value itself
 *  (a snapshot passed directly). */
export function snapshotOfRunner(runner: unknown): unknown {
  const fn = (runner as { getLastSnapshot?: unknown } | null)?.getLastSnapshot;
  if (typeof fn === 'function') return (fn as () => unknown).call(runner);
  return runner;
}

/**
 * The mounted subflows' own logs, ONE per mount.
 *
 * `subflowResults` is DUAL-KEYED: every mount appears under its bare path
 * (`sf-llm-call`, `sf-llm-call/sf-tools`) and under its runtime address
 * (`sf-llm-call#1`, `sf-llm-call/sf-tools#13`), byte twins. A reader that
 * walks `Object.values` counts each log twice. Only the `#n`-keyed entries
 * are walked here — the one whose LAST segment carries the execution index —
 * so a count over these logs is a count over the run.
 */
export function mountLogsOf(snapshot: unknown): readonly { readonly key: string; readonly log: readonly unknown[] }[] {
  const s = snapshot as { subflowResults?: unknown } | null | undefined;
  const results = s?.subflowResults;
  if (results === null || typeof results !== 'object') return [];
  const out: { key: string; log: readonly unknown[] }[] = [];
  for (const [key, entry] of Object.entries(results as Record<string, unknown>)) {
    const last = key.slice(key.lastIndexOf('/') + 1);
    if (!last.includes('#')) continue;
    const history = (entry as { treeContext?: { history?: unknown } } | null)?.treeContext?.history;
    if (Array.isArray(history)) out.push({ key, log: history });
  }
  return out;
}

/** The run and how many commits it holds — stable until the log grows. */
export function snapshotLogKey(snapshot: unknown): string {
  const s = snapshot as
    | { runId?: unknown; commitLog?: unknown; subflowResults?: unknown }
    | null
    | undefined;
  if (s === null || typeof s !== 'object') return '';
  const commits = Array.isArray(s.commitLog) ? s.commitLog.length : 0;
  const mounts =
    s.subflowResults && typeof s.subflowResults === 'object' ? Object.keys(s.subflowResults).length : 0;
  return `${String(s.runId ?? '')}:${commits}:${mounts}`;
}
