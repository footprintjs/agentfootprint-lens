# Lazy recorded sources

The controller composes Explainable UI's public `createRecordingSource` with
one observed Lens recorder and a stable replay runner. Native code owns exact
child admission, deduplication, cancellation, retained evidence and preparation.
The recorder is refreshed from an admitted snapshot; event history is not
replayed when a child arrives. The creator disposes the source. View hooks
unsubscribe and cancel only their own pending request.

`types.ts` is the structural data port accepted by Lens; its ordinary root
entry keeps working with earlier renderer peers. The optional
`agentfootprint-lens/recording/react` door requires Explainable UI 1.0.1 or
newer. Its data-only codec is on `/recording`, with no React or renderer runtime.
The host's existing SharedCursor remains the only address owner. A pending
scope never reads as the previous one, and loading completion does not move
that address. Exact recorded invocation choices disambiguate repeated mounts.

A child reply may carry `payloads` (the invocation's sub-flow entry and exit
payloads, when the recording stores them with it). The controller admits that
member with the codec, keeps it by mount runtime id, and hands the renderer the
rest of the reply unchanged; a reply without it is forwarded untouched. The
snapshot's `subflowPayloads` serves them only for a child whose load is ready.
`useStepPayloads` turns the base row's marks, the loads and those payloads into
the one payload reader (`core/subflowPayloads`) and asks the source for the
children a view shows.
