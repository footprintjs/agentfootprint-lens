# Lens compatibility inputs

The stable source and packed consumer gates read the committed registry
cohort. The compatibility input here serves one job.

- `materialize.mjs` and `gates.mjs` run the independently installed
  historical published commentary CONTROL. Its own temporary strict
  lock pins AgentFootprint 14.7.2, FootPrint 12.3.0, Foottrace 1.11.1 and
  Explainable UI 1.0.1. Its checked-out source inventory, resolved lock
  and installed versions are checked before and after each gate.

The facade is the only external entry. Private modules own the bootstrap
and installed identity checks. The CLI is hosted-only. It has no arbitrary
producer, credentials, retry, rebuild, alias, peer rewrite or registry/native
fallback. The retired renderer download (`fetch-renderer`) is an unknown
action. Every renderer now comes from the registry (see `../README.md`).

The source lock uses the stable registry cohort. The separate packed matrix
checks that cohort in its strict consumer lock, and tests this checkout's
original Lens archive with the selected registry renderer. Source development
uses renderer 2.2.0, and the packed matrix also exercises the 1.0.1
native-source API. The original historical replay fixtures remain unchanged.

Adjacent tests check the control's source inventory without installing
packages. Full installs, builds, runtime and consumer gates
run in hosted CI.
