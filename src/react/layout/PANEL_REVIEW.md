# Layout Primitive Library — 5-Panel Review

Reviewed by a simulated panel of five specialists against the
`agentfootprint-lens/react/layout/` library as shipped in this change.
Each panelist is told the library's target ("library-quality,
first-time consumers need it to be perfect") and the primitives they
have to work with.

Components under review:

- `<SelfSizingRoot>` — self-sized outer container
- `<FillParent>` — position:relative + absolute inset:0 fill pattern
- `<Stack>` — flex row/column with gap
- `<Scroller>` — bounded scrollable region with `contain: content`
- `<Surface>` — themed bg+border card/well/pill wrapper
- `<Table>` — responsive table that collapses to cards
- `<FocusRegion>` + `useFocusTracking` — keyboard focus engine

---

## 1. Frontend generalist

**What's good.** The API surface is small and orthogonal — each primitive
does one job. Every prop is explicit with a default; no magic
classes, no utility-class dependency. `data-fp-lens` hooks make every
region inspectable in devtools without React DevTools. Colors are
literal strings, not CSS-var references, so `style.background` in
devtools is diffable without chasing cascade.

**Push back.** Consumers will want `className` on every primitive for
Tailwind / styled-components interop — we have it on some but not all.
Every primitive should accept `className` uniformly. Also, the
palette prop is inconsistent: `Tabs` uses `surface / textColor /
mutedTextColor / borderColor / fontFamily` flat props, while
`Surface` and `Table` bundle them in a `palette` object. Pick one.

**Verdict.** 7/10. Solid bones; API consistency pass would take it
to 9.

---

## 2. Layout / CSS architect

**What's good.** The insight behind `SelfSizingRoot` is correct — a
library component must not trust the parent chain. The combination
of `flex: 1 + height: 100% + min-height: min(400px, 100dvh) + max-height: 100dvh`
is genuinely bulletproof across flex-column, grid, block-with-height,
and unsized parents. `contain: layout size paint` is the right move
for a library — isolates the component from outer CSS leakage.

`FillParent`'s `position: relative` → `position: absolute; inset: 0`
pattern is the correct escape hatch from flex resolution bugs. It's
also exactly how browser engines size fixed aspect-ratio elements,
so it composes well with video/canvas children.

The `display: contents` fix on `FootprintTheme` is the right
library-level pattern — it makes the theme wrapper invisible to
layout while preserving CSS variable inheritance. Proper architecture.

**Push back.** `SelfSizingRoot` locks `overflow: hidden`. Consumers
who want a Lens surface that naturally grows on a long page (an
article reader, a long trace) can't get it. Expose `overflow` as a
prop with the default still being `hidden`.

**Verdict.** 9/10. The single-best part of the library.

---

## 3. Performance engineer

**What's good.** Zero runtime CSS generation (no CSS-in-JS string
computation per render). Zero class names to generate. `useMemo` is
correctly applied where a child would re-initialize (e.g. `Tabs`
node/edge types). `ResizeObserver` in `Table` is set up once per
mount with a single `observe()` call — no polling.

`contain: layout size paint` is a performance win too: it tells the
browser that Lens's layout is self-contained, so a mutation inside
Lens doesn't invalidate the outer page's layout.

**Push back.** `FocusRegion`'s `onFocusChange` callback is fired
inside a `useEffect` that depends on the `state` value — means the
callback runs once per state transition, which is correct, BUT the
effect also depends on `emit` which depends on `onFocusChange`.
Consumers passing an inline arrow fn will see unnecessary re-emits.
Document that the callback must be memoized, or internalize the
comparison so it doesn't matter.

`Table`'s card-mode rendering re-runs every column's `cell()` per
render. Fine for small datasets; a user rendering 1000-row tables
will see jank. Document the "not virtualized" limit in the JSDoc.

**Verdict.** 8/10. Fine for Lens; call out limits explicitly for
consumers who reach for it in large-data contexts.

---

## 4. Mobile / responsive engineer

**What's good.** `Table`'s container-query-style collapse (via
`ResizeObserver`, not `@media`) is the right choice — Lens is often
embedded in a narrow sidebar on a wide monitor, so a viewport-based
media query would under-collapse. Measuring the actual container
width is correct. `collapseAt: 640px` default is sensible.

`SelfSizingRoot` uses `100dvh` not `100vh`, so the iOS mobile Safari
URL bar doesn't push content off-screen. Good detail.

`Scroller`'s `contain: content` prevents scroll-chaining to the
outer page on iOS — mobile users won't see Lens scrolls bounce into
the viewport scroll. Subtle but important.

**Push back.** No touch affordances. `Tabs` has no swipe-to-switch
gesture. `Scroller` has no pull-to-refresh. These aren't strictly
required for Lens-as-debug-tool, but first-time mobile consumers
may expect them. Document the non-support, or ship a gesture
add-on in a later pass.

`FocusRegion` tracks keyboard focus but does NOT track touch focus.
On iOS, `focusin` fires for inputs but not for arbitrary focus
traversal. The `focus-visible` semantic doesn't meaningfully apply
to touch. The primitive is correct but consumers should be warned:
"focus engine is for keyboard users, not touch".

**Verdict.** 8/10. The right defaults; gaps are understood, not bugs.

---

## 5. Accessibility / focus engineer

**What's good.** `Tabs` emits proper `role="tablist" / tab /
tabpanel`, sets `aria-selected`, `aria-disabled`, `tabIndex` per
W3C APG tabs pattern. Arrow-key / Home / End navigation matches the
APG script, skipping disabled tabs, wrapping at ends.

`FocusRegion` correctly distinguishes `focus-visible` (keyboard)
from `focus` (pointer). Tracks `document.activeElement` via
`focusin`/`focusout`, which bubble — robust for portals and
late-mounted children.

`Table` uses proper table semantics (`<thead>`, `<tbody>`,
`scope="col"`) in desktop mode and `role="group"` with meaningful
`aria-label` in card mode. Both layouts keep screen-reader traversal
intact.

**Push back.** `SelfSizingRoot` has `contain: size` which in older
browser versions removed the contained element from the
accessibility tree. Chromium fixed this in ~M104 but Safari 14.x is
affected. For a library, that's a real concern — add a caveat in
the JSDoc and consider a `containSize: boolean` opt-out.

`FocusRegion` fires `onFocusChange` inside `useEffect` — if the
state change is caused by keyboard arrow-key traversal inside
the region, the ring rendering is delayed by one frame. Usually
imperceptible but if you animate the ring, it'll stutter. Consider
computing `ringVisible` derived-state directly in render (no effect)
so the ring appears the same frame focus arrives.

`Surface` variants `card / well / pill / none` don't set `role` —
consumers composing a dialog with `Surface` must remember to add
`role="dialog"` themselves. Document it.

**Verdict.** 8/10. Excellent keyboard semantics; small a11y caveats
to document, not to fix.

---

## Cross-cutting recommendations (priority-ordered)

1. **API consistency pass.** Standardize `palette` vs flat color
   props. Every primitive accepts `className`, `style` (safe subset),
   `dataAttr`.
2. **Document known limits.** "Not virtualized" on Table. "Keyboard
   focus only" on FocusRegion. "Safari <M15 aria-hidden caveat" on
   SelfSizingRoot.
3. **Expose `overflow` on `SelfSizingRoot`.** Don't lock it.
4. **Tighten `FocusRegion`'s render path.** Compute `ringVisible`
   in render, not in an effect.
5. **JSDoc examples.** Every primitive should show one copy-paste
   snippet at the top of its file.
6. **Storybook / Playground.** Ship a visual regression harness for
   these seven primitives so visual diffs catch stylistic regressions.

---

## Overall

Average: **8.0 / 10.** Strong bones, correct architectural decisions
(`display: contents` on FootprintTheme, `contain: layout size paint`
on SelfSizingRoot, absolute-positioning backbone in FillParent). Real
gaps are in API polish and documentation, not correctness.

Ship as `0.5.0` after the API consistency pass.
