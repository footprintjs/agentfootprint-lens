# recordedContext — decoded recording presentation

The producer owns compact-record decoding. Pass the result of
`await readContextRecording(encoded, readValueRecord)` to `WhyLens`; this
library reads that structural port without importing an unpublished reader
or implementing its reference codec again. A producer-read legacy result
with no calls and no resolver retains the old recording identity.

`read.ts` owns call metadata and resolves each declared call ID once. It
never scans user data for `{ ref }` shapes. Strings expand verbatim; other
JSON values remain JSON values, with no invented original whitespace or
per-reference source labels. Duplicate added/removed IDs and recorded order
are retained. Source event indexes are pre-filter indexes, not offsets into
the decoded event array. Native run/mount/call coordinates identify calls.

`ownJson.ts` detaches presentation data without invoking getters, with one
64 MiB string/key budget, 200,000 nodes and depth 100 across the whole view.
At most 10,000 calls and 100,000 unique pieces are accepted. A missing value,
malformed port or exhausted budget refuses in fixed words; no partial table
is presented. These are presentation bounds, not a new redaction policy.

`print.ts` prints the full dictionary once and then the producer's deltas.
It does not recompute capture, source attribution or provider acceptance.
Behavior tests beside this code and the shared input-gate tests pin the
decoded port, exact expansion, bounds and refusals.


`payload.ts` projects exact dictionary matches into typed presentation nodes,
so literal `{ ref }` or `{ kind: "piece" }` data cannot become a reference.
Its expansion law is tested on nested requests and a real producer fixture.
`narration.ts` collapses consecutive equal rendered sentences only within the
same native owner/type, keeping counts, sequences and time spans.

`evidence.ts` is a root-log adapter over the existing public epoch and receipt
readers. It refuses explicitly withheld state, mismatched engine/log owners,
ambiguous physical calls, nested/grouped logs and source prefixes outside the
record. It inspects at most 128 exact calls, then names the limit. Exact tool
message content and verifier status remain separate from raw step results.
`producer.test.ts` compares these messages to actual captured requests.
