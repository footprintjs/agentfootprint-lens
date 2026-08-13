/**
 * The artifacts.* humanizer lines — the claim-check lifecycle read as prose
 * in the EventStream. Matched by raw type string (the events are newer than
 * the union this package compiles against), and honest about the actor:
 * a wire redemption has NO tool, and the line says "The screen", never a
 * phantom tool name.
 */
import { describe, expect, it } from 'vitest';
import type { AgentfootprintEvent } from 'agentfootprint/events';
import { defaultHumanizer } from './humanizer.js';

const event = (type: string, payload: unknown): AgentfootprintEvent =>
  ({ type, payload, meta: {} }) as unknown as AgentfootprintEvent;

describe('defaultHumanizer — agentfootprint.artifacts.*', () => {
  it('minted: names the tool, the label and the ticket', () => {
    const line = defaultHumanizer(
      event('agentfootprint.artifacts.minted', {
        ref: 'art_h7Kq2v',
        kind: 'dataset/rows',
        mediaType: 'application/json',
        bytes: 6_400_000,
        label: 'Q3 rows',
        tool: 'get_data',
      }),
    );
    expect(line).toContain('get_data');
    expect(line).toContain('"Q3 rows"');
    expect(line).toContain('art_h7Kq2v [dataset/rows · 6.1 MB]');
  });

  it('resolved: a tool redemption names the tool; a wire redemption says "The screen"', () => {
    const byTool = defaultHumanizer(
      event('agentfootprint.artifacts.resolved', {
        ref: 'art_h7Kq2v',
        via: 'get',
        kind: 'dataset/rows',
        bytes: 1024,
        tool: 'transform_report',
      }),
    );
    expect(byTool).toContain('Tool "transform_report" fetched');

    const byWire = defaultHumanizer(
      event('agentfootprint.artifacts.resolved', {
        ref: 'art_h7Kq2v',
        via: 'head',
        kind: 'chart/spec',
        bytes: 41984,
      }),
    );
    expect(byWire).toContain('The screen described');
    expect(byWire).not.toContain('Tool');
  });

  it('expired: states the sweep and that the absence will be stated', () => {
    const line = defaultHumanizer(
      event('agentfootprint.artifacts.expired', {
        ref: 'art_old',
        reason: 'ttl',
        kind: 'report/csv',
        bytes: 2048,
        tool: 'store_report',
      }),
    );
    expect(line).toContain('swept (ttl)');
    expect(line).toContain('art_old');
  });

  it("refused: carries the op, the reason and the refusal's own sentence", () => {
    const line = defaultHumanizer(
      event('agentfootprint.artifacts.refused', {
        op: 'get',
        reason: 'missing-or-expired',
        ref: 'art_gone',
        detail: 'nothing under that ref in this scope',
      }),
    );
    expect(line).toContain("get for 'art_gone' refused: missing-or-expired");
    expect(line).toContain('nothing under that ref in this scope');
  });

  it('presented: the hand-to-the-screen line, meta only', () => {
    const line = defaultHumanizer(
      event('agentfootprint.artifacts.presented', {
        ref: 'art_h7Kq2v',
        as: 'bar-chart',
        snapshot: {
          kind: 'chart/spec',
          mediaType: 'application/json',
          bytes: 41984,
          label: 'Q3 sales by region',
        },
        toolCallId: 't9',
        iteration: 3,
      }),
    );
    expect(line).toContain('"Q3 sales by region"');
    expect(line).toContain("as 'bar-chart'");
    expect(line).toContain('art_h7Kq2v [chart/spec · 41.0 KB]');
  });
});
