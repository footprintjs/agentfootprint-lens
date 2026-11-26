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
payloads, when the recording stores them with it). The controller takes that
member out, admits it with the codec, and hands the renderer the rest of the
reply unchanged; a reply without it (or with `payloads: undefined`) is
forwarded untouched.

Views read payloads apart from the renderer: `loadPayloads` calls the host's
`loadSubflow` directly and keeps only the admitted payloads in this package's
own store (`payloadCache.ts`), never the result, so the renderer's limited set
of loaded children (`maxCachedSubflows`, at most 64) stays for the person's own
drills. A view holds what it shows with a signal: a held entry is never
evicted, a read nobody holds is cancelled, and at most `maxCachedPayloads`
(default `MAX_CACHED_PAYLOADS`, 64) entries stay once no view holds them. A
failed read stays failed (and is shown so) while it is kept. Payloads from an
explicit child load's reply go into the same store. `useStepPayloads` turns the
base row's marks and that store into the one payload reader
(`core/subflowPayloads`) and holds the invocations a view shows.
