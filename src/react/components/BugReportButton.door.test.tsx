/**
 * <BugReportButton> loads the `/observe` door when it is PRESSED — end to end.
 *
 * Every other test of this component drives it through the `api` prop. This
 * file drives it through the real thing: no `api`, a click, the installed
 * agentfootprint's `describeBugReport` measuring the repo's recorded turn, the
 * dialog over that manifest, and a report produced from it. What it pins:
 *
 *   · before the click nothing of the door is needed — the button renders
 *     from a component whose module never imported it (the packaging test
 *     proves that at the dist; here it is the click that makes the door load);
 *   · the pressed state is the modes' own pending affordance (`Working…`,
 *     disabled, `aria-busy`) until the door arrives;
 *   · the dialog that opens is over the LIBRARY's manifest of the run;
 *   · the second open is immediate — the door is read once;
 *   · a handed-in `api` is read at render and never loads the door.
 *
 * Skips when the installed agentfootprint has no substrate (the peer range
 * admits 7.x), the way `selection.test.ts` does — the degraded paths have
 * their own files, with the door mocked.
 */

/** @vitest-environment jsdom */

import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BugReportButton, LABELS } from './BugReportButton.js';
import type { BugReportApi } from '../../core/bugReport/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', '__fixtures__');
const recording = JSON.parse(
  readFileSync(join(FIXTURES, 'recorded-turn.json'), 'utf8'),
) as Record<string, unknown>;
const ISSUES = 'https://github.com/acme/agent/issues';

// Read as `unknown`: the peer range admits an agentfootprint whose door has
// no `describeBugReport`, and this file skips rather than fails there.
const door = (await import('agentfootprint/observe')) as Record<string, unknown>;
const describeBugReport = door.describeBugReport as BugReportApi['describeBugReport'] | undefined;
const substrate = typeof describeBugReport === 'function';

let created: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  Object.defineProperty(globalThis.window, 'open', { configurable: true, value: vi.fn().mockReturnValue({}) });
  created = vi.fn().mockReturnValue('blob:zip');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: created });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const button = (): HTMLButtonElement => screen.getByTestId('bug-report-open') as HTMLButtonElement;

describe.runIf(substrate)('the door loads at click time, from the installed agentfootprint', () => {
  it('click → Working… → the dialog over the library\'s manifest → a report is produced', async () => {
    render(<BugReportButton source={recording} issuesUrl={ISSUES} />);

    // Before the click: the button, idle, with its own label.
    expect(button().textContent).toBe('Report a bug with this run');
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('data-phase')).toBe('closed');
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();

    fireEvent.click(button());

    // Pressed: the modes' pending affordance, while the door is on its way.
    expect(button().textContent).toBe(LABELS.working);
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().getAttribute('data-phase')).toBe('loading');

    // The door arrived: the dialog, over what agentfootprint measured.
    const modal = await screen.findByTestId('bug-report-modal');
    expect(modal.getAttribute('data-phase')).toBe('form');
    const manifest = describeBugReport!(recording, {});
    expect(manifest.units.length).toBeGreaterThan(0);
    for (const unit of manifest.units) expect(screen.getByTestId(`unit-${unit.id}`)).toBeTruthy();
    expect(button().getAttribute('data-phase')).toBe('open');
    expect(button().disabled).toBe(false);

    // The report: title, then the mode that is always there.
    fireEvent.change(screen.getByTestId('field-title'), { target: { value: 'It loops' } });
    fireEvent.click(screen.getByTestId('submit-copy'));
    await waitFor(() => expect(screen.getByTestId('bug-report-result')).toBeTruthy());
    expect(screen.getByTestId('bug-report-result').textContent).toContain('Report prepared.');
    // The zip the library built reached the browser's save path.
    expect(created).toHaveBeenCalledTimes(1);
    const blob = created.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('the second open is immediate — the door is read once', async () => {
    render(<BugReportButton source={recording} issuesUrl={ISSUES} />);
    fireEvent.click(button());
    await screen.findByTestId('bug-report-modal');
    fireEvent.click(screen.getByTestId('bug-report-close'));
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();
    expect(button().getAttribute('data-phase')).toBe('closed');

    fireEvent.click(button());
    // Synchronously open: no Working… in between.
    expect(screen.getByTestId('bug-report-modal')).toBeTruthy();
    expect(button().textContent).toBe('Report a bug with this run');
  });

  it('a handed-in api is read at render, and opens without a load', () => {
    const api: BugReportApi = {
      describeBugReport: () => ({ units: [], redactedKeys: [], warnings: [], notes: [] }),
      exportBugReport: () => ({ manifest: { units: [] }, zip: new Uint8Array(), filename: 'x.zip' }),
    };
    render(<BugReportButton source={recording} issuesUrl={ISSUES} api={api} />);
    fireEvent.click(button());
    expect(screen.getByTestId('bug-report-modal')).toBeTruthy();
  });
});

describe('LABELS', () => {
  it('are labels — short, and the pending word is the modes\' own', () => {
    for (const value of Object.values(LABELS)) {
      expect(value.split(/\s+/).length).toBeLessThanOrEqual(7);
    }
    expect(LABELS.working).toBe('Working…');
  });
});
