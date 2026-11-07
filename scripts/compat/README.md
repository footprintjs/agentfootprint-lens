# Source-selected compatibility proof

The active cohort has one source: exact development pins in `package.json`
joined with version, registry URL and SHA512 integrity in the committed
`package-lock.json`. `deriveCohort` refuses a changed pin without its matching
lock, non-exact versions, non-HTTPS inputs, malformed integrity and links.
Every repository gate uses `npm ci --strict-peer-deps` on that lock.

`published-proof.mjs` keeps three joins: registry SHA512/SHA1 agree with the
actual downloaded bytes and the committed lock integrity; installed package
files match that archive; one physical Foottrace matches the selected pin.
SHA256 and archive size are measured receipt data, never another fixed identity.
The old one-time RC/offline comparison lives in Git history and the repository
README; the duplicate descriptor, staging path and its tests are removed.

`prepare-artifacts.mjs` binds one Lens archive, the selected published agent
archive and the immutable renderer candidate to the same workflow run. The
contract carries the source-derived cohort. `run-lane.mjs` requires that exact
cohort, installs its registry pins and gives the native probe an expected-cohort
sidecar; the probe checks actual versions and consumer lock identities.
Renderer floor/current/candidate × React 18/19 × Node 22/24 coverage remains.

Consumer fixture locks replay their renderer/React/private Lens-tar graph with
strict npm ci. They contain a CI-local Lens path and are non-portable evidence,
separate from the portable committed source lock. Evidence stays outside the
checkout behind a path guard; the original record-only forbidden-package checks
remain. Old saved-record fixtures remain data tests, not runtime cohorts.

All five ESM/CJS doors, strict declaration modes, native mock recording, replay,
browser behavior and installed/archive byte checks remain. `process.mjs` owns
bounded subprocesses and data-only archive inspection. Adjacent tests exercise
derivation, byte/integrity joins, mutation, invalid paths and duplicate owners.

`browser-install.mjs` owns two provisioning phases. System dependencies run
once with `install-deps chromium`, a 300-second limit and a retained
`browser-dependencies.log`. Any failure stops the lane: a timed-out privileged
installer may still be running, so it must never be started again automatically.

Only the unprivileged `install chromium` download can retry once, with a
300-second limit for each attempt. `owned-command.mjs` owns a POSIX process
group, stops the whole group on timeout and confirms it is gone before reporting
a retryable timeout. Unconfirmed cleanup refuses instead of retrying; the
adapter does not claim ownership of processes that escape its group. It is for
the declared Linux CI image and also has inert POSIX fixtures; Windows refuses
this process-group path. Output stays in `browser-install.log` and
`browser-install-retry.log`. The configured execution timeouts total up to
900 seconds (one dependency phase and two downloads), plus bounded download
group/drain cleanup. The existing dependency command's timeout applies to its
direct child; failure does not prove that privileged descendants have stopped.
Browser assertions and final byte checks still run outside the retry, and the
lane awaits provisioning before recording that step or opening a browser.
