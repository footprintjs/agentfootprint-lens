# Native recording source codec

This is the pure storage/wire boundary for the optional lazy Lens source. It
imports public Foottrace ID helpers and the existing descriptor-based JSON owner;
it imports no React, viewer runtime, provider, storage client or replay executor.
The host must authorize its stored recording before calling these functions.

`projectRecordingSource` accepts a parsed native recording and returns the fixed
`agentfootprint-lens.recording-source/v1` DTO. It detaches every original root
field, event and chart field while omitting only `snapshot.subflowResults`.
The original recording remains untouched. A metadata walk discovers exact mount
runtime IDs through `executionTree` and each selected unit's
`treeContext.stageContexts`, following native `next` and `children` links.

Each manifest address contains an array of exact ancestor mount runtime IDs, its
mount ID, the recorded subflow ID and only an actually present native snapshot
`runId`. Runtime IDs are admitted by public Foottrace parsing/building helpers.
Only the root map's exact runtime key can supply a complete native unit. Static
aliases, labels, latest-definition values and guessed ancestry never resolve a
request. Missing exact units decline the lazy lane as unsupported; duplicate or
ambiguous addresses decline the whole lane, rather than publishing a partial
manifest. Legacy readers remain a separate host choice.

`readRecordingSubflow` checks the requested address against that same original
recording and owns only its selected complete unit. All native fields, state,
history, read/write provenance and source metadata remain unchanged. It does not
copy all sibling value payloads. Deep JSON validation of a child body happens
when that child is read; a manifest is not a claim that every body was readable.
Unsafe or oversized selected data returns a closed unavailable result, never a
truncated replacement. Getters, coercion and `toJSON` are not invoked.

Provided native `logAddress` paths must match the exact ancestor mounts. When
the root provides a native log owner, a child's provided owner must agree.
`logRunId` is not inferred from the engine snapshot's `runId`: a resumed leg can
keep an earlier log owner. Missing legacy log addresses stay missing; no address,
base, receipt or read coverage is synthesized.

`readRecordingSourceRoot` admits an already projected wire DTO, whose omitted
child map is intentional. It checks its fixed schema, root mount membership,
unique manifest addresses and complete ancestor prefixes. It rejects an embedded
full map before copying payloads. Actual nested ancestry is additionally checked
against the stored original on child reads and by the native client when units
arrive. Returned JSON is detached and frozen, with no mutable input aliases.

Bounds are independent: at most 4,096 invocation descriptors, 128 path components,
8,192 total path characters and 4,096 characters per source name. Metadata walks
spend at most 200,000 items. Copied root/manifest or one selected unit uses the
existing JSON owner's 200,000-node, 64 MiB string/key and depth-100 budget. These
are refusal limits, not silent truncation or a claim to accept 200,000 table rows.
The viewer's separate 64 concurrent child cache does not cap manifest length.

A sequence of stages is not depth. The execution tree nests one JSON level per
executed stage through `next`, so depth 100 used to cap a run's length. At the
tree's two places only, named by their full schema path in `fields.ts`
(`recording.snapshot.executionTree` in a root DTO, `treeContext.stageContexts`
in a child unit; `ROOT_TREE` and `CHILD_TREE`), the owner reads stage nodes with
an explicit stack. Depth counts inside one stage and one level per `children`
step; `next` adds none. Every stage, array and value still spends the one node
budget. A path of more than `MAX_STAGE_CHAIN` (1,000) stages from the tree's root,
along `next` and `children`, is refused as `recording-limit`. A key named `next`
anywhere else, or a tree copied to another place, keeps depth 100. So an owned
reply nests at most about 1,100 JSON levels, which JSON text, `structuredClone`
and `postMessage` carry on Node 22 (they fail near 2,000);
`stageChainSerialization.test.ts` pins that on the deepest admitted root and
child replies.

Tests use the recorded native turn (25 exact root units), actual nested native
FlowChart execution, repeated mounts with stale aliases, resumed log identities,
getter/cycle/class/sparse input, immutable ownership and exact refusal bounds.
