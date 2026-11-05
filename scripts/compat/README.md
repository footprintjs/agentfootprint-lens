# Native compatibility proof

This folder owns the offline package identity, generated-lock replay and public
consumer checks for agentfootprint 14 / footprintjs 11 / Foottrace 1.11. The
runtime matrix is renderer floor/current/candidate × React 18/19 × Node 22/24.
Old saved-record fixtures remain data tests, never installed runtime cohorts.

`contract.mjs` declares the exact inputs and pure guards. `stage-proof.mjs`
captures pinned producer source/payload identity around the reviewed route's
version-only stage. It never stages, builds or publishes. `source-install.mjs`
resolves the real offline archive in one directory and replays its generated
lock in the fresh source checkout, restoring the public manifest before tests
or packing. The temporary lock is evidence, not a committed lock.

`prepare-artifacts.mjs` binds one Lens archive, the offline agent archive and
the immutable renderer candidate to the same workflow run. `run-lane.mjs`
strict-installs those bytes, checks ESM/CJS/declarations/native recording and
browser replay, then verifies the installed bytes again. `process.mjs` owns
bounded subprocesses and data-only archive inspection. The adjacent tests
exercise the shared guards, including deliberate wrong identities and duplicate
record owners.

The CI workflow contains the exact upstream stage/pack/inspect commands. Its
AF archive is a candidate pack from main bc0b9301 via the route's stage step;
not the published RC. After the registry RC exists, a follow-up must commit
the registry lock and repeat the public candidate sweep before a Lens release.
