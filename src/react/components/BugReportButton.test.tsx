/**
 * <BugReportButton> — the consent dialog, the meter, and the three modes.
 *
 * Every test drives the component through the `api` prop, which is the same
 * seam a consumer would use to hand it a different agentfootprint build: the
 * library's two functions and the device sign-in, stubbed. Nothing here
 * touches the network, and the one place a token exists is asserted to be the
 * only place it appears.
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BugReportButton } from './BugReportButton.js';
import type {
  BugReportApi,
  BugReportManifestView,
  BugReportUnitView,
  DeviceIdentityView,
} from '../../core/bugReport/index.js';

const MB = 1024 * 1024;
const ISSUES = 'https://github.com/acme/agent/issues';

const conv = (id: string, mb: number): BugReportUnitView => ({
  id,
  kind: 'conversation',
  label: `${id} — session ${id}: 1 run, 4 turns, 40 events`,
  bytes: mb * MB,
  eventCount: 40,
  turnCount: 4,
});

const manifestOf = (units: readonly BugReportUnitView[]): BugReportManifestView => ({
  units,
  redactedKeys: ['apiKey'],
  warnings: [],
  notes: [],
  environment: { agentfootprint: '9.9.0', footprintjs: '9.15.0', node: 'v20.11.0' },
});

const SMALL = manifestOf([
  conv('conv-1', 1),
  conv('conv-2', 1),
  conv('conv-3', 1),
  conv('conv-4', 1),
  conv('conv-5', 1),
  { id: 'file-narrative', kind: 'file', label: 'narrative.txt — the run in sentences', bytes: 4096 },
]);

const BIG = manifestOf([conv('conv-1', 4), conv('conv-2', 11), conv('conv-3', 20)]);

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22]);

/** The library's two functions, stubbed — the export echoes the selection back. */
function stubApi(manifest: BugReportManifestView, extra: Partial<BugReportApi> = {}): BugReportApi {
  return {
    describeBugReport: () => manifest,
    exportBugReport: (_input, options) => ({
      manifest: { ...manifest, selected: options.include ?? manifest.units.map((u) => u.id) },
      zip: ZIP,
      filename: '2026-08-11-it-loops.zip',
    }),
    ...extra,
  };
}

const open = (props: Partial<React.ComponentProps<typeof BugReportButton>> = {}): void => {
  render(
    <BugReportButton
      source={{ events: [], snapshot: {} }}
      issuesUrl={ISSUES}
      api={stubApi(SMALL)}
      {...props}
    />,
  );
  fireEvent.click(screen.getByTestId('bug-report-open'));
};

const fillRequired = (): void => {
  fireEvent.change(screen.getByTestId('field-title'), { target: { value: 'It loops' } });
  fireEvent.change(screen.getByTestId('field-steps'), {
    target: { value: '1. ask for a refund\n2. watch iteration 3' },
  });
};

const box = (id: string): HTMLInputElement => screen.getByTestId(`unit-${id}`) as HTMLInputElement;

// ─── Environment stubs ───────────────────────────────────────────────

let writeText: ReturnType<typeof vi.fn>;
let opened: ReturnType<typeof vi.fn>;
let created: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  opened = vi.fn().mockReturnValue({});
  Object.defineProperty(globalThis.window, 'open', { configurable: true, value: opened });
  created = vi.fn().mockReturnValue('blob:zip');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: created });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Feature detection ───────────────────────────────────────────────

describe('an agentfootprint without the substrate', () => {
  it('renders a version hint instead of the button', () => {
    render(<BugReportButton source={{}} issuesUrl={ISSUES} api={{}} />);
    expect(screen.getByTestId('bug-report-unsupported').textContent).toContain(
      'agentfootprint 9.9 or newer',
    );
    expect(screen.queryByTestId('bug-report-open')).toBeNull();
  });

  it('half the substrate is still absent — describe without export does not open', () => {
    render(
      <BugReportButton source={{}} issuesUrl={ISSUES} api={{ describeBugReport: () => SMALL }} />,
    );
    expect(screen.queryByTestId('bug-report-open')).toBeNull();
  });
});

// ─── The consent manifest ────────────────────────────────────────────

describe('the consent manifest', () => {
  it('renders one row per unit, with its label and size', () => {
    open();
    expect(screen.getByTestId('bug-report-modal')).toBeTruthy();
    for (const unit of SMALL.units) expect(box(unit.id)).toBeTruthy();
    expect(screen.getByText(/narrative.txt — the run in sentences/)).toBeTruthy();
    expect(screen.getAllByText(/1.0 MB · 40 events · 4 turns/)).toHaveLength(5);
  });

  it('ticks the 3 most recent conversations and leaves the older ones alone', () => {
    open();
    expect(box('conv-1').checked).toBe(false);
    expect(box('conv-2').checked).toBe(false);
    expect(box('conv-3').checked).toBe(true);
    expect(box('conv-4').checked).toBe(true);
    expect(box('conv-5').checked).toBe(true);
  });

  it('honours defaultRecentConversations', () => {
    open({ defaultRecentConversations: 1 });
    expect(box('conv-4').checked).toBe(false);
    expect(box('conv-5').checked).toBe(true);
  });

  it('derived files ride the selection by default', () => {
    open();
    expect(box('file-narrative').checked).toBe(true);
  });

  it('names the redacted keys, and says the values never left', () => {
    open();
    const line = screen.getByTestId('bug-report-redacted').textContent ?? '';
    expect(line).toContain('apiKey');
    expect(line).toContain('never left this machine');
  });

  it('a checkbox is a checkbox — keyboard toggling works', () => {
    open();
    const target = box('conv-1');
    target.focus();
    expect(document.activeElement).toBe(target);
    fireEvent.click(target); // what Space does to a focused checkbox
    expect(box('conv-1').checked).toBe(true);
  });
});

// ─── The meter ───────────────────────────────────────────────────────

describe('the live size meter', () => {
  it('counts only what is ticked, against the 24 MB ceiling', () => {
    open();
    expect(screen.getByTestId('bug-report-meter').textContent).toContain('3.0 MB of 24.0 MB');
  });

  it('recomputes on every toggle', () => {
    open();
    fireEvent.click(box('conv-1'));
    expect(screen.getByTestId('bug-report-meter').textContent).toContain('4.0 MB of 24.0 MB');
    fireEvent.click(box('conv-1'));
    expect(screen.getByTestId('bug-report-meter').textContent).toContain('3.0 MB of 24.0 MB');
  });

  it('goes over, names the unit to untick, and refuses to submit', () => {
    open({ api: stubApi(BIG) });
    fillRequired();
    const meter = screen.getByTestId('bug-report-meter');
    expect(meter.getAttribute('data-state')).toBe('over');
    expect(screen.getByTestId('bug-report-trim-hint').textContent).toContain(
      'Untick conv-3 (20.0 MB) to fit.',
    );
    expect((screen.getByTestId('submit-copy') as HTMLButtonElement).disabled).toBe(true);
  });

  it('unticking the named unit flips it back to ready and enables submit', () => {
    open({ api: stubApi(BIG) });
    fillRequired();
    fireEvent.click(box('conv-3'));
    const meter = screen.getByTestId('bug-report-meter');
    expect(meter.getAttribute('data-state')).toBe('ready');
    expect(screen.queryByTestId('bug-report-trim-hint')).toBeNull();
    expect((screen.getByTestId('submit-copy') as HTMLButtonElement).disabled).toBe(false);
  });

  it('states that the number is an estimate, and which way it errs', () => {
    open();
    expect(screen.getByTestId('bug-report-meter').textContent).toContain(
      'the real zip is this size or smaller',
    );
  });

  it('refuses a report with no conversation in it', () => {
    open();
    for (const id of ['conv-3', 'conv-4', 'conv-5']) fireEvent.click(box(id));
    fillRequired();
    expect((screen.getByTestId('submit-copy') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('bug-report-meter').textContent).toContain(
      'Tick at least one conversation',
    );
  });

  it('refuses an untitled report — an untitled issue is one nobody triages', () => {
    open();
    expect((screen.getByTestId('submit-copy') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('field-title'), { target: { value: 'It loops' } });
    expect((screen.getByTestId('submit-copy') as HTMLButtonElement).disabled).toBe(false);
  });
});

// ─── Mode availability matrix ────────────────────────────────────────

describe('which submit modes are offered', () => {
  const modes = (): string[] =>
    ['submit-copy', 'submit-signin', 'submit-relay'].filter((id) => screen.queryByTestId(id));

  it('bare props: copy + download only, and it is never a dead end', () => {
    open();
    expect(modes()).toEqual(['submit-copy']);
  });

  it('deviceClientId adds sign-in', () => {
    open({
      deviceClientId: 'Iv1.abc',
      api: stubApi(SMALL, { signIn: vi.fn() as BugReportApi['signIn'] }),
    });
    expect(modes()).toEqual(['submit-copy', 'submit-signin']);
  });

  it('endpoint adds file-automatically', () => {
    open({ endpoint: '/api/bug-report' });
    expect(modes()).toEqual(['submit-copy', 'submit-relay']);
  });

  it('both props: all three', () => {
    open({
      deviceClientId: 'Iv1.abc',
      endpoint: '/api/bug-report',
      api: stubApi(SMALL, { signIn: vi.fn() as BugReportApi['signIn'] }),
    });
    expect(modes()).toEqual(['submit-copy', 'submit-signin', 'submit-relay']);
  });

  it('deviceClientId without a sign-in function offers nothing it cannot do', () => {
    open({ deviceClientId: 'Iv1.abc' });
    expect(modes()).toEqual(['submit-copy']);
  });

  it('an issues URL that names no repo still copies and downloads — and says so', () => {
    open({ issuesUrl: 'https://example.com/' });
    expect(screen.getByText(/names no repo, so no form is opened/)).toBeTruthy();
  });
});

// ─── Mode (a): copy + download + prefilled form ──────────────────────

describe('copy report + download zip', () => {
  it('copies a body carrying the reporter’s steps and the manifest table', async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());

    const body = writeText.mock.calls[0]![0] as string;
    expect(body).toContain('### Steps to reproduce');
    expect(body).toContain('2. watch iteration 3');
    expect(body).toContain('| unit | kind | size | events | turns |');
    expect(body).toContain('| `conv-5` | conversation |');
    expect(body).not.toContain('| `conv-1` |');
    expect(body).toContain('- agentfootprint: `9.9.0`');
    expect(body).toContain('`apiKey`');
  });

  it('downloads the zip and opens the prefilled form', async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-copy'));
    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(created).toHaveBeenCalled();
    const url = new URL(opened.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/acme/agent/issues/new');
    expect(url.searchParams.get('title')).toBe('It loops');
    expect(url.searchParams.get('body')).toContain('### Steps to reproduce');
  });

  it('passes labels through to the form', async () => {
    open({ labels: ['bug', 'from-lens'] });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-copy'));
    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(new URL(opened.mock.calls[0]![0] as string).searchParams.get('labels')).toBe(
      'bug,from-lens',
    );
  });

  it('reports what happened, naming the file it saved', async () => {
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-copy'));
    const result = await screen.findByTestId('bug-report-result');
    expect(result.textContent).toContain('on your clipboard');
    expect(result.textContent).toContain('2026-08-11-it-loops.zip');
  });

  it('a browser with no clipboard is told so, and still gets the zip', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    open();
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-copy'));
    const result = await screen.findByTestId('bug-report-result');
    expect(result.textContent).toContain('no clipboard');
    expect(created).toHaveBeenCalled();
  });
});

// ─── Mode (b): device sign-in ────────────────────────────────────────

describe('sign in with GitHub & file as yourself', () => {
  const TOKEN = 'gho_ThisIsTheSecret';

  /** A sign-in whose approval we control, so the state machine can be stepped. */
  function deferredSignIn(): {
    readonly signIn: ReturnType<typeof vi.fn>;
    approve: (identity: DeviceIdentityView) => void;
    deny: (reason: Error) => void;
  } {
    let approve!: (identity: DeviceIdentityView) => void;
    let deny!: (reason: Error) => void;
    const completed = new Promise<DeviceIdentityView>((resolve, reject) => {
      approve = resolve;
      deny = reject;
    });
    completed.catch(() => undefined);
    const signIn = vi.fn().mockResolvedValue({
      userCode: 'WXYZ-1234',
      verificationUri: 'https://github.com/login/device',
      completed,
    });
    return { signIn, approve, deny };
  }

  it('shows the code and the link, and sends nothing until it is approved', async () => {
    const flow = deferredSignIn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    open({ deviceClientId: 'Iv1.abc', api: stubApi(SMALL, { signIn: flow.signIn as BugReportApi['signIn'] }) });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-signin'));

    expect((await screen.findByTestId('device-code')).textContent).toBe('WXYZ-1234');
    expect(screen.getByTestId('device-uri').getAttribute('href')).toBe(
      'https://github.com/login/device',
    );
    expect(screen.getByTestId('bug-report-device').textContent).toContain('Nothing is sent');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(flow.signIn.mock.calls[0]![0]).toMatchObject({ clientId: 'Iv1.abc' });
  });

  it('files the issue on approval and shows its link', async () => {
    const flow = deferredSignIn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/acme/agent/issues/7' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    open({ deviceClientId: 'Iv1.abc', api: stubApi(SMALL, { signIn: flow.signIn as BugReportApi['signIn'] }) });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-signin'));
    await screen.findByTestId('device-code');
    flow.approve({ token: TOKEN, login: 'octocat' });

    const result = await screen.findByTestId('bug-report-result');
    expect(screen.getByTestId('result-issue-url').getAttribute('href')).toBe(
      'https://github.com/acme/agent/issues/7',
    );
    expect(result.textContent).toContain('Filed as @octocat');
    // The zip is not pushed anywhere — said plainly, not discovered later.
    expect(result.textContent).toContain('drag it onto the issue');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.github.com/repos/acme/agent/issues');
  });

  it('the token rides one Authorization header and appears nowhere else', async () => {
    const flow = deferredSignIn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/acme/agent/issues/7' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    open({ deviceClientId: 'Iv1.abc', api: stubApi(SMALL, { signIn: flow.signIn as BugReportApi['signIn'] }) });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-signin'));
    await screen.findByTestId('device-code');
    flow.approve({ token: TOKEN, login: 'octocat' });
    await screen.findByTestId('bug-report-result');

    const init = fetchMock.mock.calls[0]![1] as { headers: Record<string, string>; body: string };
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.body).not.toContain(TOKEN);
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a denied sign-in shows the library’s own sentence, verbatim', async () => {
    const flow = deferredSignIn();
    vi.stubGlobal('fetch', vi.fn());
    open({ deviceClientId: 'Iv1.abc', api: stubApi(SMALL, { signIn: flow.signIn as BugReportApi['signIn'] }) });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-signin'));
    await screen.findByTestId('device-code');
    flow.deny(
      new Error(
        'githubDeviceSignIn: the sign-in was denied on GitHub, so no token was issued. ' +
          'Nothing has been filed.',
      ),
    );

    const error = await screen.findByTestId('bug-report-error');
    expect(error.textContent).toBe(
      'githubDeviceSignIn: the sign-in was denied on GitHub, so no token was issued. ' +
        'Nothing has been filed.',
    );
    expect(screen.queryByTestId('bug-report-result')).toBeNull();
  });

  it('a refusing GitHub is reported as its status and message, never the request', async () => {
    const flow = deferredSignIn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) }),
    );
    open({ deviceClientId: 'Iv1.abc', api: stubApi(SMALL, { signIn: flow.signIn as BugReportApi['signIn'] }) });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-signin'));
    await screen.findByTestId('device-code');
    flow.approve({ token: TOKEN, login: 'octocat' });

    const error = await screen.findByTestId('bug-report-error');
    expect(error.textContent).toContain('GitHub answered 403');
    expect(error.textContent).toContain('Forbidden');
    expect(error.textContent).toContain('Nothing was filed');
    expect(error.textContent).not.toContain(TOKEN);
  });
});

// ─── Mode (c): the relay endpoint ────────────────────────────────────

describe('file automatically', () => {
  it('POSTs the bundle and shows the issue URL the endpoint returned', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issueUrl: 'https://github.com/acme/agent/issues/9', zipUrl: 'https://x/z.zip' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    open({ endpoint: '/api/bug-report' });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-relay'));

    await screen.findByTestId('bug-report-result');
    expect(screen.getByTestId('result-issue-url').getAttribute('href')).toBe(
      'https://github.com/acme/agent/issues/9',
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/bug-report');
    const payload = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(payload.kind).toBe('agentfootprint-lens.bug-report');
    expect(payload.include).toEqual(['conv-3', 'conv-4', 'conv-5', 'file-narrative']);
    expect(payload.filename).toBe('2026-08-11-it-loops.zip');
    expect(typeof payload.zipBase64).toBe('string');
    expect(payload.body).toContain('### Steps to reproduce');
  });

  it('shows the endpoint’s own error, verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'The evidence repo is not configured on this server.' }),
      }),
    );
    open({ endpoint: '/api/bug-report' });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-relay'));
    expect((await screen.findByTestId('bug-report-error')).textContent).toBe(
      'The evidence repo is not configured on this server.',
    );
  });
});

// ─── Failures from the library itself ────────────────────────────────

describe('when the library refuses', () => {
  it('a measurement that throws leaves the dialog saying why, in its own words', () => {
    const message =
      'describeBugReport: this input carried no runs. Pass a Recording, a recordRun() handle, ' +
      'or a finished Runner.';
    render(
      <BugReportButton
        source={{}}
        issuesUrl={ISSUES}
        api={{
          describeBugReport: () => {
            throw new Error(message);
          },
          exportBugReport: () => {
            throw new Error('unreachable');
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('bug-report-open'));
    expect(screen.getByTestId('bug-report-error').textContent).toBe(message);
    expect(screen.queryByTestId('submit-copy')).toBeNull();
  });

  it('an export that throws is shown verbatim and nothing is copied', async () => {
    const message =
      "exportBugReport: `include` names 'conv-9', which is not a unit of this report.";
    open({
      api: {
        describeBugReport: () => SMALL,
        exportBugReport: () => {
          throw new Error(message);
        },
      },
    });
    fillRequired();
    fireEvent.click(screen.getByTestId('submit-copy'));
    expect((await screen.findByTestId('bug-report-error')).textContent).toBe(message);
    expect(writeText).not.toHaveBeenCalled();
  });
});

// ─── The dialog itself ───────────────────────────────────────────────

describe('the dialog', () => {
  it('is a modal dialog with a name', () => {
    open();
    const dialog = screen.getByTestId('bug-report-modal');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: /Report a bug with this run/ })).toBeTruthy();
  });

  it('puts focus in the title field on open', () => {
    open();
    expect(document.activeElement).toBe(screen.getByTestId('field-title'));
  });

  it('Escape closes it', () => {
    open();
    fireEvent.keyDown(screen.getByTestId('bug-report-modal'), { key: 'Escape' });
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();
    expect(screen.getByTestId('bug-report-open')).toBeTruthy();
  });

  it('Tab wraps inside the dialog instead of escaping to the page', () => {
    open();
    // A title makes the submit buttons focusable — a trap that only holds
    // while everything is disabled is not the one under test.
    fillRequired();
    const dialog = screen.getByTestId('bug-report-modal');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]',
      ),
    );
    const last = focusable[focusable.length - 1]!;
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);

    focusable[0]!.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('the close button closes it', () => {
    open();
    fireEvent.click(screen.getByTestId('bug-report-close'));
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();
  });

  it('the trigger is small and unobtrusive — one button, no chrome', () => {
    render(<BugReportButton source={{}} issuesUrl={ISSUES} api={stubApi(SMALL)} />);
    const button = screen.getByTestId('bug-report-open');
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('Report a bug with this run');
    expect(screen.queryByTestId('bug-report-modal')).toBeNull();
  });

  it('takes its own label', () => {
    render(
      <BugReportButton source={{}} issuesUrl={ISSUES} api={stubApi(SMALL)} label="Report a bug" />,
    );
    expect(screen.getByTestId('bug-report-open').textContent).toBe('Report a bug');
  });
});
