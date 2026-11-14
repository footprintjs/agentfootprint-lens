# Context producer contract

This fixture generator calls the built public package doors of two explicitly
supplied source checkouts. It uses MockProvider only, never a paid provider.
Run `node scripts/context-fixture/generate.mjs --agent-dir <built-agent-root>
--values-dir <built-foottrace-root> --out <fixture.json>` and then
`LENS_CONTEXT_FIXTURE=<fixture.json> npx vitest run
src/core/recordedContext/producer.test.ts`.

The hosted context-producer job pins reviewed source heads. It does not claim
that the current npm peer versions already export the new recording readers.
The adjacent Lens producer test verifies exact requests, native model-input
status, and reports total-copy bytes separately from equal-information context
bytes. The checked-in fixture remains a historical synthetic record; the
hosted job generates a fresh one from the pinned sources.
