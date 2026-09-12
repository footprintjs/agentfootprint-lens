/**
 * <BugReportButton> when the `/observe` door does not load at all — a chunk
 * that did not arrive, a broken install. The click's `import()` rejects, and
 * the button gives way to `LABELS.doorUnavailable`: a label, not a sentence,
 * with the loader's own message on `title` for whoever hovers at 2am.
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BugReportButton, LABELS } from './BugReportButton.js';

vi.mock('agentfootprint/observe', () => {
  throw new Error('the door chunk did not arrive');
});

afterEach(cleanup);

describe('a door that fails to load', () => {
  it('the click replaces the button with the label, and the reason rides on title', async () => {
    render(<BugReportButton source={{}} issuesUrl="https://github.com/acme/agent/issues" />);
    fireEvent.click(screen.getByTestId('bug-report-open'));

    const label = await screen.findByTestId('bug-report-unavailable');
    expect(label.textContent).toBe(LABELS.doorUnavailable);
    expect(label.getAttribute('role')).toBe('alert');
    // The loader's own words, unedited — here vitest's, which wraps a
    // throwing factory in its own message; in a browser, the module loader's.
    expect(label.getAttribute('title')).toMatch(/\S/);
    expect(screen.queryByTestId('bug-report-open')).toBeNull();
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();
  });
});
