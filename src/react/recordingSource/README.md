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
