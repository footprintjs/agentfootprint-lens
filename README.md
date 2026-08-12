# Why Lens

<sub>npm package: <a href="https://www.npmjs.com/package/agentfootprint-lens"><code>agentfootprint-lens</code></a></sub>

**grouped by what matters: pinpoint why this answer**

_Part of the **[footprintjs ecosystem](https://footprintjs.github.io/)** — the self-explaining stack._

_One causal trace. Replay it as every step ([**Flow Lens**](https://github.com/footprintjs/explainable-ui)), grouped steps (**Why Lens**), or the story ([**Story Lens**](https://github.com/footprintjs/agentThinkingUI))._

> **See the context engineering as it happens.**
>
> **Why Lens** is the grouped view of a causal trace: React components for watching agents built on [`agentfootprint`](https://www.npmjs.com/package/agentfootprint). Every injection into the Agent's slots (RAG, Memory, Skills, Instructions, Tools) is tagged inline — students and engineers see exactly what was put into the prompt, by whom, on which iteration. No hidden abstractions.

---

### The pitch

agentfootprint = **2 primitives (LLM, Agent) + 3 compositions (Sequence, Parallel, Conditional) + N patterns (ReAct, Reflexion, Tree-of-Thoughts...) + cross-cutting context engineering.** Why Lens is the surface that makes the context engineering visible — not as a "RAG view" or a "Memory view," but as tagged injections inside the ONE Agent card. That's the whole pedagogy.

[![npm version](https://img.shields.io/npm/v/agentfootprint-lens.svg)](https://www.npmjs.com/package/agentfootprint-lens)
<!-- coverage-badge --><img src="https://img.shields.io/badge/coverage-88%25-green.svg" alt="coverage: 88%"><!-- /coverage-badge -->
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## 30-second quick start

```bash
npm install agentfootprint agentfootprint-lens
```

```tsx
import { useMemo } from 'react';
import { Agent } from 'agentfootprint';
import { mock } from 'agentfootprint/llm-providers';
import { Lens, lensRecorder } from 'agentfootprint-lens';

export function App() {
  // Build the agent and the recorder once, and point the recorder at it.
  const { agent, recorder } = useMemo(() => {
    const agent = Agent.create({ provider: mock({ reply: 'Hi!' }), model: 'mock' })
      .system('You are a helpful assistant.')
      .build();
    const recorder = lensRecorder();
    recorder.observe(agent);
    return { agent, recorder };
  }, []);

  return (
    <>
      <button onClick={() => agent.run({ message: 'Hello!' })}>Run</button>
      <Lens recorder={recorder} runner={agent} />
    </>
  );
}
```

Three lines of wiring — `lensRecorder()`, `recorder.observe(agent)`, `<Lens recorder runner />`.

- `recorder` is what Lens READS: the event log, the run tree, the summary.
- `runner` is what Lens DRAWS: the composition chart, read from
  `runner.getSpec().buildTimeStructure`. Pass it and the whole chart is visible
  from t=0; leave it out and Lens says so instead of drawing an empty box.

Swap `mock(...)` for `anthropic(...)` / `openai(...)` / `ollama(...)` from
`agentfootprint/llm-providers` — nothing else changes.

---

## What you actually see

The default view (`view="engineer"`) is one screen:

| Region | Shows |
|---|---|
| **Summary + transport** (top) | status · latency · LLM/tool calls · tokens, and ◀ ▶ ⟳Live with the clickable step strip |
| **Agents** (left, when a run has 2+) | every Agent / LLMCall instance in the run — click to jump to it |
| **The chart** (centre) | the composition that ran, lit up as the cursor moves. Click a box to drill into it |
| **What happened** (right) | the moment-by-moment rail — click any moment to move the one cursor; the focused moment expands to the full detail (prompt, tool args, result, written keys, **Where did this come from?**) |
| **Events** (bottom) | the raw typed event stream |

Two other audiences are one prop away: `view="analyst"` (summary + humanized
commentary) and `view="user"` (status line + final answer).

Lens watches agentfootprint's typed event stream — `agentfootprint.agent.*`,
`agentfootprint.stream.*` (`llm_start` / `token` / `tool_start` / …),
`agentfootprint.context.injected`, `agentfootprint.composition.*` and the rest
of the 65-type registry. You never wire events yourself; `recorder.observe()`
subscribes to all of them.

---

## Multiple watchers, one agent

Lens doesn't own the agent. Anything can watch it — a Lens, a telemetry
exporter, a custom logger, or three at once.

```ts
// Lens in the sidebar
<Lens recorder={recorder} runner={agent} />

// At the same time — ship events to your telemetry backend
useEffect(() => {
  const stop = agent.on('agentfootprint.stream.llm_end', (event) => {
    telemetry.record('llm.tokens', event.payload.usage.input + event.payload.usage.output);
  });
  return stop;   // auto-unsubscribe on unmount
}, [agent]);
```

`runner.on(type, handler)` is the single subscribe primitive. It returns a
`() => void` unsubscribe. Subscribe to one type, a domain wildcard
(`'agentfootprint.context.*'`), or `'*'` for everything.

---

## Works with every agentfootprint runner

The same two props work for all of them:

```tsx
const caller = LLMCall.create({ provider, model }).build();          // one prompt in, one answer out
const agent  = Agent.create({ provider, model }).build();            // a ReAct loop
const chain  = Sequence.create({ name: 'Chain' })                    // …and Parallel / Conditional / Loop
  .step('draft', caller)
  .step('review', agent)
  .build();

const recorder = lensRecorder();
recorder.observe(caller);

<Lens recorder={recorder} runner={caller} />
```

One mental model. The runner does the work; Lens watches.

---

## Watching a run that already finished

A recording is a run you kept. It is exactly THREE things — miss one and one
surface goes dark, so save all three together.

### Step 1 — record it (in the app that runs the agent)

```ts
const events = [];
runner.on('*', (e) => events.push(e));

await runner.run({ message });

const recording = {
  events,                                          // 1. the timeline
  snapshot:  runner.getLastSnapshot(),             // 2. state + commit log + every recorder's data
  structure: runner.getSpec().buildTimeStructure,  // 3. THE CHART. Nothing else can draw it.
};
fs.writeFileSync('run.json', JSON.stringify(recording));
```

`structure` is the one piece a run does not leave behind on its own —
`getSnapshot()` never includes it — which is why so many stored runs replay
without a chart.

### Step 2 — render it

```tsx
import { useMemo } from 'react';
import { observeRecording, Lens } from 'agentfootprint-lens';

// One call = one replay: it builds a recorder and walks the whole event log.
// Keep it out of the render body.
const observed = useMemo(() => observeRecording(recording), [recording]);

return <Lens recorder={observed.recorder} runner={observed.runner} />;
```

Nothing re-runs, no model is called, no network is touched. Anything the
recording could not give back, Lens states on screen — you do not have to
render the return values yourself.

| piece | where it comes from | what it buys |
|---|---|---|
| `events` | `runner.on('*', …)` collected during the run | the messages, the moments rail, the commentary, the summary |
| `snapshot` | the run's footprintjs `getSnapshot()` | the commit axis, `<WhereFrom>`'s provenance, and every attached recorder's data |
| `structure` | `runner.getSpec().buildTimeStructure` | the chart — the composition that actually ran |

Recordings frozen as `{ snapshot, events, blueprint }` work as-is: `blueprint`
is read when `structure` is absent.

**The step strip needs one more thing at RECORD time:** attach agentfootprint's
`boundaryRecorder` (with commit tracking) while the run happens. Its snapshot
entry stamps every subflow entry/exit with the commit index it crossed at, and
that is what the strip is indexed by. A recording without it is still fully
watchable — the strip stays quiet and says so. Lens will not guess the ranges
from the commit log: the log cannot say *when* a boundary opened (a fork's
branches all open at a moment it has no row for), and guessing produced 20 stops
on a run that had 17.

`observeRecording` also returns the counts, for code that wants to check before
rendering: `chart` (`'drawn' | 'absent'`), `eventsReplayed`, `eventsSkipped`,
`boundaryEvents`, `boundaryRanges`, and `notes` — one line per thing the
recording carried that could not be READ, as opposed to was not there.

### Replaying a `Trace`

agentfootprint's `enable.localObservability().getTrace()` produces a `Trace` —
a different transport for the same idea. `<Replay trace={trace} />` adapts it
onto the same path:

```tsx
import { Replay } from 'agentfootprint-lens';

const trace = JSON.parse(await fs.readFile('run.trace.json', 'utf8'));
<Replay trace={trace} />
```

A `Trace` carries the boundary log rather than the typed event log, so it
replays as chart + step strip + detail, with the commentary rail quiet — and
Lens says so. For the full surface, record `{ snapshot, events, structure }` and
use `observeRecording`.

---

## Report a bug with this run

A bug report about an agent is only worth reading with the run attached. A run
carries prompts, tool arguments and retrieved documents — which is exactly why
nobody should send one without seeing it first.

`<BugReportButton>` puts the consent step in the way. Clicking it opens a dialog
that shows every selectable unit of evidence — one row per conversation, one per
derived file — with its size, its event and turn counts, and the names of every
state key that was already scrubbed. The reporter's own account (title, steps,
expected, actual) is in the same dialog, because a report missing either half is
not one. Nothing leaves until a person ticks it.

The evidence itself is agentfootprint's (9.9.0 or newer): `describeBugReport`
measures the run, `exportBugReport` bundles the units that were kept. Lens
renders the offer and hands the ids back — it never assembles a bundle and never
decides what a unit is.

```tsx
import { BugReportButton } from 'agentfootprint-lens';

// The whole integration. `source` is whatever this Lens is already showing.
<BugReportButton
  source={recording}                                // or a recordRun() handle, a Runner, or an array
  issuesUrl="https://github.com/acme/agent/issues"  // owner + repo are read from this
  labels={['bug', 'from-lens']}
/>;
```

### What the reporter sees

- **The consent manifest** — one checkbox per unit. The **3 most recent
  conversations** start ticked, older ones do not (`defaultRecentConversations`
  changes the number). Derived files — the readable transcript, the narrative,
  the environment block — are rebuilt over the conversations that survive, so
  unticking a conversation takes it out of those too.
- **A live size meter** — `12.4 MB of 24.0 MB`, recomputed on every toggle. Over
  the ceiling it turns red, submit is refused, and it names what to do about it:
  *"Untick conv-3 (20.0 MB) to fit."* The number is an estimate and says so — the
  derived files shrink as conversations come out, so the real zip is that size or
  smaller.
- **The redacted keys, by name.** footprintjs scrubbed the values upstream at
  commit time; the manifest can therefore say *which* secrets were protected
  without ever carrying one.

### The three submit modes

They stack by what you configured. The first is always there, so the button is
never a dead end, and a mode you did not configure is simply not offered —
nothing fails at click time.

| mode | needs | who the issue is from | where the zip goes |
|---|---|---|---|
| **Copy report + download zip** | nothing | the reporter, by hand | their machine |
| **Sign in with GitHub** | `deviceClientId` | the reporter, as themselves | their machine, attached by hand |
| **File automatically** | `endpoint` | your application | wherever your relay puts it |

**(a) Copy + download** copies the composed issue body to the clipboard, saves
the evidence zip, and opens the repo's new-issue form prefilled. A body too long
for a URL is cut at a line break with a sentence pointing at the clipboard,
never silently shortened.

**(b) Sign in with GitHub** runs the OAuth **device flow** inside the dialog:
Lens shows the user code and the verification link, GitHub polls in the
background, and on approval the issue is filed from the browser as *that person*
— so a maintainer can ask them a follow-up.

```tsx
<BugReportButton
  source={recording}
  issuesUrl="https://github.com/acme/agent/issues"
  deviceClientId="Iv1.0123456789abcdef"   // an OAuth App with Device Flow enabled
/>;
```

The client id is public by design (the device flow has no client secret). The
token it yields is not: Lens holds it in memory for the life of the modal and
drops it — never `localStorage`, never a cookie, never a log line, never the
issue body. Signing in does not give Lens anywhere to push the zip, so the zip
downloads to the reporter's machine and the issue says plainly that it must be
attached by hand.

**(c) File automatically** POSTs the finished bundle to your own endpoint, which
holds the token and files the report with `githubBugReporter`. One click for the
reporter; nothing about your repository lives in the browser.

```tsx
<BugReportButton source={recording} issuesUrl={ISSUES} endpoint="/api/bug-report" />;
```

```ts
// The server side, in full. The browser already built the bundle — the relay
// only holds the credential.
import { githubBugReporter } from 'agentfootprint/observe';

const reporter = githubBugReporter({ issueRepo: 'acme/agent' }); // token: GITHUB_TOKEN

app.post('/api/bug-report', async (req, res) => {
  const { manifest, filename, zipBase64 } = req.body; // kind: 'agentfootprint-lens.bug-report'
  const zip = Buffer.from(zipBase64, 'base64');
  res.json(await reporter.file({ manifest, files: [], zip, filename }));
});
```

The response Lens renders is `{ issueUrl, zipUrl }`; anything else — a non-2xx,
an `error` string — is shown to the reporter exactly as the server wrote it.
That is the rule for every failure in this flow: agentfootprint's refusals teach
what to do next, so they are rendered verbatim rather than paraphrased.

### On an older agentfootprint

The substrate shipped in agentfootprint 9.9.0. On 7.x or 8.x the button does not
render at all — a one-line hint says which version it needs. Lens will not send
a run it cannot measure first.

### Props

| prop | | |
|---|---|---|
| `source` | required | a `Recording`, a `recordRun()` handle, a `Runner`, or an array of them |
| `issuesUrl` | required | `https://github.com/OWNER/REPO/issues` — owner, repo and API root are read from it (GitHub Enterprise Server works unchanged) |
| `endpoint` | | your relay URL — offers "File automatically" |
| `deviceClientId` | | OAuth App client id — offers "Sign in with GitHub" |
| `labels` | | labels applied to the issue |
| `defaultRecentConversations` | `3` | how many of the most recent conversations start ticked |
| `maxBytes` | 24 MB | the ceiling the meter measures against |
| `appVersion` | | your app's version, for the environment block |
| `label` | | the button's own text |
| `api` | | the agentfootprint functions to call — defaults to the installed ones |

The headless half is on `agentfootprint-lens/core` — `defaultSelection`,
`measureSelection`, `trimHintFor`, `buildIssueBody`, `buildNewIssueUrl`,
`parseGithubRepo` — so a CLI or a Vue shell can build the same dialog.

---

## Theming

**Lens inherits theme tokens from your app via CSS variables.** Set `--fp-*`
(the same names `footprint-explainable-ui` uses) on any parent and Lens picks
them up — no `theme=` prop needed, no flash of unstyled content on a theme
switch. Lens's stylesheet ships with the library and injects itself; there is
no CSS file to import.

### The one-line switch

```tsx
<Lens recorder={recorder} runner={agent} theme={{ mode: 'light' }} />
```

`mode` applies eui's full light/dark preset at the Lens root — so the chart, the
panels, the edge colours and the injection-source chips all follow, in all three
views, from that one word.

### The token contract — set these on `:root` (or any parent of `<Lens>`)

```css
:root {
  /* Surfaces */
  --fp-bg-primary:   #0f172a;
  --fp-bg-secondary: #1e293b;
  --fp-bg-tertiary:  #334155;
  --fp-bg-elevated:  #1e293b;   /* the card fill behind Lens's own panels */

  /* Text */
  --fp-text-primary:   #f8fafc;
  --fp-text-secondary: #94a3b8;
  --fp-text-muted:     #64748b;

  /* Border */
  --fp-border: #334155;

  /* Accent / state */
  --fp-color-primary: #6366f1;
  --fp-color-success: #22c55e;
  --fp-color-error:   #ef4444;
  --fp-color-warning: #f59e0b;
}
```

Resolution order per token: **`--lens-X` → `--fp-X` → hardcoded fallback**. So
Lens-specific overrides win over shared `--fp-*` design tokens, which win over
the built-in defaults. `theme={{ mode }}` writes into the `--fp-*` tier only —
your `--lens-*` still wins.

### Lens-only overrides

```css
.my-lens-container {
  --lens-bg-primary:      #0a0e1a;   /* darker than the app */
  --lens-color-primary:   #f59e0b;   /* amber accent for Lens chips */
  --lens-edge-decision:   #ec4899;   /* decision arrows in the graph */
  --lens-src-skill:       #7c3aed;   /* skill-injection chip */
  --lens-agent-color-0:   #22d3ee;   /* first agent's swatch in the legend */
}
```

Every token has a built-in value, so nothing is ever unpainted. See
`src/react/theme/tokens.ts` for the full list (surfaces / text / border /
accent / 4 edge kinds / 7 injection-source chips / 8 agent swatches /
typography), all of it exported as `T`, `RAW_DEFAULTS`, `AGENT_COLORS` and
`MODE_PALETTES`.

### Server rendering

`LENS_STYLESHEET` is the stylesheet as a string — put it in your own `<style>`
if a strict CSP blocks the automatic injection.

---

## Responsive

Lens resizes to whatever space you give it. Below ~640px wide it stacks panels
vertically (like `<ExplainableShell>` does). Drop it in a splitter, a drawer, or
a full-screen tab — no config needed.

---

## API reference

### `lensRecorder(rootLabel?, options?)`

Builds a `LensRecorder`. `options.maxEvents` caps the event log (default 50 000,
oldest evicted, counted in `getDiagnostics().droppedEvents` — never silent);
`options.debug` forces the dev-mode console diagnostics on or off.

### `recorder.observe(runner)`

Subscribe to a runner's typed dispatcher, its recorder channel and its step
graph in one call. Returns an unsubscribe. Call it once per run.

### `<Lens>`

| Prop | Type | Description |
|---|---|---|
| `recorder` | `LensRecorder` | **Required.** What Lens reads. |
| `runner` | `Runner?` | The runner (or `observeRecording`'s) whose build-time structure Lens draws. Omit and the chart region says what is missing. |
| `theme` | `LensTheme?` | `{ mode?: 'dark' \| 'light', ground?, visited?, current? }`. |
| `view` | `'engineer' \| 'analyst' \| 'user'` | Default `'engineer'`. |
| `stepStrip` | `boolean?` | Show the clickable step strip. Default `true`. |
| `showSummary` | `boolean?` | Show the status/metrics bar. Default `true`. |
| `appName` | `string?` | The name used as the active actor in every commentary line. Default `'Chatbot'`. |
| `humanizer` | `Humanizer?` | Override the commentary function entirely. |
| `commentaryTemplates` | `Partial<CommentaryTemplates>?` | Override individual lines (locale, brand voice). |
| `chart` | `LensFlowProps['chart']?` | Render YOUR graph instead of the derived one. |
| `stepGraph` | `StepGraph?` | Bring your own step graph; by default Lens uses the recorder's. |
| `toolChoice` | `ToolChoiceSource?` | Mount the per-iteration tool-choice panel. |

### `observeRecording(recording, options?)`

The offline twin of `recorder.observe(runner)`. Takes
`{ snapshot, events, structure }` (or `blueprint`) — whatever the recording
carries — and returns `{ recorder, runner, chart, eventsReplayed, eventsSkipped,
boundaryEvents, boundaryRanges, notes }`. Hand `recorder` and `runner` straight
to `<Lens>`. See
[Watching a run that already finished](#watching-a-run-that-already-finished).

### `<Replay trace={trace} />`

The `Trace`-shaped door into the same replay path. See
[Replaying a `Trace`](#replaying-a-trace).

### `structureGraphFromRunner(runner)` / `structureGraphFromSpec(structure)`

The runner → chart adapter, exported from `agentfootprint-lens/core`. It walks a
footprintjs build-time spec into an `explainable-ui` `TraceGraph` whose node ids
ARE the real runtime stage ids, so a runtime overlay lights the executed path.
`<Lens runner>` calls it for you; call it yourself to render the chart in your
own shell, or to feed `<ExplainableShell traceGraph={…} />`:

```ts
import { structureGraphFromSpec } from 'agentfootprint-lens/core';

const graph = structureGraphFromSpec(recording.structure);
```

`structureGraphFromRunner(runner)` is the same builder from a live runner.

### `<WhereFrom>` — walk any value's causes on the one cursor

In the engineer view's detail panel, the cursor stage's written keys render as
chips; picking one shows the backward slice that produced its value (footprintjs
`sliceForKey` — the same query the `backtrack` LLM tool runs). **◀ Walk the
causes** freezes that slice as reverse-time stops and steps the ONE cursor
through them ("◀ earlier cause / toward result ▶") — both parents of a fork are
always visited, the chart cone follows the walk, and **[Copy story]** emits the
exact `formatSlice` text the LLM tool returns. Honest absence stays honest:
"never written — initial state / args / a closure", and reads-off runs say
"unknowable, not absent".

### `<BugReportButton>` — report a bug with the run attached, consent first

A small button for a debug UI. The dialog it opens shows every selectable unit
of evidence with its size and counts, meters the selection live against a 24 MB
ceiling (naming the unit to untick when it is over), and offers whichever of the
three submit modes you configured — copy + download, sign in with GitHub, or
file through your own endpoint. Needs agentfootprint 9.9+; on anything older it
renders a version hint instead of itself. See
[Report a bug with this run](#report-a-bug-with-this-run).

### Headless core

`agentfootprint-lens/core` is React-free: `LensRecorder`, `ChangeNotifier`,
`observeRecording`, the selectors and the graph adapters. Build a Vue / Angular
/ CLI view on the same primitives — see `ChangeNotifier`'s JSDoc for adapter
snippets.

---

## Why this design

**The runner is the single source of truth.** Agents fire events as they work.
Lens subscribes to those events. Telemetry exporters subscribe to those events.
CLI loggers subscribe to those events. Nobody owns the runner; everyone can
watch it.

- **Three lines to integrate** — `lensRecorder()` + `observe()` + `<Lens>`
- **Zero coupling** — the agent doesn't know Lens exists
- **Composable** — Lens + your telemetry + your logger all watch the same agent
- **Uniform** — any runner works with any observer, live or replayed

---

## The footprintjs ecosystem

The self-explaining stack — from backend pipelines to AI agents. → **[overview](https://footprintjs.github.io/)**

| Project | Role |
|---|---|
| [footprintjs](https://footprintjs.github.io/footPrint/) | the flowchart pattern (core engine) |
| [agentfootprint](https://footprintjs.github.io/agentfootprint/) | build self-explaining AI agents |
| [Explainable UI](https://footprintjs.github.io/explainable-ui/) | visualize a footprintjs run |
| **Lens** ← you are here | debug an agentfootprint run |
| [Thinking UI](https://footprintjs.github.io/agentThinkingUI/) | replay an agent run for non-devs |

---

## License

MIT
