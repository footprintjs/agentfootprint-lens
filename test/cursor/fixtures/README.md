# Sparse child replay

`nav-sparse-child.json` is the native recording from NAV's
`test/trust-replay-preview.mjs` rehearsal, captured on 2026-10-05. The script
runs agentfootprint with a scripted mock provider and a denied `present` tool
call. It invokes no paid model and contains no financial data. The replay
input is the response's `recording` property; the HTTP envelope was removed
and JSON formatting added. Recording fields were not synthesized or repaired.

NAV's metadata-only capture withheld prompt, model, provider, response and
tool-result content with explicit placeholders. State writes are withheld;
root and child logs carry `stateValuesWithheld`, and commit rows keep their
native indices, addresses and redaction metadata. The recording preserves
structure, events, BoundaryEvents and TrustBoundaries so replay follows the
same readers as the browser, including the permission fact at source prefix
18. A withheld state is not an empty state.

`src/react/Lens.sparseAxis.test.tsx` walks the native root's displayed stop
21 → 20 → 19, then drills into the later Final scope. The held address is
`sf-thinking#41` at commit 35, while the sparse child axis contains
`final#44` at commit 38. It must remain unplaced until the reader selects a
child stop, and returning to Run must restore stop 19. The test substitutes
only the canvas measurement/rendering surface; replay, drill resolution,
axis construction, shared ownership and Lens panels are real.
