# Analyst layout comparison

The two unchanged HTML goldens preserve the no-account comparison with Lens
0.67.1 under the same narration inputs. The historical fixture humanizer in
`legacyAnalystNarration/` supplies those inputs only to the two layout oracles.
The separate default-narration test exercises the real production wiring.

The complete old and current humanizer source and narrator construction are
identical: both delegate to the upstream selector/templates. AF 14.7.2 adds
configuration/integrity prose and explicitly skips cost ticks; it does not
change this Lens layout. `src/core/humanizer.test.ts` checks real selector/text
pairs for the locked AF 14.4.0 cohort and the explicit published AF 14.7.2
control job. The selector-port tests independently cover null versus undefined.

This is source-level comparative identity, not a claim that Lens 0.67.1 can be
installed with AF 14: that old release's peer range covers AF 7/8/9 only. These
controls do not establish compatibility with a later major dependency cohort.
