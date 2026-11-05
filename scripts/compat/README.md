# Native compatibility proof

This folder checks agentfootprint 14 / footprintjs 11 / Foottrace 1.11. The
runtime matrix is renderer floor/current/candidate × React 18/19 × Node 22/24.
Old saved-record fixtures remain data tests, never installed runtime cohorts.

## Default: published registry candidate

Every repository gate runs `npm ci --strict-peer-deps` on the committed source
lock. `published-proof.mjs` downloads the exact published RC, joins registry
SHA512/SHA1 to its bytes and the committed lock, and compares SHA256 with the
reviewed offline archive. It also compares installed package bytes and scans
for one physical Foottrace owner. A changed archive is a publish-route finding,
not a reason to substitute a different version or alter Lens.

`prepare-artifacts.mjs` binds one Lens archive, that published agent archive and
the immutable renderer candidate to the same workflow run. `run-lane.mjs`
uses `--agent-profile published` by default and installs the registry RC. Each
consumer's generated fixture lock is replayed with strict `npm ci`; its agent
entry must contain the real registry URL and integrity. The fixture lock has
a local Lens archive path and is non-portable evidence. It is separate from
the portable committed repository lock used by every source gate.

Consumer evidence must be outside the repository (CI uses `$RUNNER_TEMP`) so
Node cannot satisfy isolated fixture imports from the source install above them.
The path guard rejects in-repository evidence before installation; the unchanged
record-only fixture also requires forbidden packages to be unresolvable.

The runner checks ESM/CJS, strict declarations, native recording and browser
replay, then verifies installed and archive bytes again. `process.mjs` owns
bounded subprocesses and data-only archive inspection. Adjacent tests exercise
wrong identities, changed bytes, forged integrity, local inputs and duplicate
record owners.

## Optional: reproduce the reviewed offline candidate

The reviewed `stage-proof.mjs`, its tests, and `source-install.mjs` remain
available for an explicitly selected offline lane. They are not called by the
default workflow. The exact prior build/stage/pack recipe is retained in
[the reviewed workflow at c37fdada](https://github.com/footprintjs/agentfootprint-lens/blob/c37fdada7010fdf53b7230d77cf5c5a3dfbfcb3d/.github/workflows/ci.yml#L42-L71).
It uses pinned AF main bc0b9301, producer npm 11.19.0, a locked build before
staging, the route's version-only jq step, pack and upstream archive inspection.
It publishes nothing. `stage-proof.mjs` captures source/payload identity around
that sequence and never stages, builds or publishes itself.

Supply the resulting tar and `native-source.json` to `prepare-artifacts.mjs`
with `--agent-profile offline`, `--agent-tar` and `--agent-source` (plus the
normal Lens/renderer/output arguments). Select `--agent-profile offline` in
`run-lane.mjs` too; it refuses an artifact/profile mismatch. This is a labelled
candidate pack from main, not the registry RC. An isolated offline source copy
can use `source-install.mjs` without an existing lock or installed tree; its
generated source lock contains a local AF tar path and is non-portable evidence.
It must never replace the committed registry lock or satisfy a published sweep.
