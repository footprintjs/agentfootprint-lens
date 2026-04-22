# agentfootprint-lens

> **See the context engineering as it happens.**
>
> React components for watching agents built on [`agentfootprint`](https://www.npmjs.com/package/agentfootprint). Every injection into the Agent's slots (RAG, Memory, Skills, Instructions, Tools) is tagged inline — students and engineers see exactly what was put into the prompt, by whom, on which iteration. No hidden abstractions.

---

### The pitch

agentfootprint = **2 primitives (LLM, Agent) + 3 compositions (Sequence, Parallel, Conditional) + N patterns (ReAct, Reflexion, Tree-of-Thoughts...) + cross-cutting context engineering.** Lens is the surface that makes the context engineering visible — not as a "RAG view" or a "Memory view," but as tagged injections inside the ONE Agent card. That's the whole pedagogy.

[![npm version](https://img.shields.io/npm/v/agentfootprint-lens.svg)](https://www.npmjs.com/package/agentfootprint-lens)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## 30-second quick start

```bash
npm install agentfootprint agentfootprint-lens
```

```tsx
import { Agent, anthropic } from 'agentfootprint';
import { Lens, useLens } from 'agentfootprint-lens';

export function App() {
  const agent = useLens(() =>
    Agent.create({ provider: anthropic('claude-sonnet-4') })
      .system('You are a helpful assistant.')
      .build()
  );

  return (
    <>
      <button onClick={() => agent.run('Hello!')}>Run</button>
      <Lens for={agent} />
    </>
  );
}
```

That's it. Two lines — `useLens(...)` + `<Lens for={agent} />` — and you get:

- A live **Messages** view (everything the LLM saw and said, per turn)
- An **Iteration Strip** (one cell per LLM call, tool call, or decision — scrubbable)
- A **Tool Call Inspector** (args, result, timing for the currently selected step)
- A **Decision Scope Ribbon** (which skill / decision rule was active)
- An **Explainable Trace** tab (the full footprintjs stage-level view)

No event wiring, no timeline prop, no snapshot prop. Lens figures it out by watching the runner directly.

---

## What you actually see

As the agent runs, the three columns of Lens fill in live:

| Column | Shows |
|---|---|
| **Messages** | The conversation from the agent's perspective — system prompt, user turns, assistant replies, tool results |
| **Iteration Strip** | One row per ReAct loop iteration. Each row lists the LLM call that ran it, the tool calls it picked, and the time each took |
| **Context** | Whichever iteration or tool call is selected — shows the exact prompt the LLM saw, the tools it had available, and what it returned |

When the run finishes, the second tab (**Explainable Trace**) lights up with the full stage-level flowchart — same surface `footprint-explainable-ui` ships, zero extra wiring.

---

## Multiple watchers, one agent

`Lens` doesn't own the agent. Anything can observe it — a Lens, a Datadog exporter, a custom logger, or three of them at once.

```tsx
const agent = useLens(() => Agent.create(...).build());

// Lens in the sidebar
<Lens for={agent} />

// At the same time — ship events to your telemetry backend
useEffect(() => {
  const stop = agent.observe((event) => {
    if (event.type === 'llm_end') {
      telemetry.record('llm.tokens', event.usage?.totalTokens);
    }
  });
  return stop;   // auto-unsubscribe on unmount
}, [agent]);
```

`agent.observe(handler)` is the single subscribe primitive. It returns a `() => void` unsubscribe function. Add as many observers as you want.

Event shape:

```ts
type AgentEvent =
  | { type: 'turn_start';  userMessage: string }
  | { type: 'llm_start';   iteration: number }
  | { type: 'llm_end';     iteration: number; content: string; toolCallCount: number; usage?: TokenUsage; latencyMs: number }
  | { type: 'tool_start';  toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end';    toolName: string; result: { content: string }; latencyMs: number }
  | { type: 'token';       content: string }                        // streaming
  | { type: 'turn_end';    content: string; iterations: number };
```

---

## Works with every agentfootprint runner

`<Lens for={...}>` accepts any agentfootprint runner — the same prop works for all of them, and they all light up Lens identically:

```tsx
// Agent — a ReAct loop
const agent = useLens(() => Agent.create(...).build());

// LLMCall — a single prompt-in, response-out
const caller = useLens(() => LLMCall.create(...).build());

// RAG — retrieve + augment + answer
const rag = useLens(() => RAG.create(...).retriever(...).build());

// Swarm — LLM-routed specialists
const swarm = useLens(() => Swarm.create(...).build());

// ...same pattern for FlowChart, Parallel, Conditional

<Lens for={caller} />   // pick whichever
```

One mental model. The runner does the work; Lens watches.

---

## Theming

Lens inherits from `footprint-explainable-ui`'s theme system. Two built-in presets, or bring your own:

```tsx
import { coolDark, coolLight } from 'footprint-explainable-ui';
import { Lens } from 'agentfootprint-lens';

<Lens for={agent} theme={isDark ? coolDark : coolLight} />
```

Pass any `ThemeTokens` object. CSS vars work too — handy if your app already flips theme at the `:root` level:

```tsx
<Lens
  for={agent}
  theme={{
    colors: {
      bgPrimary: 'var(--my-bg)',
      textPrimary: 'var(--my-fg)',
      // …
    },
  }}
/>
```

---

## Responsive

Lens resizes to whatever space you give it. Below ~640px wide it stacks panels vertically (like `<ExplainableShell>` does). Drop it in a splitter, a drawer, or a full-screen tab — no config needed.

---

## Escape hatches

If you want to manage the timeline yourself (custom ingestion, recording to a file, replaying a stored run), the explicit path is still available:

```tsx
import { Lens, useLiveTimeline } from 'agentfootprint-lens';

const lens = useLiveTimeline();

// You control ingestion
for (const event of storedEvents) lens.ingest(event);

<Lens
  timeline={lens.timeline}
  runtimeSnapshot={storedSnapshot}
/>
```

---

## Recorder pattern (power users)

For advanced observability — multiple exporters, buffering, filtering before dispatch — agentfootprint's recorder system is still there:

```ts
import { createStreamEventRecorder } from 'agentfootprint';

const myRec = createStreamEventRecorder(myHandler, 'my-telemetry');
const agent = Agent.create(...).recorder(myRec).build();
```

`<Lens for={...}>` is just sugar over this internally — the recorder you'd write for Datadog is the same shape Lens uses.

---

## API reference

### `useLens(factory)`

Memoizes a runner across renders. Call `factory` exactly once on mount; reuses the same instance forever. Works for any agentfootprint runner — `Agent`, `LLMCall`, `RAG`, `Swarm`, `FlowChart`, `Parallel`, `Conditional`.

```ts
const agent  = useLens(() => Agent.create(...).build());
const caller = useLens(() => LLMCall.create(...).build());
const rag    = useLens(() => RAG.create(...).build());
```

### `<Lens for={runner} />`

The one-prop integration. Subscribes to the runner's events, watches its snapshot, renders both tabs.

| Prop | Type | Description |
|---|---|---|
| `for` | `Runner` (any agentfootprint runner) | The agent / caller / swarm / etc. to watch. |
| `theme` | `ThemeTokens?` | Optional — defaults to `coolDark`. |
| `appName` | `string?` | Optional brand label in the tab strip. |

### `runner.observe(handler)`

Subscribe to live events. Returns `() => void` (unsubscribe).

```ts
const stop = agent.observe((event) => { /* ... */ });
// later:
stop();
```

### `runner.getSnapshot()`, `runner.getNarrativeEntries()`, `runner.getSpec()`

The standard agentfootprint introspection methods. `<Lens for={...}>` reads these automatically. You only call them yourself if you're building a custom UI.

### `useLiveTimeline()` (escape hatch)

Returns `{ timeline, ingest, startTurn, reset, builder }`. Use when you want to feed Lens from a non-runner source (replayed logs, server-sent events, etc.).

---

## Why this design

**The runner is the single source of truth.** Agents fire events as they work. Lens subscribes to those events. Telemetry exporters subscribe to those events. CLI loggers subscribe to those events. Nobody owns the runner; everyone can watch it.

This is the observer pattern, applied consistently across every agentfootprint runner. The outcome:

- **One line to integrate** — `<Lens for={agent} />`
- **Zero coupling** — the agent doesn't know Lens exists
- **Composable** — Lens + your telemetry + your logger all watch the same agent with no conflict
- **Uniform** — any runner works with any observer

---

## License

MIT
