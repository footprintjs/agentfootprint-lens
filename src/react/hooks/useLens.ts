/**
 * useLens — memoize a runner factory across renders.
 *
 * A runner (built from `Agent.create(...).build()`, `LLMCall.create(...).build()`,
 * `RAG.create(...).build()`, and so on) carries state: conversation history,
 * observer list, last snapshot. React's default re-render semantics would
 * rebuild it on every render and blow that state away. `useLens` holds a
 * single instance for the life of the component — `factory()` runs exactly
 * once on mount.
 *
 * Pair with `<Lens for={...} />` — the component subscribes to the runner's
 * event stream and watches its snapshot, so consumers write just:
 *
 *     const agent = useLens(() => Agent.create(...).build());
 *     <Lens for={agent} />
 *
 * Works for every agentfootprint runner (Agent, LLMCall, RAG, Swarm,
 * FlowChart, Parallel, Conditional). The hook is runner-shape agnostic —
 * it just holds whatever your factory returns.
 */
import { useRef } from "react";

export function useLens<T>(factory: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = factory();
  }
  return ref.current;
}
