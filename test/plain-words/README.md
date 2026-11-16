# Analyst layout comparison

The two unchanged HTML goldens preserve the no-account comparison with Lens
0.67.1, under the same narration inputs. The complete old and current humanizer
source and narrator construction are identical: both delegate to the upstream
selector/templates. AF 14.7.2 adds configuration/integrity prose and explicitly
skips cost ticks; it does not change this Lens layout.

The existing template-override port fixes only those two historical fixture
lines. Production defaults remain untouched. `src/core/humanizer.test.ts`
separately asserts the real selector and default voice under the locked AF
14.4.0 cohort and the explicit published AF 14.7.2 control job. No golden is
regenerated, text normalized away, or failure skipped.

This is source-level comparative identity, not a claim that Lens 0.67.1 can be
installed with AF 14: that old release's peer range covers AF 7/8/9 only.
