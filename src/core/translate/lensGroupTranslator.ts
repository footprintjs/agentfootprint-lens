/**
 * lensGroupTranslator — kind-discriminated dispatcher composing the
 * six per-kind translators into a single `GroupTranslator` ready to
 * pass to any agentfootprint composition's `groupTranslator`
 * constructor option (or `getUIGroupWith(...)` per-method override).
 *
 * Layer 2.4 (dispatcher) / Lens v0.1 translator pipeline.
 *
 * Recursion strategy
 * ──────────────────
 *   The per-kind translators are PURE — they don't import the
 *   dispatcher and don't recurse on their own. Instead, each
 *   compound translator (Parallel / Sequence / Loop / Conditional)
 *   takes a `MemberResolver` callback. The dispatcher constructs a
 *   resolver that:
 *
 *     1. If `member.uiGroup` is already populated (because the
 *        consumer wired a `groupTranslator` at that level), trust
 *        it and cast to `LensGroupOutput`.
 *     2. Otherwise call `member.runner.getUIGroupWith(lensGroupTranslator)`
 *        to recurse with the same dispatcher. This means the
 *        consumer only needs to wire `lensGroupTranslator` ONCE
 *        at the top of the tree.
 *     3. If both paths yield undefined, throw — the member's
 *        runner doesn't expose any UI group shape, which is a
 *        consumer bug (or a footprintjs bug if a built-in runner
 *        forgot to implement `buildUIGroupMetadata`).
 *
 * Why a single dispatcher, not a Map of translators
 * ──────────────────────────────────────────────────
 *   A `switch` on the discriminator keeps the dispatcher
 *   well-typed without `as` casts: the compiler narrows
 *   `metadata.kind` inside each branch so the per-kind translator
 *   call type-checks. A `Record<GroupKind, GroupTranslator>` would
 *   widen the `metadata` argument and lose narrowing.
 *
 * Pure function — no closures over module state. The dispatcher is
 * its own resolver: the `getUIGroupWith` call passes a reference to
 * the same exported function, closing the recursion cleanly.
 */

import type { GroupMember, GroupMetadata, GroupTranslator } from 'agentfootprint';
import { translateAgent } from './perKind/translateAgent.js';
import { translateConditional } from './perKind/translateConditional.js';
import { translateLLMCall } from './perKind/translateLLMCall.js';
import { translateLoop } from './perKind/translateLoop.js';
import { translateParallel } from './perKind/translateParallel.js';
import { translateSequence } from './perKind/translateSequence.js';
import type { MemberResolver } from './perKind/MemberResolver.js';
import type { LensGroupOutput } from './types.js';

function isLensGroupOutput(value: unknown): value is LensGroupOutput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { nodes?: unknown; edges?: unknown; rootNodeId?: unknown };
  return (
    Array.isArray(v.nodes) &&
    Array.isArray(v.edges) &&
    typeof v.rootNodeId === 'string'
  );
}

const resolve: MemberResolver = (member: GroupMember): LensGroupOutput => {
  if (member.uiGroup !== undefined) {
    if (!isLensGroupOutput(member.uiGroup)) {
      throw new TypeError(
        `lensGroupTranslator: member '${member.memberId}' has a uiGroup but it is not a LensGroupOutput. ` +
          `A consumer wired a different GroupTranslator at that level — Lens cannot consume the result.`,
      );
    }
    return member.uiGroup;
  }
  const fromRunner = member.runner.getUIGroupWith<LensGroupOutput>(
    lensGroupTranslator,
  );
  if (fromRunner === undefined) {
    throw new Error(
      `lensGroupTranslator: member '${member.memberId}' has no translatable UI group shape — its runner returned undefined from getUIGroupWith.`,
    );
  }
  return fromRunner;
};

/**
 * Translate one `GroupMetadata` into a `LensGroupOutput`. Dispatches
 * to the appropriate per-kind translator based on `metadata.kind`.
 * Throws `TypeError` on unknown kinds — keeps the union closed at
 * runtime, not just at compile time.
 */
export const lensGroupTranslator: GroupTranslator<LensGroupOutput> = (
  metadata: GroupMetadata,
): LensGroupOutput => {
  switch (metadata.kind) {
    case 'LLMCall':
      return translateLLMCall(metadata);
    case 'Agent':
      return translateAgent(metadata);
    case 'Sequence':
      return translateSequence(metadata, resolve);
    case 'Loop':
      return translateLoop(metadata, resolve);
    case 'Conditional':
      return translateConditional(metadata, resolve);
    case 'Parallel':
      return translateParallel(metadata, resolve);
    default: {
      const exhaustive: never = metadata.kind;
      throw new TypeError(
        `lensGroupTranslator: unknown GroupMetadata.kind '${exhaustive as string}'`,
      );
    }
  }
};
