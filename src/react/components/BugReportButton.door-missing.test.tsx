/**
 * <BugReportButton> on an agentfootprint whose `/observe` door LOADS but
 * carries no substrate (older than 9.9): the click loads the door, finds no
 * `describeBugReport`, and the button gives way to the version hint — the
 * same hint a handed-in `api={{}}` renders at once.
 *
 * The door is mocked at the specifier, so this file is the one place the
 * "loaded, but absent" branch is exercised; the real door has its own file.
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BugReportButton } from './BugReportButton.js';

// A dynamic import's namespace answers `undefined` for a name the door does
// not export; vitest's mock proxy would THROW on it instead, so the three
// names are spelled out as absent.
vi.mock('agentfootprint/observe', () => ({
  describeBugReport: undefined,
  exportBugReport: undefined,
  githubDeviceSignIn: undefined,
}));

afterEach(cleanup);

describe('a door without the substrate', () => {
  it('the button renders, and the click replaces it with the version hint', async () => {
    render(<BugReportButton source={{}} issuesUrl="https://github.com/acme/agent/issues" />);
    const button = screen.getByTestId('bug-report-open');
    expect(screen.queryByTestId('bug-report-unsupported')).toBeNull();

    fireEvent.click(button);
    const hint = await screen.findByTestId('bug-report-unsupported');
    expect(hint.textContent).toContain('agentfootprint 9.9 or newer');
    expect(screen.queryByTestId('bug-report-open')).toBeNull();
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();
  });
});
