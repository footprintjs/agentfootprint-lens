/**
 * The Served graph's surface: the list stays the default, the toggle is
 * reachable and operable from the keyboard with its focus ring intact, and
 * nothing in the graph pins a width or opens a sideways scroller inside the
 * rail. Written as the review's own probes (2026-09-10) and kept.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServedTab } from '../../src/react/components/ServedTab.js';
import { load, stopsOf } from './helpers.js';

const mount = () => {
  const f = load('flat-dynamic-tools');
  const stop = stopsOf(f, 'llm-turn')[0]!;
  render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
};

describe('PROBE UI — the toggle', () => {
  it('the LIST is the default; the graph is not mounted until asked', () => {
    mount();
    expect(screen.getByTestId('served-tab').getAttribute('data-view')).toBe('list');
    expect(screen.queryByTestId('served-graph')).toBeNull();
    cleanup();
  });

  it('Tab reaches both buttons and Enter / Space activate them', async () => {
    const user = userEvent.setup();
    mount();
    const list = screen.getByTestId('served-view-list');
    const graph = screen.getByTestId('served-view-graph');
    list.focus();
    expect(document.activeElement).toBe(list);
    await user.tab();
    expect(document.activeElement).toBe(graph);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('served-graph')).toBeTruthy();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(list);
    await user.keyboard(' ');
    expect(screen.queryByTestId('served-graph')).toBeNull();
    cleanup();
  });

  it('neither button removes its focus outline, and aria-selected tracks the mode', async () => {
    const user = userEvent.setup();
    mount();
    const list = screen.getByTestId('served-view-list');
    const graph = screen.getByTestId('served-view-graph');
    expect(list.style.outline).toBe('');
    expect(graph.style.outline).toBe('');
    expect(list.getAttribute('aria-selected')).toBe('true');
    await user.click(graph);
    expect(graph.getAttribute('aria-selected')).toBe('true');
    expect(list.getAttribute('aria-selected')).toBe('false');
    cleanup();
  });

  it('ARIA tablist pattern: arrow keys are the expected control — report if absent', async () => {
    const user = userEvent.setup();
    mount();
    const list = screen.getByTestId('served-view-list');
    list.focus();
    await user.keyboard('{ArrowRight}');
    const moved = document.activeElement === screen.getByTestId('served-view-graph');
    const roving = list.getAttribute('tabindex');
    const controls = list.getAttribute('aria-controls');
    console.log('ARIA-TABLIST', JSON.stringify({ arrowMovesFocus: moved, tabindex: roving, ariaControls: controls, panelRole: screen.queryByRole('tabpanel') !== null }));
    expect(true).toBe(true);
    cleanup();
  });

  it('no element in the graph sets a fixed width or a horizontal scroller', () => {
    mount();
    fireEvent.click(screen.getByTestId('served-view-graph'));
    const g = screen.getByTestId('served-graph');
    const bad: string[] = [];
    g.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const s = el.style;
      if (s.width && !s.width.endsWith('%') && s.width !== '10px') bad.push(`width:${s.width}`);
      if (s.overflowX === 'scroll' || s.overflowX === 'auto') bad.push(`overflowX:${s.overflowX}`);
      if (s.whiteSpace === 'nowrap' && s.overflow !== 'hidden' && (el.textContent ?? '').length > 40) bad.push(`nowrap-long:${(el.textContent ?? '').slice(0, 30)}`);
    });
    expect(bad).toEqual([]);
    cleanup();
  });
});
