# Saved record corpus for the `/record` lanes

These three files are copied byte for byte from
`footprintjs/explainable-ui` at tag `v2.0.0`, commit
`39166fe66d33d7e522d6729f07808414b3433a9d`, directory `pilots/record-lens`
(`fixtures/flow.json`, `fixtures/hci.json`, `runtime-fixtures.cjs`). Each Git
blob there is the same blob as at the reviewed reader commit `0af1a2d0`.

They live here so the required check reads only this commit. CI does not
fetch them. `record-renderer.mjs` pins each file's SHA256 and refuses any
extra file. Do not format or edit them. To change them, copy new bytes from
an immutable upstream tag and update the pins in the same commit.

The 2.0.0 compatibility lanes run them against the published
`footprint-explainable-ui@2.0.0` archive, checked against the registry SRI.
