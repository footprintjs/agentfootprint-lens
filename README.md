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

## Render an artifact by its ref

agentfootprint 9.21–9.23 taught tools to check large results into an **artifact
store** and hand the model a ~30-token claim ticket (`art_…`) instead of the
bytes; the model finishes with `present({ ref, as, label })`. The lens is the
screen's half of that handshake: it **redeems the ref and renders a component
the app registered for the artifact's kind** — ids + props, never markup the
model wrote. The model can say *what* to show; only your registry says *how*.

```tsx
import {
  ArtifactPane,
  httpArtifactResolver,
  presentedFromEvents,
  registerArtifactComponent,
} from 'agentfootprint-lens';

// 1. Teach Lens your kinds, once at startup. ('dataset/rows' already ships.)
registerArtifactComponent({
  kind: 'chart/spec',
  component: ({ meta, data }) => <MyBarChart title={meta.label} spec={data} />,
});

// 2. Point a resolver at the served agent — the SAME invoke path the
//    conversation posts to. Session identity rides every redemption.
const resolver = httpArtifactResolver({ url: '/invoke', sessionId });

// 3. Render every artifact the run presented. On history reload, walk the
//    stored transcript instead: readPresentedResult(toolMessage.content).
{presentedFromEvents(recording.events).map((call) => (
  <ArtifactPane key={call.toolCallId ?? call.ref} presented={call} resolver={resolver} />
))}
```

`<ArtifactPane>` heads the ref first (the render decision), then gets the
payload and mounts the registered component. A kind nothing is registered for
falls back to an honest **metadata card** — ticket facts, a bounded payload
preview, copy/download — plus one line naming the `registerArtifactComponent`
call that closes the gap. Never a blank pane.

### When the artifact is gone

Refs expire — TTL, retention budgets, a restarted store. The `present` result
carries a **description snapshot** at speak time, so a reloaded conversation
can still say what stood there, from history alone:

> Chart — "Q3 sales by region" (bar-chart, 41.0 KB) — expired; re-run to regenerate.

That placeholder needs **no store round-trip beyond the failed head** — this is
the spreadsheet's `#REF!`, taught manners. Missing, expired and
another-session's ref all answer one indistinguishable not-found by design (a
leaked ref probes nothing), and the pane renders the same stated absence for
all three. A resolution *door* failure (no store attached, wire down) is a
different sentence: the pane shows the server's own teaching refusal, verbatim.

### The two resolvers

```ts
import { httpArtifactResolver, storeArtifactResolver } from 'agentfootprint-lens/core';

// Over a served agent's wire ops (standingAgent / httpHost / nodeHost, or the
// managed-runtime dialect): POST { op: 'artifact-head' | 'artifact-get', ref,
// sessionId } to the invoke path. `userId`, extra `headers` and a custom
// `fetch` are options.
const overHttp = httpArtifactResolver({ url: 'https://host/invoke', sessionId: 's-1' });

// Over a directly passed store, for same-process demos and tests. The scope is
// REQUIRED — refs only resolve under the identity they were minted in.
const inProcess = storeArtifactResolver({ store, scope: { conversationId } });
```

Both return `{ status: 'live' | 'absent' | 'failed' }` outcomes instead of
throwing, so a pane can branch. In the EventStream, the whole artifact
lifecycle — minted, resolved, expired, refused, presented — already reads as
prose via the default humanizer.

---

## Answer a paused run with a real component (typed HITL)

agentfootprint 9.24 taught every human-ask door (`askHuman`, the `ask`
middleware, `defineTool({ checkInComponent })`) to carry an optional typed
half beside the prose question: `{ componentId, props?, propsRef? }`. The id
names a component **your screen registered** — ids + props, never markup the
model wrote, the same no-eval law artifacts follow. Small props ride the ask
inline; the big half (a 200-option picker's options) rides the **artifact
store** as a `propsRef` claim ticket, redeemed through the same resolver and
the same session identity as every other artifact.

`<AwaitingPane>` is the screen's half:

```tsx
import {
  AwaitingPane,
  decisionRequestBody,
  httpArtifactResolver,
  registerDecisionComponent,
} from 'agentfootprint-lens';

// 1. Teach Lens your collectors, once at startup. ('option-picker' ships.)
registerDecisionComponent({
  componentId: 'refund-form',
  component: ({ question, props, data, respond }) => (
    <MyRefundForm limits={props} rows={data} onSubmit={(answer) => respond(answer)} />
  ),
});

// 2. When a reply comes back awaiting, render the pane. The lens does NOT
//    own the POST — your app does; decisionRequestBody formats the body.
const resolver = httpArtifactResolver({ url: '/invoke', sessionId });
<AwaitingPane
  awaiting={reply.awaiting}
  resolver={resolver}
  onDecision={(decision) =>
    fetch('/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(decisionRequestBody({ decision, sessionId })),
    })
  }
/>
```

The person clicks; `onDecision` receives **the structured decision** — the
option's id, or the approve/decline record (`approveDecision` /
`declineDecision`, byte-compatible with agentfootprint's check-in
vocabulary). After answering, the pane renders the decision as one sentence —
*"Approved by alice@ops — 'verified'."* — which is **display only**: the
structured decision is the record; the words are a rendering of it.

Nothing on this road dead-ends the human. An unknown `componentId` falls back
to the prose question plus a plain answer box and *says so*; an expired
`propsRef` renders the honest placeholder plus the answer box; a crashed
registered component is caught and stated; a consent gate (`checkIn` /
middleware `ask`) falls back to Approve/Decline with a required "deciding as"
field, because an audit record with no actor names nobody.

The headless half is on `agentfootprint-lens/core` — `readAwaitingComponent`
(era-robust: reads `awaiting.component` and the three `pauseData` homes),
`approveDecision` / `declineDecision`, `decisionRequestBody`,
`decisionSentence`, `isConsentAsk` — so a Vue or CLI shell can build the same
pane.

---

## Scrubbing by group — the active group is a named place

One causal trace, replayed at two zoom levels. On the **per-step** ruler every
executed stage is a stop — the commit trace itself, nothing skippable, so the
ruler's count is the run's stage count. On the **grouped** ruler the stops are
the agent's milestones (iteration, context, LLM turn, route, tool call), drawn
as labelled iteration bands; ◀ ▶ still move one stop at a time, and clicking a
band jumps to its first stop.

The chart used to paint both the same way, and that was wrong for the second one.
A stage's styling is by TYPE — the LLM call carries a hero emphasis (accent
border, tint, glow) and the cursor's one node pulses — so landing on a group of
six nodes pulled the eye to the LLM box. The group, the thing the ruler had
actually moved by, never read as the position at all.

Pass `granularity="group"` and it does:

- **one accent for every member.** An LLM call, a tool and a context pill light
  identically — same tint, same intensity. What a node IS stays legible in its
  icon and its shape; how loud it is no longer depends on its type.
- **everything else recedes uniformly** — one dim, not a second ranking.
- **a boundary is drawn around the members**, from their real measured positions,
  with the group's **name** on its top edge. Scrubbing group to group animates it
  (and doesn't, under `prefers-reduced-motion: reduce`).

The name is `groupDisplayName` — the same spelling the WHAT HAPPENED boundary
list uses. One place, one name.

```tsx
<Lens recorder={recorder} runner={runner} granularity="group" />
```

Or, in a shell that owns its own canvas and its own cursor:

```tsx
import { LensFlow, useChartGroup } from 'agentfootprint-lens';

function WhyLensChart({ recorder, chart, cursorCommitIdx }) {
  // The group the cursor stands in, as chart node ids. Derived from the
  // boundary ranges the grouped ruler already computes its stops from —
  // no extra fetch, no second cursor.
  const group = useChartGroup(recorder, cursorCommitIdx);
  return <LensFlow chart={chart} granularity="group" activeGroup={group} />;
}
```

`granularity` defaults to `'step'`, and on that path nothing changes: no classes,
no boundary, the same chart the Flow Lens has always drawn. `'group'` at a commit
no boundary encloses also renders as `'step'` — a mode with nothing to draw draws
nothing, rather than boxing the whole chart.

Restyle it with one variable (`--lens-group-accent`, falling back to
`--fp-group-accent`), or target the classes directly: `.lens-group-node--member`,
`.lens-group-node--outsider`, `.lens-group-boundary`, `.lens-group-boundary-name`.

Headless: `activeChartGroup({ groups, commits, commitIdx })` on
`agentfootprint-lens/core` is the pure function behind the hook — same answer for
a Vue or CLI shell.

---

## Driving the cursor from your app

**Omitting these props keeps the lens self-driving.** It holds the position
itself, follows the live run, and needs nothing from you — that is the default
and it has not changed.

Pass `step` and you own the cursor. That is the difference between a lens that
happens to be on your page and a lens that is part of your app: two tabs can
show the same moment, a "jump to the failure" button in your own UI can move it,
and switching tabs no longer loses the position.

```tsx
function Debugger({ recorder, runner }) {
  // ONE cursor, held by you. Both lenses show the same moment.
  const [step, setStep] = useState(0);

  return (
    <>
      <Lens recorder={recorder} runner={runner} step={step} onStepChange={setStep} />
      <Lens recorder={recorder} runner={runner} step={step} onStepChange={setStep} view="analyst" />
      <button onClick={() => setStep(0)}>Back to the start</button>
    </>
  );
}
```

Just want to *watch* the cursor? Pass `onStepChange` alone. The lens keeps
owning the state and calls you on every move — the same contract
`<TraceExplorerShell onSelectionChange>` has in `footprint-explainable-ui`.

### The unit is a step, and the callback carries the rest

A **step** is one stop on the lens's scrub axis — the same number the transport
counts ("3 / 12"), the same one the WHAT HAPPENED rail dots. Valid values are
`0 … totalSteps - 1`, and `totalSteps` **grows** while a run is live.

Every call hands you the other two units of the same position, so you never
invert the mapping yourself:

```ts
onStepChange(step, at)
// at = { step, totalSteps, runtimeStageId, commitIdx, label, kind?, clamped }
```

- `at.runtimeStageId` — footprintjs's address, the string
  `<TraceExplorerShell selectedRuntimeStageId>` and `<RunSlider cursorRuntimeStageId>` take.
- `at.commitIdx` — the commit-log index the position anchors to.

Why the step is the controlled unit and not one of those: it is the only one
that is **one-to-one** with a position the lens can show. A group's start and
its end are the same group, so "Run · start" and "Run · end" are both
`__root__#0`; a parallel fork's branches open at the same commit. Address the
cursor by either and the second of every such pair becomes unreachable — half
the positions silently unselectable, which is the exact failure this prop
exists to prevent.

Move it out of range and the lens **clamps and says so**: it renders the nearest
real position, calls `onStepChange(clamped, { clamped: true })`, and warns once
on the console. It clamps rather than refuses because the axis grows under you —
a step you stored from a finished run is a perfectly good value that the same
run, earlier, does not have yet. Store what the callback hands back and the two
cursors agree again.

Every mover reports: the step strip, ◀ ▶ ⟳Live, the arrow keys, a chart node
click, a WHAT HAPPENED moment, a provenance jump, and the auto-advance that
follows a live run. One cursor, one funnel — a mover that moved without telling
you would be a second cursor wearing the first one's clothes.

---

## Rendering your own detail pane

`slots.detail` replaces the CONTENT of the shipped right column. The column
itself — its width, its border, its collapse pill, its cursor — is unchanged.
Omit `slots` and the built-in timeline renders exactly as before.

```tsx
const Detail: React.FC<LensDetailSlotProps> = ({ step, cursorRuntimeStageId, node, onNavigate }) => (
  <div>
    <h3>{node?.label ?? 'nothing focused'}</h3>
    <code>{cursorRuntimeStageId}</code>
    <button onClick={() => onNavigate(0)}>rewind</button>
  </div>
);

<Lens recorder={recorder} runner={runner} slots={{ detail: Detail }} />
```

The slot receives the cursor in every unit (`step`, `totalSteps`,
`cursorRuntimeStageId`, `commitIdx`, `label`, `kind`), the `StepNode` it sits on
and the ones that ran inside its scope (`node`, `relatedNodes`), the `recorder`
for anything else, and `onNavigate` — the same funnel every built-in mover uses,
so your pane moves the ONE cursor rather than starting a second one.

Keep the slots object stable across renders (module scope or `useMemo`), same as
`<TraceExplorerShell slots>`.

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

Lens resizes to whatever space you give it. The engineer view is a chart column
beside an inspector with a 300px minimum, and below **`LENS_NARROW_BREAKPOINT`
(690px of available row width)** that pair stops fitting — so the columns
**stack** instead of clipping. Nothing is hidden and nothing is cut off; the
same panes are read top to bottom instead of left to right. A split panel
dragged down to 392px gets a readable lens, not a sliver of one.

The threshold is exported, so a shell that lays out around Lens can use the same
number rather than guessing it:

```ts
import { LENS_NARROW_BREAKPOINT, isNarrowRow } from 'agentfootprint-lens';
```

Drop it in a splitter, a drawer, or a full-screen tab — no config needed, both
themes.

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
| `granularity` | `'step' \| 'group'?` | Which ruler is scrubbing the chart. `'group'` paints the cursor's group as a named place. Default `'step'`. See [Scrubbing by group](#scrubbing-by-group--the-active-group-is-a-named-place). |
| `step` | `number?` | Controlled cursor. **Omit it and the lens is self-driving, exactly as before.** Pass it and you own the position; out-of-range values are clamped and reported. See [Driving the cursor](#driving-the-cursor-from-your-app). |
| `onStepChange` | `(step, at) => void?` | Fires on every cursor move — required for movement in controlled mode, an observation hook otherwise. `at` carries `runtimeStageId`, `commitIdx`, `label`, `kind` and `clamped`. |
| `slots` | `LensSlots?` | Slot overrides. `slots.detail` renders your content in the shipped right column. Omit for the built-in timeline. See [Rendering your own detail pane](#rendering-your-own-detail-pane). |

### `<LensFlow>` — the chart canvas on its own

The chart without the shell, for consumers who own their layout and their
cursor. Takes `chart`, the runtime overlay, the cursor, and — for the grouped
ruler — `granularity="group"` plus `activeGroup` (from `useChartGroup`). Every
other prop is unchanged by group mode.

### `useChartGroup(recorder, commitIdx, options?)` / `activeChartGroup(...)`

The group the cursor stands in, resolved to CHART NODE IDS: the boundary's
commit range read off the recording, each commit's `runtimeStageId` stripped of
its `#executionIndex` (the id rule every chart-click and co-active highlight in
the ecosystem already uses), plus the group's own mount. Returns `undefined`
when no boundary encloses the cursor. `options.includeRoot` opts into the
synthetic Run root, which is off by default because a box around the whole chart
states nothing. `activeChartGroup` is the pure, React-free twin on
`agentfootprint-lens/core`.

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

### `<ArtifactPane>` — render by ref, with `#REF!` taught manners

Takes one `present` call (`presented`) and an `ArtifactResolver` (`resolver`);
heads the ref, then renders the component registered for the artifact's kind
(`registerArtifactComponent({ kind, component })`) with `{ meta, data,
presented }` as props. `'dataset/rows'` ships as a built-in table; every
unregistered kind falls back to `<ArtifactMetaCard>` with the gap stated. An
expired/missing ref renders its placeholder from the speak-time snapshot alone.
The headless half — `httpArtifactResolver`, `storeArtifactResolver`,
`presentedFromEvents`, `readPresentedResult`, `artifactPlaceholder` — is on
`agentfootprint-lens/core`. See
[Render an artifact by its ref](#render-an-artifact-by-its-ref).

### `<AwaitingPane>` — answer a paused run with a real component

Takes the `awaiting` payload a served agent replied with (`awaiting`), an
optional `ArtifactResolver` (`resolver`, only needed when the ask ships a
`propsRef`), and `onDecision` — which receives the person's STRUCTURED
decision; your app posts it (`decisionRequestBody` formats the wire body).
Renders the component registered for the ask's `componentId`
(`registerDecisionComponent({ componentId, component })`) with `{ question,
props, data, respond }`; `'option-picker'` ships as a built-in. Unknown id,
expired ref, failed door and crashed component all state themselves and fall
back to a live answer surface — never a dead end. After answering it renders
the decision as one sentence (display only; the structured decision is the
record). The headless half — `readAwaitingComponent`, `approveDecision` /
`declineDecision`, `decisionRequestBody`, `decisionSentence`, `isConsentAsk`
— is on `agentfootprint-lens/core`. See
[Answer a paused run with a real component](#answer-a-paused-run-with-a-real-component-typed-hitl).

### `selectSkillRoute({ log })` — why the skill graph went where it went

Routing already had a voice in Lens (the commentary line for every hop). This
gives it a **shape**: one row per iteration, typed, so a view can group by
skill, draw the graph, or answer "why was I refused" without re-reading prose.

```ts
import { selectSkillRoute } from 'agentfootprint-lens/core';

const route = selectSkillRoute({ log: recorder.selectEventLog() });

for (const hop of route.hops) {
  console.log(hop.iteration, hop.by, hop.from, '→', hop.to); // 2 'stay' triage → triage
}

// The model asked for a skill it could not reach — and the whole failure,
// on one row: what it asked for, what it was told, what it was reading when
// it asked, and the proof the cursor did not budge.
const [refusal] = route.hops.flatMap((h) => h.refusals);
refusal.requestedId;        // 'audit-log'
refusal.allowed;            // ['volume-lookup']  ← the reachable set
refusal.refusalText;        // the sentence the MODEL read back
refusal.cursorAfter;        // { iteration: 2, by: 'stay', moved: false }
```

`hop.readSkillDescription` is the `read_skill` menu **verbatim, as the model saw
it** — the reachable list it was reading when it picked. `route.nodes` is the
skill catalog (with `visited`), `route.observedEdges` the hops the cursor
actually took, `route.declaredEdges` the ones the author drew, and
`route.turns` the turn-start verdicts.

Two vocabularies, deliberately on two types: `hop.by` answers *what moved the
cursor* (nine causes: `entry`, `route`, `model-pick`, `tool-proposal`, `intent`,
`continuity`, `decider`, `stay`, `none`), while `turn.by` answers *which tier
decided where the turn started* (`menu` lives only there — an offer is not a
move). `route.hasRouting` is `false` on a run with no skills, so a view can say
so instead of drawing an empty graph.

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
