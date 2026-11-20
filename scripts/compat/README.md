# Source-selected compatibility proof

The ordinary registry cohort has one source: exact development pins in `package.json`
joined with version, registry URL and SHA512 integrity in the committed
`package-lock.json`. `deriveCohort` refuses a changed pin without its matching
lock, non-exact versions, non-HTTPS inputs, malformed integrity and links.
Every ordinary registry gate uses `npm ci --strict-peer-deps` on that lock.

`published-proof.mjs` binds each of the three registry archives to the
committed lock, registry SHA512/SHA1 and installed files. It also checks that
one physical Foottrace matches the selected pin.
SHA256 and archive size are measured receipt data, never another fixed identity.
The old one-time RC/offline comparison lives in Git history and the repository
README; the duplicate descriptor, staging path and its tests are removed.

`prepare-artifacts.mjs` binds one Lens archive, the stable registry cohort
and the reviewed renderer original to the workflow run. `run-lane.mjs`
requires that cohort in its strict lock, checks installed files against their
original archives and supplies the expected versions to the recording probe.
The seven renderer selections run with React 18/19 on Node 22/24.
The packed lock and browser plan share the closed declared renderer versions.
Only the admitted source candidate requires the separate literal Flow/HCI record
browser; its original archive digest remains mandatory. The published lazy lane
retains both the registry pack receipt and actual byte SRI checks.
The 0.38.0, 2.0.0, 2.1.0 and 2.2.0 lanes bind the original registry archives by URL, size and
digest. They compile the same full engine narrative fixture under strict NodeNext
ESM, NodeNext CommonJS and Bundler. Only the expected narrative-argument
diagnostic qualifies as a 0.38.0 rejection. All 2.x lanes must compile the fixture cleanly.

Consumer fixture locks replay their renderer/React/private Lens-tar graph with
strict npm ci. They contain a CI-local Lens path and are non-portable evidence,
separate from the portable committed source lock. Evidence stays outside the
checkout behind a path guard; the original record-only forbidden-package checks
remain. Old saved-record fixtures remain data tests, not runtime cohorts.

All five ESM/CJS doors, strict declaration modes, native mock recording, replay,
browser behavior and installed/archive byte checks remain. `process.mjs` owns
bounded subprocesses and data-only archive inspection. Adjacent tests exercise
derivation, byte/integrity joins, mutation, invalid paths and duplicate owners.

## Browser provisioning

`--install-browser yes` retains `network` provisioning for local callers.
`--browser-provisioning network|bundled` explicitly selects a strategy and
requires both provisioning and browser replay; an unknown strategy refuses.
Neither strategy changes a browser assertion, public import/declaration check,
source/archive comparison, or same-workflow/run-attempt artifact identity check.

The hosted 20-lane matrix uses the official
`mcr.microsoft.com/playwright:v1.63.0-noble` container at immutable OCI index
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`.
This digest was verified against the
[MCR manifest](https://mcr.microsoft.com/v2/playwright/manifests/v1.63.0-noble)
response header and SHA256 of the exact response body. The official
[Dockerfile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/Dockerfile.noble)
supplies `/ms-playwright` and native system libraries. Playwright is still
installed by each exact consumer lock. `--ipc=host` follows the official
[Chromium container recommendation](https://playwright.dev/docs/docker#recommended-docker-configuration)
to avoid shared-memory exhaustion in these ephemeral test jobs.

`bundled` makes no apt or download request and never retries or falls back.
`browser-bundled.mjs` checks the actual installed Playwright version and public
Chromium engine/path against the pinned image's
[browser metadata](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/browsers.json):
Playwright 1.63.0, Chromium revision 1243, native version 153.0.8010.12. It requires
an executable file whose canonical path remains under that revision in the
bundled root, refuses a different executable override, launches it and completes
a real page interaction. Missing libraries/binaries, version/revision mismatches
or a failed interaction stop the lane. A 60-second owned process-group deadline
bounds the proof; its browser closes on success or failure. The exact admitted
binary and expected native version then flow into every full browser replay.
Evidence is `browser-bundled.log` plus `browser-provisioning.json`. Updating the
Playwright pin requires re-verifying both the immutable image and browser metadata.
Node helper tests use explicitly inert fixtures; hosted lanes still perform the
actual native smoke proof and full installed-package browser checks.

The default `network` strategy owns two phases. System dependencies run
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

## Authored development pins before installation

`check-source-pins.mjs` reads this source manifest and uses `authoredDevPins`
from `contract.mjs`, sharing the exact-version guard used by `deriveCohort`.
The CI and context-producer source bootstraps run it before registry installation. It checks
syntax only: a valid pin does not prove availability, lock identity, archive
bytes or compatibility. `deriveCohort` still requires the matching root pin,
locked version, canonical registry URL, integrity and an unlinked package.

## Earlier RC proof and published control

The earlier native source proof used an unpublished AgentFootprint original
and temporary locks. The active target jobs now replay the committed stable
registry lock. Node 22 packs Lens once, and Node 24 compares its build with
that archive. The unpublished AgentFootprint path is retired. The separate
published commentary control still bootstraps directly at 14.7.2 / 12.3.0 /
1.11.1. Its tool commentary fixture checks the published 14.7.2 selector with
an ordinary end and a settled end. The supported AgentFootprint 15 install
also exercises refused, unknown and confirmed execution, including replay of
older unstamped recordings.

## Original renderer producer

The hosted renderer receipt carries the separately reviewed UI64 original.
Its fixed source/run/tested parents and all four required jobs must match.
The bounded data reader understands only that thirteen-member dependency-security
ZIP, verifies its original package and source manifest plus packed member table,
and retains its twenty-member TGZ without executing it. No upstream build or
repack occurs. The source checkout supplies only the unchanged literal saved
Flow/HCI fixtures. Candidate version1.1.1 is not registry provenance; the exact
SHA256/SRI owns this unpublished image. Production audit is clean; the producer
full development audit has nine unresolved HIGH findings. Its browser demo is
not exact final-head or packed-browser proof; the real consumer gates remain.
