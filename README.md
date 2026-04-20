# agentfootprint-lens

> **See through your agent's decisions.**
>
> React components for debugging agents built on [`agentfootprint`](https://www.npmjs.com/package/agentfootprint): messages, prompt composition, tool calls, decision scope, and cost — in one scrub-able timeline.

[![npm version](https://img.shields.io/npm/v/agentfootprint-lens.svg)](https://www.npmjs.com/package/agentfootprint-lens)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## Why this exists

`footprint-explainable-ui` is the debugger for **pipelines** — stages, flowchart topology, commit log, data lineage. It's perfect for the person writing a footprintjs tool.

But an **agent** isn't a pipeline — it's a loop of (LLM call → parse → tool calls → repeat), steered by a decision scope and gated by skills. The questions an agent developer asks are different:

- "What prompt did the LLM actually see at iter 4?"
- "Why did the agent pick **this** tool over that one?"
- "Which skill was active when it went sideways?"
- "How many tokens did this turn cost me?"
- "What changed between turn 1 and the follow-up?"

**Lens** answers those. It reads `agent.getSnapshot()`, parses it into an agent-shaped timeline, and renders the agent-native surfaces:

1. **Messages Panel** — chat bubbles with expandable tool-call cards, turn boundaries, iteration markers.
2. **Iteration Strip** — horizontal ribbon of every LLM call in the run. Click to jump.
3. **Tool Call Inspector** — flat sidebar of every tool invocation across all turns.

(phase-2: Prompt Composer, Decision Scope Ribbon, Cost & Latency Attribution.)

For tool-internal debugging (what did this tool's footprintjs flowchart actually do?), Lens composes [`footprint-explainable-ui`](https://www.npmjs.com/package/footprint-explainable-ui) as a drill-in drawer. The two libraries are siblings, not competitors.

---

## Install

```bash
npm install agentfootprint-lens footprint-explainable-ui
```

Peer deps: React 18+, `footprint-explainable-ui@^0.18.0`.

---

## Quick start

```tsx
import { AgentLens } from 'agentfootprint-lens';
import { FootprintTheme, coolDark, coolLight } from 'footprint-explainable-ui';
import { Agent, anthropic } from 'agentfootprint';
import { useState, useEffect } from 'react';

export function MyApp() {
  const [dark, setDark] = useState(true);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const agent = Agent.create({ provider: anthropic('claude-haiku-4-5') })
      .system('You are a helpful agent.')
      .build();
    agent.run('What time is it?').then(() => setSnapshot(agent.getSnapshot()));
  }, []);

  return (
    <FootprintTheme tokens={dark ? coolDark : coolLight}>
      <div style={{ height: '100vh' }}>
        <AgentLens runtimeSnapshot={snapshot} />
      </div>
    </FootprintTheme>
  );
}
```

That's it. Lens reads the same `FootprintTheme` context explainable-ui reads, so **the consumer owns theming** — flip `coolDark` ↔ `coolLight` at the app root and both the agent view (Lens) and any drill-in trace view (explainable-ui) follow together.

---

## Composition: drill-in to a tool's flowchart

Each tool in agentfootprint is typically a `flowChart<State>` underneath. When a user wants to debug *what that tool did internally*, open an explainable-ui drawer:

```tsx
import { AgentLens, type AgentToolInvocation } from 'agentfootprint-lens';
import { ExplainableShell } from 'footprint-explainable-ui';

function Shell({ snapshot }) {
  const [selected, setSelected] = useState<AgentToolInvocation | null>(null);
  return (
    <>
      <AgentLens runtimeSnapshot={snapshot} onToolCallClick={setSelected} />
      {selected && (
        <Drawer onClose={() => setSelected(null)}>
          <ExplainableShell
            runtimeSnapshot={extractToolSubSnapshot(snapshot, selected.id)}
            title={`${selected.name} · internals`}
          />
        </Drawer>
      )}
    </>
  );
}
```

Lens says "this is what the agent did." explainable-ui says "this is what each tool's flowchart did." Clean separation, no duplication.

---

## API surface

### `<AgentLens>` — the one-stop shell

```tsx
<AgentLens
  runtimeSnapshot={agent.getSnapshot()}
  onToolCallClick={(invocation) => /* open drill-in */}
/>
```

Props:
- `runtimeSnapshot` (any | null) — raw output of `agent.getSnapshot()`. Null renders an empty state.
- `timeline` (`AgentTimeline`) — pre-parsed timeline, overrides `runtimeSnapshot`. Useful for sharing across multiple Lens instances.
- `systemPrompt` (string) — override the system-prompt preview in MessagesPanel. Auto-derived from snapshot otherwise.
- `onToolCallClick` ((`AgentToolInvocation`) => void) — fires when any tool-call card is clicked.

### Individual panels (composable)

- `<MessagesPanel timeline onToolCallClick systemPrompt />`
- `<IterationStrip timeline selectedKey onSelect />`
- `<ToolCallInspector timeline selectedId onSelect />`

### Adapter

- `fromAgentSnapshot(runtimeSnapshot) → AgentTimeline` — pure function. Useful for non-UI consumers (eval scripts, exporters).

### Theme

Lens reads `useFootprintTheme()` (from explainable-ui). Wrap your tree in `<FootprintTheme tokens={...}>` and Lens follows. No Lens-specific theme API.

---

## Data model

`AgentTimeline` is what Lens renders against. `fromAgentSnapshot` derives it from the raw runtime snapshot:

```ts
interface AgentTimeline {
  turns: AgentTurn[];               // one per agent.run() call
  messages: AgentMessage[];         // full flat conversation
  tools: AgentToolInvocation[];     // every tool call, across turns
  finalDecision: Record<string, unknown>;
  rawSnapshot: unknown;             // escape hatch
}

interface AgentTurn {
  index: number;
  userPrompt: string;
  iterations: AgentIteration[];
  finalContent: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

interface AgentIteration {
  index: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  stopReason?: string;
  assistantContent: string;
  toolCalls: AgentToolInvocation[];
  decisionAtStart: Record<string, unknown>;
  matchedInstructions?: string[];
  visibleTools: string[];            // tool names visible to the LLM that iter
}

interface AgentToolInvocation {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  error?: boolean;
  decisionUpdate?: Record<string, unknown>;
  iterationIndex: number;
  turnIndex: number;
  durationMs?: number;
}
```

---

## Roadmap

### v0.1 (shipped)
- `<AgentLens>` shell + MessagesPanel + IterationStrip + ToolCallInspector
- Theme pass-through via FootprintTheme
- `fromAgentSnapshot` adapter

### v0.2 — "why did the LLM decide that"
- **Prompt Composer** — assembled system prompt per iteration with diff-across-iterations highlighting (base + skill body + instruction injections + message window + tool list).
- **Decision Scope Ribbon** — horizontal pill timeline of decision scope fields; arrows back to the tool call that wrote each via `decisionUpdate`.

### v0.3 — "is it shippable"
- **Cost & Latency Attribution** — token burn curve, per-iter/per-tool breakdown, pluggable price table.
- **Skill Dock** — loaded skills, activation state, tools-per-skill.

### v1.0 — "Lens v1"
- Trace compare (two runs side-by-side)
- Eval grid (batch runs → pass/fail matrix)
- Exportable / importable traces via `TraceViewer` from explainable-ui

---

## Design decisions

- **Separate package, not a fork of explainable-ui.** Different audience (agent devs vs. pipeline/tool devs), different mental model (conversation loop vs. data-flow graph), different failure modes. Overloading explainable-ui would muddy both.
- **Theme via FootprintTheme context, not a Lens-specific prop.** One source of truth; automatic propagation to the drill-in drawer; consumers don't learn two theme APIs.
- **Adapter at the boundary.** `fromAgentSnapshot` is the single data-shape conversion. Panels render against the derived `AgentTimeline`, so agentfootprint's internal snapshot shape can evolve without breaking Lens.
- **No new agentfootprint library changes required to use Lens.** Every field Lens needs is already emitted today (messages, commitLog, recorder snapshots, emit events).

---

## License

MIT © Sanjay Krishna Anbalagan
