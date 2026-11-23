/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { observeRecording, type Recording } from '../../core/observeRecording.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { SkillGraphDebugger } from './SkillGraphDebugger.js';

afterEach(cleanup);

it('follows the recorded routing stream, rewinds, holds and returns to its live edge', async () => {
  const recording: Recording = JSON.parse(readFileSync('demo/skill-run.json', 'utf8'));
  const events = recording.events!;
  // The saved commit axis is present throughout. Release the authentic events
  // separately to exercise the exact same stable recorder across updates.
  const { recorder, runner } = observeRecording({ ...recording, events: [] });
  if (!runner) throw new Error('The skill-run fixture must contain its original structure');
  // observeRecording's replay dispatcher takes an already-stamped event.
  // The public agent Runner signature describes the producer's two-argument emit.
  const replay = runner as unknown as { emit(event: (typeof events)[number]): void };
  function Host() {
    const shared = useSharedCursor(recorder);
    const peer = shared.forAxis('step');
    return <>
      <output data-testid="peer-address">{peer.at.runtimeStageId}</output>
      <button onClick={() => {
        const firstContext = peer.resolve('context#6');
        if (!firstContext.ok) throw new Error('Missing recorded context step');
        peer.moveTo(firstContext.step);
      }}>First context</button>
      <button onClick={() => peer.moveTo(peer.total - 1)}>Latest</button>
      <SkillGraphDebugger recorder={recorder} shared={shared} lens="product" />
    </>;
  }

  const { unmount } = render(<Host />);
  let sent = 0;
  const sendUntil = async (end: number) => {
    await act(async () => {
      for (; sent < end; sent++) replay.emit(events[sent]!);
    });
  };
  const check = async (total: number, active: number, skill: string) => {
    await waitFor(() => {
      expect(screen.getAllByTestId(/^beat-\d+$/)).toHaveLength(total);
      expect(screen.getByTestId(`beat-${active}`).getAttribute('data-active')).toBe('true');
      expect(screen.getByTestId(`skill-node-${skill}`).getAttribute('data-state')).toBe('current');
      expect(screen.getAllByTestId(/^narrative-beat-\d+$/)).toHaveLength(active + 1);
    });
  };
  try {
    expect(screen.queryByTestId('beat-0')).toBeNull();
    await sendUntil(32);
    await check(1, 0, 'support');
    await sendUntil(82);
    await check(3, 2, 'billing');
    fireEvent.click(screen.getByRole('button', { name: 'First context' }));
    await check(3, 0, 'support');
    expect(screen.getByTestId('peer-address').textContent).toBe('context#6');
    await sendUntil(115);
    await check(4, 0, 'support');
    expect(screen.getByTestId('peer-address').textContent).toBe('context#6');
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    await check(4, 3, 'refunds');
    await sendUntil(events.length);
    await check(5, 4, 'refunds');
    expect(sent).toBe(153);
  } finally {
    unmount();
    recorder.detach();
  }
});
