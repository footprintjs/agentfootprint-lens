# Native lazy recordings

`agentfootprint-lens/recording` is a pure transport codec. It imports neither
React nor the renderer runtime. The existing full recording remains the
source of truth; no destructive split, rewritten retention policy, extra
artifact store or fabricated child payload is needed.

1. In an authenticated server reader, call `projectRecordingSource(full)` to
   return its owned root DTO and exact invocation manifest. The root keeps all
   recorded fields/events/structure except `snapshot.subflowResults`.
2. For an exact descriptor requested against the same scoped full recording,
   call `readRecordingSubflow(full, request)`. Return its complete native result.
   A recording saved in parts may store an invocation's sub-flow payloads with
   it; pass the reader's `payloads` through as the reply's `payloads` member
   (`{ result, payloads }`). Lens shows a payload marked as living with its
   invocation as "not loaded" until a reply carries it.
   Keep normal authorization, ownership, expiry and body-size checks around
   both reads. Unavailable is a closed reason, never a partial success.
3. In the browser, create one `createLensRecordingSource({root: httpDto,
   loadSubflow})` from `agentfootprint-lens/recording/react`. The factory validates
   the HTTP descriptor once; do not first clone it through a second reader.
4. Subscribe with `useRecordingSource(source)`, then keep the host's ONE cursor:
   `useSharedCursor(source?.observed.recorder, state?.recording.snapshot,
   {scopePositions: source?.getAxis})`. Pass that same cursor, recorder, runner
   and `recordingSource={source}` to Lens. A standalone source-backed Lens
   supplies its one cursor itself.
5. The creator disposes the source when retiring its recording. View unmounts
   release subscriptions and abort only their own pending interest.

The optional React door requires published `footprint-explainable-ui >=1.0.1`.
The original five doors and legacy recorder/runner props retain their supported
renderer floor. A new source is one event replay; loading a child keeps its
recorder and runner identities. Loading/preparing/error status changes retain
recording and replay identities. Native preparation admits the child before
publishing it; cancellation and stale completion never move a cursor.

Repeated chart definitions offer exact invocation choices. Browsing the bounded
manifest makes no child request. Opening a scope loads its exact ancestors in
order through the native source's deduplicated interests. The native cache
bounds retained prepared children, independently of the manifest's 4,096-scope
admission cap. Child scopes use their native local commit axis, including for
`shared.forAxis`; root commit/milestone projections keep their existing behavior.
No root commit index, nearest visit or display label substitutes for a child
coordinate. Legacy root-only Served, event-timeline and provenance readers are
withheld for child scopes rather than interpreting their local indices as root
indices; a native scope-aware detail slot can inspect those children. Detail slots receive that actual `axis`, `invocationPath`, admitted
`snapshot`, and an explicit `onNavigateRecordingAddress(address, {signal})`
port. TraceWalk local stop coordinates resolve through the same source and move
that same shared cursor only after exact admission. TrustBoundaryView accepts
the same optional source to load an exact cold source-prefix log on request.

The codec caps JSON work, bytes, depth and manifest size; native source admission
has its own limits. Missing or ambiguous legacy child units refuse the lazy lane
and can use a separately authenticated full-recording fallback. The root's event
log is still replayed once in full. This feature does not virtualize arbitrary
tables, move parsing off-thread, or make backend storage range-readable: a host
that reads and parses the original stored full artifact for each projection
still pays that backend cost. No data is fetched merely to draw metadata.
