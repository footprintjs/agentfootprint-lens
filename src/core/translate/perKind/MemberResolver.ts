/**
 * MemberResolver — per-kind translator callback for resolving a
 * `GroupMember` into the `LensGroupOutput` of its subgraph.
 *
 * Layer 2 (per-kind translator interfaces, pure) / Lens v0.1.
 *
 * Why parameterise this in
 * ────────────────────────
 *   Per-kind translators are PURE — they must not close over module
 *   state or import the dispatcher. The dispatcher (L2.4) constructs
 *   a `MemberResolver` that recurses via
 *   `member.runner.getUIGroupWith(lensGroupTranslator)` when
 *   `member.uiGroup` is undefined, and passes the resolver to the
 *   per-kind translator. This keeps the recursion in ONE place
 *   (the dispatcher) and makes per-kind translators trivially
 *   testable against any `LensGroupOutput` you can hand-construct.
 *
 * Contract
 * ────────
 *   Given a `GroupMember`, return its `LensGroupOutput`. The
 *   dispatcher's default resolver throws when both `member.uiGroup`
 *   is undefined AND `member.runner.getUIGroupWith(...)` returns
 *   undefined (meaning the member's runner does not expose any UI
 *   group shape — caller bug). Per-kind translators trust the
 *   resolver to always succeed or throw upstream — they do not
 *   tolerate undefined return values themselves.
 */

import type { GroupMember } from 'agentfootprint';
import type { LensGroupOutput } from '../types.js';

export type MemberResolver = (member: GroupMember) => LensGroupOutput;
