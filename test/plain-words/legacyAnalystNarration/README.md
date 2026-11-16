# Fixed narration for the two historical analyst layout oracles

These inputs preserve the nine original captions/null decisions for the fixed
`flat-dynamic-tools` recording. The two historical HTML goldens test byte-identical
layout **with the same narration inputs**, not the installed dependency's current
commentary policy. The helper calls no default humanizer or upstream selector;
an unrecognized event type/runtime-stage pair fails instead of falling through.
The fixture-byte check also prevents changed payloads with unchanged identities
from silently reusing this historical oracle; it is an immutability check, not
an authenticity claim.

Only those two snapshot mounts use it. Separate, unmocked DOM tests exercise Lens's
real default humanizer, app name, registered tool description and template wiring.
