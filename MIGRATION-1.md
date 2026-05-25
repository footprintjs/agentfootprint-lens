# agentfootprint-lens 1.0 Migration Guide

1.0 is a structural restructure aligned with footprintjs 5.0 + agentfootprint 3.0. Two breaking changes for consumers, plus a new headless subpath for non-React frameworks.

| Change | Type | Description |
|---|---|---|
| `LensRecorder extends SequenceRecorder` → composition | Internal | Inherited methods are re-exposed as public delegators. Most consumers see no API change. |
| `ChangeNotifier` extracted as public primitive | Additive | Use it directly to build Vue / Angular / Recoil / DOM adapters. |
| `agentfootprint-lens/core` subpath | Additive | Headless import. Zero React dep. |

---

## 1. `LensRecorder` — composition over inheritance

Previously `LensRecorder` extended `SequenceRecorder<EventLogEntry>` from `footprintjs/trace`. That base class is removed in footprintjs 5.0.

In 1.0 the recorder COMPOSES a `SequenceStore<EventLogEntry>` and a `ChangeNotifier`. **Backward compat is preserved**: every previously-inherited public method is re-exposed as a public delegator on `LensRecorder`:

| Method | Status |
|---|---|
| `entryCount` | Preserved (now a getter) |
| `getEntries()` | Preserved |
| `getEntriesForStep(rid)` | Preserved |
| `getEntryRanges()` | Preserved |
| `aggregate(reducer, init)` | Preserved |
| `accumulate(reducer, init, keys)` | Preserved |

```diff
- import { SequenceRecorder } from 'footprintjs/trace';
- expect(recorder).toBeInstanceOf(SequenceRecorder);

+ // Composition — no instanceof check possible. Read state via the
+ // public delegators above (unchanged).
+ expect(recorder.entryCount).toBeGreaterThan(0);
```

Removed: `instanceof SequenceRecorder` checks (the base class is gone). If you have such a check, replace it with a duck-typed check against `entryCount` / `getEntries`.

---

## 2. New `ChangeNotifier` primitive (additive)

A reusable Observable for building consumer adapters in any framework. Lens uses it internally; you can also use it directly.

```typescript
import { ChangeNotifier } from 'agentfootprint-lens/core';

const notifier = new ChangeNotifier();
const off = notifier.subscribe(() => console.log('changed'));
notifier.notify();
off();
```

See the `ChangeNotifier` JSDoc for working adapter snippets in Vue 3, Angular signals, and vanilla DOM.

---

## 3. `agentfootprint-lens/core` subpath (additive)

The headless surface lives at `agentfootprint-lens/core`. It exports the recorder, selectors, types, and `ChangeNotifier` — with **zero React dependency**.

| Import | Pulls in React? |
|---|---|
| `'agentfootprint-lens'` | Yes — components + hooks + core |
| `'agentfootprint-lens/core'` | NO — headless only |

Use the latter from Vue / Angular / Recoil / CLI / DOM:

```typescript
import { LensRecorder } from 'agentfootprint-lens/core';
```

---

## 4. `runId`-aware reset (transparent fix)

A multi-run aliasing bug: when `LensRecorder` was reused across two `runner.run()` calls (e.g., chat-style apps), state from the first run accumulated into the second's projections.

1.0 detects new runs via `event.meta.runId` and resets state automatically. No consumer code change required.

---

## 5. Version-bump cascade

- footprintjs 4.x → 5.0.0 (recorder system rewrite)
- agentfootprint 2.14.x → 3.0.0 (composition migration + runId scoping)
- agentfootprint-lens 0.15.x → 1.0.0 (this guide)

If you pin transitive deps, update all three in lockstep.

---

## 6. What did NOT change

- `<Lens recorder={...} view="..." />` React component API
- `useLensRecorder`, `useStepFocus`, `useDrillPath`, `useStepView` hooks
- `humanizer` / `buildLLMText` / selector functions
- Selector outputs (RunTree, EventLog, Summary shapes)
- The slider, commentary panel, and run-flow renderer
