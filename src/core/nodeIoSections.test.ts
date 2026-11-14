import { describe, expect, it } from 'vitest';
import type { StepNode } from 'agentfootprint/observe';
import { ioSectionsFor } from './nodeIoSections.js';

describe('step input/output facts', () => {
  const node = (patch: Partial<StepNode>): StepNode => ({
    id: 'step', kind: 'tool->llm', label: 'step', subflowPath: [], startOffsetMs: 0, ...patch,
  });
  it('keeps false and empty results as recorded values without a model-input claim', () => {
    for (const result of [false, '', null, []])
      expect(ioSectionsFor(node({ toolResult: result }))).toEqual([
        { label: 'Stored tool result', payload: result },
      ]);
  });
  it('does not invent a result when no payload was recorded', () => {
    expect(ioSectionsFor(node({}))).toEqual([]);
  });
  it('keeps the reasoning and args distinct on a tool proposal', () => {
    expect(ioSectionsFor(node({ kind: 'llm->tool', assistantText: 'Check one item.', toolArgs: {} })))
      .toEqual([{ label: "LLM's reasoning", payload: 'Check one item.' },
        { label: 'Tool input (args)', payload: {} }]);
  });
});
