# Trust boundary evidence reader

This module reads the version 1 `TrustBoundaries` bundles retained in a run
snapshot. It validates and copies only the producer's metadata fields into
frozen captures. It does not scan event history, reconstruct decisions, or
require an unpublished AgentFootprint type dependency.

`readTrustBoundaries(snapshot)` returns available captures or an explicit
missing, invalid, or unsupported result. A malformed capture is not partially
displayed. Counts must reconcile, facts must have increasing observation
sequences, and retained bounds must match the facts. Unknown content fields
are neither read nor copied. Multiple recorder IDs remain separate captures.

`TrustBoundaryView` presents the seven recorded event kinds and the capture's
loss counters. An allow may come from a quiet wrapper; a changed value is not
proof of redaction; an after-tool refusal does not undo execution. Missing
facts do not establish coverage or safety.

Source navigation uses the shared cursor's exact source-prefix resolver. It
does not resolve the emitting stage to its eventual commit. A missing log or
invalid coordinate leaves the cursor unchanged. A valid location can still
have withheld or unavailable state. The view does not display state values.

When a shared source prefix is selected, the Lens shell replaces its ordinary
execution panes with a source-only view. Legacy stage folds and final-answer
slots are not mounted. The shared target survives changing audience views or
axes; choosing **Show final execution step** explicitly returns to execution.
This transition resets the shell's local visual drill state, not the recording.

The headless reader tests validate the wire contract and detachment. React
tests check the wording, unavailable-source behavior and the shared cursor
path. The host remains responsible for limiting the complete recording before
it reaches an untrusted viewer; this metadata panel is not an access boundary.
