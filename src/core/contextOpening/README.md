# Context recording opening

This async feature chart is the decoded-input entry used by WhyLens. It runs
the one existing pure `readAgentRecording` query, routes its verdict with
`decide()`, and records accepted/refused. Each stage has its own folder,
README and tests. Stages import shared contracts, never sibling stages.

A per-run result cell holds the actual immutable projection. Chart scope and
its returned trace contain only admission/context flags and the disposition;
raw values, resolvers and source records never enter the debug log. The
legacy synchronous recording query and legacy mount path stay synchronous.
The async React adapter discards results from superseded inputs.
