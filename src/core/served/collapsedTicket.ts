/**
 * The ticket a served tool message carries in place of a result the model
 * judged (agentfootprint 9.101.0, `findings/serve.ts · collapseJudged`):
 * `{ collapsed: true, standing, toolCallId }` as JSON, no model words. Read
 * by its SHAPE — the library names no guard on a barrel — and never
 * inferred: a content that does not parse to that shape is a result.
 */
export function collapsedTicketOf(content: unknown): { readonly standing: string; readonly toolCallId: string } | undefined {
  if (typeof content !== 'string' || !content.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(content) as { collapsed?: unknown; standing?: unknown; toolCallId?: unknown } | null;
    if (parsed === null || typeof parsed !== 'object' || parsed.collapsed !== true) return undefined;
    if (typeof parsed.standing !== 'string' || typeof parsed.toolCallId !== 'string') return undefined;
    return { standing: parsed.standing, toolCallId: parsed.toolCallId };
  } catch {
    return undefined;
  }
}

