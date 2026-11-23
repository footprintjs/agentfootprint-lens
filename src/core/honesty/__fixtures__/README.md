# Honesty Lens recording fixtures

These recordings were produced by AgentFootprint 16.0.0 with scripted replies from its mock provider and example tools. Each archive contains the recorded run and the producer's answer assessment for comparison. Event ordinals are zero-based and refer to the original recording.

- `switch-coverage.json.gz` contains 39 events. It records a switch lookup with a coverage gap and an answer assessed as `not-sure`. Two events share a timestamp, position and call ID. The assessment names the call. The recording has no sentence link or delivery confirmation.
- `schema-retry.json.gz` contains 41 events. The schema rejects a string amount and the next model call supplies a number. The standing is `not-assessed`. The first draft, recorded retry and second model call have separate event addresses.

Use the recording as projection input and the separate assessment as a fixture expectation. Both archives are copied byte for byte from the STAND example captures.


`mounted-17.json.gz` comes from the published 17.0.0 producer with a mock provider. A parent Agent runs a child inside its memory flow. Both turns share a native run ID. The child and parent terminal responses remain visible. `mounted-served-17.json.gz` records the same fixture under a producer policy. Model-start payloads and the final response values are withheld while terminal coordinates stay visible.
