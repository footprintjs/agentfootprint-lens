# Real producer-decoded context fixture

`producer.json` is a synthetic three-call MockProvider run captured through
agentfootprint's real `recordContextRun`, encoded by the concrete foottrace
value-table adapter, then read by `readContextRecording`. It contains no
provider calls, credentials or private application data. The dictionary is
the reader's own resolved values; it is not a handwritten stand-in codec.

The checked-in fixture was generated with the existing approved AF build
recorded by its provenance, and a focused compilation of the upstream public
value adapter. It proves a real producer port, not installation of a newer
published AF peer. A fresh exact-source candidate run can provide another
fixture through `LENS_CONTEXT_FIXTURE`; the same contract test checks both.

The test compares copied UTF-8 bytes and expands every captured provider
request to its exact JSON values. Its log is the size evidence. Values remain
exact; the copied view is a presentation with explicit dictionary matches,
not another importable recording format.
