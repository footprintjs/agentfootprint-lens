# Foottrace consumer contract

Run `npm run test:contract:foottrace` after the repository's normal dependency
installation. CI runs the same command. To test an upstream candidate, first install
its published version or archive into this checkout without saving the manifest
(for example `npm install --no-save --package-lock=false /absolute/foottrace.tgz`),
then run the command. The suite does not install or publish anything.

The suite parses production `src` imports on every run using TypeScript's AST.
It excludes tests, fixtures, and `__contract__`; aliases resolve to the upstream
export name. Runtime behavior cases and the strict type fixture must cover exactly
those imports. An added or removed import fails until its consumer contract is
updated; namespace, re-export, `require`, dynamic, and inline import-type forms
cannot silently escape that check.

The current consumer uses root readers, cursor movement and strategies, ID parsing,
backward slices and their display projections, plus `/paths`. It does not exercise
unimported producer or saved-store adapters. Saved JSON is passed through the
imported `stateAt` reader. Both public ESM and CommonJS module doors are resolved;
strict NodeNext declaration checks run before the behavior tests, with no retries.

For a patch or minor candidate, a failure is an upstream regression until evidence
proves downstream staleness. An intended breaking change requires an upstream major
and a consumer update against its release candidate. See the ecosystem agent rules
for release ordering; this suite does not choose release policy.
