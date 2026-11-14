# core/ — headless recording and graph data

`recordingInput.ts` owns recording recognition, envelope unwrapping and the
refusal facts shared by the mount components. It reads no React state and
renders nothing. Its four shared-gate cases live beside it.

`render/` turns graph data into positioned nodes. React views call that data
pipeline. Public exports remain selected by `index.ts`;
an internal module's location does not add a public export.

`nodeIoSections.ts` owns the headless per-step input/output sections used by
the detail panel. A retained tool result is labelled as stored data, never as
evidence that those bytes crossed into a model call.
