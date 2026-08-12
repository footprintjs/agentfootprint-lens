/**
 * <BugReportButton> — "Report a bug with this run", with consent first.
 *
 * A small button for a debug UI. Clicking it opens a modal that shows the
 * reporter EXACTLY what would leave their machine — one tickable row per
 * conversation and per derived file, with sizes, event and turn counts, and the
 * names of every state key that was already scrubbed — and only then offers to
 * send it. The reporter's prose (title, steps, expected, actual) rides along in
 * the same dialog, because a bug report without either half is not one.
 *
 * The evidence is agentfootprint's, not Lens's: `describeBugReport` measures
 * the run and `exportBugReport` bundles the units that were ticked. Lens
 * renders the offer and hands the ids back. It never assembles a bundle, never
 * decides what a unit is, and never edits a message the library produced —
 * every failure below is shown in the library's own words.
 *
 * ## Three submit modes, stacked by what you configured
 *
 * | mode | needs | who files it | where the zip goes |
 * |---|---|---|---|
 * | Copy report + download zip | nothing | the reporter, by hand | their machine |
 * | Sign in with GitHub | `deviceClientId` | the reporter, as themselves | their machine, attached by hand |
 * | File automatically | `endpoint` | your relay, with your token | wherever the relay puts it |
 *
 * The first is always there, so the button is never a dead end. The others
 * appear when their prop is set — the dialog shows what is available and says
 * what each one does, rather than failing silently at click time.
 *
 * ## Secrets
 *
 * A device-flow token is a live credential for the reporter's GitHub account.
 * It lives in this component's memory for the life of the modal and is dropped
 * when the flow ends or the dialog closes: never `localStorage`, never a
 * cookie, never a log line, never the issue body, never a prop.
 *
 * ## Older agentfootprint
 *
 * The substrate shipped in agentfootprint 9.9.0. On anything older the button
 * does not render — a one-line hint says which version this needs, which is the
 * same degradation-stated rule the rest of Lens follows.
 *
 * @example
 * ```tsx
 * <BugReportButton
 *   source={recording}
 *   issuesUrl="https://github.com/acme/checkout-agent/issues"
 *   deviceClientId="Iv1.0123456789abcdef"
 *   endpoint="/api/bug-report"
 *   labels={['bug', 'from-lens']}
 * />
 * ```
 */

import React from 'react';
import * as afObserve from 'agentfootprint/observe';
import { ensureLensStyles } from '../lensStyles.js';
import {
  DEFAULT_MAX_BYTES,
  buildIssueBody,
  buildNewIssueUrl,
  defaultSelection,
  encodeBase64,
  formatBytes,
  measureSelection,
  parseGithubRepo,
  type BugReportApi,
  type BugReportBundleView,
  type BugReportFieldsView,
  type BugReportInputLike,
  type BugReportManifestView,
  type GithubTarget,
  type RelayPayload,
  type RelayResult,
} from '../../core/bugReport/index.js';

/**
 * What the INSTALLED agentfootprint exports, read once by property access.
 *
 * A namespace import plus call-time access, never a named import: a named
 * import of a symbol an older agentfootprint does not export is a module-link
 * error, which would take the whole Lens bundle down instead of degrading this
 * one button. Reading properties off the namespace makes "absent" a value.
 */
const DOOR_API: BugReportApi = readDoor(afObserve as unknown as Record<string, unknown>);

function readDoor(door: Record<string, unknown>): BugReportApi {
  const fn = (name: string): ((...args: never[]) => unknown) | undefined =>
    typeof door[name] === 'function' ? (door[name] as (...args: never[]) => unknown) : undefined;
  return {
    ...(fn('describeBugReport') && {
      describeBugReport: door.describeBugReport as BugReportApi['describeBugReport'],
    }),
    ...(fn('exportBugReport') && {
      exportBugReport: door.exportBugReport as BugReportApi['exportBugReport'],
    }),
    ...(fn('githubDeviceSignIn') && { signIn: door.githubDeviceSignIn as BugReportApi['signIn'] }),
  };
}

export interface BugReportButtonProps {
  /**
   * The run to report on: a `Recording`, the handle `recordRun()` returned, a
   * finished `Runner`, or an array of them (several runs of one session fold
   * into one conversation). Whatever this Lens is already showing.
   */
  readonly source: BugReportInputLike;
  /**
   * The repository's issues URL — `https://github.com/OWNER/REPO/issues`. Owner,
   * repo and the API root are read from it, so GitHub Enterprise Server works
   * with no extra prop.
   */
  readonly issuesUrl: string;
  /** Your app's relay URL. Set it to offer the one-click "File automatically" mode. */
  readonly endpoint?: string;
  /**
   * An OAuth App client id with Device Flow enabled. Set it to offer "Sign in
   * with GitHub" — the issue is then filed as the REPORTER, not as your app.
   * Public by design: the device flow has no client secret.
   */
  readonly deviceClientId?: string;
  /** Labels applied to the issue. */
  readonly labels?: readonly string[];
  /** How many of the most recent conversations start ticked. Default 3. */
  readonly defaultRecentConversations?: number;
  /** The size ceiling the meter measures against. Default 24 MB. */
  readonly maxBytes?: number;
  /** Your application's version — it rides in the environment block. */
  readonly appVersion?: string;
  /** The button's own text. Default "Report a bug with this run". */
  readonly label?: string;
  /**
   * The agentfootprint functions to call. Defaults to whatever the installed
   * agentfootprint exports. What you pass REPLACES that set entirely — `{}` is a
   * complete answer meaning "none of it is available".
   */
  readonly api?: BugReportApi;
}

/** Where the flow is. One state, so two modes can never run at once. */
type Phase = 'form' | 'working' | 'device' | 'done';

export const BugReportButton: React.FC<BugReportButtonProps> = (props) => {
  ensureLensStyles();
  const [open, setOpen] = React.useState(false);
  const api = props.api ?? DOOR_API;
  const usable =
    typeof api.describeBugReport === 'function' && typeof api.exportBugReport === 'function';

  if (!usable) {
    return (
      <span className="lens-bug-report__unsupported" data-testid="bug-report-unsupported">
        Reporting a bug with this run requires agentfootprint 9.9 or newer — the installed
        version has no <code>describeBugReport</code>, and Lens will not send a run it cannot
        measure first.
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="lens-bug-report__open"
        data-testid="bug-report-open"
        onClick={() => setOpen(true)}
      >
        {props.label ?? 'Report a bug with this run'}
      </button>
      {open && <BugReportModal {...props} api={api} onClose={() => setOpen(false)} />}
    </>
  );
};

// ─── The modal ───────────────────────────────────────────────────────

interface ModalProps extends BugReportButtonProps {
  readonly api: BugReportApi;
  readonly onClose: () => void;
}

const EMPTY_FIELDS: BugReportFieldsView = {
  title: '',
  stepsToReproduce: '',
  expected: '',
  actual: '',
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const BugReportModal: React.FC<ModalProps> = ({
  source,
  issuesUrl,
  endpoint,
  deviceClientId,
  labels,
  defaultRecentConversations = 3,
  maxBytes = DEFAULT_MAX_BYTES,
  appVersion,
  api,
  onClose,
}) => {
  // Measured ONCE per dialog: `describeBugReport` serializes the files to
  // weigh them, and the offer must not change under a reporter mid-tick.
  const [described] = React.useState(() => describeSafely(api, source, maxBytes));
  const manifest = described.manifest;

  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(manifest ? defaultSelection(manifest, defaultRecentConversations) : []),
  );
  const [fields, setFields] = React.useState<BugReportFieldsView>(EMPTY_FIELDS);
  const [phase, setPhase] = React.useState<Phase>('form');
  const [error, setError] = React.useState<string | undefined>(described.error);
  const [outcome, setOutcome] = React.useState<Outcome | undefined>(undefined);
  const [device, setDevice] = React.useState<DeviceState | undefined>(undefined);

  // The token never reaches state: state is rendered, inspected and (in dev
  // tools) serialized. It lives here, and it is cleared the moment the flow
  // ends or the dialog unmounts.
  const tokenRef = React.useRef<string | undefined>(undefined);
  const abortRef = React.useRef<AbortController | undefined>(undefined);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  // React owns the id: an `aria-labelledby` target must be unique on the page,
  // and a debug UI can mount more than one of these.
  const titleId = React.useId();

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
      tokenRef.current = undefined;
    },
    [],
  );

  // Focus trap: focus in on mount, Escape closes, Tab cycles inside the dialog.
  React.useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const initial =
      node.querySelector<HTMLElement>('[data-autofocus]') ??
      node.querySelector<HTMLElement>(FOCUSABLE);
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = node.ownerDocument.activeElement;
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const target = React.useMemo(() => parseGithubRepo(issuesUrl), [issuesUrl]);
  const size = React.useMemo(
    () => (manifest ? measureSelection(manifest, selected, maxBytes) : undefined),
    [manifest, selected, maxBytes],
  );

  const canSubmit =
    phase === 'form' &&
    fields.title.trim() !== '' &&
    size !== undefined &&
    !size.over &&
    size.conversations > 0;

  const toggle = (id: string): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Bundle exactly what is ticked. Throws the library's own message. */
  const exportBundle = (): BugReportBundleView =>
    api.exportBugReport!(source, {
      ...fields,
      ...(appVersion !== undefined && { appVersion }),
      include: [...selected],
      warnOverBytes: maxBytes,
    });

  const run = async (work: () => Promise<Outcome>, busy: Phase): Promise<void> => {
    setError(undefined);
    setPhase(busy);
    try {
      setOutcome(await work());
      setPhase('done');
    } catch (err) {
      // Verbatim: the library's messages teach what to do next, and a
      // paraphrase of a teaching message is a worse teaching message.
      setError(messageOf(err));
      setPhase('form');
    } finally {
      tokenRef.current = undefined;
    }
  };

  // ── (a) Copy + download + prefilled form — always available ──────
  const submitManual = (): Promise<void> =>
    run(async () => {
      const bundle = exportBundle();
      const body = buildIssueBody({
        fields,
        manifest: bundle.manifest,
        evidence: {
          filename: bundle.filename,
          bytes: bundle.zip.length,
          delivery: 'by-hand',
        },
      });
      const copied = await copyText(body);
      const downloaded = downloadZip(bundle);
      const prefilled = target
        ? buildNewIssueUrl({
            target,
            title: fields.title,
            body,
            ...(labels !== undefined && { labels }),
          })
        : undefined;
      const opened = prefilled ? openUrl(prefilled.url) : false;
      return {
        mode: 'manual',
        ...(prefilled && !opened && { issueUrl: prefilled.url }),
        notes: [
          copied
            ? 'The issue body is on your clipboard.'
            : 'This browser gave Lens no clipboard, so nothing was copied — the report is in the ' +
              'form that opened, or download the zip and write it there.',
          downloaded
            ? `The evidence bundle downloaded as ${bundle.filename} (${formatBytes(bundle.zip.length)}). Attach it to the issue.`
            : 'This browser gave Lens no way to save a file, so the zip was not downloaded.',
          ...(prefilled?.truncated
            ? ['The body was too long for a URL, so the form has a cut version — paste the clipboard over it.']
            : []),
          ...(opened ? [] : ['Open the issue link below to file it.']),
        ],
      };
    }, 'working');

  // ── (b) Device sign-in — file as the reporter ────────────────────
  const submitAsUser = (): Promise<void> =>
    run(async () => {
      if (!target) throw new Error(`This issues URL names no owner/repo: ${issuesUrl}`);
      if (typeof api.signIn !== 'function') {
        throw new Error(
          'Signing in needs `githubDeviceSignIn` from agentfootprint 9.9 or newer, and the ' +
            'installed version does not export it.',
        );
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const handle = await api.signIn({
        clientId: deviceClientId!,
        signal: controller.signal,
      });
      setDevice({ userCode: handle.userCode, verificationUri: handle.verificationUri });
      const identity = await handle.completed;
      tokenRef.current = identity.token;
      setDevice((current) => ({ ...current!, ...(identity.login && { login: identity.login }) }));

      const bundle = exportBundle();
      const downloaded = downloadZip(bundle);
      const body = buildIssueBody({
        fields,
        manifest: bundle.manifest,
        evidence: { filename: bundle.filename, bytes: bundle.zip.length, delivery: 'by-hand' },
      });
      const issueUrl = await createIssueAsUser({
        target,
        token: identity.token,
        title: fields.title,
        body,
        ...(labels !== undefined && { labels }),
      });
      return {
        mode: 'signed-in',
        issueUrl,
        notes: [
          identity.login
            ? `Filed as @${identity.login}.`
            : 'Filed as the account that approved the code.',
          downloaded
            ? `The evidence bundle is not uploaded for you: ${bundle.filename} ` +
              `(${formatBytes(bundle.zip.length)}) downloaded to this machine — drag it onto the ` +
              'issue to attach it.'
            : 'This browser gave Lens no way to save a file, so the evidence bundle was not ' +
              'downloaded and nothing is attached.',
          'Your sign-in token was used once and dropped; it was never stored.',
        ],
      };
    }, 'device');

  // ── (c) Relay endpoint — one click, the app's own token ──────────
  const submitViaEndpoint = (): Promise<void> =>
    run(async () => {
      const bundle = exportBundle();
      const body = buildIssueBody({
        fields,
        manifest: bundle.manifest,
        evidence: { filename: bundle.filename, bytes: bundle.zip.length, delivery: 'relayed' },
      });
      const payload: RelayPayload = {
        kind: 'agentfootprint-lens.bug-report',
        version: 1,
        fields: { ...fields, ...(appVersion !== undefined && { appVersion }) },
        include: [...selected],
        ...(labels !== undefined && { labels }),
        manifest: bundle.manifest,
        body,
        filename: bundle.filename,
        zipBase64: encodeBase64(bundle.zip),
      };
      const result = await postRelay(endpoint!, payload);
      return {
        mode: 'relayed',
        ...(result.issueUrl !== undefined && { issueUrl: result.issueUrl }),
        ...(result.zipUrl !== undefined && { zipUrl: result.zipUrl }),
        notes: [
          result.issueUrl
            ? 'Filed by the application, with its own credentials.'
            : 'The endpoint accepted the report but returned no issue URL — ask the application ' +
              'where it went.',
        ],
      };
    }, 'working');

  return (
    <div className="lens-bug-report__overlay">
      <div
        className="lens-bug-report__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="bug-report-modal"
        data-phase={phase}
        ref={dialogRef}
      >
        <header className="lens-bug-report__header">
          <h2 id={titleId}>Report a bug with this run</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="bug-report-close"
            aria-label="Close bug report"
          >
            ✕
          </button>
        </header>

        {error && (
          <p className="lens-bug-report__error" role="alert" data-testid="bug-report-error">
            {error}
          </p>
        )}

        {!manifest ? (
          <p className="lens-bug-report__body">
            Nothing was measured, so nothing can be sent.
          </p>
        ) : phase === 'done' && outcome ? (
          <Result outcome={outcome} onClose={onClose} />
        ) : (
          <div className="lens-bug-report__body">
            <ReporterFields fields={fields} onChange={setFields} disabled={phase !== 'form'} />
            <ConsentList
              manifest={manifest}
              selected={selected}
              onToggle={toggle}
              disabled={phase !== 'form'}
            />
            {size && <Meter size={size} manifest={manifest} />}
            {phase === 'device' && device && <DevicePanel device={device} />}
            <Modes
              phase={phase}
              canSubmit={canSubmit}
              hasTarget={target !== undefined}
              deviceClientId={deviceClientId}
              canSignIn={typeof api.signIn === 'function'}
              endpoint={endpoint}
              onManual={submitManual}
              onSignIn={submitAsUser}
              onRelay={submitViaEndpoint}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Pieces ──────────────────────────────────────────────────────────

const ReporterFields: React.FC<{
  readonly fields: BugReportFieldsView;
  readonly onChange: (next: BugReportFieldsView) => void;
  readonly disabled: boolean;
}> = ({ fields, onChange, disabled }) => (
  <div className="lens-bug-report__fields">
    <label>
      <span>Title</span>
      <input
        type="text"
        value={fields.title}
        data-autofocus
        data-testid="field-title"
        disabled={disabled}
        onChange={(e) => onChange({ ...fields, title: e.target.value })}
      />
    </label>
    <label>
      <span>Steps to reproduce</span>
      <textarea
        rows={3}
        value={fields.stepsToReproduce}
        data-testid="field-steps"
        disabled={disabled}
        onChange={(e) => onChange({ ...fields, stepsToReproduce: e.target.value })}
      />
    </label>
    <label>
      <span>Expected</span>
      <textarea
        rows={2}
        value={fields.expected}
        data-testid="field-expected"
        disabled={disabled}
        onChange={(e) => onChange({ ...fields, expected: e.target.value })}
      />
    </label>
    <label>
      <span>Actual</span>
      <textarea
        rows={2}
        value={fields.actual}
        data-testid="field-actual"
        disabled={disabled}
        onChange={(e) => onChange({ ...fields, actual: e.target.value })}
      />
    </label>
  </div>
);

const ConsentList: React.FC<{
  readonly manifest: BugReportManifestView;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly disabled: boolean;
}> = ({ manifest, selected, onToggle, disabled }) => (
  <fieldset className="lens-bug-report__consent">
    <legend>What leaves with this report</legend>
    <ul>
      {manifest.units.map((unit) => (
        <li key={unit.id}>
          <label>
            <input
              type="checkbox"
              checked={selected.has(unit.id)}
              disabled={disabled}
              data-testid={`unit-${unit.id}`}
              onChange={() => onToggle(unit.id)}
            />
            <span className="lens-bug-report__unit-label">{unit.label}</span>
            <span className="lens-bug-report__unit-meta">
              {formatBytes(unit.bytes || 0)}
              {unit.eventCount !== undefined ? ` · ${unit.eventCount} events` : ''}
              {unit.turnCount !== undefined ? ` · ${unit.turnCount} turns` : ''}
            </span>
          </label>
        </li>
      ))}
    </ul>
    {(manifest.redactedKeys?.length ?? 0) > 0 && (
      <p className="lens-bug-report__redacted" data-testid="bug-report-redacted">
        Already scrubbed, by name only — the values never left this machine:{' '}
        {manifest.redactedKeys!.join(', ')}
      </p>
    )}
    <p className="lens-bug-report__caveat">
      Derived files are rebuilt over the conversations you keep, so unticking a conversation
      takes it out of the transcript and the narrative too.
    </p>
  </fieldset>
);

const Meter: React.FC<{
  readonly size: ReturnType<typeof measureSelection>;
  readonly manifest: BugReportManifestView;
}> = ({ size, manifest }) => (
  <div
    className="lens-bug-report__meter"
    data-state={size.over ? 'over' : 'ready'}
    data-testid="bug-report-meter"
    role="status"
    aria-live="polite"
  >
    <strong>{size.label}</strong>
    {size.over && size.hint && <span data-testid="bug-report-trim-hint"> {size.hint}</span>}
    {!size.over && size.conversations === 0 && (
      <span> Tick at least one conversation — a report with no run is not evidence.</span>
    )}
    {size.over &&
      (manifest.oversize?.trimHints ?? []).map((hint) => (
        <span key={hint} className="lens-bug-report__library-hint">
          {' '}
          {hint}
        </span>
      ))}
    <span className="lens-bug-report__caveat">
      Estimated from the manifest: the bundle adds its own manifest.json, and the derived files
      shrink as conversations are unticked — the real zip is this size or smaller.
    </span>
  </div>
);

const DevicePanel: React.FC<{ readonly device: DeviceState }> = ({ device }) => (
  <div className="lens-bug-report__device" data-testid="bug-report-device">
    <p>
      Enter this code on GitHub — it is case-sensitive:{' '}
      <code data-testid="device-code">{device.userCode}</code>
    </p>
    <p>
      <a
        href={device.verificationUri}
        target="_blank"
        rel="noreferrer noopener"
        data-testid="device-uri"
      >
        {device.verificationUri}
      </a>
    </p>
    <p>
      {device.login
        ? `Signed in as @${device.login} — filing…`
        : 'Waiting for you to approve it. Nothing is sent until you do.'}
    </p>
  </div>
);

const Modes: React.FC<{
  readonly phase: Phase;
  readonly canSubmit: boolean;
  readonly hasTarget: boolean;
  readonly deviceClientId?: string;
  readonly canSignIn: boolean;
  readonly endpoint?: string;
  readonly onManual: () => void;
  readonly onSignIn: () => void;
  readonly onRelay: () => void;
}> = ({
  phase,
  canSubmit,
  hasTarget,
  deviceClientId,
  canSignIn,
  endpoint,
  onManual,
  onSignIn,
  onRelay,
}) => (
  <div className="lens-bug-report__modes">
    <button type="button" data-testid="submit-copy" disabled={!canSubmit} onClick={onManual}>
      Copy report + download zip
    </button>
    <p className="lens-bug-report__mode-note">
      {hasTarget
        ? 'Copies the issue body, saves the evidence zip, and opens the new-issue form prefilled.'
        : 'Copies the issue body and saves the evidence zip. This issues URL names no repo, so no ' +
          'form is opened.'}
    </p>

    {deviceClientId && canSignIn && (
      <>
        <button
          type="button"
          data-testid="submit-signin"
          disabled={!canSubmit}
          onClick={onSignIn}
        >
          Sign in with GitHub &amp; file as yourself
        </button>
        <p className="lens-bug-report__mode-note">
          The issue reads as you, so a maintainer can ask you a follow-up. The zip still
          downloads here for you to attach — signing in does not give Lens anywhere to push it.
        </p>
      </>
    )}

    {endpoint && (
      <>
        <button type="button" data-testid="submit-relay" disabled={!canSubmit} onClick={onRelay}>
          File automatically
        </button>
        <p className="lens-bug-report__mode-note">
          Sends the bundle to this application&rsquo;s own endpoint, which files it with the
          application&rsquo;s credentials.
        </p>
      </>
    )}

    {phase === 'working' && <p className="lens-bug-report__mode-note">Working…</p>}
  </div>
);

const Result: React.FC<{ readonly outcome: Outcome; readonly onClose: () => void }> = ({
  outcome,
  onClose,
}) => (
  <div className="lens-bug-report__result" data-testid="bug-report-result">
    <p>
      <strong>Report prepared.</strong>
    </p>
    {outcome.issueUrl && (
      <p>
        <a
          href={outcome.issueUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="result-issue-url"
        >
          {outcome.issueUrl}
        </a>
      </p>
    )}
    {outcome.zipUrl && (
      <p>
        <a href={outcome.zipUrl} target="_blank" rel="noreferrer noopener">
          {outcome.zipUrl}
        </a>
      </p>
    )}
    <ul>
      {outcome.notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
    <button type="button" onClick={onClose} data-testid="bug-report-done">
      Done
    </button>
  </div>
);

// ─── Plumbing ────────────────────────────────────────────────────────

interface DeviceState {
  readonly userCode: string;
  readonly verificationUri: string;
  readonly login?: string;
}

interface Outcome {
  readonly mode: 'manual' | 'signed-in' | 'relayed';
  readonly issueUrl?: string;
  readonly zipUrl?: string;
  readonly notes: readonly string[];
}

/** Measure, or keep the library's refusal to show instead of a blank dialog. */
function describeSafely(
  api: BugReportApi,
  source: BugReportInputLike,
  maxBytes: number,
): { manifest?: BugReportManifestView; error?: string } {
  try {
    return { manifest: api.describeBugReport!(source, { warnOverBytes: maxBytes }) };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : String(err);

/** Clipboard, if this browser has one. Returns whether it took. */
async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Save the zip. Returns whether this environment could. */
function downloadZip(bundle: BugReportBundleView): boolean {
  try {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
    // A fresh copy: the Blob must own bytes that nothing else will reuse.
    const blob = new Blob([new Uint8Array(bundle.zip)], { type: 'application/zip' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = bundle.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    return true;
  } catch {
    return false;
  }
}

/** Open the prefilled form. Returns whether a window took it. */
function openUrl(url: string): boolean {
  try {
    return globalThis.window?.open(url, '_blank', 'noopener,noreferrer') != null;
  } catch {
    return false;
  }
}

/**
 * File the issue with the reporter's own token.
 *
 * The token goes in a header and nowhere else. A failure is reported as the
 * STATUS and GitHub's own `message` — never the request, never the headers.
 */
async function createIssueAsUser(args: {
  readonly target: GithubTarget;
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${args.target.apiBase}/repos/${args.target.owner}/${args.target.repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        title: args.title,
        body: args.body,
        ...(args.labels && args.labels.length > 0 && { labels: [...args.labels] }),
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach GitHub to file the issue (${err instanceof Error ? err.name || 'network error' : 'network error'}).`,
    );
  }
  const payload = (await response.json().catch(() => ({}))) as { html_url?: string; message?: string };
  if (!response.ok) {
    throw new Error(
      `GitHub answered ${response.status} when asked to file the issue` +
        `${payload.message ? `: ${payload.message}` : ''}. Nothing was filed.`,
    );
  }
  if (!payload.html_url) {
    throw new Error('GitHub accepted the issue but returned no URL for it.');
  }
  return payload.html_url;
}

/** POST the bundle to the application's relay. */
async function postRelay(endpoint: string, payload: RelayPayload): Promise<RelayResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      `Could not reach ${endpoint} to file the report ` +
        `(${err instanceof Error ? err.name || 'network error' : 'network error'}).`,
    );
  }
  const result = (await response.json().catch(() => ({}))) as RelayResult;
  if (!response.ok) {
    throw new Error(
      result.error ??
        result.message ??
        `The bug-report endpoint answered ${response.status}. Nothing was filed.`,
    );
  }
  return result;
}
